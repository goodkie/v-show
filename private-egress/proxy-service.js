/**
 * proxy-service.js
 * 
 * XPIDER AutoForm Sender Pro — Dedicated Private Egress TLS Proxy
 * Protocol: OCA-DEV-1.4 (Issue #6 R6.9G.10.3)
 * 
 * Runs on the Owner-controlled Linux VPS as a systemd service.
 * Features:
 *   - Authenticated HTTP CONNECT tunnel for HTTP & HTTPS targets
 *   - Strict TLS client-to-proxy listener on port 8443
 *   - Constant-time password validation (timingSafeEqual)
 *   - Fail-closed: invalid auth immediately rejected (407)
 *   - Lightweight telemetry endpoint (GET /_telemetry) for CPU, RAM, swap, and tunnel monitoring
 *   - Unauthenticated health ping (GET /_health)
 *   - Logs without target URLs or credentials
 */

const https = require('https');
const net = require('net');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * [P0-7] IP range validation to prevent SSRF and proxying to non-public/internal endpoints.
 * Blocks:
 *   - 0.0.0.0/8 (Current network)
 *   - 127.0.0.0/8 (IPv4 Loopback)
 *   - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 (RFC 1918 Private)
 *   - 169.254.0.0/16 (Link-Local & Cloud Metadata 169.254.169.254)
 *   - 100.64.0.0/10 (Carrier-grade NAT)
 *   - 224.0.0.0/4 (Multicast)
 *   - 240.0.0.0/4 (Reserved / Broadcast)
 *   - ::, ::1 (IPv6 Unspecified & Loopback)
 *   - fe80::/10 (IPv6 Link-Local)
 *   - fc00::/7 (IPv6 Unique Local / Private)
 *   - ff00::/8 (IPv6 Multicast)
 */
function isIpBlocked(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') {
    return { blocked: true, reason: 'INVALID_IP' };
  }

  let cleanIp = ipStr.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) {
      return { blocked: true, reason: 'MALFORMED_IPV4' };
    }
    const [b0, b1] = parts;

    if (b0 === 0) return { blocked: true, reason: 'UNSPECIFIED_0_0_0_0' };
    if (b0 === 127) return { blocked: true, reason: 'LOOPBACK_127_0_0_0' };
    if (b0 === 10) return { blocked: true, reason: 'RFC1918_PRIVATE_10_0_0_0' };
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return { blocked: true, reason: 'RFC1918_PRIVATE_172_16_0_0' };
    if (b0 === 192 && b1 === 168) return { blocked: true, reason: 'RFC1918_PRIVATE_192_168_0_0' };
    if (b0 === 169 && b1 === 254) return { blocked: true, reason: 'LINK_LOCAL_METADATA_169_254_0_0' };
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return { blocked: true, reason: 'SHARED_ADDRESS_SPACE_100_64_0_0' };
    if (b0 >= 224 && b0 <= 239) return { blocked: true, reason: 'MULTICAST' };
    if (b0 >= 240) return { blocked: true, reason: 'RESERVED_OR_BROADCAST' };

    return { blocked: false };
  }

  if (net.isIPv6(cleanIp)) {
    const lower = cleanIp.toLowerCase();
    if (lower === '::' || lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') {
      return { blocked: true, reason: 'IPV6_LOOPBACK' };
    }
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
      return { blocked: true, reason: 'IPV6_LINK_LOCAL' };
    }
    if (lower.startsWith('fc') || lower.startsWith('fd')) {
      return { blocked: true, reason: 'IPV6_UNIQUE_LOCAL' };
    }
    if (lower.startsWith('ff')) {
      return { blocked: true, reason: 'IPV6_MULTICAST' };
    }
    return { blocked: false };
  }

  return { blocked: true, reason: 'NON_IP_ADDRESS' };
}


const PORT = parseInt(process.env.XPIDER_EGRESS_PORT || '8443', 10);
const CONFIG_DIR = process.env.XPIDER_CONFIG_DIR || '/etc/xpider-egress';
const CERT_FILE = process.env.XPIDER_CERT_FILE || path.join(CONFIG_DIR, 'server.crt');
const KEY_FILE = process.env.XPIDER_KEY_FILE || path.join(CONFIG_DIR, 'server.key');
const CREDS_FILE = process.env.XPIDER_CREDS_FILE || path.join(CONFIG_DIR, 'credentials.json');

let activeTunnels = 0;
let totalConnections = 0;
let credentials = null;
let currentCredsFile = CREDS_FILE;

function loadCredentials(explicitFile) {
  try {
    const targetFile = explicitFile || currentCredsFile || process.env.XPIDER_CREDS_FILE || CREDS_FILE;
    if (fs.existsSync(targetFile)) {
      const raw = fs.readFileSync(targetFile, 'utf8');
      credentials = JSON.parse(raw);
      return credentials;
    }
  } catch (err) {
    console.error(`[XPIDER_EGRESS] Failed to load credentials from ${currentCredsFile}:`, err.message);
  }
  return null;
}

function verifyAuth(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return false;
  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') return false;

  let decoded;
  try {
    decoded = Buffer.from(parts[1], 'base64').toString('utf8');
  } catch (_) {
    return false;
  }

  const colonIdx = decoded.indexOf(':');
  if (colonIdx === -1) return false;

  const username = decoded.substring(0, colonIdx);
  const password = decoded.substring(colonIdx + 1);

  if (!credentials) {
    loadCredentials();
  }
  if (!credentials || !credentials.username || !credentials.password) {
    return false;
  }

  // Safe timing comparison
  const uExpected = Buffer.from(credentials.username);
  const uActual = Buffer.from(username);
  const pExpected = Buffer.from(credentials.password);
  const pActual = Buffer.from(password);

  if (uExpected.length !== uActual.length || pExpected.length !== pActual.length) {
    return false;
  }

  const uMatch = crypto.timingSafeEqual(uExpected, uActual);
  const pMatch = crypto.timingSafeEqual(pExpected, pActual);

  return uMatch && pMatch;
}

function getSystemTelemetry() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 1000) / 10;

  // CPU load average
  const loadAvg = os.loadavg();
  const cpus = os.cpus();
  const numCpus = cpus ? cpus.length : 1;

  // Swap calculation from /proc/meminfo if available on Linux
  let swapTotal = 0;
  let swapFree = 0;
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const lines = fs.readFileSync('/proc/meminfo', 'utf8').split('\n');
      for (const line of lines) {
        if (line.startsWith('SwapTotal:')) {
          swapTotal = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        } else if (line.startsWith('SwapFree:')) {
          swapFree = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        }
      }
    }
  } catch (_) {}

  const swapUsed = swapTotal - swapFree;
  const swapUsagePercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0;

  return {
    timestamp: Date.now(),
    uptimeSeconds: Math.floor(os.uptime()),
    numCpus,
    loadAvg,
    cpu1mRatio: Math.round((loadAvg[0] / numCpus) * 100) / 100,
    memTotalBytes: totalMem,
    memUsedBytes: usedMem,
    memFreeBytes: freeMem,
    memUsagePercent,
    swapTotalBytes: swapTotal,
    swapUsedBytes: swapUsed,
    swapFreeBytes: swapFree,
    swapUsagePercent,
    activeTunnels,
    totalConnections
  };
}

function createProxyServer(options = {}) {
  const certPath = options.certFile || CERT_FILE;
  const keyPath = options.keyFile || KEY_FILE;
  if (options.credsFile) {
    currentCredsFile = options.credsFile;
  }

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    throw new Error(`TLS certificate or key missing: ${certPath}, ${keyPath}`);
  }

  const tlsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };

  const server = https.createServer(tlsOptions);

  // Initial credentials load
  loadCredentials(currentCredsFile);

  const allowLoopback = Boolean(options.allowLoopbackForTesting || process.env.XPIDER_ALLOW_LOOPBACK === '1');
  const allowedPorts = options.allowedPorts || [80, 443];

  // Handle standard HTTP requests (health & telemetry)
  server.on('request', (req, res) => {
    const urlPath = req.url.split('?')[0];

    // [P1-1] Minimal opaque health ping (no activeTunnels or internals exposed unauthenticated)
    if (urlPath === '/_health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    // Authenticated telemetry endpoint
    if (urlPath === '/_telemetry' && req.method === 'GET') {
      const auth = req.headers['authorization'] || req.headers['proxy-authorization'];
      if (!verifyAuth(auth)) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Basic realm="XPIDER Telemetry"'
        });
        res.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getSystemTelemetry()));
      return;
    }

    // All other endpoints fail closed
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  });

  // Handle HTTP CONNECT requests (the proxy tunnel)
  server.on('connect', (req, clientSocket, head) => {
    totalConnections++;

    // Authenticate CONNECT request
    const authHeader = req.headers['proxy-authorization'];
    if (!verifyAuth(authHeader)) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="XPIDER Private Egress"\r\n' +
        'Connection: close\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // Parse target host:port
    const target = req.url;
    let targetHost = target;
    let targetPort = 443;

    const colonIdx = target.lastIndexOf(':');
    if (colonIdx !== -1) {
      targetHost = target.substring(0, colonIdx);
      const parsedPort = parseInt(target.substring(colonIdx + 1), 10);
      if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        targetPort = parsedPort;
      }
    }

    // Strip square brackets if IPv6 literal
    if (targetHost.startsWith('[') && targetHost.endsWith(']')) {
      targetHost = targetHost.substring(1, targetHost.length - 1);
    }

    // [P0-7] Destination Port Safety Check (Default: 80 and 443 only)
    if (!allowedPorts.includes(targetPort)) {
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n' +
        'X-Blocked-Reason: RESTRICTED_PORT_ONLY_80_443_ALLOWED\r\n' +
        'Connection: close\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // [P0-7] Check for explicit forbidden hostnames (localhost, metadata, etc.)
    const lowerHost = targetHost.toLowerCase();
    if (!allowLoopback && (lowerHost === 'localhost' || lowerHost.endsWith('.localhost') || lowerHost === 'metadata.google.internal' || lowerHost === 'instance-data')) {
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n' +
        'X-Blocked-Reason: BLOCKED_INTERNAL_HOSTNAME\r\n' +
        'Connection: close\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    // [P0-7] Safe DNS resolution & IP range validation before TCP connect
    const dnsLookup = (host, cb) => {
      if (net.isIP(host)) {
        return cb(null, [{ address: host, family: net.isIPv4(host) ? 4 : 6 }]);
      }
      dns.lookup(host, { all: true }, cb);
    };

    dnsLookup(targetHost, (dnsErr, addresses) => {
      if (dnsErr || !addresses || addresses.length === 0) {
        clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n' +
          'X-Blocked-Reason: DNS_RESOLUTION_FAILED\r\n' +
          'Connection: close\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      // Check all resolved addresses against blocked ranges
      if (!allowLoopback) {
        for (const addr of addresses) {
          const check = isIpBlocked(addr.address);
          if (check.blocked) {
            clientSocket.write(`HTTP/1.1 403 Forbidden\r\n` +
              `X-Blocked-Reason: ${check.reason}\r\n` +
              `Connection: close\r\n\r\n`);
            clientSocket.destroy();
            return;
          }
        }
      }

      // Connect to the verified IP address to prevent DNS rebinding
      const targetIp = addresses[0].address;
      const targetSocket = net.connect(targetPort, targetIp, () => {
        activeTunnels++;
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
          'Proxy-Agent: XPIDER-Egress/1.0\r\n\r\n');

        if (head && head.length > 0) {
          targetSocket.write(head);
        }

        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
      });

      let closed = false;
      const cleanup = () => {
        if (!closed) {
          closed = true;
          if (activeTunnels > 0) activeTunnels--;
        }
        try { clientSocket.destroy(); } catch (_) {}
        try { targetSocket.destroy(); } catch (_) {}
      };

      targetSocket.on('error', () => cleanup());
      targetSocket.on('close', () => cleanup());
      targetSocket.on('end', () => cleanup());

      clientSocket.on('error', () => cleanup());
      clientSocket.on('close', () => cleanup());
      clientSocket.on('end', () => cleanup());
    });
  });

  return server;
}

if (require.main === module) {
  try {
    const server = createProxyServer();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[XPIDER_EGRESS] TLS Proxy listening on 0.0.0.0:${PORT}`);
    });

    // Reload credentials on SIGHUP without dropping connections
    process.on('SIGHUP', () => {
      console.log('[XPIDER_EGRESS] SIGHUP received, reloading credentials...');
      loadCredentials();
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('[XPIDER_EGRESS] SIGTERM received, shutting down gracefully...');
      server.close(() => process.exit(0));
    });
  } catch (err) {
    console.error('[XPIDER_EGRESS] Fatal startup error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  createProxyServer,
  verifyAuth,
  getSystemTelemetry,
  loadCredentials,
  isIpBlocked
};

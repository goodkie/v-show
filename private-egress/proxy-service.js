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
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

  // Handle standard HTTP requests (health & telemetry)
  server.on('request', (req, res) => {
    const urlPath = req.url.split('?')[0];

    // Unauthenticated health ping
    if (urlPath === '/_health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'OK',
        service: 'xpider-private-egress',
        activeTunnels,
        timestamp: Date.now()
      }));
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

    // Establish TCP connection to upstream target
    const targetSocket = net.connect(targetPort, targetHost, () => {
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
  loadCredentials
};

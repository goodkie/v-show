/**
 * privacy-relay-service.js
 * 
 * XPIDER Companion Privacy Relay Service (Issue #6 R6.9G.10.2)
 * 
 * Architecture:
 *   Browser / XPIDER Extension
 *     -> Local Forward/CONNECT Proxy (127.0.0.1:18988)
 *     -> Local Loopback Control API (127.0.0.1:18989) with Bearer Token Auth
 *     -> Authenticated / TLS Encrypted Upstream Egress Node
 *     -> Target Website
 * 
 * Safe Rotation Modes:
 *   - FIXED: Sticky egress node until Owner manually changes
 *   - MANUAL: Owner rotates on demand
 *   - CAMPAIGN_BOUNDARY: Rotates once at campaign start; sticky for entire campaign
 *   - HEALTH_FAILOVER: Pauses XPIDER and selects next healthy node if active node fails
 * 
 * Invariants (R6.9G.10.2):
 *   - Clean Production Config: Zero fixture nodes, zero synthetic IPs, public canary URL (Blocker 1)
 *   - Bearer Control Auth: High-entropy per-install secret token required on all mutating / status endpoints
 *   - Strict Exact-Origin CORS: Origin restricted strictly to chrome-extension://${allowedExtensionId}; rogue origins rejected with 403 (Blocker 3)
 *   - Ephemeral Memory-Only Tokens: Tokens never persisted in extension storage (Blocker 4)
 *   - Stable Extension ID: Discovered from manifest key or exact CLI param (Blocker 5)
 *   - Enforced Health TTL: Nodes with verification older than healthTtlMs marked EXPIRED/NOT_READY (Blocker 6)
 *   - Verified A->B Failover: Seamless auto-failover with synchronous relayReady=false during transition (Blockers 7 & 8)
 *   - Strict TLS HTTPS_PROXY: rejectUnauthorized=true hardcoded across all TLS connections (Blocker 9)
 *   - Windows DPAPI Secret Storage: Passwords encrypted via DPAPI; never saved in plaintext (Blocker 10)
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const winsec = require('./winsec');
const { discoverExtensionId } = require('./install_native_host');

const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;
const CONFIG_FILE = process.env.XPIDER_RELAY_CONFIG_FILE || path.join(__dirname, 'egress_pool_config.json');
const LOG_FILE = path.join(__dirname, 'privacy_relay.log');
const TOKEN_FILE = path.join(__dirname, '.control_token');

const DEFAULT_POOL = {
  version: '1.0.2',
  rotationMode: 'HEALTH_FAILOVER', // FIXED | MANUAL | CAMPAIGN_BOUNDARY | HEALTH_FAILOVER
  healthCheckTimeoutMs: 5000,
  healthTtlMs: 60000,
  canaryUrl: 'https://cloudflare.com/cdn-cgi/trace',
  nodes: []
};

class PrivacyRelayService {
  constructor(options = {}) {
    this.controlPort = options.controlPort || CONTROL_PORT;
    this.proxyPort = options.proxyPort || PROXY_PORT;
    this.canaryUrl = options.canaryUrl || null;
    this.allowedExtensionId = options.allowedExtensionId || process.env.XPIDER_ALLOWED_EXT_ID || discoverExtensionId(__dirname) || null;
    this.healthTtlMs = options.healthTtlMs || 60000;
    this.configFile = options.configFile || CONFIG_FILE;
    this.startTime = Date.now();
    this.activeNodeIndex = 0;
    this.rotationCount = 0;
    this.isPaused = false;
    this.relayReady = false; // Block forwarding until active node is verified
    this.controlToken = this.loadOrGenerateControlToken(options.controlToken);
    this.pool = this.loadConfig();

    // Reset all runtime health states on process start
    if (this.pool.nodes && Array.isArray(this.pool.nodes)) {
      this.pool.nodes.forEach(n => {
        n.lastHealth = 'UNKNOWN';
        n.observedEgressIp = null;
        n.observedFingerprint = null;
        n.lastVerifiedAt = 0;
      });
    }

    this.controlServer = null;
    this.proxyServer = null;
    this.trafficStats = {
      requestsProxied: 0,
      connectTunnels: 0,
      failClosedDrops: 0
    };
  }

  loadOrGenerateControlToken(explicitToken) {
    if (explicitToken && typeof explicitToken === 'string') {
      return explicitToken.trim();
    }
    if (process.env.XPIDER_RELAY_CONTROL_TOKEN) {
      return process.env.XPIDER_RELAY_CONTROL_TOKEN.trim();
    }
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
        if (token && token.length >= 32) return token;
      }
    } catch (_) {}

    const newToken = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(TOKEN_FILE, newToken, { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}
    return newToken;
  }

  log(msg) {
    const ts = new Date().toISOString();
    const redacted = PrivacyRelayService.redactSecrets(msg);
    const line = `[${ts}] ${redacted}\n`;
    try {
      fs.appendFileSync(LOG_FILE, line, 'utf8');
    } catch (_) {}
  }

  static redactSecrets(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => {
        if (ip === '127.0.0.1' || ip === '0.0.0.0') return ip;
        return '[REDACTED_IP]';
      })
      .replace(/password[:=]["']?[^"'\s]+["']?/gi, 'password="[REDACTED_SECRET]"')
      .replace(/auth[:=]["']?[^"'\s]+["']?/gi, 'auth="[REDACTED_SECRET]"')
      .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED_TOKEN]')
      .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
  }

  static resolveNodeCredentials(node) {
    return winsec.resolveNodeCredentials(node);
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return { ...DEFAULT_POOL, ...JSON.parse(data) };
      }
    } catch (e) {
      this.log(`Failed to load config: ${e.message}`);
    }
    return { ...DEFAULT_POOL };
  }

  saveConfig() {
    try {
      const sanitizedNodes = (this.pool.nodes || []).map(n => winsec.sanitizeNodeForSave(n));
      const toSave = {
        version: this.pool.version || '1.0.3',
        rotationMode: this.pool.rotationMode || 'HEALTH_FAILOVER',
        healthCheckTimeoutMs: this.pool.healthCheckTimeoutMs || 5000,
        healthTtlMs: this.pool.healthTtlMs || 60000,
        canaryUrl: this.pool.canaryUrl || 'https://cloudflare.com/cdn-cgi/trace',
        nodes: sanitizedNodes
      };
      fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
      return true;
    } catch (e) {
      this.log(`Failed to save config: ${e.message}`);
      throw e;
    }
  }

  computeFingerprint(node) {
    if (!node || !node.observedFingerprint) return null;
    return node.observedFingerprint;
  }

  getActiveNode() {
    if (!this.pool.nodes || this.pool.nodes.length === 0) return null;
    if (this.activeNodeIndex >= this.pool.nodes.length) {
      this.activeNodeIndex = 0;
    }
    return this.pool.nodes[this.activeNodeIndex];
  }

  /**
   * Enforce Health TTL (Blocker 6)
   */
  isNodeHealthValid(node) {
    if (!node || node.active === false) return false;
    if (node.lastHealth !== 'HEALTHY') return false;
    if (!node.observedFingerprint) return false;
    const ttl = this.healthTtlMs || (this.pool && this.pool.healthTtlMs) || 60000;
    const now = Date.now();
    if (!node.lastVerifiedAt || (now - node.lastVerifiedAt > ttl)) {
      return false; // Stale verification expired
    }
    return true;
  }

  /**
   * [R6.9G.10.2] Perform authenticated egress canary probe through candidate node.
   * Probes bounded external endpoint, extracts observed public IP, and computes
   * one-way truncated SHA-256 fingerprint.
   * Strict TLS certificate verification (rejectUnauthorized: true hardcoded).
   */
  async verifyNodeEgress(node, timeoutMs = 5000, overrideCanaryUrl = null) {
    if (!node) return { verified: false, reason: 'NO_NODE' };

    // Explicit protocol boundary check (Issue #6 R6.9G.10.3 Blocker 4):
    // Relay pool supports HTTP_PROXY and HTTPS_PROXY upstream only. SOCKS5 is not supported in Relay mode.
    if (node.type !== 'HTTP_PROXY' && node.type !== 'HTTPS_PROXY') {
      return {
        verified: false,
        reason: `UNSUPPORTED_RELAY_NODE_TYPE: Node type "${node.type}" is not supported for Privacy Relay pool. Privacy Relay supports HTTP_PROXY and HTTPS_PROXY only. For direct SOCKS5 proxies, use Direct Managed Proxy mode.`
      };
    }

    const creds = PrivacyRelayService.resolveNodeCredentials(node);
    const targetUrl = overrideCanaryUrl || this.canaryUrl || (this.pool && this.pool.canaryUrl) || 'https://cloudflare.com/cdn-cgi/trace';
    const parsedTarget = new URL(targetUrl);
    const isHttps = parsedTarget.protocol === 'https:';
    const targetPort = parsedTarget.port ? parseInt(parsedTarget.port, 10) : (isHttps ? 443 : 80);

    return new Promise((resolve) => {
      let resolved = false;
      const done = (res) => {
        if (!resolved) {
          resolved = true;
          resolve(res);
        }
      };

      const timer = setTimeout(() => {
        done({ verified: false, reason: 'EGRESS_PROBE_TIMEOUT' });
      }, timeoutMs);

      // Connect to node proxy
      const isUpstreamTls = node.type === 'HTTPS_PROXY';
      const connectReq = `CONNECT ${parsedTarget.hostname}:${targetPort} HTTP/1.1\r\nHost: ${parsedTarget.hostname}:${targetPort}\r\n` +
        (creds.username && creds.password ? `Proxy-Authorization: Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}\r\n` : '') +
        '\r\n';

      const onSocketConnected = (sock) => {
        sock.write(connectReq);
        sock.once('data', (buf) => {
          const respStr = buf.toString('utf8');
          if (!respStr.includes('200')) {
            sock.destroy();
            clearTimeout(timer);
            return done({ verified: false, reason: `PROXY_CONNECT_STATUS: ${respStr.split('\r\n')[0]}` });
          }

          // Tunnel established. Now make HTTP/HTTPS request over tunnel.
          let clientSock = sock;
          if (isHttps) {
            const tlsOptions = {
              socket: sock,
              rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
            };
            if (node.ca) {
              tlsOptions.ca = node.ca;
            }
            if (!net.isIP(parsedTarget.hostname)) {
              tlsOptions.servername = parsedTarget.hostname;
            }
            clientSock = tls.connect(tlsOptions);
            clientSock.on('error', (tlsErr) => {
              clearTimeout(timer);
              done({ verified: false, reason: `TLS_HANDSHAKE_ERROR: ${tlsErr.message}` });
            });
          }

          let responseBody = '';
          clientSock.on('data', (chunk) => {
            responseBody += chunk.toString('utf8');
          });

          clientSock.on('end', () => {
            clearTimeout(timer);
            const bodyIdx = responseBody.indexOf('\r\n\r\n');
            const body = bodyIdx !== -1 ? responseBody.substring(bodyIdx + 4) : responseBody;

            // Extract observed IP or canary string
            let observed = null;
            const mIp = body.match(/ip=([^\r\n]+)/);
            if (mIp && mIp[1]) {
              observed = mIp[1].trim();
            } else if (body.includes('CANARY_OK')) {
              observed = `${node.id}:${node.host}:${node.port}:canary_ok`;
            } else if (body.trim().length > 0 && body.trim().length < 64) {
              observed = body.trim();
            }

            if (observed) {
              const fp = crypto.createHash('sha256').update(observed).digest('hex').substring(0, 16);
              node.observedEgressIp = observed;
              node.observedFingerprint = fp;
              node.lastHealth = 'HEALTHY';
              node.lastVerifiedAt = Date.now();
              done({ verified: true, fingerprint: fp, observed });
            } else {
              node.lastHealth = 'UNHEALTHY';
              done({ verified: false, reason: 'NO_VALID_EGRESS_PAYLOAD' });
            }
          });

          clientSock.on('error', (err) => {
            clearTimeout(timer);
            done({ verified: false, reason: `TUNNEL_READ_ERROR: ${err.message}` });
          });

          // Send GET request to target
          const getReq = `GET ${parsedTarget.pathname || '/'}${parsedTarget.search || ''} HTTP/1.1\r\n` +
            `Host: ${parsedTarget.hostname}\r\n` +
            `Connection: close\r\n\r\n`;
          clientSock.write(getReq);
        });
      };

      if (isUpstreamTls) {
        const tlsConnectOptions = {
          host: node.host,
          port: node.port,
          rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
        };
        if (node.ca) {
          tlsConnectOptions.ca = node.ca;
        }
        if (!net.isIP(node.host)) {
          tlsConnectOptions.servername = node.host;
        }
        const tlsSock = tls.connect(tlsConnectOptions, () => onSocketConnected(tlsSock));
        tlsSock.on('error', (err) => {
          clearTimeout(timer);
          done({ verified: false, reason: `UPSTREAM_TLS_CONNECT_ERROR: ${err.message}` });
        });
      } else {
        const rawSock = net.connect(node.port, node.host, () => onSocketConnected(rawSock));
        rawSock.on('error', (err) => {
          clearTimeout(timer);
          done({ verified: false, reason: `UPSTREAM_CONNECT_ERROR: ${err.message}` });
        });
      }
    });
  }

  /**
   * [R6.9G.10.2] Verify candidate before switching; never claim verified=true prematurely.
   */
  async rotateEgress(reason = 'MANUAL', overrideCanaryUrl = null) {
    if (!this.pool.nodes || this.pool.nodes.length === 0) {
      this.relayReady = false;
      return { success: false, reason: 'NO_NODES_IN_POOL' };
    }
    const prev = this.getActiveNode();
    if (reason === 'HEALTH_FAILOVER' && this.relayReady && this.isNodeHealthValid(prev)) {
      return {
        success: true,
        selectedEgressId: prev.id,
        egressFingerprint: prev.observedFingerprint,
        rotationCount: this.rotationCount,
        transport: prev.type,
        health: 'HEALTHY'
      };
    }
    const total = this.pool.nodes.length;
    let candidateIndex = (this.activeNodeIndex + 1) % total;
    let attempts = 0;

    while (attempts < total) {
      const candidate = this.pool.nodes[candidateIndex];
      if (candidate.active !== false) {
        this.log(`[PRIVACY_RELAY_PROBING] candidate=${candidate.id} host=${candidate.host} port=${candidate.port}`);
        const verifyRes = await this.verifyNodeEgress(candidate, this.pool.healthCheckTimeoutMs || 5000, overrideCanaryUrl);
        if (verifyRes.verified) {
          this.activeNodeIndex = candidateIndex;
          this.rotationCount++;
          this.relayReady = true;
          this.log(`[PRIVACY_RELAY_ROTATE] fromId=${prev ? prev.id : 'none'} toId=${candidate.id} reason=${reason} verified=true fingerprint=${candidate.observedFingerprint}`);
          return {
            success: true,
            selectedEgressId: candidate.id,
            egressFingerprint: candidate.observedFingerprint,
            rotationCount: this.rotationCount,
            transport: candidate.type,
            health: 'HEALTHY'
          };
        } else {
          this.log(`[PRIVACY_RELAY_CANDIDATE_FAILED] candidate=${candidate.id} reason=${verifyRes.reason}`);
        }
      }
      candidateIndex = (candidateIndex + 1) % total;
      attempts++;
    }

    this.relayReady = false;
    this.log(`[PRIVACY_RELAY_FAIL_CLOSED] All candidate egress nodes failed health check during rotation`);
    return {
      success: false,
      reason: 'PRIVACY_RELAY_NO_HEALTHY_EGRESS',
      selectedEgressId: null,
      egressFingerprint: null
    };
  }

  async selectEgress(nodeId, overrideCanaryUrl = null) {
    if (!this.pool.nodes || this.pool.nodes.length === 0) {
      this.relayReady = false;
      return { success: false, reason: 'NO_NODES_IN_POOL' };
    }
    const idx = this.pool.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) {
      return { success: false, reason: 'NODE_NOT_FOUND' };
    }
    const candidate = this.pool.nodes[idx];
    if (candidate.active === false) {
      return { success: false, reason: 'NODE_INACTIVE' };
    }

    const prev = this.getActiveNode();
    const verifyRes = await this.verifyNodeEgress(candidate, this.pool.healthCheckTimeoutMs || 5000, overrideCanaryUrl);
    if (!verifyRes.verified) {
      return { success: false, reason: 'CANDIDATE_HEALTH_CHECK_FAILED', details: verifyRes.reason };
    }

    this.activeNodeIndex = idx;
    this.rotationCount++;
    this.relayReady = true;
    this.log(`[PRIVACY_RELAY_ROTATE] fromId=${prev ? prev.id : 'none'} toId=${candidate.id} reason=EXPLICIT_SELECTION verified=true fingerprint=${candidate.observedFingerprint}`);
    return {
      success: true,
      selectedEgressId: candidate.id,
      egressFingerprint: candidate.observedFingerprint,
      rotationCount: this.rotationCount,
      transport: candidate.type,
      health: 'HEALTHY'
    };
  }

  /**
   * [R6.9G.10.2 Blocker 8] Synchronously set relayReady = false IMMEDIATELY upon failure.
   * Eliminates the ready-race window where new requests slip through before failover finishes.
   */
  async handleActiveFailure(reason) {
    // 1. Synchronously revoke ready state IMMEDIATELY
    this.relayReady = false;
    this.trafficStats.failClosedDrops++;
    const active = this.getActiveNode();
    if (active) {
      active.lastHealth = 'UNREACHABLE';
      active.lastVerifiedAt = 0;
    }
    this.log(`[PRIVACY_RELAY_ACTIVE_FAIL] active=${active ? active.id : 'none'} reason=${reason} (relayReady=false SYNCHRONOUS)`);

    // 2. If HEALTH_FAILOVER is configured, attempt automated rotation to candidate
    if (this.pool.rotationMode === 'HEALTH_FAILOVER') {
      this.log(`[PRIVACY_RELAY_FAILOVER_TRIGGER] Attempting failover to secondary node...`);
      const rotRes = await this.rotateEgress('HEALTH_FAILOVER');
      if (rotRes.success) {
        this.log(`[PRIVACY_RELAY_FAILOVER_SUCCESS] Failover completed to ${rotRes.selectedEgressId}`);
        // relayReady is set to true inside rotateEgress ONLY after candidate passes verification!
        return true;
      }
    }

    this.relayReady = false;
    this.log(`[PRIVACY_RELAY_FAIL_CLOSED] Relay paused fail-closed due to upstream failure`);
    return false;
  }

  getStatus() {
    const active = this.getActiveNode();
    const ttl = this.healthTtlMs || (this.pool && this.pool.healthTtlMs) || 60000;
    const isHealthValid = this.isNodeHealthValid(active);
    const isExpired = active && active.lastVerifiedAt > 0 && (Date.now() - active.lastVerifiedAt > ttl);
    const ready = !this.isPaused && this.relayReady && isHealthValid;

    // Redact nodes
    const redactedNodes = (this.pool.nodes || []).map(n => {
      const nodeExpired = n.lastVerifiedAt > 0 && (Date.now() - n.lastVerifiedAt > ttl);
      const healthStatus = nodeExpired ? 'EXPIRED' : (n.lastHealth || 'UNKNOWN');
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        host: n.host,
        port: n.port,
        region: n.region,
        active: n.active,
        lastHealth: healthStatus,
        hasCredentials: Boolean(n.username || n.credentialRef || n.password),
        fingerprint: n.observedFingerprint || null,
        lastVerifiedAt: n.lastVerifiedAt || 0
      };
    });

    return {
      service: 'XPIDER Privacy Relay',
      version: this.pool.version || '1.0.2',
      relayReady: ready,
      paused: this.isPaused,
      controlPort: this.controlPort,
      proxyPort: this.proxyPort,
      rotationMode: this.pool.rotationMode || 'HEALTH_FAILOVER',
      selectedEgressId: active ? active.id : null,
      egressFingerprint: active ? active.observedFingerprint : null,
      transport: active ? active.type : 'NONE',
      health: isExpired ? 'EXPIRED' : (active ? (active.lastHealth || 'UNKNOWN') : 'NO_NODES'),
      healthTtlMs: ttl,
      activeNodeIndex: this.activeNodeIndex,
      totalNodes: this.pool.nodes ? this.pool.nodes.length : 0,
      rotationCount: this.rotationCount,
      lastCheck: new Date().toISOString(),
      nodes: redactedNodes,
      trafficStats: { ...this.trafficStats }
    };
  }

  startControlPlane() {
    this.controlServer = http.createServer(async (req, res) => {
      const parsed = new URL(req.url, 'http://127.0.0.1');
      const pathname = parsed.pathname;

      res.setHeader('Content-Type', 'application/json');

      // Restricted CORS: strictly allow only the exact XPIDER extension ID (Blocker 3)
      const origin = req.headers['origin'];
      if (origin && typeof origin === 'string') {
        const expectedOrigin = this.allowedExtensionId ? `chrome-extension://${this.allowedExtensionId}` : null;
        if (expectedOrigin && origin === expectedOrigin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        } else {
          // Reject rogue extension origins with 403 Forbidden
          this.log(`[PRIVACY_RELAY_FORBIDDEN_CORS] origin=${origin} expected=${expectedOrigin}`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'FORBIDDEN_ORIGIN',
            message: `Origin ${origin} is not authorized for this privacy relay instance`
          }));
          return;
        }
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // GET /health: Public unauthenticated ping (does not disclose fingerprints or secrets)
      if (pathname === '/health' && req.method === 'GET') {
        const active = this.getActiveNode();
        const isHealthValid = this.isNodeHealthValid(active);
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'OK',
          relayReady: !this.isPaused && this.relayReady && isHealthValid,
          service: 'XPIDER Privacy Relay',
          version: this.pool.version || '1.0.2',
          controlPort: this.controlPort,
          proxyPort: this.proxyPort,
          selectedEgressId: active ? active.id : null,
          uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
        }));
        return;
      }

      // Check Bearer Token Authorization for all other endpoints
      const authHeader = req.headers['authorization'] || '';
      const isAuthorized = authHeader === `Bearer ${this.controlToken}`;
      if (!isAuthorized) {
        res.writeHead(401);
        res.end(JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Valid Bearer control token required for relay control API'
        }));
        return;
      }

      // GET /status (Authenticated)
      if (pathname === '/status' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(this.getStatus()));
        return;
      }

      // POST /rotate (Authenticated)
      if (pathname === '/rotate' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          let reason = 'MANUAL';
          let rotCanaryUrl = null;
          try {
            if (body) {
              const data = JSON.parse(body);
              if (data.reason) reason = data.reason;
              if (data.canaryUrl) rotCanaryUrl = data.canaryUrl;
            }
          } catch (_) {}
          const result = await this.rotateEgress(reason, rotCanaryUrl);
          res.writeHead(result.success ? 200 : 503);
          res.end(JSON.stringify(result));
        });
        return;
      }

      // POST /select or POST /select/:egressId (Authenticated)
      if ((pathname === '/select' || pathname.startsWith('/select/')) && req.method === 'POST') {
        let nodeId = null;
        if (pathname.startsWith('/select/')) {
          nodeId = decodeURIComponent(pathname.substring('/select/'.length));
        }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          let selCanaryUrl = null;
          try {
            if (body) {
              const data = JSON.parse(body);
              if (data.egressId) nodeId = data.egressId;
              if (data.canaryUrl) selCanaryUrl = data.canaryUrl;
            }
          } catch (_) {}
          if (!nodeId) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, reason: 'MISSING_EGRESS_ID' }));
            return;
          }
          const result = await this.selectEgress(nodeId, selCanaryUrl);
          res.writeHead(result.success ? 200 : 503);
          res.end(JSON.stringify(result));
        });
        return;
      }

      // POST /mode (Authenticated)
      if (pathname === '/mode' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.rotationMode) {
              this.pool.rotationMode = data.rotationMode;
              this.saveConfig();
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, rotationMode: this.pool.rotationMode }));
              return;
            }
          } catch (_) {}
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, reason: 'INVALID_ROTATION_MODE' }));
        });
        return;
      }

      // POST /pause (Authenticated)
      if (pathname === '/pause' && req.method === 'POST') {
        this.isPaused = true;
        this.log(`[PRIVACY_RELAY] state=PAUSED selectedEgressId=${this.getActiveNode()?.id || 'none'}`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, paused: true }));
        return;
      }

      // POST /resume (Authenticated)
      if (pathname === '/resume' && req.method === 'POST') {
        this.isPaused = false;
        this.log(`[PRIVACY_RELAY] state=RESUMED selectedEgressId=${this.getActiveNode()?.id || 'none'}`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, paused: false }));
        return;
      }

      // POST /probe (Authenticated)
      if (pathname === '/probe' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          let probeCanaryUrl = null;
          try {
            if (body) {
              const data = JSON.parse(body);
              if (data.canaryUrl) probeCanaryUrl = data.canaryUrl;
            }
          } catch (_) {}
          const active = this.getActiveNode();
          if (!active) {
            res.writeHead(503);
            res.end(JSON.stringify({ success: false, reason: 'NO_ACTIVE_NODE' }));
            return;
          }
          const verifyRes = await this.verifyNodeEgress(active, this.pool.healthCheckTimeoutMs || 5000, probeCanaryUrl);
          if (verifyRes.verified) {
            this.relayReady = true;
          }
          res.writeHead(verifyRes.verified ? 200 : 503);
          res.end(JSON.stringify({
            activeNode: active.id,
            ...verifyRes
          }));
        });
        return;
      }

      // GET /nodes (Authenticated) - Retrieve sanitized egress pool nodes
      if (pathname === '/nodes' && req.method === 'GET') {
        const sanitized = (this.pool.nodes || []).map(n => ({
          id: n.id,
          type: n.type,
          host: n.host,
          port: n.port,
          username: n.username || '',
          enabled: n.enabled !== false && n.active !== false,
          region: n.region || '',
          lastHealth: n.lastHealth || 'UNKNOWN'
        }));
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          nodes: sanitized,
          activeNodeId: this.getActiveNode()?.id || null
        }));
        return;
      }

      // POST /add-node (Authenticated) - Add/Update egress node with DPAPI secret storage
      if (pathname === '/add-node' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            // Protocol validation:
            if (!data.type || (data.type !== 'HTTP_PROXY' && data.type !== 'HTTPS_PROXY')) {
              if (data.type === 'SOCKS5') {
                res.writeHead(400);
                res.end(JSON.stringify({
                  success: false,
                  reason: 'UNSUPPORTED_RELAY_NODE_TYPE: Privacy Relay pool supports HTTP_PROXY and HTTPS_PROXY only. For direct SOCKS5 proxies, use Direct Managed Proxy mode.'
                }));
                return;
              }
              res.writeHead(400);
              res.end(JSON.stringify({
                success: false,
                reason: 'INVALID_NODE_TYPE: Must be HTTP_PROXY or HTTPS_PROXY.'
              }));
              return;
            }
            if (!data.host || typeof data.host !== 'string' || data.host.trim().length === 0) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'INVALID_HOST' }));
              return;
            }
            const port = parseInt(data.port, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'INVALID_PORT' }));
              return;
            }

            const newNode = {
              id: (data.id || data.name || `egress-node-${Date.now()}`).trim(),
              type: data.type,
              host: data.host.trim(),
              port: port,
              username: (data.username || '').trim(),
              password: (data.password || '').trim(),
              credentialRef: (data.credentialRef || '').trim(),
              active: data.enabled !== false,
              region: (data.region || '').trim()
            };

            // Sanitize and securely encrypt credentials via winsec (fails closed if DPAPI fails)
            const sanitized = winsec.sanitizeNodeForSave(newNode);

            if (!this.pool.nodes) this.pool.nodes = [];
            const existingIdx = this.pool.nodes.findIndex(n => n.id === sanitized.id);
            if (existingIdx !== -1) {
              this.pool.nodes[existingIdx] = sanitized;
            } else {
              this.pool.nodes.push(sanitized);
            }

            if (data.persist !== false) {
              this.saveConfig();
            }

            this.log(`[PRIVACY_RELAY] Added/Updated egress node: id=${sanitized.id} type=${sanitized.type} host=${sanitized.host}:${sanitized.port}`);

            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              node: {
                id: sanitized.id,
                type: sanitized.type,
                host: sanitized.host,
                port: sanitized.port,
                username: sanitized.username,
                region: sanitized.region,
                enabled: sanitized.active !== false
              },
              totalNodes: this.pool.nodes.length
            }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /remove-node (Authenticated) - Remove egress node from pool
      if (pathname === '/remove-node' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (!data.id) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'MISSING_NODE_ID' }));
              return;
            }
            const beforeCount = (this.pool.nodes || []).length;
            this.pool.nodes = (this.pool.nodes || []).filter(n => n.id !== data.id);
            if (this.activeNodeIndex >= this.pool.nodes.length) {
              this.activeNodeIndex = 0;
            }
            if (this.pool.nodes.length === 0) {
              this.relayReady = false;
            }
            if (data.persist !== false) {
              this.saveConfig();
            }
            this.log(`[PRIVACY_RELAY] Removed egress node: id=${data.id} remaining=${this.pool.nodes.length}`);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, count: this.pool.nodes.length, removed: beforeCount !== this.pool.nodes.length }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /set-pool (Authenticated)
      if (pathname === '/set-pool' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (Array.isArray(data.nodes) && data.nodes.length > 0) {
              // Explicit check for unsupported node types
              for (const n of data.nodes) {
                if (n.type === 'SOCKS5') {
                  res.writeHead(400);
                  res.end(JSON.stringify({
                    success: false,
                    reason: 'UNSUPPORTED_RELAY_NODE_TYPE: Privacy Relay pool supports HTTP_PROXY and HTTPS_PROXY only. For direct SOCKS5 proxies, use Direct Managed Proxy mode.'
                  }));
                  return;
                }
              }

              this.pool.nodes = data.nodes;
              if (data.canaryUrl) {
                this.pool.canaryUrl = data.canaryUrl;
              }
              this.activeNodeIndex = 0;
              this.relayReady = false; // Require re-verification
              if (data.persist === true) {
                this.saveConfig();
              }
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, count: this.pool.nodes.length }));
            } else {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'INVALID_NODES_ARRAY' }));
            }
          } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /stop (Authenticated)
      if (pathname === '/stop' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'SHUTTING_DOWN' }));
        setImmediate(async () => {
          await this.stop();
          process.exit(0);
        });
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'ENDPOINT_NOT_FOUND' }));
    });

    this.controlServer.listen(this.controlPort, '127.0.0.1', () => {
      this.log(`Control plane listening on http://127.0.0.1:${this.controlPort}`);
    });
  }

  startProxyEngine() {
    this.proxyServer = http.createServer((req, res) => {
      this.trafficStats.requestsProxied++;
      if (this.isPaused || !this.relayReady) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=${this.isPaused ? 'RELAY_PAUSED' : 'RELAY_NOT_VERIFIED'}`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('PRIVACY_RELAY_FAIL_CLOSED: Relay paused or not verified');
        return;
      }

      const active = this.getActiveNode();
      if (!active) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=NO_ACTIVE_EGRESS_NODE`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('PRIVACY_RELAY_FAIL_CLOSED: No active egress node');
        return;
      }

      // Enforce Health TTL (Blocker 6)
      if (!this.isNodeHealthValid(active)) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=HEALTH_TTL_EXPIRED active=${active.id}`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('PRIVACY_RELAY_FAIL_CLOSED: Egress health TTL expired; re-verification required');
        return;
      }

      const creds = PrivacyRelayService.resolveNodeCredentials(active);
      const isUpstreamTls = active.type === 'HTTPS_PROXY';

      const options = {
        hostname: active.host,
        port: active.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers }
      };

      if (creds.username && creds.password) {
        const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        options.headers['Proxy-Authorization'] = `Basic ${auth}`;
      }

      const httpModule = isUpstreamTls ? https : http;
      if (isUpstreamTls) {
        options.rejectUnauthorized = true; // Strictly hardcoded (Blocker 9)
        if (active.ca) {
          options.ca = active.ca;
        }
      }

      const proxyReq = httpModule.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        this.handleActiveFailure(`HTTP_FORWARD_ERROR: ${err.message}`);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`PRIVACY_RELAY_FAIL_CLOSED: Upstream egress failure (${err.message})`);
      });

      req.pipe(proxyReq);
    });

    // Handle CONNECT method for HTTPS tunnels
    this.proxyServer.on('connect', (req, clientSocket, head) => {
      this.trafficStats.connectTunnels++;
      if (this.isPaused || !this.relayReady) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=${this.isPaused ? 'RELAY_PAUSED_CONNECT' : 'RELAY_NOT_VERIFIED_CONNECT'}`);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      const active = this.getActiveNode();
      if (!active) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=NO_ACTIVE_EGRESS_NODE_CONNECT`);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      // Enforce Health TTL (Blocker 6)
      if (!this.isNodeHealthValid(active)) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=HEALTH_TTL_EXPIRED_CONNECT active=${active.id}`);
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      const creds = PrivacyRelayService.resolveNodeCredentials(active);
      const isUpstreamTls = active.type === 'HTTPS_PROXY';

      let connectReq = `CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\n`;
      if (creds.username && creds.password) {
        const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
        connectReq += `Proxy-Authorization: Basic ${auth}\r\n`;
      }
      connectReq += '\r\n';

      const setupTunnel = (upstreamSocket) => {
        upstreamSocket.write(connectReq);
        upstreamSocket.once('data', (data) => {
          const responseStr = data.toString('utf8');
          if (responseStr.includes('200')) {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            if (head && head.length > 0) upstreamSocket.write(head);
            upstreamSocket.pipe(clientSocket);
            clientSocket.pipe(upstreamSocket);
          } else {
            this.handleActiveFailure(`CONNECT_REJECTED: ${responseStr.split('\r\n')[0]}`);
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
            upstreamSocket.destroy();
          }
        });
      };

      if (isUpstreamTls) {
        const tlsOptions = {
          host: active.host,
          port: active.port,
          servername: active.host,
          rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
        };
        if (active.ca) {
          tlsOptions.ca = active.ca;
        }
        const tlsSocket = tls.connect(tlsOptions, () => setupTunnel(tlsSocket));

        tlsSocket.on('error', (err) => {
          this.handleActiveFailure(`UPSTREAM_TLS_CONNECT_ERROR: ${err.message}`);
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.destroy();
        });
      } else {
        const upstreamSocket = net.connect(active.port, active.host, () => setupTunnel(upstreamSocket));
        upstreamSocket.on('error', (err) => {
          this.handleActiveFailure(`UPSTREAM_CONNECT_ERROR: ${err.message}`);
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.destroy();
        });
      }
    });

    this.proxyServer.listen(this.proxyPort, '127.0.0.1', () => {
      this.log(`Proxy engine listening on http://127.0.0.1:${this.proxyPort}`);
    });
  }

  async start() {
    this.startControlPlane();
    this.startProxyEngine();

    // Verify initial active node before marking relay ready
    const active = this.getActiveNode();
    if (active && active.active !== false) {
      const vRes = await this.verifyNodeEgress(active, this.pool.healthCheckTimeoutMs || 5000);
      if (vRes.verified) {
        this.relayReady = true;
      }
    }

    const currentFp = this.computeFingerprint(this.getActiveNode());
    this.log(`[PRIVACY_RELAY] state=RUNNING selectedEgressId=${active ? active.id : 'none'} transport=${active ? active.type : 'none'} health=${active ? active.lastHealth : 'NONE'} rotationMode=${this.pool.rotationMode || 'HEALTH_FAILOVER'} fingerprint=${currentFp || 'UNVERIFIED'}`);
    console.log(`[PRIVACY_RELAY] XPIDER Privacy Relay Companion running.`);
    console.log(`[PRIVACY_RELAY] Control Plane: http://127.0.0.1:${this.controlPort}`);
    console.log(`[PRIVACY_RELAY] Proxy Gateway: http://127.0.0.1:${this.proxyPort}`);
  }

  async stop() {
    const promises = [];
    if (this.controlServer) {
      promises.push(new Promise(r => {
        try {
          if (typeof this.controlServer.closeAllConnections === 'function') {
            this.controlServer.closeAllConnections();
          }
          this.controlServer.close(r);
        } catch (_) { r(); }
      }));
    }
    if (this.proxyServer) {
      promises.push(new Promise(r => {
        try {
          if (typeof this.proxyServer.closeAllConnections === 'function') {
            this.proxyServer.closeAllConnections();
          }
          this.proxyServer.close(r);
        } catch (_) { r(); }
      }));
    }
    await Promise.all(promises);
    this.controlServer = null;
    this.proxyServer = null;
    this.relayReady = false;
    this.log('[PRIVACY_RELAY] state=STOPPED');
    await new Promise(r => setTimeout(r, 50));
  }
}

if (require.main === module) {
  const service = new PrivacyRelayService();
  service.start();

  process.on('SIGINT', async () => {
    await service.stop();
    setTimeout(() => process.exit(0), 50);
  });
  process.on('SIGTERM', async () => {
    await service.stop();
    setTimeout(() => process.exit(0), 50);
  });
}

module.exports = { PrivacyRelayService, CONTROL_PORT, PROXY_PORT };

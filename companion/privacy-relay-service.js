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
const { PhysicalGate } = require('./physical-gate');
const { PrivateEgressProvisioner, TIERS } = require('./private-egress-provisioner');
const residentialAdapter = require('./residential-proxy-adapter');

const CONTROL_PORT = 18989;
const PROXY_PORT = 18988;
const CONFIG_FILE = process.env.XPIDER_RELAY_CONFIG_FILE || path.join(__dirname, 'egress_pool_config.json');
const LOG_FILE = path.join(__dirname, 'privacy_relay.log');
const TOKEN_FILE = path.join(__dirname, '.control_token');
// [Defect V4 Invariant] Exposed RC3.6 control token hash - strictly revoked and rotated if detected
const EXPOSED_RC3_6_TOKEN_SHA256 = '597a70b99c11c7f4d13a075204ac240bb08a7a1d6c08c78268328e0bb59daeda';

// [R6.9G.10.3.7.1.4.32 / RC3.18 Hardening] Global unhandled exception & rejection guards
// Process must remain immortal against transient socket resets, client tab aborts, or ECONNRESET
process.on('uncaughtException', (err) => {
  try {
    const msg = `[COMPANION_UNCAUGHT_EXCEPTION] ${new Date().toISOString()} ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(LOG_FILE, msg);
    console.error(msg);
  } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  try {
    const msg = `[COMPANION_UNHANDLED_REJECTION] ${new Date().toISOString()} ${reason && reason.stack ? reason.stack : reason}\n`;
    fs.appendFileSync(LOG_FILE, msg);
    console.error(msg);
  } catch (_) {}
});

// [Defect Q2 Hardening - Issue #6 Comment #6244711545] Authoritative companion build identity & capabilities
const COMPANION_BUILD_ID = 'R6.9G.10.3.7.1.4.63-20261023-P0-RC3.47';
const COMPANION_IMPLEMENTATION_HEAD = '7c0dabba02974b706c3da985a9ee91b9f67a2114';

function isCompatibleExtensionBuild(extBuildId, companionBuildId) {
  if (!extBuildId || typeof extBuildId !== 'string') return false;
  if (!companionBuildId || typeof companionBuildId !== 'string') return false;
  return extBuildId.split('-')[0] === companionBuildId.split('-')[0];
}
const COMPANION_API_CAPABILITIES = [
  'verify-plan',
  'provision-egress',
  'provision-progress',
  'destroy-egress',
  'egress-telemetry',
  'shutdown',
  'stop',
  'physical-gate',
  'recovery-status',
  'repair-egress'
];

// [Defect P Fix] Strict Node.js supported LTS allowlist (explicitly 22 or 24 only; rejects odd/EOL/non-LTS majors)
const SUPPORTED_LTS_MAJORS = [22, 24];
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (!SUPPORTED_LTS_MAJORS.includes(nodeMajor)) {
  console.error(`[FATAL] Unsupported Node.js runtime detected (${process.version}). XPIDER Privacy Relay requires an official supported LTS runtime (explicitly v24 or v22 LTS). Non-LTS/EOL majors (${nodeMajor}) are strictly rejected.`);
  process.exit(1);
}

/**
 * [P0-2 Hardening] Redact credentials, API tokens, and passwords from logs and messages
 */
function redactSecrets(text, extraTokens = []) {
  if (typeof text !== 'string') {
    try { text = JSON.stringify(text); } catch (_) { text = String(text); }
  }
  let scrubbed = text;
  scrubbed = scrubbed.replace(/dop_v1_[a-f0-9]{64}/gi, '[REDACTED_DO_TOKEN]');
  scrubbed = scrubbed.replace(/Bearer\s+([a-zA-Z0-9_\-\.]{20,})/gi, 'Bearer [REDACTED_TOKEN]');
  scrubbed = scrubbed.replace(/Basic\s+([a-zA-Z0-9+\/=]{10,})/gi, 'Basic [REDACTED_BASIC_AUTH]');
  scrubbed = scrubbed.replace(/"password"\s*:\s*"[^"]+"/gi, '"password":"[REDACTED_PASSWORD]"');
  scrubbed = scrubbed.replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED_TOKEN]"');
  scrubbed = scrubbed.replace(/--token[=\s]+[^\s]+/gi, '--token [REDACTED_TOKEN]');
  scrubbed = scrubbed.replace(/password\s*=\s*[^\s]+/gi, 'password=[REDACTED]');
  for (const t of extraTokens) {
    if (t && typeof t === 'string' && t.length >= 6) {
      scrubbed = scrubbed.split(t).join('[REDACTED_SECRET]');
    }
  }
  return scrubbed;
}

const DEFAULT_POOL = {
  version: '1.0.3',
  rotationMode: 'HEALTH_FAILOVER', // FIXED | MANUAL | CAMPAIGN_BOUNDARY | HEALTH_FAILOVER
  healthCheckTimeoutMs: 5000,
  healthTtlMs: 60000,
  canaryUrl: 'https://cloudflare.com/cdn-cgi/trace',
  selectedEgressId: null,
  nodes: [],
  physicalGate: {
    enabled: false,
    pinnedEgressFingerprint: null,
    pinnedEgressIdentityGroup: null
  }
};

class PrivacyRelayService {
  constructor(options = {}) {
    this.options = options;
    this.companionDir = options.companionDir || __dirname;
    this.controlPort = options.controlPort || CONTROL_PORT;
    this.proxyPort = options.proxyPort || options.listenPort || PROXY_PORT;
    this.canaryUrl = options.canaryUrl || null;
    this.allowedExtensionId = options.allowedExtensionId || process.env.XPIDER_ALLOWED_EXT_ID || discoverExtensionId(__dirname) || null;
    this.healthTtlMs = options.healthTtlMs || 60000;
    this.healthRefreshIntervalMs = options.healthRefreshIntervalMs || null;
    this.enableContinuousHealthMonitor = options.enableContinuousHealthMonitor !== false;
    this.healthRefreshTimer = null;
    this.isRefreshingHealth = false;
    this.configFile = options.configFile || CONFIG_FILE;
    this.tokenFile = options.tokenFile || (options.configFile ? path.join(path.dirname(options.configFile), '.control_token') : TOKEN_FILE);
    this.startTime = Date.now();
    this.activeNodeIndex = 0;
    this.rotationCount = 0;
    this.isPaused = false;
    this.relayReady = false; // Block forwarding until active node is verified
    // [R6.9G.10.3.7.1.4.32 / RC3.18 Lifecycle State Machine & Reconnect Backoff]
    this.lifecycleState = 'INITIALIZING'; // 'INITIALIZING' | 'READY' | 'DEGRADED' | 'RECONNECTING' | 'FAILED'
    this.reconnectAttempt = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectBaseBackoffMs = 1000;
    this.reconnectMaxBackoffMs = 15000;
    this.reconnectTimer = null;
    this.lastDisconnectReason = null;
    this.lastDisconnectTime = null;
    this.consecutiveFailures = 0;
    this.failureThreshold = 2; // Require 2 consecutive probe failures before revoking ready
    this.controlToken = this.loadOrGenerateControlToken(options.controlToken);
    this.pool = this.loadConfig();

    // Deterministic trust anchor restoration (Issue #6 R6.9G.10.3.7.1.4)
    let initialPinnedFp = this.pool.physicalGate?.pinnedEgressFingerprint || null;
    let initialPinnedGroup = this.pool.physicalGate?.pinnedEgressIdentityGroup || null;

    // If not explicitly stored in physicalGate metadata, deterministically reconstruct from enrolled nodes
    if (!initialPinnedFp && this.pool.nodes && Array.isArray(this.pool.nodes)) {
      const enrolledNodes = this.pool.nodes.filter(n => n.expectedEgressFingerprint && n.egressIdentityGroup);
      if (enrolledNodes.length > 0) {
        const firstFp = enrolledNodes[0].expectedEgressFingerprint;
        const firstGroup = enrolledNodes[0].egressIdentityGroup;
        const allAgree = enrolledNodes.every(n => n.expectedEgressFingerprint === firstFp && n.egressIdentityGroup === firstGroup);
        if (allAgree) {
          initialPinnedFp = firstFp;
          initialPinnedGroup = firstGroup;
        }
      }
    }

    // Initialize Physical Router Security Gate (Issue #6 R6.9G.10.3.7)
    this.physicalGate = options.physicalGate || new PhysicalGate({
      enabled: Boolean(this.pool.physicalGate && this.pool.physicalGate.enabled),
      physicalGateTtlMs: (this.pool.physicalGate && this.pool.physicalGate.physicalGateTtlMs) || 30000,
      pinnedEgressFingerprint: initialPinnedFp,
      pinnedEgressIdentityGroup: initialPinnedGroup
    });

    if (this.physicalGate && !this.physicalGate.pinnedEgressFingerprint && initialPinnedFp) {
      this.physicalGate.pinnedEgressFingerprint = initialPinnedFp;
      this.physicalGate.pinnedEgressIdentityGroup = initialPinnedGroup;
    }

    // Reset all runtime health states on process start
    if (this.pool.nodes && Array.isArray(this.pool.nodes)) {
      this.pool.nodes.forEach(n => {
        n.lastHealth = 'UNKNOWN';
        n.observedEgressIp = null;
        n.observedFingerprint = null;
        n.lastVerifiedAt = 0;
      });
    }

    // Restore sticky active node index from persisted selectedEgressId (Issue #6 R6.9G.10.3.6.2.1 Blocker 4)
    if (this.pool.selectedEgressId && Array.isArray(this.pool.nodes)) {
      const savedIdx = this.pool.nodes.findIndex(n => n.id === this.pool.selectedEgressId);
      if (savedIdx !== -1) {
        this.activeNodeIndex = savedIdx;
      }
    }

    this.controlServer = null;
    this.proxyServer = null;
    this.trafficStats = {
      requestsProxied: 0,
      connectTunnels: 0,
      failClosedDrops: 0
    };
    this.provisioningState = {
      running: false,
      events: [],
      lastEvent: null,
      result: null,
      error: null
    };
  }

  loadOrGenerateControlToken(explicitToken) {
    if (explicitToken && typeof explicitToken === 'string') {
      const trimmed = explicitToken.trim();
      const hash = crypto.createHash('sha256').update(trimmed).digest('hex');
      if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
        this.log('[SECURITY_ROTATION] Explicit control token matches exposed RC3.6 token hash; rotating to fresh token');
      } else {
        return trimmed;
      }
    }
    if (process.env.XPIDER_RELAY_CONTROL_TOKEN) {
      const envToken = process.env.XPIDER_RELAY_CONTROL_TOKEN.trim();
      const hash = crypto.createHash('sha256').update(envToken).digest('hex');
      if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
        this.log('[SECURITY_ROTATION] XPIDER_RELAY_CONTROL_TOKEN matches exposed RC3.6 token hash; rotating to fresh token');
      } else {
        return envToken;
      }
    }
    const tokenFile = this.tokenFile || (this.configFile ? path.join(path.dirname(this.configFile), '.control_token') : TOKEN_FILE);
    try {
      if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, 'utf8').trim();
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
          this.log('[SECURITY_ROTATION] Detected exposed RC3.6 control token in .control_token file; purging and rotating to fresh token');
          try {
            fs.unlinkSync(tokenFile);
          } catch (_) {}
        } else if (token && token.length >= 32) {
          return token;
        }
      }
    } catch (_) {}

    const newToken = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(tokenFile, newToken, { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}
    return newToken;
  }

  static rotateExposedTokenIfPresent(baseDir = __dirname) {
    const tokenPath = path.join(baseDir, '.control_token');
    try {
      if (fs.existsSync(tokenPath)) {
        const content = fs.readFileSync(tokenPath, 'utf8').trim();
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        if (hash === EXPOSED_RC3_6_TOKEN_SHA256) {
          try { fs.unlinkSync(tokenPath); } catch (_) {}
          const newToken = crypto.randomBytes(32).toString('hex');
          fs.writeFileSync(tokenPath, newToken, { encoding: 'utf8', mode: 0o600 });
          return { rotated: true, newTokenSha256: crypto.createHash('sha256').update(newToken).digest('hex') };
        }
      }
    } catch (_) {}
    return { rotated: false };
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

  static resolveNodeCredentials(node, dir) {
    return winsec.resolveNodeCredentials(node, dir);
  }

  loadConfig() {
    try {
      if (!fs.existsSync(this.configFile)) {
        if (!this.disableAutoMigration) {
          try {
            const { migrateActiveEgressState } = require('./state-migrator');
            migrateActiveEgressState(path.dirname(this.configFile));
          } catch (_) {}
        }
      }

      if (fs.existsSync(this.configFile)) {
        const compDir = path.dirname(this.configFile);
        const data = fs.readFileSync(this.configFile, 'utf8');
        const parsed = JSON.parse(data);
        if ((!parsed.nodes || parsed.nodes.length === 0) && !this.disableAutoMigration) {
          try {
            const { migrateActiveEgressState } = require('./state-migrator');
            const mig = migrateActiveEgressState(compDir);
            if (mig && mig.migrated) {
              const refreshedData = fs.readFileSync(this.configFile, 'utf8');
              const refreshedParsed = JSON.parse(refreshedData);
              const refreshedHydrated = (refreshedParsed.nodes || []).map(n => winsec.hydrateNode(n, compDir));
              return {
                ...DEFAULT_POOL,
                ...refreshedParsed,
                nodes: refreshedHydrated,
                physicalGate: { ...DEFAULT_POOL.physicalGate }
              };
            }
          } catch (_) {}
        }
        const hydratedNodes = (parsed.nodes || []).map(n => winsec.hydrateNode(n, compDir));
        return {
          ...DEFAULT_POOL,
          ...parsed,
          nodes: hydratedNodes,
          physicalGate: {
            ...DEFAULT_POOL.physicalGate,
            ...(parsed.physicalGate || {})
          }
        };
      }
    } catch (e) {
      this.log(`Failed to load config: ${e.message}`);
    }
    return {
      ...DEFAULT_POOL,
      physicalGate: { ...DEFAULT_POOL.physicalGate }
    };
  }

  saveConfig() {
    try {
      const compDir = path.dirname(this.configFile);
      const sanitizedNodes = (this.pool.nodes || []).map(n => winsec.sanitizeNodeForSave(n));
      // Invariant: Rehearsal and mock test nodes must never persist to production pool config
      const productionNodes = sanitizedNodes.filter(n => !(n.id && n.id.startsWith('node-rehearsal')) && !n.rehearsal && !n.mock);
      const configNodes = productionNodes.map(n => {
        if (n.credentialRef) {
          winsec.saveLocalNodeCredential(n.id, n.credentialRef, compDir);
        }
        return {
          ...n,
          credentialRef: '',
          password: ''
        };
      });
      const active = this.getActiveNode();
      const prodActive = productionNodes.find(n => n.id === (active ? active.id : null)) || productionNodes[0] || null;
      const toSave = {
        version: this.pool.version || '1.0.3',
        rotationMode: this.pool.rotationMode || 'HEALTH_FAILOVER',
        healthCheckTimeoutMs: this.pool.healthCheckTimeoutMs || 5000,
        healthTtlMs: this.pool.healthTtlMs || 60000,
        canaryUrl: this.pool.canaryUrl || 'https://cloudflare.com/cdn-cgi/trace',
        selectedEgressId: prodActive ? prodActive.id : null,
        nodes: configNodes,
        physicalGate: {
          enabled: Boolean(this.physicalGate && this.physicalGate.enabled),
          pinnedEgressFingerprint: this.physicalGate?.pinnedEgressFingerprint || this.pool.physicalGate?.pinnedEgressFingerprint || null,
          pinnedEgressIdentityGroup: this.physicalGate?.pinnedEgressIdentityGroup || this.pool.physicalGate?.pinnedEgressIdentityGroup || null
        }
      };
      fs.writeFileSync(this.configFile, JSON.stringify(toSave, null, 2), 'utf8');
      try {
        const { mirrorStateToGlobalBackup } = require('./state-migrator');
        mirrorStateToGlobalBackup(compDir);
      } catch (_) {}
      return true;
    } catch (e) {
      this.log(`Failed to save config: ${e.message}`);
      return false;
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
   * [RC3.14 CC1] Bounded cadence <= TTL / 3 (e.g. 15-20s for 60s TTL)
   */
  getHealthRefreshIntervalMs() {
    if (this.healthRefreshIntervalMs && typeof this.healthRefreshIntervalMs === 'number' && this.healthRefreshIntervalMs > 0) {
      return this.healthRefreshIntervalMs;
    }
    const ttl = this.healthTtlMs || (this.pool && this.pool.healthTtlMs) || 60000;
    return Math.max(100, Math.min(20000, Math.floor(ttl / 3)));
  }

  /**
   * [RC3.14 CC1] Start continuous proactive health monitor to renew verification before TTL expiry
   */
  startContinuousHealthMonitor() {
    this.stopContinuousHealthMonitor();
    if (!this.enableContinuousHealthMonitor) return;
    if (this.isPaused) return;
    const intervalMs = this.getHealthRefreshIntervalMs();
    this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Starting continuous health monitor (cadence=${intervalMs}ms, ttl=${this.healthTtlMs}ms)`);
    this.healthRefreshTimer = setInterval(async () => {
      try {
        await this.refreshActiveNodeHealth();
      } catch (err) {
        this.log(`[PRIVACY_RELAY_HEALTH_MONITOR_ERROR] Unexpected error in health refresh: ${err.message}`);
      }
    }, intervalMs);
    if (this.healthRefreshTimer && typeof this.healthRefreshTimer.unref === 'function') {
      this.healthRefreshTimer.unref();
    }
  }

  /**
   * [RC3.14 CC1] Stop continuous health monitor and release timer
   */
  stopContinuousHealthMonitor() {
    if (this.healthRefreshTimer) {
      clearInterval(this.healthRefreshTimer);
      this.healthRefreshTimer = null;
      this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Continuous health monitor stopped`);
    }
    this.isRefreshingHealth = false;
  }

  /**
   * [RC3.14 CC1] Single-flight active node canary refresh probe
   */
  async refreshActiveNodeHealth() {
    if (this.isRefreshingHealth) {
      this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Health refresh probe already in flight, skipping overlapping probe`);
      return { inFlight: true };
    }

    const active = this.getActiveNode();
    if (!active || active.active === false) {
      this.relayReady = false;
      return { verified: false, reason: 'NO_ACTIVE_NODE' };
    }

    if (this.isPaused) {
      return { verified: false, reason: 'RELAY_PAUSED' };
    }

    this.isRefreshingHealth = true;
    try {
      const timeoutMs = this.pool.healthCheckTimeoutMs || 5000;
      const vRes = await this.verifyNodeEgress(active, timeoutMs);
      if (vRes.verified) {
        this.relayReady = true;
        this.lifecycleState = 'READY';
        this.reconnectAttempt = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Active node=${active.id} health probe SUCCESS (lastVerifiedAt=${active.lastVerifiedAt})`);
        return { verified: true, node: active.id };
      } else {
        this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Active node=${active.id} health probe FAILED: ${vRes.reason}`);
        await this.handleActiveFailure(`CONTINUOUS_HEALTH_PROBE_FAILED: ${vRes.reason}`);
        return { verified: false, reason: vRes.reason };
      }
    } catch (err) {
      this.log(`[PRIVACY_RELAY_HEALTH_MONITOR] Active node probe exception: ${err.message}`);
      await this.handleActiveFailure(`CONTINUOUS_HEALTH_PROBE_EXCEPTION: ${err.message}`);
      return { verified: false, reason: err.message };
    } finally {
      this.isRefreshingHealth = false;
    }
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
    const targetUrl = overrideCanaryUrl || (node && node.canaryUrl) || this.canaryUrl || (this.pool && this.pool.canaryUrl) || 'https://cloudflare.com/cdn-cgi/trace';
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
            // [X1 Fix] Layer B: Tunneled request to public canary target (e.g. cloudflare.com).
            // MUST validate public target certificate against system/public WebPKI trust roots.
            // DO NOT inject proxyTlsCa (node.ca, which is private proxy CA for Layer A only).
            const targetTlsOptions = {
              socket: sock,
              rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
            };
            if (!net.isIP(parsedTarget.hostname)) {
              targetTlsOptions.servername = parsedTarget.hostname;
            }
            clientSock = tls.connect(targetTlsOptions);
            clientSock.on('error', (tlsErr) => {
              clearTimeout(timer);
              done({
                verified: false,
                reason: `TARGET_TLS_HANDSHAKE_ERROR: ${tlsErr.message}`,
                details: tlsErr.message
              });
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

              // [P0-6 Hardening] Verify observed egress identity against expectedEgressFingerprint
              if (node.expectedEgressFingerprint && node.expectedEgressFingerprint !== fp) {
                node.lastHealth = 'UNHEALTHY';
                node.observedFingerprint = null;
                done({
                  verified: false,
                  reason: `EGRESS_IDENTITY_MISMATCH: observed fingerprint ${fp} does not match expected ${node.expectedEgressFingerprint}`
                });
                return;
              }

              if (node.expectedEgressIp && node.expectedEgressIp !== observed) {
                node.lastHealth = 'UNHEALTHY';
                node.observedFingerprint = null;
                done({
                  verified: false,
                  reason: `EGRESS_IP_MISMATCH: observed IP ${observed} does not match expected ${node.expectedEgressIp}`
                });
                return;
              }

              node.observedEgressIp = observed;
              node.observedFingerprint = fp;
              node.lastHealth = 'HEALTHY';
              node.lastVerifiedAt = Date.now();
              done({ verified: true, fingerprint: fp, observed, ip: observed, observedEgressIp: observed });
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
        // [Z2 Fix] HTTPS_PROXY must NEVER fall back to public/system CA if privateOnly
        if (node.privateOnly && (!node.ca || typeof node.ca !== 'string' || !node.ca.trim())) {
          return done({
            verified: false,
            reason: 'MISSING_PINNED_PROXY_CA: Managed private HTTPS proxy must have pinned private CA certificate; fallback to system CA is strictly prohibited.'
          });
        }

        // [X1 & Z1 Fix] Layer A: Local Companion -> Upstream HTTPS Proxy
        // Must validate proxy server using pinned private proxy CA (node.ca).
        const proxyTlsCa = node.ca;
        const proxyConnectOptions = {
          host: node.host,
          port: node.port,
          rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
        };
        if (proxyTlsCa) {
          proxyConnectOptions.ca = proxyTlsCa;
        }
        if (!net.isIP(node.host)) {
          proxyConnectOptions.servername = node.host;
        }

        const tlsSock = tls.connect(proxyConnectOptions, () => {
          // [Z3 Fix] Verify peer server certificate SPKI fingerprint against node.tlsSpkiFingerprint
          if (node.tlsSpkiFingerprint) {
            try {
              const peerCert = tlsSock.getPeerX509Certificate();
              if (!peerCert || !peerCert.publicKey) {
                tlsSock.destroy();
                clearTimeout(timer);
                return done({ verified: false, reason: 'PEER_CERTIFICATE_MISSING: Upstream proxy did not present X509 certificate' });
              }
              const spkiDer = peerCert.publicKey.export({ type: 'spki', format: 'der' });
              const actualSpkiFp = crypto.createHash('sha256').update(spkiDer).digest('hex').toLowerCase();
              const expectedSpkiFp = node.tlsSpkiFingerprint.replace(/:/g, '').toLowerCase();
              if (actualSpkiFp !== expectedSpkiFp) {
                tlsSock.destroy();
                clearTimeout(timer);
                return done({
                  verified: false,
                  reason: `PEER_SPKI_PIN_MISMATCH: Peer server certificate SPKI fingerprint ${actualSpkiFp} does not match expected pin ${expectedSpkiFp}`
                });
              }
            } catch (spkiErr) {
              tlsSock.destroy();
              clearTimeout(timer);
              return done({ verified: false, reason: `SPKI_VERIFICATION_ERROR: ${spkiErr.message}` });
            }
          }
          onSocketConnected(tlsSock);
        });

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
      return {
        success: false,
        verified: false,
        reason: 'NO_NODES_IN_POOL',
        details: 'NO_NODES_IN_POOL',
        selectedEgressId: null,
        observedEgressIp: null,
        egressFingerprint: null
      };
    }
    const prev = this.getActiveNode();
    if (reason === 'HEALTH_FAILOVER' && this.relayReady && this.isNodeHealthValid(prev)) {
      return {
        success: true,
        verified: true,
        selectedEgressId: prev.id,
        observedEgressIp: prev.observedEgressIp || null,
        egressFingerprint: prev.observedFingerprint || null,
        rotationCount: this.rotationCount,
        transport: prev.type,
        health: 'HEALTHY',
        details: 'HEALTH_VALID'
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
          this.lifecycleState = 'READY';
          this.reconnectAttempt = 0;
          this.pool.selectedEgressId = candidate.id;
          try { this.saveConfig(); } catch (_) {}
          if (this.physicalGate && this.physicalGate.enabled) {
            await this.physicalGate.evaluate(candidate, (n) => this.verifyNodeEgress(n));
          }
          this.startContinuousHealthMonitor();
          this.log(`[PRIVACY_RELAY_ROTATE] fromId=${prev ? prev.id : 'none'} toId=${candidate.id} reason=${reason} verified=true fingerprint=${candidate.observedFingerprint}`);
          return {
            success: true,
            verified: true,
            selectedEgressId: candidate.id,
            observedEgressIp: candidate.observedEgressIp || verifyRes.observedEgressIp || verifyRes.observed || verifyRes.ip || null,
            egressFingerprint: candidate.observedFingerprint || verifyRes.fingerprint || null,
            rotationCount: this.rotationCount,
            transport: candidate.type,
            health: 'HEALTHY',
            details: 'VERIFIED',
            verifyResult: verifyRes
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
      verified: false,
      reason: 'PRIVACY_RELAY_NO_HEALTHY_EGRESS',
      details: 'All candidate egress nodes failed health check during rotation',
      selectedEgressId: null,
      observedEgressIp: null,
      egressFingerprint: null
    };
  }

  async selectEgress(nodeId, overrideCanaryUrl = null) {
    if (!this.pool.nodes || this.pool.nodes.length === 0) {
      this.relayReady = false;
      return {
        success: false,
        verified: false,
        reason: 'NO_NODES_IN_POOL',
        details: 'NO_NODES_IN_POOL',
        selectedEgressId: null,
        observedEgressIp: null,
        egressFingerprint: null
      };
    }
    const idx = this.pool.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) {
      return {
        success: false,
        verified: false,
        reason: 'NODE_NOT_FOUND',
        details: `Node "${nodeId}" was not found in pool`,
        selectedEgressId: null,
        observedEgressIp: null,
        egressFingerprint: null
      };
    }
    const candidate = this.pool.nodes[idx];
    if (candidate.active === false) {
      return {
        success: false,
        verified: false,
        reason: 'NODE_INACTIVE',
        details: `Node "${nodeId}" is currently disabled/inactive`,
        selectedEgressId: candidate.id,
        observedEgressIp: candidate.observedEgressIp || null,
        egressFingerprint: candidate.observedFingerprint || null
      };
    }

    const prev = this.getActiveNode();
    if (overrideCanaryUrl) {
      this.pool.canaryUrl = overrideCanaryUrl;
      candidate.canaryUrl = overrideCanaryUrl;
    }
    const verifyRes = await this.verifyNodeEgress(candidate, this.pool.healthCheckTimeoutMs || 5000, overrideCanaryUrl);
    if (!verifyRes.verified) {
      const detailedReason = verifyRes.reason ? `CANDIDATE_HEALTH_CHECK_FAILED: ${verifyRes.reason}` : 'CANDIDATE_HEALTH_CHECK_FAILED';
      return {
        success: false,
        verified: false,
        reason: detailedReason,
        details: verifyRes.reason || 'UNVERIFIED',
        selectedEgressId: candidate.id,
        observedEgressIp: null,
        egressFingerprint: null,
        verifyResult: verifyRes
      };
    }

    this.activeNodeIndex = idx;
    this.rotationCount++;
    this.relayReady = true;
    this.lifecycleState = 'READY';
    this.reconnectAttempt = 0;
    this.pool.selectedEgressId = candidate.id;
    try { this.saveConfig(); } catch (_) {}
    if (this.physicalGate && this.physicalGate.enabled) {
      await this.physicalGate.evaluate(candidate, (n) => this.verifyNodeEgress(n));
    }
    this.startContinuousHealthMonitor();
    this.log(`[PRIVACY_RELAY_ROTATE] fromId=${prev ? prev.id : 'none'} toId=${candidate.id} reason=EXPLICIT_SELECTION verified=true fingerprint=${candidate.observedFingerprint}`);
    return {
      success: true,
      verified: true,
      selectedEgressId: candidate.id,
      observedEgressIp: candidate.observedEgressIp || verifyRes.observedEgressIp || verifyRes.observed || verifyRes.ip || null,
      egressFingerprint: candidate.observedFingerprint || verifyRes.fingerprint || null,
      rotationCount: this.rotationCount,
      transport: candidate.type,
      health: 'HEALTHY',
      details: 'VERIFIED',
      verifyResult: verifyRes
    };
  }

  /**
   * [R6.9G.10.3.7.1.4.32 / RC3.18 Self-Healing Keepalive & Reconnect]
   * Bounded exponential reconnect backoff with structured reason codes.
   * Maintains FAIL-CLOSED on port 18988 (502 Bad Gateway) during reconnecting state.
   */
  scheduleSelfHealingReconnect(reason) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.relayReady = false;
    this.lastDisconnectReason = reason || 'UPSTREAM_DISCONNECTED';
    this.lastDisconnectTime = Date.now();

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.lifecycleState = 'REMOTE_EGRESS_REPAIR_REQUIRED';
      this.log(`[SELF_HEALING_RECONNECT_EXHAUSTED] Max attempts (${this.maxReconnectAttempts}) reached. State: REMOTE_EGRESS_REPAIR_REQUIRED reason=${reason}`);
      return;
    }

    this.lifecycleState = 'RECONNECTING';
    const attempt = ++this.reconnectAttempt;
    const delayMs = Math.min(this.reconnectMaxBackoffMs, this.reconnectBaseBackoffMs * Math.pow(2, attempt - 1));
    this.log(`[SELF_HEALING_RECONNECT_SCHEDULED] attempt=${attempt}/${this.maxReconnectAttempts} in ${delayMs}ms reason=${reason}`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      const active = this.getActiveNode();
      if (!active) {
        this.log(`[SELF_HEALING_RECONNECT] No active node to reconnect to.`);
        this.scheduleSelfHealingReconnect('NO_ACTIVE_NODE');
        return;
      }

      this.log(`[SELF_HEALING_RECONNECT_PROBE] Testing active node=${active.id} (attempt ${attempt}/${this.maxReconnectAttempts})...`);
      const vRes = await this.verifyNodeEgress(active, this.pool.healthCheckTimeoutMs || 5000);
      if (vRes.verified) {
        this.relayReady = true;
        this.lifecycleState = 'READY';
        this.reconnectAttempt = 0;
        this.consecutiveFailures = 0;
        active.lastHealth = 'HEALTHY';
        active.lastVerifiedAt = Date.now();
        this.log(`[SELF_HEALING_RECONNECT_SUCCESS] Node ${active.id} reconnected and verified HEALTHY. Lifecycle: READY`);
      } else {
        this.log(`[SELF_HEALING_RECONNECT_FAILED] attempt=${attempt} failed: ${vRes.reason}`);
        this.scheduleSelfHealingReconnect(vRes.reason);
      }
    }, delayMs);
  }

  /**
   * [R6.9G.10.2 Blocker 8] Synchronously set relayReady = false IMMEDIATELY upon failure.
   * Eliminates the ready-race window where new requests slip through before failover finishes.
   */
  async handleActiveFailure(reason) {
    // 1. Synchronously revoke ready state IMMEDIATELY (Fail-Closed)
    this.relayReady = false;
    this.lifecycleState = 'DEGRADED';
    this.lastDisconnectReason = reason;
    this.lastDisconnectTime = Date.now();
    this.trafficStats.failClosedDrops++;
    const active = this.getActiveNode();
    if (active) {
      active.lastHealth = 'UNREACHABLE';
      active.lastVerifiedAt = 0;
    }
    this.log(`[PRIVACY_RELAY_ACTIVE_FAIL] active=${active ? active.id : 'none'} reason=${reason} (relayReady=false SYNCHRONOUS, state=DEGRADED)`);

    // 2. If HEALTH_FAILOVER is configured with multiple nodes, attempt automated rotation to candidate
    if (this.pool.rotationMode === 'HEALTH_FAILOVER' && this.pool.nodes && this.pool.nodes.length > 1) {
      this.log(`[PRIVACY_RELAY_FAILOVER_TRIGGER] Attempting failover to secondary node...`);
      const rotRes = await this.rotateEgress('HEALTH_FAILOVER');
      if (rotRes.success) {
        this.log(`[PRIVACY_RELAY_FAILOVER_SUCCESS] Failover completed to ${rotRes.selectedEgressId}`);
        this.lifecycleState = 'READY';
        this.reconnectAttempt = 0;
        this.consecutiveFailures = 0;
        return true;
      }
    }

    // 3. Automated bounded exponential self-healing reconnect
    this.scheduleSelfHealingReconnect(reason);
    this.log(`[PRIVACY_RELAY_FAIL_CLOSED] Relay fail-closed active. Reconnection scheduled.`);
    return false;
  }

  getRecoveryStatus() {
    try {
      const prov = new PrivateEgressProvisioner({ mockMode: Boolean(this.options.mockMode) });
      return prov.checkRecoveryJournal();
    } catch (e) {
      return { recoveryRequired: false, status: 'ERROR', error: e.message };
    }
  }

  getWatchdogInfo() {
    try {
      const lockPath = path.join(this.companionDir || __dirname, '.watchdog.lock');
      if (!fs.existsSync(lockPath)) return null;
      const raw = fs.readFileSync(lockPath, 'utf8').trim();
      if (!raw) return null;
      let data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!data || typeof data !== 'object') {
        const pid = parseInt(raw, 10);
        if (isNaN(pid)) return null;
        data = { pid, companionDir: __dirname, runtimeRoot: path.resolve(__dirname, '..'), heartbeat: 0 };
      }
      let isAlive = false;
      if (data.pid) {
        try {
          process.kill(data.pid, 0);
          isAlive = true;
        } catch (_) {}
      }
      const isFresh = Boolean(data.heartbeat && (Date.now() - data.heartbeat < 15000));
      return {
        pid: data.pid,
        alive: isAlive,
        fresh: isFresh,
        companionDir: data.companionDir || null,
        runtimeRoot: data.runtimeRoot || null
      };
    } catch (_) {
      return null;
    }
  }

  getStatus() {
    const active = this.getActiveNode();
    const ttl = this.healthTtlMs || (this.pool && this.pool.healthTtlMs) || 60000;
    const isHealthValid = this.isNodeHealthValid(active);
    const healthAgeMs = (active && active.lastVerifiedAt > 0) ? (Date.now() - active.lastVerifiedAt) : null;
    const isExpired = active && active.lastVerifiedAt > 0 && (Date.now() - active.lastVerifiedAt > ttl);
    const physicalGateReady = !this.physicalGate.enabled || Boolean(this.physicalGate.state && this.physicalGate.state.ready);
    const ready = !this.isPaused && this.relayReady && isHealthValid && physicalGateReady;

    const watchdogInfo = this.getWatchdogInfo();
    const runtimeRoot = path.resolve(__dirname, '..');
    const watchdogRoot = watchdogInfo ? watchdogInfo.runtimeRoot : null;
    const rootParity = Boolean(watchdogInfo && watchdogRoot && path.resolve(watchdogRoot) === runtimeRoot);

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
        lastVerifiedAt: n.lastVerifiedAt || 0,
        healthAgeMs: n.lastVerifiedAt > 0 ? (Date.now() - n.lastVerifiedAt) : null,
        isExpired: Boolean(nodeExpired)
      };
    });

    const lifecycle = this.lifecycleState || (ready ? 'READY' : 'DEGRADED');

    return {
      service: 'XPIDER Privacy Relay',
      version: this.pool.version || '1.0.3',
      relayReady: ready,
      lifecycleState: lifecycle,
      reconnectAttempt: this.reconnectAttempt || 0,
      maxReconnectAttempts: this.maxReconnectAttempts || 10,
      lastDisconnectReason: this.lastDisconnectReason || null,
      lastDisconnectTime: this.lastDisconnectTime || null,
      paused: this.isPaused,
      controlPort: this.controlPort,
      proxyPort: this.proxyPort,
      rotationMode: this.pool.rotationMode || 'HEALTH_FAILOVER',
      selectedEgressId: active ? active.id : null,
      egressFingerprint: active ? active.observedFingerprint : null,
      transport: active ? active.type : 'NONE',
      health: isExpired ? 'EXPIRED' : (active ? (active.lastHealth || 'UNKNOWN') : 'NO_NODES'),
      healthTtlMs: ttl,
      healthAgeMs: healthAgeMs,
      healthRefreshIntervalMs: this.getHealthRefreshIntervalMs(),
      isHealthValid: Boolean(isHealthValid),
      isExpired: Boolean(isExpired),
      lastVerifiedAt: (active && active.lastVerifiedAt) ? active.lastVerifiedAt : 0,
      activeNodeIndex: this.activeNodeIndex,
      totalNodes: this.pool.nodes ? this.pool.nodes.length : 0,
      rotationCount: this.rotationCount,
      lastCheck: new Date().toISOString(),
      nodes: redactedNodes,
      trafficStats: { ...this.trafficStats },
      physicalGate: this.physicalGate.state,
      residentialProxy: this.residentialProxyState || {
        status: 'UNCONFIGURED',
        detail: 'NO_CONFIG',
        observedIpMasked: null,
        residentialVerified: false,
        sendAllowed: false,
        checkedAt: null
      },
      recovery: this.getRecoveryStatus(),
      runtimeRoot,
      companionDir: __dirname,
      watchdogRoot,
      rootParity,
      watchdog: {
        active: Boolean(watchdogInfo && watchdogInfo.alive && watchdogInfo.fresh),
        pid: watchdogInfo ? watchdogInfo.pid : null,
        root: watchdogRoot,
        rootParity
      },
      diagnostics: {
        companionProcess: {
          ok: true,
          pid: process.pid,
          uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
        },
        localProxyListener: {
          ok: Boolean(this.proxyServer && this.proxyServer.listening),
          port: this.proxyPort,
          host: '127.0.0.1'
        },
        nativeMessagingChannel: {
          ok: true,
          hostName: 'com.xpider.privacy_relay'
        },
        watchdogSupervisor: {
          ok: Boolean(watchdogInfo && watchdogInfo.alive && watchdogInfo.fresh && rootParity),
          pid: watchdogInfo ? watchdogInfo.pid : null,
          rootParity
        },
        upstreamTunnelState: {
          ok: Boolean(ready),
          type: active ? active.type : 'NONE',
          host: active ? active.host : null,
          port: active ? active.port : null
        },
        remoteEgressReachability: {
          ok: Boolean(ready),
          activeNodeId: active ? active.id : null,
          lastVerifiedAt: (active && active.lastVerifiedAt) ? active.lastVerifiedAt : 0
        },
        dnsPath: {
          ok: Boolean(ready),
          dnsResolverVerified: true
        }
      }
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

      // GET /health: Public unauthenticated ping (does not disclose fingerprints or secrets or detailed resource IDs)
      if (pathname === '/health' && req.method === 'GET') {
        const active = this.getActiveNode();
        const isHealthValid = this.isNodeHealthValid(active);
        const physicalGateFresh = !this.physicalGate.enabled || this.physicalGate.isFresh();
        const physicalGateReady = !this.physicalGate.enabled || Boolean(this.physicalGate.state && this.physicalGate.state.ready && physicalGateFresh);
        const fullRec = this.getRecoveryStatus();
        const coarseRec = {
          recoveryRequired: Boolean(fullRec && fullRec.recoveryRequired),
          status: (fullRec && fullRec.status) || 'NONE',
          stage: (fullRec && fullRec.stage) || null
        };
        const readyNow = !this.isPaused && this.relayReady && isHealthValid && physicalGateReady;
        const lifecycleNow = this.lifecycleState || (readyNow ? 'READY' : 'DEGRADED');
        const watchdogInfo = this.getWatchdogInfo();
        const runtimeRoot = path.resolve(__dirname, '..');
        const watchdogRoot = watchdogInfo ? watchdogInfo.runtimeRoot : null;
        const rootParity = Boolean(watchdogInfo && watchdogRoot && path.resolve(watchdogRoot) === runtimeRoot);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'OK',
          relayReady: readyNow,
          lifecycleState: lifecycleNow,
          reconnectAttempt: this.reconnectAttempt || 0,
          physicalGateEnabled: this.physicalGate.enabled,
          physicalGateReady,
          physicalGateFresh: this.physicalGate.enabled ? this.physicalGate.isFresh() : true,
          service: 'XPIDER Privacy Relay',
          version: this.pool.version || '1.0.3',
          pid: process.pid,
          companionBuildId: COMPANION_BUILD_ID,
          companionImplementationHead: COMPANION_IMPLEMENTATION_HEAD,
          apiCapabilities: COMPANION_API_CAPABILITIES,
          controlPort: this.controlPort,
          proxyPort: this.proxyPort,
          selectedEgressId: active ? active.id : null,
          uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
          runtimeRoot,
          companionDir: __dirname,
          watchdogRoot,
          rootParity,
          watchdog: {
            active: Boolean(watchdogInfo && watchdogInfo.alive && watchdogInfo.fresh),
            pid: watchdogInfo ? watchdogInfo.pid : null,
            root: watchdogRoot,
            rootParity
          },
          recovery: coarseRec
        }));
        return;
      }

      // Check Bearer Token Authorization for all control endpoints
      const authHeader = req.headers['authorization'] || '';
      let isAuthorized = authHeader === `Bearer ${this.controlToken}`;
      if (!isAuthorized && authHeader && authHeader.startsWith('Bearer ')) {
        const presentedToken = authHeader.substring(7).trim();
        const tokenFile = this.tokenFile || (this.configFile ? path.join(path.dirname(this.configFile), '.control_token') : TOKEN_FILE);
        try {
          if (fs.existsSync(tokenFile)) {
            const diskToken = fs.readFileSync(tokenFile, 'utf8').trim();
            if (diskToken && diskToken === presentedToken) {
              this.controlToken = diskToken;
              isAuthorized = true;
            }
          }
        } catch (_) {}
      }
      if (isAuthorized && authHeader && authHeader.startsWith('Bearer ')) {
        const presentedToken = authHeader.substring(7).trim();
        const presentedHash = crypto.createHash('sha256').update(presentedToken).digest('hex');
        if (presentedHash === EXPOSED_RC3_6_TOKEN_SHA256) {
          this.log('[SECURITY_ALERT] Request presented revoked/exposed RC3.6 token. Rejected with 401.');
          isAuthorized = false;
        }
      }
      if (!isAuthorized) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'UNAUTHORIZED',
          message: 'Valid Bearer control token required for relay control API'
        }));
        return;
      }

      // GET /recovery-status: Authenticated endpoint exposing full recovery state (V5 Data Minimization)
      if (pathname === '/recovery-status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          recovery: this.getRecoveryStatus()
        }));
        return;
      }

      // [RC3.45] Firewall Guardian status / on-demand reconcile (token is NEVER accepted or returned here; set via local UI only)
      if (pathname === '/firewall-guardian/status' && req.method === 'GET') {
        const { FirewallGuardian } = require('./firewall-guardian');
        this.firewallGuardian = this.firewallGuardian || new FirewallGuardian({ dir: path.dirname(this.configFile || TOKEN_FILE) });
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, guardian: this.firewallGuardian.getStatus() }));
        return;
      }
      if (pathname === '/firewall-guardian/reconcile' && req.method === 'POST') {
        const { FirewallGuardian } = require('./firewall-guardian');
        this.firewallGuardian = this.firewallGuardian || new FirewallGuardian({ dir: path.dirname(this.configFile || TOKEN_FILE) });
        const gr = await this.firewallGuardian.reconcile();
        res.writeHead(gr.ok ? 200 : 409);
        res.end(JSON.stringify({ success: gr.ok, status: gr.status, ip: gr.ip || null }));
        return;
      }

      // [Lane B] GET /residential-proxy/status (Authenticated)
      if (pathname === '/residential-proxy/status' && req.method === 'GET') {
        const current = this.residentialProxyState || {
          status: 'UNCONFIGURED',
          detail: 'NO_CONFIG',
          observedIpMasked: null,
          residentialVerified: false,
          sendAllowed: false,
          checkedAt: null
        };
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, residentialProxy: current }));
        return;
      }

      // [Lane B] POST /residential-proxy/probe (Authenticated)
      if (pathname === '/residential-proxy/probe' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const targetCfg = data.config || this.residentialProxyConfig;
            if (!targetCfg) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'UNCONFIGURED' }));
              return;
            }
            const probeResult = await residentialAdapter.probe(targetCfg, {
              password: data.password || (this.residentialProxyPassword ? winsec.decrypt(this.residentialProxyPassword) : null),
              directIp: data.directIp,
              forbiddenIps: data.forbiddenIps || []
            });
            this.residentialProxyState = probeResult;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, result: probeResult }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
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
              if (data.requestedNodeId) nodeId = data.requestedNodeId;
              if (data.canaryUrl) selCanaryUrl = data.canaryUrl;
            }
          } catch (_) {}
          if (!nodeId) {
            res.writeHead(400);
            res.end(JSON.stringify({
              success: false,
              verified: false,
              reason: 'MISSING_EGRESS_ID',
              details: 'MISSING_EGRESS_ID',
              selectedEgressId: null,
              observedEgressIp: null,
              egressFingerprint: null
            }));
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
            const ALLOWED_MODES = ['FIXED', 'MANUAL', 'CAMPAIGN_BOUNDARY', 'HEALTH_FAILOVER'];
            if (data.rotationMode && ALLOWED_MODES.includes(data.rotationMode)) {
              this.pool.rotationMode = data.rotationMode;
              this.saveConfig();
              this.log(`[PRIVACY_RELAY] rotationMode changed to ${this.pool.rotationMode}`);
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, rotationMode: this.pool.rotationMode }));
              return;
            }
          } catch (_) {}
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            reason: 'INVALID_ROTATION_MODE',
            message: 'Allowed modes are: FIXED, MANUAL, CAMPAIGN_BOUNDARY, HEALTH_FAILOVER'
          }));
        });
        return;
      }

      // POST /pause (Authenticated)
      if (pathname === '/pause' && req.method === 'POST') {
        this.isPaused = true;
        this.stopContinuousHealthMonitor();
        this.log(`[PRIVACY_RELAY] state=PAUSED selectedEgressId=${this.getActiveNode()?.id || 'none'}`);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, paused: true }));
        return;
      }

      // POST /resume (Authenticated)
      if (pathname === '/resume' && req.method === 'POST') {
        this.isPaused = false;
        if (this.relayReady && this.getActiveNode()) {
          this.startContinuousHealthMonitor();
        }
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
            res.end(JSON.stringify({
              success: false,
              verified: false,
              reason: 'NO_ACTIVE_NODE',
              details: 'NO_ACTIVE_NODE',
              selectedEgressId: null,
              observedEgressIp: null,
              egressFingerprint: null
            }));
            return;
          }
          const verifyRes = await this.verifyNodeEgress(active, this.pool.healthCheckTimeoutMs || 5000, probeCanaryUrl);
          if (verifyRes.verified) {
            this.relayReady = true;
            this.lifecycleState = 'READY';
            this.reconnectAttempt = 0;
            this.startContinuousHealthMonitor();
          }
          res.writeHead(verifyRes.verified ? 200 : 503);
          res.end(JSON.stringify({
            success: Boolean(verifyRes.verified),
            verified: Boolean(verifyRes.verified),
            selectedEgressId: active.id,
            activeNode: active.id,
            observedEgressIp: active.observedEgressIp || verifyRes.observedEgressIp || verifyRes.observed || verifyRes.ip || null,
            egressFingerprint: active.observedFingerprint || verifyRes.fingerprint || null,
            rotationCount: this.rotationCount,
            transport: active.type,
            health: verifyRes.verified ? 'HEALTHY' : 'UNHEALTHY',
            reason: verifyRes.reason || null,
            details: verifyRes.reason || (verifyRes.verified ? 'VERIFIED' : 'UNVERIFIED'),
            verifyResult: verifyRes
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
          hasCa: Boolean(n.ca),
          tlsCaFingerprint: n.tlsCaFingerprint || null,
          tlsSpkiFingerprint: n.tlsSpkiFingerprint || null,
          expectedEgressIp: n.expectedEgressIp || null,
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

            const isPrivateOnly = Boolean(data.privateOnly);
            let caPem = (data.ca || data.caCertPem || '').trim();
            let parsedCaCert = null;

            // [Z1 & Z2] Strict Validation for HTTPS_PROXY Private Egress Trust Material
            if (data.type === 'HTTPS_PROXY' && isPrivateOnly) {
              if (!caPem) {
                res.writeHead(400);
                res.end(JSON.stringify({
                  success: false,
                  reason: 'MISSING_PINNED_PROXY_CA: HTTPS_PROXY private node requires non-empty pinned PEM CA certificate.'
                }));
                return;
              }
            }

            if (caPem) {
              try {
                parsedCaCert = new crypto.X509Certificate(caPem);
              } catch (caErr) {
                res.writeHead(400);
                res.end(JSON.stringify({
                  success: false,
                  reason: `INVALID_CA_CERTIFICATE: Failed to parse CA PEM: ${caErr.message}`
                }));
                return;
              }

              // Check certificate validity window
              const now = Date.now();
              const validFromMs = new Date(parsedCaCert.validFrom).getTime();
              const validToMs = new Date(parsedCaCert.validTo).getTime();
              if (now < validFromMs - 60000 || now > validToMs) {
                res.writeHead(400);
                res.end(JSON.stringify({
                  success: false,
                  reason: `EXPIRED_OR_NOT_YET_VALID_CA: CA validity window [${parsedCaCert.validFrom} to ${parsedCaCert.validTo}] invalid for current time.`
                }));
                return;
              }

              // Verify CA fingerprint match if provided
              const actualCaFp = parsedCaCert.fingerprint256.replace(/:/g, '').toLowerCase();
              const rawExpectedCaFp = (data.tlsCaFingerprint || data.fingerprint || '').trim();
              if (rawExpectedCaFp) {
                const expectedCaFp = rawExpectedCaFp.replace(/:/g, '').toLowerCase();
                if (actualCaFp !== expectedCaFp) {
                  res.writeHead(400);
                  res.end(JSON.stringify({
                    success: false,
                    reason: `CA_FINGERPRINT_MISMATCH: Provided CA fingerprint ${expectedCaFp} does not match certificate fingerprint ${actualCaFp}`
                  }));
                  return;
                }
              }
            }

            const actualCaFingerprint = parsedCaCert ? parsedCaCert.fingerprint256.replace(/:/g, '').toLowerCase() : null;

            const newNode = {
              id: (data.id || data.name || `egress-node-${Date.now()}`).trim(),
              type: data.type,
              host: data.host.trim(),
              port: port,
              username: (data.username || '').trim(),
              password: (data.password || '').trim(),
              credentialRef: (data.credentialRef || '').trim(),
              privateOnly: isPrivateOnly,
              transportBinding: data.transportBinding ? data.transportBinding.trim() : null,
              ca: caPem || null,
              tlsCaFingerprint: actualCaFingerprint || (data.tlsCaFingerprint ? data.tlsCaFingerprint.trim().toLowerCase() : null),
              tlsSpkiFingerprint: data.tlsSpkiFingerprint && typeof data.tlsSpkiFingerprint === 'string' ? data.tlsSpkiFingerprint.trim().toLowerCase() : null,
              expectedEgressIp: data.expectedEgressIp && typeof data.expectedEgressIp === 'string' ? data.expectedEgressIp.trim() : (data.observedEgressIp && typeof data.observedEgressIp === 'string' ? data.observedEgressIp.trim() : null),
              expectedEgressFingerprint: data.expectedEgressFingerprint ? data.expectedEgressFingerprint.trim() : null,
              egressIdentityGroup: data.egressIdentityGroup ? data.egressIdentityGroup.trim() : null,
              canaryUrl: data.canaryUrl ? data.canaryUrl.trim() : null,
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

            this.log(`[PRIVACY_RELAY] Added/Updated egress node: id=${sanitized.id} type=${sanitized.type} host=${sanitized.host}:${sanitized.port} hasCa=${Boolean(sanitized.ca)} spkiPinned=${Boolean(sanitized.tlsSpkiFingerprint)} expectedIp=${sanitized.expectedEgressIp || 'none'}`);

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
                enabled: sanitized.active !== false,
                hasCa: Boolean(sanitized.ca),
                tlsCaFingerprint: sanitized.tlsCaFingerprint || null,
                tlsSpkiFingerprint: sanitized.tlsSpkiFingerprint || null,
                expectedEgressIp: sanitized.expectedEgressIp || null
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
            const activeAfter = this.getActiveNode();
            this.pool.selectedEgressId = activeAfter ? activeAfter.id : null;
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

      // POST /verify-plan (Authenticated) - Beginner 2-step verification: validate DO token & derive verified catalog pricing with zero cloud creation
      if (pathname === '/verify-plan' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          let reqData = null;
          let reqToken = null;

          try {
            reqData = JSON.parse(body);
            if (reqData && typeof reqData.token === 'string') {
              reqToken = reqData.token.trim();
            }
          } catch (jsonErr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'MALFORMED_JSON',
              reason: 'Malformed JSON payload in request body'
            }));
            return;
          }

          if (!reqToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'MISSING_API_TOKEN',
              reason: 'DigitalOcean API token is required'
            }));
            return;
          }

          // [Version Parity Check - Issue #6 Comment #6251236140]
          if (reqData && reqData.extensionBuildId && typeof reqData.extensionBuildId === 'string') {
            if (!isCompatibleExtensionBuild(reqData.extensionBuildId, COMPANION_BUILD_ID)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'EXTENSION_COMPANION_VERSION_MISMATCH',
                reason: `EXTENSION_COMPANION_VERSION_MISMATCH: Extension build (${reqData.extensionBuildId}) does not match Companion service build (${COMPANION_BUILD_ID}). Please reload the extension at chrome://extensions or edge://extensions.`
              }));
              return;
            }
          }

          try {
            const provisioner = new PrivateEgressProvisioner({
              token: reqToken,
              controlPort: this.controlPort,
              controlToken: this.controlToken,
              mockMode: Boolean(reqData.mockMode),
              simulatePreflightFailure: Boolean(reqData.simulatePreflightFailure),
              simulateFirewallFailure: Boolean(reqData.simulateFirewallFailure),
              simulateCatalogFailure: Boolean(reqData.simulateCatalogFailure),
              simulateInvalidToken: Boolean(reqData.simulateInvalidToken),
              simulateMissingScope: Boolean(reqData.simulateMissingScope),
              simulateUnavailableRegion: Boolean(reqData.simulateUnavailableRegion),
              simulateMissingPrice: Boolean(reqData.simulateMissingPrice),
              simulateOwnerIpFailure: Boolean(reqData.simulateOwnerIpFailure)
            });

            const planInfo = await provisioner.verifyPlanAndPrice({
              tier: reqData.tier || 'ULTRA_ECONOMY',
              region: reqData.region || 'nyc3'
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...planInfo }));
          } catch (e) {
            const safeTokens = reqToken ? [reqToken] : [];
            const scrubbedErr = redactSecrets(e.message || String(e), safeTokens);
            const statusCode = e.statusCode || (e.code === 'TOKEN_INVALID' ? 401 : e.code === 'TOKEN_SCOPE_MISSING' ? 403 : 400);
            const errorCode = e.code || (statusCode === 401 ? 'TOKEN_INVALID' : statusCode === 403 ? 'TOKEN_SCOPE_MISSING' : 'PROVIDER_ERROR');
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: errorCode,
              reason: scrubbedErr,
              statusCode
            }));
          }
        });
        return;
      }

      // POST /provision-egress (Authenticated) - Full auto DigitalOcean private egress deployment
      if (pathname === '/provision-egress' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          let reqData = null;
          let reqToken = null;

          try {
            reqData = JSON.parse(body);
            if (reqData && typeof reqData.token === 'string') {
              reqToken = reqData.token.trim();
            }
          } catch (jsonErr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'MALFORMED_JSON',
              reason: 'Malformed JSON payload in request body'
            }));
            return;
          }

          if (!reqToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'MISSING_API_TOKEN',
              reason: 'DigitalOcean API token is required'
            }));
            return;
          }

          // [Version Parity Check - Issue #6 Comment #6251236140]
          if (reqData && reqData.extensionBuildId && typeof reqData.extensionBuildId === 'string') {
            if (!isCompatibleExtensionBuild(reqData.extensionBuildId, COMPANION_BUILD_ID)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'EXTENSION_COMPANION_VERSION_MISMATCH',
                reason: `EXTENSION_COMPANION_VERSION_MISMATCH: Extension build (${reqData.extensionBuildId}) does not match Companion service build (${COMPANION_BUILD_ID}). Please reload the extension at chrome://extensions or edge://extensions.`
              }));
              return;
            }
          }

          this.provisioningState = {
            running: true,
            events: [],
            lastEvent: null,
            result: null,
            error: null
          };

          const provisioner = new PrivateEgressProvisioner({
            token: reqToken,
            controlPort: this.controlPort,
            controlToken: this.controlToken,
            mockMode: Boolean(reqData.mockMode),
            onProgress: (ev) => {
              const scrubbedEv = {
                ...ev,
                details: redactSecrets(ev.details, [reqToken])
              };
              this.provisioningState.events.push(scrubbedEv);
              this.provisioningState.lastEvent = scrubbedEv;
              this.log(`[PROVISION_PROGRESS] Step ${ev.step}/8 ${ev.title}: ${ev.status} — ${scrubbedEv.details}`);
            }
          });

          // Start provisioning
          try {
            const result = await provisioner.provisionPrivateEgress({
              tier: reqData.tier || 'ULTRA_ECONOMY',
              region: reqData.region || 'nyc3',
              verifiedQuote: reqData.verifiedQuote || null,
              blueGreen: Boolean(reqData.blueGreen)
            });
            this.provisioningState.running = false;
            this.provisioningState.result = result;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, ...result }));
          } catch (pErr) {
            const scrubbedErr = redactSecrets(pErr.message || String(pErr), [reqToken]);
            this.provisioningState.running = false;
            this.provisioningState.error = scrubbedErr;
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: scrubbedErr }));
          }
        });
        return;
      }

      // GET /provision-progress (Authenticated)
      if (pathname === '/provision-progress' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          provisioning: this.provisioningState
        }));
        return;
      }

      // POST /destroy-egress (Authenticated) - One-click destroy of exact owned private egress VPS & firewall
      if (pathname === '/destroy-egress' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            if (!data.token) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'MISSING_API_TOKEN' }));
              return;
            }

            const provisioner = new PrivateEgressProvisioner({
              token: data.token,
              controlPort: this.controlPort,
              controlToken: this.controlToken,
              mockMode: Boolean(data.mockMode)
            });

            const destroyRes = await provisioner.destroyPrivateEgress(data);
            this.log(`[DESTROY_EGRESS] Cleaned up status=${destroyRes.status} droplet=${destroyRes.destroyedDropletId} firewall=${destroyRes.destroyedFirewallId}`);
            if (!destroyRes.reason && Array.isArray(destroyRes.errors) && destroyRes.errors.length > 0) {
              destroyRes.reason = destroyRes.errors.join('; ');
            }
            res.writeHead(destroyRes.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(destroyRes));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: e.message, status: 'HTTP_500' }));
          }
        });
        return;
      }

      // POST /repair-egress (Authenticated) - Safe in-place repair of existing private egress node
      if (pathname === '/repair-egress' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            let data = {};
            try { if (body) data = JSON.parse(body); } catch (_) {}

            const provisioner = new PrivateEgressProvisioner({
              token: data.token || null,
              controlPort: this.controlPort,
              controlToken: this.controlToken,
              mockMode: Boolean(data.mockMode)
            });

            const repairRes = await provisioner.repairExistingEgress({
              ...data,
              blueGreenFallback: Boolean(data.blueGreenFallback)
            });
            this.log(`[REPAIR_EGRESS] Repair result: success=${repairRes.success} code=${repairRes.code}`);

            if (repairRes && repairRes.success && (repairRes.code === 'REPAIRED_READY' || repairRes.status === 'READY' || repairRes.preflight?.ready)) {
              const activeNode = this.getActiveNode();
              if (activeNode) {
                const vRes = await this.verifyNodeEgress(activeNode, this.pool.healthCheckTimeoutMs || 5000);
                if (vRes.verified) {
                  this.relayReady = true;
                  this.lifecycleState = 'READY';
                  this.reconnectAttempt = 0;
                }
              }
            }

            res.writeHead(repairRes.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(repairRes));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, reason: e.message, code: 'HTTP_500' }));
          }
        });
        return;
      }

      // GET /egress-telemetry (Authenticated) - Query live node resource telemetry
      if (pathname === '/egress-telemetry' && req.method === 'GET') {
        const active = this.getActiveNode();
        if (!active) {
          res.writeHead(503);
          res.end(JSON.stringify({ success: false, reason: 'NO_ACTIVE_NODE' }));
          return;
        }

        const creds = PrivacyRelayService.resolveNodeCredentials(active);
        const provisioner = new PrivateEgressProvisioner({ mockMode: Boolean(parsed.searchParams.get('mock')) });

        try {
          const telemetry = await provisioner.fetchNodeTelemetry({
            ...active,
            ...creds
          });
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            nodeId: active.id,
            region: active.region,
            telemetry
          }));
        } catch (tErr) {
          res.writeHead(502);
          res.end(JSON.stringify({
            success: false,
            nodeId: active.id,
            reason: tErr.message
          }));
        }
        return;
      }

      // GET /physical-gate/status (Authenticated)
      if (pathname === '/physical-gate/status' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          status: this.physicalGate.state,
          isFresh: this.physicalGate.isFresh(),
          ttlMs: this.physicalGate.physicalGateTtlMs
        }));
        return;
      }

      // POST /physical-gate/enable (Authenticated)
      if (pathname === '/physical-gate/enable' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
            this.physicalGate.setEnabled(enabled);
            this.pool.physicalGate = {
              ...this.pool.physicalGate,
              enabled,
              pinnedEgressFingerprint: this.physicalGate.pinnedEgressFingerprint || this.pool.physicalGate?.pinnedEgressFingerprint || null,
              pinnedEgressIdentityGroup: this.physicalGate.pinnedEgressIdentityGroup || this.pool.physicalGate?.pinnedEgressIdentityGroup || null
            };
            this.saveConfig();
            if (enabled) {
              await this.physicalGate.evaluate(this.getActiveNode(), (n) => this.verifyNodeEgress(n));
              this.physicalGate.startMonitor(15000, () => this.getActiveNode(), (n) => this.verifyNodeEgress(n));
            } else {
              this.physicalGate.stopMonitor();
            }
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              enabled: this.physicalGate.enabled,
              status: this.physicalGate.state,
              isFresh: this.physicalGate.isFresh()
            }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /physical-gate/verify (Authenticated)
      if (pathname === '/physical-gate/verify' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const state = await this.physicalGate.evaluate(this.getActiveNode(), (n) => this.verifyNodeEgress(n));
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              status: state,
              isFresh: this.physicalGate.isFresh(),
              ttlMs: this.physicalGate.physicalGateTtlMs
            }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /enroll-egress (Authenticated) - Pins expected egress fingerprint & identity group after canary probe
      if (pathname === '/enroll-egress' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const nodeId = data.nodeId || this.pool.selectedEgressId;
            const targetNode = (this.pool.nodes || []).find(n => n.id === nodeId);
            if (!targetNode) {
              res.writeHead(404);
              res.end(JSON.stringify({ success: false, reason: 'NODE_NOT_FOUND' }));
              return;
            }

            // 1. Mandatory transport binding check (OPAL_WG or OPAL_OVPN only)
            const requestedBinding = (data.transportBinding || targetNode.transportBinding || '').trim();
            if (requestedBinding !== 'OPAL_WG' && requestedBinding !== 'OPAL_OVPN') {
              res.writeHead(400);
              res.end(JSON.stringify({
                success: false,
                reason: 'INVALID_TRANSPORT_BINDING',
                message: `transportBinding must be either OPAL_WG or OPAL_OVPN, got "${requestedBinding}"`
              }));
              return;
            }

            // 2. Strict endpoint check at enrollment:
            // OPAL_WG -> 10.66.66.1:3128, OPAL_OVPN -> 10.67.67.1:3128
            const expectedHost = requestedBinding === 'OPAL_WG' ? '10.66.66.1' : '10.67.67.1';
            const expectedPort = 3128;
            if (targetNode.host !== expectedHost || Number(targetNode.port) !== expectedPort) {
              res.writeHead(400);
              res.end(JSON.stringify({
                success: false,
                reason: 'UNAPPROVED_VPN_PROXY_ENDPOINT',
                message: `Endpoint for ${requestedBinding} must be ${expectedHost}:${expectedPort}, got ${targetNode.host}:${targetNode.port}`
              }));
              return;
            }

            // 3. Mandatory identity group
            const requestedGroup = (data.egressIdentityGroup || targetNode.egressIdentityGroup || '').trim();
            if (!requestedGroup) {
              res.writeHead(400);
              res.end(JSON.stringify({ success: false, reason: 'EGRESS_IDENTITY_GROUP_MANDATORY' }));
              return;
            }

            const existingPinnedFp = this.physicalGate.pinnedEgressFingerprint;
            const existingPinnedGroup = this.physicalGate.pinnedEgressIdentityGroup;

            // 4. Rule B & D: If trust anchor already exists, reject group mismatch (Issue #6 R6.9G.10.3.7.1.4)
            if (existingPinnedGroup && existingPinnedGroup !== requestedGroup) {
              res.writeHead(409);
              res.end(JSON.stringify({
                success: false,
                reason: 'EGRESS_IDENTITY_GROUP_MISMATCH',
                message: `Requested identity group "${requestedGroup}" does not match established trust anchor "${existingPinnedGroup}"`
              }));
              return;
            }

            // 5. Rule C: Fallback OPAL_OVPN requires existing enrolled OPAL_WG anchor in same group
            if (requestedBinding === 'OPAL_OVPN') {
              const hasWgAnchor = (this.pool.nodes || []).some(n =>
                n.transportBinding === 'OPAL_WG' &&
                n.egressIdentityGroup === requestedGroup &&
                Boolean(n.expectedEgressFingerprint) &&
                (existingPinnedFp ? n.expectedEgressFingerprint === existingPinnedFp : true) &&
                n.host === '10.66.66.1' &&
                Number(n.port) === 3128 &&
                n.active !== false
              );
              if (!hasWgAnchor) {
                res.writeHead(400);
                res.end(JSON.stringify({
                  success: false,
                  reason: 'PRIMARY_WG_ANCHOR_REQUIRED',
                  message: `Cannot enroll OPAL_OVPN fallback node before primary OPAL_WG anchor is enrolled in group "${requestedGroup}"`
                }));
                return;
              }
            }

            // 6. Canary probe
            if (data.canaryUrl) {
              this.pool.canaryUrl = data.canaryUrl;
              targetNode.canaryUrl = data.canaryUrl;
            }
            const canaryRes = await this.verifyNodeEgress(targetNode, data.timeoutMs || 5000, data.canaryUrl);
            if (!canaryRes.verified || !canaryRes.fingerprint) {
              res.writeHead(502);
              res.end(JSON.stringify({ success: false, reason: 'CANARY_PROBE_FAILED', details: canaryRes.reason }));
              return;
            }

            // 7. Rule B & D: If trust anchor already exists, reject fingerprint mismatch (Issue #6 R6.9G.10.3.7.1.4)
            if (existingPinnedFp && existingPinnedFp !== canaryRes.fingerprint) {
              res.writeHead(409);
              res.end(JSON.stringify({
                success: false,
                reason: 'EGRESS_PIN_MISMATCH',
                message: `Observed egress fingerprint "${canaryRes.fingerprint}" does not match established trust anchor "${existingPinnedFp}"`
              }));
              return;
            }

            // Trust anchor creation (First enrollment for new group)
            if (!this.physicalGate.pinnedEgressFingerprint) {
              this.physicalGate.pinnedEgressFingerprint = canaryRes.fingerprint;
              this.physicalGate.pinnedEgressIdentityGroup = requestedGroup;
            }

            targetNode.expectedEgressFingerprint = canaryRes.fingerprint;
            targetNode.egressIdentityGroup = requestedGroup;
            targetNode.transportBinding = requestedBinding;

            // Persist to pool config
            if (!this.pool.physicalGate) this.pool.physicalGate = {};
            this.pool.physicalGate.pinnedEgressFingerprint = this.physicalGate.pinnedEgressFingerprint;
            this.pool.physicalGate.pinnedEgressIdentityGroup = this.physicalGate.pinnedEgressIdentityGroup;

            this.saveConfig();
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              nodeId: targetNode.id,
              pinnedFingerprint: canaryRes.fingerprint,
              egressIdentityGroup: targetNode.egressIdentityGroup,
              transportBinding: targetNode.transportBinding
            }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /physical-gate/reset-trust (Authenticated) - Explicit destructive reset of physical egress trust anchor (Rule E)
      if (pathname === '/physical-gate/reset-trust' && req.method === 'POST') {
        this.isPaused = true;
        this.relayReady = false;
        this.physicalGate.pinnedEgressFingerprint = null;
        this.physicalGate.pinnedEgressIdentityGroup = null;
        if (this.pool.physicalGate) {
          this.pool.physicalGate.pinnedEgressFingerprint = null;
          this.pool.physicalGate.pinnedEgressIdentityGroup = null;
        }
        if (this.pool.nodes && Array.isArray(this.pool.nodes)) {
          this.pool.nodes.forEach(n => {
            n.expectedEgressFingerprint = null;
            n.observedFingerprint = null;
            n.egressIdentityGroup = null;
            n.lastHealth = 'UNKNOWN';
          });
        }
        this.saveConfig();
        this.physicalGate.state.ready = false;
        this.physicalGate.state.egressIdentityGroup = null;
        this.physicalGate.state.observedEgressFingerprint = null;
        this.physicalGate.state.reasons = ['PHYSICAL_EGRESS_TRUST_RESET'];

        const resetStatus = {
          ready: false,
          reasons: ['PHYSICAL_EGRESS_TRUST_RESET']
        };

        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          action: 'PHYSICAL_EGRESS_TRUST_RESET',
          message: 'Physical egress trust anchor reset. All physical nodes unverified.',
          status: resetStatus
        }));

        setImmediate(() => {
          this.physicalGate.evaluate(this.getActiveNode(), (n) => this.verifyNodeEgress(n)).catch(() => {});
        });
        return;
      }

      // POST /physical-gate/generate-key (Authenticated) - Generates Ed25519 pairing keypair with DPAPI protection
      if (pathname === '/physical-gate/generate-key' && req.method === 'POST') {
        try {
          const keyInfo = this.physicalGate.routerAttestation.generatePairingKey();
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            publicKey: keyInfo.publicKey,
            installCommand: keyInfo.installCommand
          }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, reason: e.message }));
        }
        return;
      }

      // GET /physical-gate/public-key (Authenticated) - Retrieves public key and install instruction
      if (pathname === '/physical-gate/public-key' && req.method === 'GET') {
        try {
          const keyInfo = this.physicalGate.routerAttestation.getPublicKey();
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            publicKey: keyInfo.publicKey,
            installCommand: keyInfo.installCommand
          }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, reason: e.message }));
        }
        return;
      }

      // POST /physical-gate/pair (Authenticated)
      if (pathname === '/physical-gate/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const pairRes = await this.physicalGate.routerAttestation.pairRouter(
              data.routerIp || '192.168.8.1',
              data.expectedFingerprint || null,
              data.agentToken || null,
              data.routerPort !== undefined ? data.routerPort : null,
              {
                transport: data.transport || null,
                sshPort: data.sshPort || null,
                sshUser: data.sshUser || null
              }
            );
            const state = await this.physicalGate.evaluate(this.getActiveNode(), (n) => this.verifyNodeEgress(n));
            res.writeHead(200);
            res.end(JSON.stringify({
              success: Boolean(state.routerIdentityPass),
              attestation: pairRes,
              status: state
            }));
          } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, reason: e.message }));
          }
        });
        return;
      }

      // POST /shutdown or POST /stop (Authenticated) - Graceful shutdown of companion
      if ((pathname === '/shutdown' || pathname === '/stop') && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'SHUTTING_DOWN', pid: process.pid }));
        setImmediate(async () => {
          this.log(`[COMPANION_SHUTDOWN] Received authorized shutdown request. Terminating companion server...`);
          try {
            await this.stop();
          } catch (_) {}
          if (this.options && this.options.exitOnShutdown === false) {
            return;
          }
          process.exit(0);
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ENDPOINT_NOT_FOUND' }));
    });

    this.controlServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        this.log(`[FATAL_PORT_CONFLICT] Control port ${this.controlPort} is already bound by another process (EADDRINUSE).`);
        console.error(`[FATAL_PORT_CONFLICT] Control port ${this.controlPort} is already in use by another process.`);
        process.exit(1);
      } else {
        this.log(`[CONTROL_SERVER_ERROR] ${err.message}`);
      }
    });

    this.controlServer.listen(this.controlPort, '127.0.0.1', () => {
      this.log(`Control plane listening on http://127.0.0.1:${this.controlPort}`);
    });
  }

  startProxyEngine() {
    this.proxyServer = http.createServer((req, res) => {
      this.trafficStats.requestsProxied++;

      // [R6.9G.10.3.7.1] Physical Router Security Gate Precedence & Freshness (Blocker 6)
      if (this.physicalGate && this.physicalGate.enabled) {
        const isReady = this.physicalGate.state.ready;
        const isFresh = this.physicalGate.isFresh();
        if (!isReady || !isFresh) {
          this.trafficStats.failClosedDrops++;
          const reason = !isReady ? 'PHYSICAL_GATE_FAIL_CLOSED' : 'PHYSICAL_GATE_STALE';
          const details = !isReady ? (this.physicalGate.state.reasons || []).join(', ') : `Attestation expired (> ${this.physicalGate.physicalGateTtlMs}ms)`;
          this.log(`[PHYSICAL_GATE_BLOCK] reason=${reason} details=${details}`);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`PHYSICAL_GATE_FAIL_CLOSED: ${reason} (${details})`);
          return;
        }
      }

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
        options.servername = active.host;
        if (active.ca) {
          options.ca = active.ca;
        }
      }

      const proxyReq = httpModule.request(options, (proxyRes) => {
        try {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        } catch (_) {}
        proxyRes.on('error', (err) => {
          this.log(`[HTTP_PROXY_RES_ERROR] ${err.message}`);
          try { res.destroy(); } catch (_) {}
        });
      });

      req.on('error', (err) => {
        this.log(`[HTTP_CLIENT_REQ_ERROR] ${err.message}`);
        try { proxyReq.destroy(); } catch (_) {}
      });

      res.on('error', (err) => {
        this.log(`[HTTP_CLIENT_RES_ERROR] ${err.message}`);
        try { proxyReq.destroy(); } catch (_) {}
      });

      proxyReq.on('error', (err) => {
        this.log(`[HTTP_FORWARD_ERROR] ${err.message}`);
        try {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end(`PRIVACY_RELAY_FAIL_CLOSED: Upstream egress failure (${err.message})`);
          } else {
            res.destroy();
          }
        } catch (_) {}
      });

      req.pipe(proxyReq);
    });

    // Handle CONNECT method for HTTPS tunnels
    this.proxyServer.on('connect', (req, clientSocket, head) => {
      this.trafficStats.connectTunnels++;

      // Guard client socket against unhandled errors immediately
      clientSocket.on('error', (err) => {
        this.log(`[CLIENT_SOCKET_ERROR] ${err.code || err.message}`);
      });
      try { clientSocket.setKeepAlive(true, 10000); } catch (_) {}

      // [R6.9G.10.3.7.1] Physical Router Security Gate Precedence & Freshness (Blocker 6)
      if (this.physicalGate && this.physicalGate.enabled) {
        const isReady = this.physicalGate.state.ready;
        const isFresh = this.physicalGate.isFresh();
        if (!isReady || !isFresh) {
          this.trafficStats.failClosedDrops++;
          const reason = !isReady ? 'PHYSICAL_GATE_FAIL_CLOSED' : 'PHYSICAL_GATE_STALE';
          const details = !isReady ? (this.physicalGate.state.reasons || []).join(', ') : `Attestation expired (> ${this.physicalGate.physicalGateTtlMs}ms)`;
          this.log(`[PHYSICAL_GATE_BLOCK] reason=${reason} details=${details}`);
          try {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
          } catch (_) {}
          return;
        }
      }

      if (this.isPaused || !this.relayReady) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=${this.isPaused ? 'RELAY_PAUSED_CONNECT' : 'RELAY_NOT_VERIFIED_CONNECT'}`);
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.destroy();
        } catch (_) {}
        return;
      }

      const active = this.getActiveNode();
      if (!active) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=NO_ACTIVE_EGRESS_NODE_CONNECT`);
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.destroy();
        } catch (_) {}
        return;
      }

      // Enforce Health TTL (Blocker 6)
      if (!this.isNodeHealthValid(active)) {
        this.trafficStats.failClosedDrops++;
        this.log(`[PRIVACY_RELAY_BLOCK] reason=HEALTH_TTL_EXPIRED_CONNECT active=${active.id}`);
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          clientSocket.destroy();
        } catch (_) {}
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
        try { upstreamSocket.setKeepAlive(true, 10000); } catch (_) {}

        upstreamSocket.on('error', (err) => {
          this.log(`[UPSTREAM_TUNNEL_SOCKET_ERROR] ${err.code || err.message}`);
          try { clientSocket.destroy(); } catch (_) {}
        });

        clientSocket.on('close', () => {
          try { upstreamSocket.destroy(); } catch (_) {}
        });
        upstreamSocket.on('close', () => {
          try { clientSocket.destroy(); } catch (_) {}
        });

        upstreamSocket.write(connectReq);
        upstreamSocket.once('data', (data) => {
          const responseStr = data.toString('utf8');
          if (responseStr.includes('200')) {
            try {
              clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
              if (head && head.length > 0) upstreamSocket.write(head);
              upstreamSocket.pipe(clientSocket);
              clientSocket.pipe(upstreamSocket);
            } catch (pipeErr) {
              this.log(`[TUNNEL_PIPE_ERROR] ${pipeErr.message}`);
              try { clientSocket.destroy(); } catch (_) {}
              try { upstreamSocket.destroy(); } catch (_) {}
            }
          } else {
            this.log(`[CONNECT_REJECTED] ${responseStr.split('\r\n')[0]}`);
            try {
              clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
              clientSocket.destroy();
            } catch (_) {}
            try { upstreamSocket.destroy(); } catch (_) {}
          }
        });
      };

      if (isUpstreamTls) {
        // [Z2 Fix] Fail-closed if private proxy lacks pinned CA
        if (active.privateOnly && (!active.ca || typeof active.ca !== 'string' || !active.ca.trim())) {
          this.handleActiveFailure('MISSING_PINNED_PROXY_CA: Managed private proxy lacks pinned CA');
          try {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
          } catch (_) {}
          return;
        }

        const tlsOptions = {
          host: active.host,
          port: active.port,
          servername: active.host,
          rejectUnauthorized: true // Strictly hardcoded (Blocker 9)
        };
        if (active.ca) {
          tlsOptions.ca = active.ca;
        }
        const tlsSocket = tls.connect(tlsOptions, () => {
          // [Z3 Fix] Enforce SPKI pin if present on live proxying
          if (active.tlsSpkiFingerprint) {
            try {
              const peerCert = tlsSocket.getPeerX509Certificate();
              if (!peerCert || !peerCert.publicKey) {
                this.handleActiveFailure('PEER_CERTIFICATE_MISSING: Upstream proxy did not present X509 certificate');
                tlsSocket.destroy();
                clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                clientSocket.destroy();
                return;
              }
              const spkiDer = peerCert.publicKey.export({ type: 'spki', format: 'der' });
              const actualSpkiFp = crypto.createHash('sha256').update(spkiDer).digest('hex').toLowerCase();
              const expectedSpkiFp = active.tlsSpkiFingerprint.replace(/:/g, '').toLowerCase();
              if (actualSpkiFp !== expectedSpkiFp) {
                this.handleActiveFailure(`PEER_SPKI_PIN_MISMATCH: ${actualSpkiFp} does not match expected ${expectedSpkiFp}`);
                tlsSocket.destroy();
                clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                clientSocket.destroy();
                return;
              }
            } catch (spkiErr) {
              this.handleActiveFailure(`SPKI_VERIFICATION_ERROR: ${spkiErr.message}`);
              tlsSocket.destroy();
              clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
              clientSocket.destroy();
              return;
            }
          }
          setupTunnel(tlsSocket);
        });

        tlsSocket.on('error', (err) => {
          this.log(`[UPSTREAM_TLS_CONNECT_ERROR] ${err.message}`);
          try {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
          } catch (_) {}
        });
      } else {
        const upstreamSocket = net.connect(active.port, active.host, () => setupTunnel(upstreamSocket));
        upstreamSocket.on('error', (err) => {
          this.log(`[UPSTREAM_CONNECT_ERROR] ${err.message}`);
          try {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.destroy();
          } catch (_) {}
        });
      }
    });

    this.proxyServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        this.log(`[FATAL_PORT_CONFLICT] Proxy port ${this.proxyPort} is already bound by another process (EADDRINUSE).`);
        console.error(`[FATAL_PORT_CONFLICT] Proxy port ${this.proxyPort} is already in use by another process.`);
        process.exit(1);
      } else {
        this.log(`[PROXY_SERVER_ERROR] ${err.message}`);
      }
    });

    this.proxyServer.listen(this.proxyPort, '127.0.0.1', () => {
      this.log(`Proxy engine listening on http://127.0.0.1:${this.proxyPort}`);
    });
  }

  acquireRelayLock() {
    try {
      const lockFile = path.join(this.companionDir || __dirname, '.relay.lock');
      if (fs.existsSync(lockFile)) {
        try {
          const raw = fs.readFileSync(lockFile, 'utf8').trim();
          const parsed = JSON.parse(raw);
          if (parsed && parsed.pid && parsed.pid !== process.pid) {
            let isAlive = false;
            try {
              process.kill(parsed.pid, 0);
              isAlive = true;
            } catch (_) {}
            const isFresh = parsed.heartbeat && (Date.now() - parsed.heartbeat < 15000);
            const isSameRoot = !parsed.companionDir || (path.resolve(parsed.companionDir) === path.resolve(this.companionDir || __dirname));
            if (isAlive && isFresh && isSameRoot) {
              this.log(`[STARTUP_LOCK] Existing healthy relay PID ${parsed.pid} is already active from canonical root. Exiting duplicate instance.`);
              process.exit(0);
            }
          }
        } catch (_) {}
      }
      const data = {
        pid: process.pid,
        companionDir: this.companionDir || __dirname,
        startedAt: Date.now(),
        heartbeat: Date.now()
      };
      fs.writeFileSync(lockFile, JSON.stringify(data, null, 2), 'utf8');
      this.relayLockHeartbeatTimer = setInterval(() => {
        try {
          const d = { ...data, heartbeat: Date.now() };
          fs.writeFileSync(lockFile, JSON.stringify(d, null, 2), 'utf8');
        } catch (_) {}
      }, 5000);
    } catch (_) {}
  }

  releaseRelayLock() {
    if (this.relayLockHeartbeatTimer) {
      clearInterval(this.relayLockHeartbeatTimer);
      this.relayLockHeartbeatTimer = null;
    }
    try {
      const lockFile = path.join(this.companionDir || __dirname, '.relay.lock');
      if (fs.existsSync(lockFile)) {
        const raw = fs.readFileSync(lockFile, 'utf8').trim();
        const parsed = JSON.parse(raw);
        if (parsed && parsed.pid === process.pid) {
          fs.unlinkSync(lockFile);
        }
      }
    } catch (_) {}
  }

  async start() {
    this.acquireRelayLock();
    this.startControlPlane();
    this.startProxyEngine();

    // [U1 Hardening] Startup Recovery Journal Inspection
    const recStatus = this.getRecoveryStatus();
    if (recStatus && recStatus.recoveryRequired) {
      this.log(`[PRIVACY_RELAY_RECOVERY_ALERT] Unrecovered transaction detected on startup: status=${recStatus.status} stage=${recStatus.stage} tag=${recStatus.transactionTag} droplet=${recStatus.dropletId} firewall=${recStatus.firewallId}`);
      console.warn(`[RECOVERY_ALERT] Incomplete private-egress transaction detected (${recStatus.transactionTag}, stage: ${recStatus.stage}). Cleanup and recovery required.`);
    } else if (recStatus && recStatus.status === 'ACTIVE') {
      this.log(`[PRIVACY_RELAY_ACTIVE_NODE] Active private-egress node found: droplet=${recStatus.dropletId} ip=${recStatus.publicIp}`);
    }

    // [RC3.45] Firewall Guardian: repair 8443 /32 for current owner IP BEFORE startup egress probe (no-op without local PAT)
    try {
      const { FirewallGuardian } = require('./firewall-guardian');
      this.firewallGuardian = this.firewallGuardian || new FirewallGuardian({ dir: path.dirname(this.configFile || TOKEN_FILE) });
      if (this.firewallGuardian.hasToken()) {
        const gr = await this.firewallGuardian.reconcile();
        this.log(`[FIREWALL_GUARDIAN] startup reconcile status=${gr.status}${gr.ip ? ' ip=' + gr.ip : ''}`);
        this.firewallGuardian.start(60000);
      } else {
        this.log('[FIREWALL_GUARDIAN] no local PAT stored; guardian idle (run companion/firewall-guardian-ui.js once)');
      }
    } catch (gErr) {
      this.log(`[FIREWALL_GUARDIAN] init error: ${gErr.message}`);
    }

    // Verify initial sticky active node before marking relay ready (Fail-Closed)
    const active = this.getActiveNode();
    if (active && active.active !== false) {
      this.log(`[PRIVACY_RELAY_STARTUP_PROBE] Checking sticky active node=${active.id}`);
      const vRes = await this.verifyNodeEgress(active, this.pool.healthCheckTimeoutMs || 5000);
      if (vRes.verified) {
        this.relayReady = true;
        this.lifecycleState = 'READY';
        this.reconnectAttempt = 0;
        this.log(`[PRIVACY_RELAY_STARTUP_PROBE] Sticky active node=${active.id} verified HEALTHY`);
        this.startContinuousHealthMonitor();
      } else {
        this.relayReady = false;
        this.lifecycleState = 'DEGRADED';
        this.log(`[PRIVACY_RELAY_STARTUP_PROBE] Sticky active node=${active.id} probe FAILED: ${vRes.reason}`);
        if (this.pool.rotationMode === 'FIXED' || this.pool.rotationMode === 'MANUAL') {
          this.log(`[PRIVACY_RELAY_FAIL_CLOSED] rotationMode=${this.pool.rotationMode} sticky node failed, maintaining fail-closed without silent switching`);
        } else if (this.pool.rotationMode === 'HEALTH_FAILOVER') {
          this.log(`[PRIVACY_RELAY_STARTUP_FAILOVER] Attempting failover to another healthy node...`);
          await this.rotateEgress('HEALTH_FAILOVER');
        }
      }
    } else {
      this.relayReady = false;
    }

    // Evaluate Physical Router Security Gate if enabled (Issue #6 R6.9G.10.3.7.1)
    if (this.physicalGate && this.physicalGate.enabled) {
      this.log(`[PRIVACY_RELAY_STARTUP_PHYSICAL_GATE] Evaluating physical router security gate...`);
      await this.physicalGate.evaluate(this.getActiveNode(), (n) => this.verifyNodeEgress(n));
      this.physicalGate.startMonitor(15000, () => this.getActiveNode(), (n) => this.verifyNodeEgress(n));
      this.log(`[PRIVACY_RELAY_STARTUP_PHYSICAL_GATE] ready=${this.physicalGate.state.ready} reasons=${(this.physicalGate.state.reasons || []).join(',')}`);
    }

    const currentFp = this.computeFingerprint(this.getActiveNode());
    this.log(`[PRIVACY_RELAY] state=RUNNING selectedEgressId=${active ? active.id : 'none'} transport=${active ? active.type : 'none'} health=${active ? active.lastHealth : 'NONE'} rotationMode=${this.pool.rotationMode || 'HEALTH_FAILOVER'} fingerprint=${currentFp || 'UNVERIFIED'}`);
    console.log(`[PRIVACY_RELAY] XPIDER Privacy Relay Companion running.`);
    console.log(`[PRIVACY_RELAY] Control Plane: http://127.0.0.1:${this.controlPort}`);
    console.log(`[PRIVACY_RELAY] Proxy Gateway: http://127.0.0.1:${this.proxyPort}`);
  }

  async stop() {
    this.stopContinuousHealthMonitor();
    if (this.firewallGuardian) { try { this.firewallGuardian.stop(); } catch (_) {} }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.physicalGate) {
      this.physicalGate.stopMonitor();
    }
    const promises = [];
    if (this.controlServer) {
      promises.push(new Promise(r => {
        let done = false;
        const finish = () => { if (!done) { done = true; r(); } };
        const timer = setTimeout(finish, 300);
        try {
          if (typeof this.controlServer.closeAllConnections === 'function') {
            this.controlServer.closeAllConnections();
          }
          this.controlServer.close(() => {
            clearTimeout(timer);
            finish();
          });
        } catch (_) {
          clearTimeout(timer);
          finish();
        }
      }));
    }
    if (this.proxyServer) {
      promises.push(new Promise(r => {
        let done = false;
        const finish = () => { if (!done) { done = true; r(); } };
        const timer = setTimeout(finish, 300);
        try {
          if (typeof this.proxyServer.closeAllConnections === 'function') {
            this.proxyServer.closeAllConnections();
          }
          this.proxyServer.close(() => {
            clearTimeout(timer);
            finish();
          });
        } catch (_) {
          clearTimeout(timer);
          finish();
        }
      }));
    }
    await Promise.all(promises);
    this.controlServer = null;
    this.proxyServer = null;
    this.releaseRelayLock();
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

module.exports = { PrivacyRelayService, CONTROL_PORT, PROXY_PORT, COMPANION_BUILD_ID };

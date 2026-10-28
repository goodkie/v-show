'use strict';
/**
 * XPIDER Firewall Guardian & Dynamic VPN IP Allowlist (RC3.59)
 *
 * Keeps the DigitalOcean Cloud Firewall inbound TCP 8443 rule scoped to the owner's
 * CURRENT verified public IPv4 /32 and preserved static allowlist.
 *
 * Security invariants (RC3.59 - P0 Security Hold Directive #6397334700):
 *  - Explicit Owner Approval Gate: NO unattended automatic firewall writes. Mutation strictly requires confirmed=true.
 *  - Read-Only Reconcile & Startup: Service startup and background reconcile have 0 mutations (preview/status only).
 *  - Additive-Only Preservation: Preserves ALL unrelated ports/rules (port 22, 80, ICMP, outbound) verbatim.
 *  - Rogue Wildcard Fail-Closed: 0.0.0.0/0 or ::/0 anywhere triggers ROGUE_WILDCARD_DETECTED and fails closed (NO silent purge).
 *  - Pre-Write Concurrency Guard: Computes canonical SHA256 snapshot on preview; strictly aborts on snapshot mismatch.
 *  - Network & Routing Validation: Verifies active default route interface on Windows uses Proton VPN (10.2.0.x).
 *  - Zero Secret Leakage: PAT is encrypted via Windows DPAPI (winsec), never logged, and redacted from all errors.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');
const winsec = require('./winsec');

const DEFAULT_DIR = __dirname;
const DO_HOST = 'api.digitalocean.com';
const PORT = '8443';
const DEFAULT_FIREWALL_ID = 'd6fd3a95-d9d9-417d-9d27-c6b57e94240a';
const DEFAULT_DROPLET_ID = 611293905;
const DEFAULT_TRANSACTION_TAG = 'xpider-tx-mviey6au-2afbc2f1';
const STATIC_ALLOWLIST = ['74.39.42.139/32'];
const MAX_RETRIES = 3;

/**
 * Scrub credentials and tokens from text.
 */
function redactSecrets(text, extraTokens = []) {
  if (typeof text !== 'string') {
    try { text = JSON.stringify(text); } catch (_) { text = String(text); }
  }
  let scrubbed = text;
  scrubbed = scrubbed.replace(/dop_v1_[a-f0-9]{64}/gi, '[REDACTED_DO_TOKEN]');
  scrubbed = scrubbed.replace(/Bearer\s+([a-zA-Z0-9_\-\.]{20,})/gi, 'Bearer [REDACTED_TOKEN]');
  scrubbed = scrubbed.replace(/Basic\s+([a-zA-Z0-9+\/=]{10,})/gi, 'Basic [REDACTED_BASIC_AUTH]');
  for (const extra of extraTokens) {
    if (extra && typeof extra === 'string' && extra.length >= 8) {
      scrubbed = scrubbed.split(extra).join('[REDACTED_EXTRA]');
    }
  }
  return scrubbed;
}

function isValidPublicIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return false;
  if (o[0] === 0 || o[0] === 10 || o[0] === 127 || o[0] >= 224) return false;
  if (o[0] === 169 && o[1] === 254) return false;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return false;
  if (o[0] === 192 && o[1] === 168) return false;
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return false;
  return true;
}

function httpsGetText(host, urlPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path: urlPath, timeout: timeoutMs, headers: { 'User-Agent': 'xpider-guardian' } }, res => {
      let b = '';
      res.on('data', c => { b += c; if (b.length > 4096) req.destroy(new Error('too large')); });
      res.on('end', () => resolve(b.trim()));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function parseCloudflareTrace(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^ip=([^\r\n]+)/m);
  return m ? m[1].trim() : null;
}

const IP_SOURCES = [
  () => httpsGetText('api.ipify.org', '/', 6000),
  () => httpsGetText('checkip.amazonaws.com', '/', 6000),
  () => httpsGetText('icanhazip.com', '/', 6000),
  () => httpsGetText('cloudflare.com', '/cdn-cgi/trace', 6000).then(parseCloudflareTrace)
];

/** Require >=2 independent sources to agree on a valid public IPv4. */
async function detectPublicIp(sources = IP_SOURCES) {
  const results = await Promise.all(sources.map(s => Promise.resolve().then(s).then(v => String(v).trim()).catch(() => null)));
  const counts = {};
  for (const r of results) if (r && isValidPublicIPv4(r)) counts[r] = (counts[r] || 0) + 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 2) {
    const e = new Error('IP_UNVERIFIED: fewer than 2 independent sources agreed on a public IPv4');
    e.code = 'IP_UNVERIFIED';
    throw e;
  }
  return best[0];
}

/**
 * Inspect active default IPv4 route on Windows routing table.
 */
function getActiveDefaultRoute(routeOutput = null) {
  let output = routeOutput;
  if (!output && process.platform === 'win32') {
    try {
      output = cp.execSync('route print 0.0.0.0', { encoding: 'utf8', timeout: 5000 });
    } catch (e) {
      const err = new Error(`ROUTE_PRINT_FAILED: ${e.message}`);
      err.code = 'NETWORK_ROUTE_UNCERTAIN';
      throw err;
    }
  }
  if (!output || typeof output !== 'string') {
    return null;
  }
  const lines = output.split(/\r?\n/);
  const routes = [];
  for (const line of lines) {
    const m = /^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+\S+\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+(\d+)\s*$/.exec(line);
    if (m) {
      routes.push({
        interfaceIp: m[1],
        metric: parseInt(m[2], 10)
      });
    }
  }
  if (routes.length === 0) {
    const err = new Error('NETWORK_ROUTE_UNCERTAIN: No default IPv4 route found in routing table.');
    err.code = 'NETWORK_ROUTE_UNCERTAIN';
    throw err;
  }
  routes.sort((a, b) => a.metric - b.metric);
  if (routes.length > 1 && routes[0].metric === routes[1].metric && routes[0].interfaceIp !== routes[1].interfaceIp) {
    const err = new Error(`NETWORK_ROUTE_UNCERTAIN: Ambiguous default routes with identical metric ${routes[0].metric}: ${routes[0].interfaceIp} vs ${routes[1].interfaceIp}`);
    err.code = 'NETWORK_ROUTE_UNCERTAIN';
    throw err;
  }
  return routes[0];
}

/**
 * Detect network interface context and verify default route interface.
 */
function detectNetworkContext(routeOutput = null, options = {}) {
  const ifaces = os.networkInterfaces();
  let protonAdapter = null;
  let localAdapter = null;

  for (const [name, addrs] of Object.entries(ifaces)) {
    const isProton = /protun|proton/i.test(name);
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        if (isProton && !protonAdapter) {
          protonAdapter = { name, address: a.address };
        } else if (!isProton && !localAdapter && a.address !== '127.0.0.1') {
          localAdapter = { name, address: a.address };
        }
      }
    }
  }

  const isProtonActive = Boolean(protonAdapter);
  let defaultRoute = null;
  let isProtonDefaultRoute = false;

  if (process.platform === 'win32' || routeOutput) {
    try {
      defaultRoute = getActiveDefaultRoute(routeOutput);
      if (defaultRoute) {
        const is10_2 = /^10\.2\.0\./.test(defaultRoute.interfaceIp);
        const matchesAdapter = protonAdapter && protonAdapter.address === defaultRoute.interfaceIp;
        isProtonDefaultRoute = Boolean(is10_2 || matchesAdapter);
      }
    } catch (e) {
      if (options.failClosedOnRoute) {
        throw e;
      }
      defaultRoute = { error: e.message, code: e.code };
    }
  }

  return {
    isProton: isProtonActive,
    isProtonDefaultRoute,
    defaultRoute,
    activeAdapter: isProtonActive ? protonAdapter.name : (localAdapter ? localAdapter.name : 'Unknown'),
    adapterDetails: isProtonActive ? protonAdapter : localAdapter
  };
}

/**
 * Full network detection combining public IPv4 canary with adapter & routing classification.
 */
async function detectNetworkInfo(sources = IP_SOURCES, options = {}) {
  const ip = await detectPublicIp(sources);
  const netCtx = detectNetworkContext(options.routeOutput, options);

  if (options.requireProtonRoute && !netCtx.isProtonDefaultRoute) {
    const err = new Error(`NETWORK_ROUTE_UNCERTAIN: Active default route interface (${netCtx.defaultRoute ? netCtx.defaultRoute.interfaceIp : 'unknown'}) is not Proton VPN adapter (10.2.0.x).`);
    err.code = 'NETWORK_ROUTE_UNCERTAIN';
    throw err;
  }

  return {
    ip,
    isProton: netCtx.isProton,
    isProtonDefaultRoute: netCtx.isProtonDefaultRoute,
    defaultRoute: netCtx.defaultRoute,
    adapter: netCtx.activeAdapter,
    adapterDetails: netCtx.adapterDetails
  };
}

function canonicalizeSourcesOrDests(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const res = {};
  if (Array.isArray(obj.addresses)) res.addresses = obj.addresses.slice().sort();
  if (Array.isArray(obj.droplet_ids)) res.droplet_ids = obj.droplet_ids.slice().sort();
  if (Array.isArray(obj.load_balancer_uids)) res.load_balancer_uids = obj.load_balancer_uids.slice().sort();
  if (Array.isArray(obj.tags)) res.tags = obj.tags.slice().sort();
  return res;
}

function canonicalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return {};
  const res = {
    protocol: String(rule.protocol || '').toLowerCase(),
    ports: String(rule.ports || '')
  };
  if (rule.sources) res.sources = canonicalizeSourcesOrDests(rule.sources);
  if (rule.destinations) res.destinations = canonicalizeSourcesOrDests(rule.destinations);
  return res;
}

/**
 * Pure: Deterministic SHA256 canonical snapshot of firewall state.
 */
function computeFirewallSnapshot(firewall) {
  if (!firewall || typeof firewall !== 'object') return null;
  const canonicalInbound = (firewall.inbound_rules || []).map(canonicalizeRule).sort((a, b) => {
    const kA = `${a.protocol}:${a.ports}:${JSON.stringify(a.sources || {})}`;
    const kB = `${b.protocol}:${b.ports}:${JSON.stringify(b.sources || {})}`;
    return kA.localeCompare(kB);
  });
  const canonicalOutbound = (firewall.outbound_rules || []).map(canonicalizeRule).sort((a, b) => {
    const kA = `${a.protocol}:${a.ports}:${JSON.stringify(a.destinations || {})}`;
    const kB = `${b.protocol}:${b.ports}:${JSON.stringify(b.destinations || {})}`;
    return kA.localeCompare(kB);
  });
  const canonicalObj = {
    name: String(firewall.name || ''),
    droplet_ids: (firewall.droplet_ids || []).slice().map(Number).sort((a, b) => a - b),
    tags: (firewall.tags || []).slice().map(String).sort(),
    inbound_rules: canonicalInbound,
    outbound_rules: canonicalOutbound
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
}

function doRequest(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: DO_HOST, path: '/v2' + apiPath, method, timeout: 15000,
      headers: Object.assign({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'XPIDER-Firewall-Guardian/1.0'
      }, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let json = null;
        try { json = b ? JSON.parse(b) : null; } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Pure: compute desired firewall inbound rules.
 * Invariant (RC3.59):
 *  - Must preserve ALL existing rules on ALL ports (port 22, 80, ICMP, etc.) verbatim.
 *  - In TCP 8443: preserve ALL existing addresses verbatim; add new ip/32 additively.
 *  - Rogue wildcard detection: If 0.0.0.0/0 or ::/0 is found in ANY rule, throw ROGUE_WILDCARD_DETECTED and fail closed.
 */
function buildDesiredInbound(existingInbound, ip, staticSources = []) {
  if (!isValidPublicIPv4(ip)) {
    const err = new Error('REFUSED: invalid IP for firewall rule');
    err.code = 'INVALID_IP';
    throw err;
  }
  const targetCidr = `${ip.trim()}/32`;
  const inbound = Array.isArray(existingInbound) ? existingInbound : [];

  // 1. Rogue wildcard detection across ALL existing inbound rules
  for (const rule of inbound) {
    const addresses = (rule.sources && Array.isArray(rule.sources.addresses)) ? rule.sources.addresses : [];
    for (const a of addresses) {
      const clean = String(a).trim();
      if (clean === '0.0.0.0/0' || clean === '::/0') {
        const err = new Error(`ROGUE_WILDCARD_DETECTED: Inbound rule for protocol ${rule.protocol} port ${rule.ports || 'any'} contains rogue wildcard "${clean}". Refusing update and failing closed.`);
        err.code = 'ROGUE_WILDCARD_DETECTED';
        throw err;
      }
    }
  }

  // 2. Additive-only preservation
  // Deep clone all rules to ensure unrelated rules (port 22, 80, icmp, etc.) are preserved verbatim
  const clonedRules = JSON.parse(JSON.stringify(inbound));
  let found8443 = false;

  for (const rule of clonedRules) {
    if (String(rule.ports) === PORT && rule.protocol === 'tcp') {
      found8443 = true;
      const existingAddresses = (rule.sources && Array.isArray(rule.sources.addresses)) ? rule.sources.addresses : [];
      const addrSet = new Set(existingAddresses.map(s => String(s).trim()));

      // Add target IP
      addrSet.add(targetCidr);
      // Add static sources if any
      for (const s of staticSources) {
        if (s) addrSet.add(String(s).trim());
      }

      rule.sources = Object.assign({}, rule.sources, {
        addresses: Array.from(addrSet).sort()
      });
    }
  }

  // If no 8443 rule exists, add it
  if (!found8443) {
    const addrSet = new Set([targetCidr]);
    for (const s of staticSources) {
      if (s) addrSet.add(String(s).trim());
    }
    clonedRules.push({
      protocol: 'tcp',
      ports: PORT,
      sources: {
        addresses: Array.from(addrSet).sort()
      }
    });
  }

  return clonedRules;
}

/**
 * Pure: generate detailed preview diff between current firewall rules and proposed new IP.
 */
function generatePreviewDiff(firewall, newIp, staticSources = STATIC_ALLOWLIST) {
  if (!firewall || typeof firewall !== 'object') {
    throw new Error('INVALID_FIREWALL_OBJECT');
  }
  if (!isValidPublicIPv4(newIp)) {
    const err = new Error(`INVALID_PUBLIC_IPV4: "${newIp}" is not a valid public IPv4 address`);
    err.code = 'INVALID_IP';
    throw err;
  }

  const existingInbound = firewall.inbound_rules || [];
  const desiredInbound = buildDesiredInbound(existingInbound, newIp, staticSources);

  const current8443 = existingInbound.find(r => String(r.ports) === PORT && r.protocol === 'tcp');
  const currentAddresses = (current8443 && current8443.sources && current8443.sources.addresses) ? current8443.sources.addresses.slice().sort() : [];

  const proposed8443 = desiredInbound.find(r => String(r.ports) === PORT && r.protocol === 'tcp');
  const proposedAddresses = (proposed8443 && proposed8443.sources && proposed8443.sources.addresses) ? proposed8443.sources.addresses.slice().sort() : [];

  const added = proposedAddresses.filter(a => !currentAddresses.includes(a));
  const removed = currentAddresses.filter(a => !proposedAddresses.includes(a));
  const preserved = proposedAddresses.filter(a => currentAddresses.includes(a));

  const isNoop = added.length === 0 && removed.length === 0;
  const snapshot = computeFirewallSnapshot(firewall);

  const proposedPayload = {
    name: firewall.name,
    inbound_rules: desiredInbound,
    outbound_rules: firewall.outbound_rules || [],
    droplet_ids: firewall.droplet_ids || [],
    tags: firewall.tags || []
  };

  return {
    firewallId: firewall.id,
    firewallName: firewall.name,
    targetPort: PORT,
    newIp,
    targetCidr: `${newIp}/32`,
    currentAddresses,
    proposedAddresses,
    added,
    removed,
    preserved,
    hasRogue: false,
    noop: isNoop,
    snapshot,
    proposedPayload
  };
}

class FirewallGuardian {
  constructor(options = {}) {
    this.dir = options.dir || DEFAULT_DIR;
    this.patFile = path.join(this.dir, '.do_firewall_pat.dpapi');
    this.stateFile = path.join(this.dir, '.firewall_guardian_state.json');
    this.configFile = path.join(this.dir, '.firewall_guardian.json');
    this.request = options.request || doRequest;
    this.detectIp = options.detectIp || null;
    this.detectNetwork = options.detectNetwork || (async () => {
      if (this.detectIp) {
        const ip = await this.detectIp();
        return { ip, isProton: false, isProtonDefaultRoute: false, adapter: 'mock' };
      }
      return detectNetworkInfo();
    });
    this.sleep = options.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    this.backoffBaseMs = options.backoffBaseMs ?? 1500;
    this.crypto = options.crypto || winsec;
    this.expectedDropletId = options.dropletId !== undefined ? options.dropletId : DEFAULT_DROPLET_ID;
    this.expectedTag = options.expectedTag !== undefined ? options.expectedTag : DEFAULT_TRANSACTION_TAG;
    this.staticSources = options.staticSources || [];
    this.inflight = null;
    this.state = this._loadState();
  }

  _loadState() {
    try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch (_) {
      return { status: 'NO_TOKEN', lastIp: null, lastAppliedAt: null, lastError: null, attempts: 0 };
    }
  }
  _saveState(patch) {
    this.state = Object.assign({}, this.state, patch, { updatedAt: new Date().toISOString() });
    try { fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2)); } catch (_) {}
  }

  getConfig() {
    try { return JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch (_) { return {}; }
  }
  setFirewallId(id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new Error('Invalid firewall id');
    fs.writeFileSync(this.configFile, JSON.stringify(Object.assign(this.getConfig(), { firewallId: id }), null, 2));
  }

  hasToken() { return fs.existsSync(this.patFile); }
  _token() {
    if (!this.hasToken()) return null;
    try {
      return this.crypto.decrypt(fs.readFileSync(this.patFile, 'utf8').trim());
    } catch (_) {
      return null;
    }
  }

  /** Validate PAT against provider and store with DPAPI. Token is never returned/logged. */
  async setToken(token) {
    const t = String(token || '').trim();
    if (!/^dop_v1_[a-f0-9]{64}$/i.test(t) && !/^[A-Za-z0-9_\-]{32,128}$/.test(t)) {
      return { ok: false, error: 'TOKEN_FORMAT_INVALID' };
    }
    let r;
    try { r = await this.request(t, 'GET', '/account'); } catch (e) { return { ok: false, error: 'NETWORK_ERROR' }; }
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'TOKEN_REJECTED_BY_PROVIDER' };
    if (r.status !== 200) return { ok: false, error: `PROVIDER_STATUS_${r.status}` };
    fs.writeFileSync(this.patFile, this.crypto.encrypt(t), { mode: 0o600 });
    this._saveState({ status: 'TOKEN_STORED', lastError: null });
    return { ok: true };
  }

  revokeLocal() {
    try { fs.unlinkSync(this.patFile); } catch (_) {}
    this._saveState({ status: 'NO_TOKEN', lastError: null });
    return { ok: true, note: 'Local token removed.' };
  }

  getStatus() {
    return {
      hasToken: this.hasToken(),
      firewallId: this.getConfig().firewallId || DEFAULT_FIREWALL_ID,
      dropletId: this.expectedDropletId,
      status: this.state.status,
      lastIp: this.state.lastIp,
      lastAppliedAt: this.state.lastAppliedAt,
      lastError: this.state.lastError ? redactSecrets(this.state.lastError) : null,
      updatedAt: this.state.updatedAt || null
    };
  }

  async _withRetry(fn) {
    let last;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        const r = await fn();
        if (r.status === 403 && r.json && /insufficient permissions/i.test(String(r.json.message))) {
          const e = new Error('MISSING_SCOPE: ' + String(r.json.message).slice(0, 160)); e.code = 'MISSING_SCOPE'; throw e;
        }
        if (r.status === 401 || r.status === 403) { const e = new Error('TOKEN_INVALID'); e.code = 'TOKEN_INVALID'; throw e; }
        if (r.status === 429 || r.status >= 500) { last = new Error(`PROVIDER_${r.status}`); }
        else return r;
      } catch (e) {
        if (e.code === 'TOKEN_INVALID' || e.code === 'MISSING_SCOPE') throw e;
        last = e;
      }
      if (i < MAX_RETRIES) await this.sleep(Math.min(this.backoffBaseMs * 2 ** i, 15000));
    }
    const e = new Error(`RETRIES_EXHAUSTED: ${last && last.message}`); e.code = 'RETRIES_EXHAUSTED'; throw e;
  }

  /**
   * Authoritative read-only fetch & association check of target Cloud Firewall.
   */
  async fetchFirewallState(explicitToken = null, explicitFwId = null) {
    const token = explicitToken || this._token();
    const fwId = explicitFwId || this.getConfig().firewallId || DEFAULT_FIREWALL_ID;

    if (!token) {
      const err = new Error('TOKEN_MISSING: No DigitalOcean API token provided or found in DPAPI storage');
      err.code = 'TOKEN_MISSING';
      throw err;
    }

    const res = await this._withRetry(() => this.request(token, 'GET', `/firewalls/${fwId}`));
    if (res.status !== 200 || !res.json || !res.json.firewall) {
      const err = new Error(`FIREWALL_GET_FAILED: Provider returned HTTP ${res.status}`);
      err.code = 'FIREWALL_GET_FAILED';
      err.statusCode = res.status;
      throw err;
    }

    const fw = res.json.firewall;

    // Verify Droplet / tag association
    const checkDroplet = this.expectedDropletId !== null && this.expectedDropletId !== undefined;
    const checkTag = this.expectedTag !== null && this.expectedTag !== undefined;
    if (checkDroplet || checkTag) {
      const hasDroplet = checkDroplet && (fw.droplet_ids || []).includes(Number(this.expectedDropletId));
      const hasTag = checkTag && (fw.tags || []).includes(this.expectedTag);
      if (!hasDroplet && !hasTag) {
        const err = new Error(`FIREWALL_ASSOCIATION_MISMATCH: Firewall "${fw.name}" (${fwId}) is not associated with Droplet ${this.expectedDropletId} or Tag "${this.expectedTag}"`);
        err.code = 'FIREWALL_ASSOCIATION_MISMATCH';
        throw err;
      }
    }

    return fw;
  }

  /**
   * Read-only reconcile: Checks sync status without mutating.
   * Invariant (RC3.59):
   *  - Purely read-only diagnostic/preview.
   *  - Returns IN_SYNC or APPROVAL_REQUIRED with 0 writes.
   *  - Never calls applyUpdate unattended.
   */
  reconcile() {
    if (this.inflight) return this.inflight;
    this.inflight = this._reconcile().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async _reconcile() {
    const token = this._token();
    const fwId = this.getConfig().firewallId || DEFAULT_FIREWALL_ID;
    if (!token) {
      this._saveState({ status: 'NO_TOKEN' });
      return { ok: false, status: 'NO_TOKEN' };
    }
    if (!fwId) {
      this._saveState({ status: 'NO_FIREWALL_ID' });
      return { ok: false, status: 'NO_FIREWALL_ID' };
    }
    try {
      const previewRes = await this.preview({ token, firewallId: fwId });
      const { diff, network } = previewRes;
      if (diff.noop) {
        this._saveState({
          status: 'IN_SYNC',
          lastIp: network.ip,
          lastAppliedAt: this.state.lastAppliedAt || new Date().toISOString(),
          lastError: null
        });
        return {
          ok: true,
          status: 'IN_SYNC',
          ip: network.ip,
          changed: false,
          diff
        };
      } else {
        this._saveState({
          status: 'APPROVAL_REQUIRED',
          lastIp: network.ip,
          lastError: null
        });
        return {
          ok: true,
          status: 'APPROVAL_REQUIRED',
          ip: network.ip,
          changed: false,
          diff,
          note: '0 mutations made. Unattended automatic firewall updates are disabled. Owner interactive approval via quick_update_firewall_ip.js is required.'
        };
      }
    } catch (e) {
      const code = e.code || 'ERROR';
      const status = (code === 'TOKEN_INVALID' || code === 'MISSING_SCOPE') ? code : 'FAIL_CLOSED_' + code;
      this._saveState({ status, lastError: String(e.message).slice(0, 200) });
      return { ok: false, status, error: this.state.lastError };
    }
  }

  /**
   * Preview proposed firewall rule changes without mutating.
   */
  async preview(options = {}) {
    const token = options.token || this._token();
    const fwId = options.firewallId || this.getConfig().firewallId || DEFAULT_FIREWALL_ID;

    const netInfo = options.networkInfo || (await this.detectNetwork());
    const fw = await this.fetchFirewallState(token, fwId);
    const staticSources = (options.staticSources !== undefined) ? options.staticSources : (this.staticSources && this.staticSources.length > 0 ? this.staticSources : STATIC_ALLOWLIST);
    const diff = generatePreviewDiff(fw, netInfo.ip, staticSources);

    return {
      network: netInfo,
      firewall: {
        id: fw.id,
        name: fw.name,
        droplets: fw.droplet_ids || [],
        tags: fw.tags || []
      },
      diff,
      snapshot: diff.snapshot
    };
  }

  /**
   * Mutate DigitalOcean Cloud Firewall with explicit Owner confirmation requirement and snapshot concurrency guard.
   */
  async applyUpdate(options = {}) {
    if (options.confirmed !== true) {
      const err = new Error('CONFIRMATION_REQUIRED: Owner explicit confirmation (confirmed: true) is strictly required to mutate firewall rules.');
      err.code = 'CONFIRMATION_REQUIRED';
      throw err;
    }

    if (!options.expectedSnapshot) {
      const err = new Error('EXPECTED_SNAPSHOT_REQUIRED: options.expectedSnapshot is strictly required for pre-write concurrency guard.');
      err.code = 'EXPECTED_SNAPSHOT_REQUIRED';
      throw err;
    }

    const token = options.token || this._token();
    const fwId = options.firewallId || this.getConfig().firewallId || DEFAULT_FIREWALL_ID;

    if (!token) {
      const err = new Error('TOKEN_MISSING: No DigitalOcean API token provided or found in DPAPI storage');
      err.code = 'TOKEN_MISSING';
      throw err;
    }

    const netInfo = options.networkInfo || (await this.detectNetwork());
    const targetIp = options.ip || netInfo.ip;

    if (!isValidPublicIPv4(targetIp)) {
      const err = new Error(`INVALID_PUBLIC_IPV4: "${targetIp}" is not a valid public IPv4`);
      err.code = 'INVALID_IP';
      throw err;
    }

    // 1. Fetch live firewall state immediately before write
    const currentFw = await this.fetchFirewallState(token, fwId);
    const liveSnapshot = computeFirewallSnapshot(currentFw);

    // Concurrency guard: verify live rules snapshot matches preview snapshot
    if (liveSnapshot !== options.expectedSnapshot) {
      const err = new Error(`CONCURRENT_MODIFICATION_DETECTED: Live firewall snapshot (${liveSnapshot.slice(0, 12)}) does not match expected snapshot (${options.expectedSnapshot.slice(0, 12)}). Concurrently modified.`);
      err.code = 'CONCURRENT_MODIFICATION_DETECTED';
      throw err;
    }

    // Concurrency guard (address array check if provided)
    if (options.expectedPreviousAddresses && Array.isArray(options.expectedPreviousAddresses)) {
      const current8443 = (currentFw.inbound_rules || []).find(r => String(r.ports) === PORT && r.protocol === 'tcp');
      const curAddresses = (current8443 && current8443.sources && current8443.sources.addresses) ? current8443.sources.addresses.slice().sort() : [];
      const expAddresses = options.expectedPreviousAddresses.slice().sort();
      if (JSON.stringify(curAddresses) !== JSON.stringify(expAddresses)) {
        const err = new Error(`CONCURRENT_MODIFICATION_DETECTED: Live firewall rules changed since preview was generated.`);
        err.code = 'CONCURRENT_MODIFICATION_DETECTED';
        throw err;
      }
    }

    const staticSources = (options.staticSources !== undefined) ? options.staticSources : (this.staticSources && this.staticSources.length > 0 ? this.staticSources : STATIC_ALLOWLIST);
    const diff = generatePreviewDiff(currentFw, targetIp, staticSources);

    // If already in sync, no write needed
    if (diff.noop) {
      this._saveState({
        status: 'IN_SYNC',
        lastIp: targetIp,
        lastAppliedAt: this.state.lastAppliedAt || new Date().toISOString(),
        lastError: null
      });
      return {
        ok: true,
        status: 'IN_SYNC',
        ip: targetIp,
        changed: false,
        diff,
        snapshot: liveSnapshot
      };
    }

    // 2. Perform atomic PUT
    const putRes = await this._withRetry(() => this.request(token, 'PUT', `/firewalls/${fwId}`, diff.proposedPayload));
    if (putRes.status !== 200) {
      const errMsg = (putRes.json && putRes.json.message) || `HTTP ${putRes.status}`;
      const err = new Error(`FIREWALL_UPDATE_FAILED: Provider rejected rule update (${errMsg})`);
      err.code = 'FIREWALL_UPDATE_FAILED';
      err.statusCode = putRes.status;
      throw err;
    }

    // 3. Re-fetch and authoritatively verify persisted state
    const verifyFw = await this.fetchFirewallState(token, fwId);
    const v8443 = (verifyFw.inbound_rules || []).find(r => String(r.ports) === PORT && r.protocol === 'tcp');
    const vAddresses = (v8443 && v8443.sources && v8443.sources.addresses) ? v8443.sources.addresses.slice().sort() : [];

    const expectedAddresses = diff.proposedAddresses.slice().sort();
    const isExactMatch = JSON.stringify(vAddresses) === JSON.stringify(expectedAddresses);
    const hasRogue = (verifyFw.inbound_rules || []).some(r => (r.sources?.addresses || []).some(a => a === '0.0.0.0/0' || a === '::/0'));

    if (!isExactMatch || hasRogue) {
      const err = new Error('VERIFY_FAILED: Persisted firewall rules do not match expected /32 allowlist or contain rogue wildcards.');
      err.code = 'VERIFY_FAILED';
      this._saveState({ status: 'FAIL_CLOSED_VERIFY_FAILED', lastError: err.message });
      throw err;
    }

    this._saveState({
      status: 'UPDATED',
      lastIp: targetIp,
      lastAppliedAt: new Date().toISOString(),
      lastError: null
    });

    return {
      ok: true,
      status: 'UPDATED',
      ip: targetIp,
      changed: true,
      diff,
      persistedAddresses: vAddresses,
      snapshot: computeFirewallSnapshot(verifyFw)
    };
  }

  /**
   * Pure read-only preview of adding UDP 51820 (WireGuard) scoped to Owner /32 CIDR + existing TCP 8443 allowlist.
   * Zero mutations are made.
   */
  async previewWireGuard(options = {}) {
    const token = options.token || this._token();
    const fwId = options.firewallId || this.getConfig().firewallId || DEFAULT_FIREWALL_ID;
    const netInfo = options.networkInfo || (await this.detectNetwork());
    const fw = await this.fetchFirewallState(token, fwId);
    const staticSources = (options.staticSources !== undefined)
      ? options.staticSources
      : (this.staticSources && this.staticSources.length > 0 ? this.staticSources : STATIC_ALLOWLIST);
    const diff = generateWireGuardPreviewDiff(fw, netInfo.ip, staticSources);
    return {
      network: netInfo,
      firewall: {
        id: fw.id,
        name: fw.name,
        droplets: fw.droplet_ids || [],
        tags: fw.tags || []
      },
      diff,
      snapshot: diff.snapshot
    };
  }

  /**
   * Apply WireGuard UDP 51820 /32 rule ONLY when Owner explicitly confirms (confirmed === true)
   * and expectedSnapshot matches the live Cloud Firewall state.
   */
  async applyWireGuardUpdate(options = {}) {
    if (options.confirmed !== true) {
      const err = new Error('CONFIRMATION_REQUIRED: Owner explicit confirmation (confirmed: true) is strictly required to mutate WireGuard firewall rules.');
      err.code = 'CONFIRMATION_REQUIRED';
      throw err;
    }
    if (!options.expectedSnapshot) {
      const err = new Error('EXPECTED_SNAPSHOT_REQUIRED: options.expectedSnapshot is strictly required for pre-write concurrency guard.');
      err.code = 'EXPECTED_SNAPSHOT_REQUIRED';
      throw err;
    }
    const token = options.token || this._token();
    const fwId = options.firewallId || this.getConfig().firewallId || DEFAULT_FIREWALL_ID;
    if (!token) {
      const err = new Error('TOKEN_MISSING: No DigitalOcean API token provided or found in DPAPI storage');
      err.code = 'TOKEN_MISSING';
      throw err;
    }
    const netInfo = options.networkInfo || (await this.detectNetwork());
    const targetIp = options.ip || netInfo.ip;
    if (!isValidPublicIPv4(targetIp)) {
      const err = new Error(`INVALID_PUBLIC_IPV4: "${targetIp}" is not a valid public IPv4`);
      err.code = 'INVALID_IP';
      throw err;
    }
    const currentFw = await this.fetchFirewallState(token, fwId);
    const liveSnapshot = computeFirewallSnapshot(currentFw);
    if (liveSnapshot !== options.expectedSnapshot) {
      const err = new Error(`CONCURRENT_MODIFICATION_DETECTED: Live firewall snapshot (${liveSnapshot.slice(0, 12)}) does not match expected snapshot (${options.expectedSnapshot.slice(0, 12)}).`);
      err.code = 'CONCURRENT_MODIFICATION_DETECTED';
      throw err;
    }
    const staticSources = (options.staticSources !== undefined)
      ? options.staticSources
      : (this.staticSources && this.staticSources.length > 0 ? this.staticSources : STATIC_ALLOWLIST);
    const diff = generateWireGuardPreviewDiff(currentFw, targetIp, staticSources);
    if (diff.noop) {
      return {
        ok: true,
        status: 'IN_SYNC',
        ip: targetIp,
        changed: false,
        diff,
        snapshot: liveSnapshot
      };
    }
    const putRes = await this._withRetry(() => this.request(token, 'PUT', `/firewalls/${fwId}`, diff.proposedPayload));
    if (putRes.status !== 200) {
      const errMsg = (putRes.json && putRes.json.message) || `HTTP ${putRes.status}`;
      const err = new Error(`FIREWALL_UPDATE_FAILED: Provider rejected WireGuard rule update (${errMsg})`);
      err.code = 'FIREWALL_UPDATE_FAILED';
      err.statusCode = putRes.status;
      throw err;
    }
    const verifyFw = await this.fetchFirewallState(token, fwId);
    return {
      ok: true,
      status: 'UPDATED',
      ip: targetIp,
      changed: true,
      diff,
      snapshot: computeFirewallSnapshot(verifyFw)
    };
  }
}

const WIREGUARD_PORT = '51820';

function buildDesiredInboundWithWireGuard(existingInbound, ip, staticSources = []) {
  const baseRules = buildDesiredInbound(existingInbound, ip, staticSources);
  const targetCidr = `${ip.trim()}/32`;
  const addrSet = new Set([targetCidr]);
  for (const s of staticSources) {
    if (s) addrSet.add(String(s).trim());
  }
  for (const r of baseRules) {
    if (String(r.ports) === PORT && r.protocol === 'tcp' && r.sources && Array.isArray(r.sources.addresses)) {
      for (const a of r.sources.addresses) addrSet.add(String(a).trim());
    }
  }
  let foundWg = false;
  for (const rule of baseRules) {
    if (String(rule.ports) === WIREGUARD_PORT && rule.protocol === 'udp') {
      foundWg = true;
      const existingAddrs = (rule.sources && Array.isArray(rule.sources.addresses)) ? rule.sources.addresses : [];
      for (const a of existingAddrs) addrSet.add(String(a).trim());
      rule.sources = Object.assign({}, rule.sources, {
        addresses: Array.from(addrSet).sort()
      });
    }
  }
  if (!foundWg) {
    baseRules.push({
      protocol: 'udp',
      ports: WIREGUARD_PORT,
      sources: {
        addresses: Array.from(addrSet).sort()
      }
    });
  }
  return baseRules;
}

function generateWireGuardPreviewDiff(firewall, newIp, staticSources = STATIC_ALLOWLIST) {
  if (!firewall || typeof firewall !== 'object') {
    throw new Error('INVALID_FIREWALL_OBJECT');
  }
  if (!isValidPublicIPv4(newIp)) {
    const err = new Error(`INVALID_PUBLIC_IPV4: "${newIp}" is not a valid public IPv4 address`);
    err.code = 'INVALID_IP';
    throw err;
  }
  const existingInbound = firewall.inbound_rules || [];
  const desiredInbound = buildDesiredInboundWithWireGuard(existingInbound, newIp, staticSources);
  const currentWgRules = existingInbound.filter(r => String(r.ports) === WIREGUARD_PORT && r.protocol === 'udp');
  const currentWgAddresses = Array.from(new Set(currentWgRules.flatMap(r => (r.sources && r.sources.addresses) || []))).sort();
  const proposedWgRules = desiredInbound.filter(r => String(r.ports) === WIREGUARD_PORT && r.protocol === 'udp');
  const proposedWgAddresses = Array.from(new Set(proposedWgRules.flatMap(r => (r.sources && r.sources.addresses) || []))).sort();
  const addedWg = proposedWgAddresses.filter(a => !currentWgAddresses.includes(a));
  const snapshot = computeFirewallSnapshot(firewall);
  const proposedPayload = {
    name: firewall.name,
    inbound_rules: desiredInbound,
    outbound_rules: firewall.outbound_rules || [],
    droplet_ids: firewall.droplet_ids || [],
    tags: firewall.tags || []
  };
  const proposedSnapshot = computeFirewallSnapshot(proposedPayload);
  return {
    firewallId: firewall.id,
    firewallName: firewall.name,
    wireGuardPort: WIREGUARD_PORT,
    newIp,
    targetCidr: `${newIp}/32`,
    currentWgAddresses,
    proposedWgAddresses,
    addedWg,
    noop: snapshot === proposedSnapshot,
    snapshot,
    proposedPayload
  };
}

module.exports = {
  FirewallGuardian,
  detectPublicIp,
  detectNetworkContext,
  detectNetworkInfo,
  getActiveDefaultRoute,
  computeFirewallSnapshot,
  isValidPublicIPv4,
  buildDesiredInbound,
  buildDesiredInboundWithWireGuard,
  generatePreviewDiff,
  generateWireGuardPreviewDiff,
  doRequest,
  redactSecrets,
  STATIC_ALLOWLIST,
  PORT,
  WIREGUARD_PORT,
  DEFAULT_FIREWALL_ID,
  DEFAULT_DROPLET_ID,
  DEFAULT_TRANSACTION_TAG
};

'use strict';
/**
 * XPIDER Firewall Guardian (RC3.45)
 *
 * Keeps the DigitalOcean Cloud Firewall inbound TCP 8443 rule scoped to the owner's
 * CURRENT verified public IPv4 /32 and nothing else.
 *
 * Security invariants:
 *  - PAT is entered via LOCAL UI only, stored with Windows DPAPI (winsec), never logged,
 *    never returned by any status API.
 *  - Never broadens: only a single validated public IPv4 /32 is ever written. 0.0.0.0/0,
 *    ::/0, private/loopback IPs and CIDRs other than /32 are refused.
 *  - SSH 22 inbound rules are removed/kept closed.
 *  - Only the configured firewall id is touched; other rules (non 8443/22) are preserved.
 *  - 401/403 => TOKEN_INVALID (fail-closed, no retry). 429/5xx/network => bounded backoff.
 *  - Single-flight mutex prevents racing reconciles.
 *  - Post-write GET verification; mismatch => VERIFY_FAILED.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const winsec = require('./winsec');

const DEFAULT_DIR = __dirname;
const DO_HOST = 'api.digitalocean.com';
const PORT = '8443';
const MAX_RETRIES = 4;

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

const IP_SOURCES = [
  () => httpsGetText('api.ipify.org', '/', 6000),
  () => httpsGetText('checkip.amazonaws.com', '/', 6000),
  () => httpsGetText('icanhazip.com', '/', 6000)
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

function doRequest(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: DO_HOST, path: '/v2' + apiPath, method, timeout: 15000,
      headers: Object.assign({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
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

/** Pure: compute desired firewall inbound rules for a given IP. */
function buildDesiredInbound(existingInbound, ip) {
  if (!isValidPublicIPv4(ip)) throw new Error('REFUSED: invalid IP for firewall rule');
  const kept = (existingInbound || []).filter(r => {
    const ports = String(r.ports || '');
    if (ports === PORT && r.protocol === 'tcp') return false; // replaced
    if (ports === '22' || ports === '0' || ports === 'all' || ports === '1-65535' || ports === '') {
      // SSH or world-wide port ranges are removed (SSH must stay closed)
      return !(ports === '22' || (r.protocol === 'tcp' && /^(0|all|1-65535|)$/.test(ports)));
    }
    return true;
  });
  kept.push({ protocol: 'tcp', ports: PORT, sources: { addresses: [`${ip}/32`] } });
  return kept;
}

class FirewallGuardian {
  constructor(options = {}) {
    this.dir = options.dir || DEFAULT_DIR;
    this.patFile = path.join(this.dir, '.do_firewall_pat.dpapi');
    this.stateFile = path.join(this.dir, '.firewall_guardian_state.json');
    this.configFile = path.join(this.dir, '.firewall_guardian.json');
    this.request = options.request || doRequest;
    this.detectIp = options.detectIp || (() => detectPublicIp());
    this.sleep = options.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    this.backoffBaseMs = options.backoffBaseMs ?? 1500;
    this.crypto = options.crypto || winsec; // injectable for tests
    this.inflight = null;
    this.timer = null;
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
    return this.crypto.decrypt(fs.readFileSync(this.patFile, 'utf8').trim());
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
    return { ok: true, note: 'Local token removed. Also revoke the PAT in the DigitalOcean control panel.' };
  }

  getStatus() {
    return {
      hasToken: this.hasToken(),
      firewallId: this.getConfig().firewallId || null,
      status: this.state.status,
      lastIp: this.state.lastIp,
      lastAppliedAt: this.state.lastAppliedAt,
      lastError: this.state.lastError,
      updatedAt: this.state.updatedAt || null
    };
  }

  /** Single-flight reconcile. */
  reconcile() {
    if (this.inflight) return this.inflight;
    this.inflight = this._reconcile().finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async _withRetry(fn) {
    let last;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        const r = await fn();
        if (r.status === 401 || r.status === 403) { const e = new Error('TOKEN_INVALID'); e.code = 'TOKEN_INVALID'; throw e; }
        if (r.status === 429 || r.status >= 500) { last = new Error(`PROVIDER_${r.status}`); }
        else return r;
      } catch (e) {
        if (e.code === 'TOKEN_INVALID') throw e;
        last = e;
      }
      if (i < MAX_RETRIES) await this.sleep(Math.min(this.backoffBaseMs * 2 ** i, 30000));
    }
    const e = new Error(`RETRIES_EXHAUSTED: ${last && last.message}`); e.code = 'RETRIES_EXHAUSTED'; throw e;
  }

  async _reconcile() {
    const token = this._token();
    const fwId = this.getConfig().firewallId;
    if (!token) { this._saveState({ status: 'NO_TOKEN' }); return { ok: false, status: 'NO_TOKEN' }; }
    if (!fwId) { this._saveState({ status: 'NO_FIREWALL_ID' }); return { ok: false, status: 'NO_FIREWALL_ID' }; }
    try {
      const ip = await this.detectIp();
      if (!isValidPublicIPv4(ip)) throw Object.assign(new Error('IP_UNVERIFIED'), { code: 'IP_UNVERIFIED' });
      const g = await this._withRetry(() => this.request(token, 'GET', `/firewalls/${fwId}`));
      if (g.status !== 200 || !g.json || !g.json.firewall) {
        throw Object.assign(new Error(`FIREWALL_GET_${g.status}`), { code: 'FIREWALL_GET_FAILED' });
      }
      const fw = g.json.firewall;
      const desired = buildDesiredInbound(fw.inbound_rules, ip);
      const already = JSON.stringify(this._norm(fw.inbound_rules)) === JSON.stringify(this._norm(desired));
      if (!already) {
        const body = {
          name: fw.name, inbound_rules: desired, outbound_rules: fw.outbound_rules || [],
          droplet_ids: fw.droplet_ids || [], tags: fw.tags || []
        };
        const p = await this._withRetry(() => this.request(token, 'PUT', `/firewalls/${fwId}`, body));
        if (p.status !== 200) throw Object.assign(new Error(`FIREWALL_PUT_${p.status}`), { code: 'FIREWALL_UPDATE_FAILED' });
      }
      const v = await this._withRetry(() => this.request(token, 'GET', `/firewalls/${fwId}`));
      const inb = (v.json && v.json.firewall && v.json.firewall.inbound_rules) || [];
      const r8443 = inb.filter(r => String(r.ports) === PORT);
      const ok = r8443.length === 1 &&
        JSON.stringify(r8443[0].sources && r8443[0].sources.addresses) === JSON.stringify([`${ip}/32`]) &&
        !(r8443[0].sources.tags || []).length && !(r8443[0].sources.droplet_ids || []).length &&
        !inb.some(r => String(r.ports) === '22');
      if (!ok) throw Object.assign(new Error('VERIFY_FAILED: applied state does not match desired /32'), { code: 'VERIFY_FAILED' });
      this._saveState({ status: already ? 'IN_SYNC' : 'UPDATED', lastIp: ip, lastAppliedAt: already ? this.state.lastAppliedAt : new Date().toISOString(), lastError: null });
      return { ok: true, status: this.state.status, ip, changed: !already };
    } catch (e) {
      const code = e.code || 'ERROR';
      this._saveState({ status: code === 'TOKEN_INVALID' ? 'TOKEN_INVALID' : 'FAIL_CLOSED_' + code, lastError: String(e.message).slice(0, 200) });
      return { ok: false, status: this.state.status, error: this.state.lastError };
    }
  }

  _norm(rules) {
    return (rules || []).map(r => ({
      p: r.protocol, ports: String(r.ports),
      a: ((r.sources && r.sources.addresses) || []).slice().sort()
    })).sort((x, y) => (x.ports + x.p).localeCompare(y.ports + y.p));
  }

  start(intervalMs = 60000) {
    this.stop();
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), intervalMs);
    if (this.timer.unref) this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = { FirewallGuardian, detectPublicIp, isValidPublicIPv4, buildDesiredInbound, doRequest };

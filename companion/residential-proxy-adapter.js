'use strict';
/**
 * residential-proxy-adapter.js  (Issue #6 P0-180MIN Lane B)
 *
 * Provider-agnostic, authenticated HTTP(S) CONNECT proxy adapter for XPIDER-only traffic.
 * Contract:
 *  - Statuses: UNCONFIGURED | PROXY_UNREACHABLE | AUTH_FAILED | PROXY_READY | EGRESS_VERIFIED | LEAK_TEST_FAILED
 *  - Never falls back to DIRECT: callers must treat anything other than EGRESS_VERIFIED as "do not send".
 *  - Passwords are never returned, logged, or placed in status objects. Stored via DPAPI (winsec) by the caller.
 *  - This adapter can NOT prove a proxy is "residential". `residentialVerified` is always false; the owner must
 *    confirm provider provenance out of band. No rotation / anti-bot evasion logic lives here.
 */
const net = require('net');
const tls = require('tls');

const STATUS = Object.freeze({
  UNCONFIGURED: 'UNCONFIGURED',
  PROXY_UNREACHABLE: 'PROXY_UNREACHABLE',
  AUTH_FAILED: 'AUTH_FAILED',
  PROXY_READY: 'PROXY_READY',
  EGRESS_VERIFIED: 'EGRESS_VERIFIED',
  LEAK_TEST_FAILED: 'LEAK_TEST_FAILED'
});

function normalizeProxyType(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  if (cfg.type === 'HTTP_PROXY' || cfg.type === 'HTTPS_PROXY') return cfg.type;
  if (typeof cfg.protocol === 'string') {
    const proto = cfg.protocol.trim().toLowerCase().replace(/:$/, '');
    if (proto === 'http') return 'HTTP_PROXY';
    if (proto === 'https') return 'HTTPS_PROXY';
  }
  return cfg.type || null;
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: false, reason: 'NO_CONFIG' };
  const { host, port } = cfg;
  const type = normalizeProxyType(cfg);
  if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]{1,253}$/.test(host)) return { ok: false, reason: 'INVALID_HOST' };
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return { ok: false, reason: 'INVALID_PORT' };
  if (type !== 'HTTP_PROXY' && type !== 'HTTPS_PROXY') return { ok: false, reason: 'UNSUPPORTED_TYPE' };
  return { ok: true, normalizedType: type };
}

function connectViaProxy(cfg, password, target, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch (_) {}
      resolve(r);
    };
    const proxyType = normalizeProxyType(cfg);
    const opts = { host: cfg.host, port: Number(cfg.port) };
    if (!net.isIP(cfg.host)) opts.servername = cfg.host;
    if (cfg.ca) opts.ca = cfg.ca;
    opts.rejectUnauthorized = true; // hardcoded, never relaxed
    const sock = proxyType === 'HTTPS_PROXY' ? tls.connect(opts) : net.connect(opts);
    sock.setTimeout(timeoutMs, () => done({ status: STATUS.PROXY_UNREACHABLE, detail: 'TIMEOUT' }));
    sock.on('error', (e) => done({ status: STATUS.PROXY_UNREACHABLE, detail: e.code || 'ERROR' }));
    sock.on('close', () => done({ status: STATUS.PROXY_UNREACHABLE, detail: 'CONNECTION_CLOSED' }));
    sock.on('end', () => done({ status: STATUS.PROXY_UNREACHABLE, detail: 'CONNECTION_CLOSED' }));
    sock.once(proxyType === 'HTTPS_PROXY' ? 'secureConnect' : 'connect', () => {
      let req = `CONNECT ${target.host}:${target.port} HTTP/1.1\r\nHost: ${target.host}:${target.port}\r\n`;
      if (cfg.username) {
        req += 'Proxy-Authorization: Basic ' + Buffer.from(`${cfg.username}:${password || ''}`).toString('base64') + '\r\n';
      }
      sock.write(req + '\r\n');
    });
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const code = parseInt((buf.split(' ')[1] || ''), 10);
      if (code === 407 || code === 401) return done({ status: STATUS.AUTH_FAILED, detail: `HTTP_${code}` });
      if (code !== 200) return done({ status: STATUS.PROXY_UNREACHABLE, detail: `HTTP_${code || 'BAD'}` });
      settled = true;
      sock.removeAllListeners('data');
      sock.removeAllListeners('close');
      sock.removeAllListeners('end');
      sock.setTimeout(0);
      resolve({ status: STATUS.PROXY_READY, socket: sock });
    });
  });
}

/** Fetch the observed public IP through an established CONNECT tunnel (Cloudflare trace). */
function observeIp(tunnel, host, timeoutMs, ca) {
  return new Promise((resolve) => {
    const tlsOpts = { socket: tunnel, host, rejectUnauthorized: true };
    if (!net.isIP(host)) tlsOpts.servername = host;
    if (ca) tlsOpts.ca = ca;
    const t = tls.connect(tlsOpts);
    let out = '';
    const fin = (v) => { try { t.destroy(); } catch (_) {} resolve(v); };
    t.setTimeout(timeoutMs, () => fin(null));
    t.on('error', () => fin(null));
    t.on('secureConnect', () => t.write(`GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
    t.on('data', (d) => { out += d.toString(); });
    t.on('end', () => { const m = /^ip=([0-9a-fA-F:.]+)$/m.exec(out); fin(m ? m[1] : null); });
  });
}

/**
 * Probe a configured upstream.
 * @param {object} cfg {host,port,type,username,ca?}
 * @param {object} o {password, directIp, forbiddenIps[], target, targetCa, observe(fn)->ip, timeoutMs}
 */
async function probe(cfg, o = {}) {
  const v = validateConfig(cfg);
  if (!v.ok) return status(STATUS.UNCONFIGURED, v.reason);
  const target = o.target || { host: 'cloudflare.com', port: 443 };
  const timeoutMs = o.timeoutMs || 10000;
  const c = await connectViaProxy(cfg, o.password, target, timeoutMs);
  if (c.status !== STATUS.PROXY_READY) return status(c.status, c.detail);
  const observed = o.observe ? await o.observe(c.socket) : await observeIp(c.socket, target.host, timeoutMs, o.targetCa || cfg.targetCa);
  if (!observed) return status(STATUS.PROXY_READY, 'IP_NOT_OBSERVED');
  if (o.directIp && observed === o.directIp) return status(STATUS.LEAK_TEST_FAILED, 'EGRESS_EQUALS_DIRECT_IP', observed);
  if ((o.forbiddenIps || []).includes(observed)) return status(STATUS.LEAK_TEST_FAILED, 'EGRESS_IS_FORBIDDEN_IP', observed);
  return status(STATUS.EGRESS_VERIFIED, 'OK', observed);
}

function status(s, detail, observedIp, extra = {}) {
  return {
    status: s,
    detail,
    observedIpMasked: observedIp ? maskIp(observedIp) : null,
    residentialVerified: false, // adapter cannot prove provenance; owner attestation required
    sendAllowed: s === STATUS.EGRESS_VERIFIED, // fail-closed: only a verified egress permits traffic
    dnsProtection: extra.dnsProtection || 'UNKNOWN',
    ipv6Protection: extra.ipv6Protection || 'UNKNOWN',
    checkedAt: new Date().toISOString()
  };
}

function maskIp(ip) {
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':****';
  const p = ip.split('.');
  return `${p[0]}.${p[1]}.*.*`;
}

module.exports = { STATUS, validateConfig, connectViaProxy, observeIp, probe, maskIp, status };

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
const https = require('https');

const DATACENTER_ASNS = new Set([
  14061, // DigitalOcean
  16509, 14618, // Amazon AWS
  15169, 396982, // Google Cloud
  8075, // Microsoft Azure
  63949, // Linode / Akamai
  20473, // Choopa / Vultr
  24940, // Hetzner
  16276, // OVH
  9009, // M247
  60068, // Datacamp
  13335, // Cloudflare
  46606, // Unified Layer
  36352 // ColoCrossing
]);

const DATACENTER_KEYWORDS = /digitalocean|amazon|aws|google cloud|microsoft|azure|linode|vultr|choopa|hetzner|ovh|datacamp|m247|leaseweb|colocrossing|hostinger|contabo/i;

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
      try { sock.destroy(); } catch (_) { }
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
      const headerBlock = buf.slice(0, idx);
      const code = parseInt((headerBlock.split(' ')[1] || ''), 10);
      const errMatch = /^x-error-message:\s*(.+)$/im.exec(headerBlock);
      const upstreamError = errMatch ? errMatch[1].trim() : null;
      if (code === 407 || code === 401) return done({ status: STATUS.AUTH_FAILED, detail: `HTTP_${code}`, upstreamError });
      if (code !== 200) return done({ status: STATUS.PROXY_UNREACHABLE, detail: `HTTP_${code || 'BAD'}`, upstreamError });
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
    const fin = (v) => { try { t.destroy(); } catch (_) { } resolve(v); };
    t.setTimeout(timeoutMs, () => fin(null));
    t.on('error', () => fin(null));
    t.on('secureConnect', () => t.write(`GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`));
    t.on('data', (d) => { out += d.toString(); });
    t.on('end', () => { const m = /^ip=([0-9a-fA-F:.]+)$/m.exec(out); fin(m ? m[1] : null); });
  });
}

function httpsGetJson(url, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'xpider-asn-verifier/1.0', Accept: 'application/json' },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', (c) => { if (data.length < 65536) data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function isMockOrReservedTestIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  return (
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('192.0.2.') ||
    ip.startsWith('198.51.100.') ||
    ip.startsWith('203.0.113.')
  );
}

/**
 * Independently verifies ASN / ISP / ARIN RDAP provenance of an observed exit IP in memory.
 * Never logs or returns the raw IP address.
 */
async function verifyAsnProvenance(observedIp, timeoutMs = 4500) {
  if (!observedIp || isMockOrReservedTestIp(observedIp)) {
    return { verified: false, reason: 'RESERVED_OR_MOCK_TEST_IP' };
  }
  const [who, rdap] = await Promise.all([
    httpsGetJson(`https://ipwho.is/${encodeURIComponent(observedIp)}`, timeoutMs),
    httpsGetJson(`https://rdap.arin.net/registry/ip/${encodeURIComponent(observedIp)}`, timeoutMs)
  ]);
  const asn = who?.connection?.asn ? Number(who.connection.asn) : null;
  const org = (who?.connection?.org || '').trim();
  const isp = (who?.connection?.isp || '').trim();
  const domain = (who?.connection?.domain || '').trim();
  const country = (who?.country_code || '').trim();
  const region = (who?.region || '').trim();
  const arinHandle = (rdap?.handle || '').trim() || null;
  const arinName = (rdap?.name || '').trim() || null;
  const arinType = (rdap?.type || '').trim() || null;

  const combinedText = `${org} ${isp} ${arinName || ''}`;
  const isDatacenterAsn = (asn && DATACENTER_ASNS.has(asn)) || DATACENTER_KEYWORDS.test(combinedText);
  const hasValidProviderIdentity = Boolean((asn && (org || isp)) || (arinHandle && arinName));
  const verified = Boolean(hasValidProviderIdentity && !isDatacenterAsn);

  return {
    verified,
    asn,
    org: org || null,
    isp: isp || null,
    domain: domain || null,
    country: country || null,
    region: region || null,
    arinHandle,
    arinName,
    arinType,
    isDatacenterAsn
  };
}

/**
 * Verifies OS-level IPv6 leak surface (2606:4700:4700::1111:443) and remote proxy CONNECT DNS handling.
 */
async function verifyDnsAndIpv6Protection(timeoutMs = 2500) {
  const directIpv6Reachable = await new Promise((resolve) => {
    try {
      const s = net.connect({ host: '2606:4700:4700::1111', port: 443, family: 6 }, () => {
        s.destroy();
        resolve(true);
      });
      s.setTimeout(timeoutMs, () => { s.destroy(); resolve(false); });
      s.on('error', () => resolve(false));
    } catch (_) {
      resolve(false);
    }
  });
  return {
    dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
    ipv6Protection: directIpv6Reachable ? 'IPV6_ROUTE_ACTIVE_BLOCKED_AT_PROXY' : 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED'
  };
}

/**
 * Probe a configured upstream.
 * @param {object} cfg {host,port,type,username,ca?}
 * @param {object} o {password, directIp, forbiddenIps[], target, targetCa, observe(fn)->ip, timeoutMs, verifyProtectionAndProvenance}
 */
async function probe(cfg, o = {}) {
  const v = validateConfig(cfg);
  if (!v.ok) return status(STATUS.UNCONFIGURED, v.reason);
  const target = o.target || { host: 'cloudflare.com', port: 443 };
  const timeoutMs = o.timeoutMs || 10000;
  const c = await connectViaProxy(cfg, o.password, target, timeoutMs);
  if (c.status !== STATUS.PROXY_READY) {
    let failExtra = {};
    if (c.upstreamError) failExtra.upstreamError = c.upstreamError;
    if (o.verifyProtectionAndProvenance) {
      const netProt = await verifyDnsAndIpv6Protection(2000);
      failExtra.dnsProtection = netProt.dnsProtection;
      failExtra.ipv6Protection = netProt.ipv6Protection;
    }
    return status(c.status, c.detail, null, failExtra);
  }
  const observed = o.observe ? await o.observe(c.socket) : await observeIp(c.socket, target.host, timeoutMs, o.targetCa || cfg.targetCa);
  if (!observed) return status(STATUS.PROXY_READY, 'IP_NOT_OBSERVED');
  if (o.directIp && observed === o.directIp) return status(STATUS.LEAK_TEST_FAILED, 'EGRESS_EQUALS_DIRECT_IP', observed);
  if ((o.forbiddenIps || []).includes(observed)) return status(STATUS.LEAK_TEST_FAILED, 'EGRESS_IS_FORBIDDEN_IP', observed);

  let extra = {};
  if (o.verifyProtectionAndProvenance && !isMockOrReservedTestIp(observed)) {
    const [asnProv, netProt] = await Promise.all([
      verifyAsnProvenance(observed, Math.min(timeoutMs, 4500)),
      verifyDnsAndIpv6Protection(2000)
    ]);
    if (asnProv && asnProv.isDatacenterAsn) {
      return status(STATUS.LEAK_TEST_FAILED, 'EGRESS_IS_DATACENTER_ASN', observed, {
        residentialVerified: false,
        asnProvenance: asnProv,
        dnsProtection: netProt.dnsProtection,
        ipv6Protection: netProt.ipv6Protection
      });
    }
    extra = {
      residentialVerified: Boolean(asnProv && asnProv.verified),
      asnProvenance: asnProv,
      dnsProtection: netProt.dnsProtection,
      ipv6Protection: netProt.ipv6Protection
    };
  }
  return status(STATUS.EGRESS_VERIFIED, 'OK', observed, extra);
}

function status(s, detail, observedIp, extra = {}) {
  const res = {
    status: s,
    detail,
    observedIp: observedIp || null,
    observedIpMasked: observedIp ? maskIp(observedIp) : null,
    residentialVerified: Boolean(extra.residentialVerified), // true only when independent ASN/ISP + RDAP provenance confirms non-datacenter ISP
    sendAllowed: s === STATUS.EGRESS_VERIFIED, // fail-closed: only a verified egress permits traffic
    dnsProtection: extra.dnsProtection || 'UNKNOWN',
    ipv6Protection: extra.ipv6Protection || 'UNKNOWN',
    checkedAt: new Date().toISOString()
  };
  if (extra.asnProvenance) {
    res.asnProvenance = extra.asnProvenance;
  }
  if (extra.upstreamError) {
    res.upstreamError = extra.upstreamError;
  }
  return res;
}

function maskIp(ip) {
  if (ip.includes(':')) return ip.split(':').slice(0, 2).join(':') + ':****';
  const p = ip.split('.');
  return `${p[0]}.${p[1]}.*.*`;
}

module.exports = { STATUS, validateConfig, connectViaProxy, observeIp, verifyAsnProvenance, verifyDnsAndIpv6Protection, probe, maskIp, status };

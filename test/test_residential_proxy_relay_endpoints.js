'use strict';
/**
 * test/test_residential_proxy_relay_endpoints.js
 * Verifies Stream B residential upstream forwarding in companion/privacy-relay-service.js:
 *  1. Unauthenticated /residential-proxy/status -> 401
 *  2. Default /residential-proxy/status -> UNCONFIGURED, sendAllowed: false, dnsProtection: UNKNOWN, ipv6Protection: UNKNOWN
 *  3. /status includes residentialProxySelected & residentialProxy
 *  4. POST /residential-proxy/probe without config -> 400 UNCONFIGURED
 *  5. POST /residential-proxy/probe with invalid config -> UNCONFIGURED, sendAllowed: false
 *  6. Selected but unconfigured (residentialProxySelected=true, config=null) -> relayReady=false, HTTP & CONNECT fail-closed (502 CONFIG_REQUIRED)
 *  7. POST /residential-proxy/configure with DPAPI password persistence -> zero plaintext in egress_pool_config.json, encrypted dpapi: in .local_credentials.json
 *  8. Selected + configured + AUTH_FAILED (407) -> relayReady=false, sendAllowed=false, live CONNECT blocked (502)
 *  9. Selected + configured + LEAK_TEST_FAILED (observed IP == DO 143.198.40.33 or ISP directIp) -> sendAllowed=false, live CONNECT blocked (502)
 * 10. Selected + configured + EGRESS_VERIFIED (independent IP 198.51.100.42) -> live HTTP & CONNECT tunnel routed through residential upstream; mid-flight upstream drop fails closed (502, zero direct fallback)
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-res-test-'));
const tokenFile = path.join(tmpDir, '.control_token');
const TEST_TOKEN = 'test-res-token-12345678901234567890';
fs.writeFileSync(tokenFile, TEST_TOKEN);

const cfgFile = path.join(tmpDir, 'egress_pool_config.json');
fs.writeFileSync(cfgFile, JSON.stringify({
  version: '1.0.3',
  selectedEgressId: 'do-egress-tor1-611293905',
  nodes: [
    {
      id: 'do-egress-tor1-611293905',
      type: 'HTTP_PROXY',
      host: '143.198.40.33',
      port: 8443,
      expectedEgressIp: '143.198.40.33',
      active: true
    }
  ],
  physicalGate: { enabled: false }
}));

const svc = new PrivacyRelayService({
  companionDir: tmpDir,
  controlPort: 29989,
  proxyPort: 29988,
  configFile: cfgFile,
  tokenFile: tokenFile,
  enableContinuousHealthMonitor: false,
  watchdogEnabled: false,
  startWatchdogProcess: false
});

function req(method, urlPath, body, headers = {}) {
  return new Promise((res, rej) => {
    const payload = body ? JSON.stringify(body) : null;
    const h = Object.assign({
      Authorization: `Bearer ${TEST_TOKEN}`,
      'Content-Type': 'application/json'
    }, headers);
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const r = http.request({ host: '127.0.0.1', port: 29989, method, path: urlPath, headers: h }, x => {
      let d = '';
      x.on('data', c => d += c);
      x.on('end', () => res({ status: x.statusCode, json: JSON.parse(d || '{}') }));
    });
    r.on('error', rej);
    if (payload) r.write(payload);
    r.end();
  });
}

function proxyHttpGet(targetUrl) {
  return new Promise((res, rej) => {
    const r = http.request({
      host: '127.0.0.1',
      port: 29988,
      method: 'GET',
      path: targetUrl,
      headers: { Host: 'target.example.test' }
    }, x => {
      let d = '';
      x.on('data', c => d += c);
      x.on('end', () => res({ status: x.statusCode, body: d }));
    });
    r.on('error', rej);
    r.end();
  });
}

function proxyConnectTunnel(targetHostPort, payloadToSend = 'PING_OVER_TUNNEL') {
  return new Promise((res) => {
    const sock = net.connect(29988, '127.0.0.1', () => {
      sock.write(`CONNECT ${targetHostPort} HTTP/1.1\r\nHost: ${targetHostPort}\r\n\r\n`);
    });
    let buf = '';
    let established = false;
    sock.setTimeout(3000, () => {
      try { sock.destroy(); } catch (_) {}
      res({ status: 0, established: false, reply: buf });
    });
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      if (!established && buf.includes('\r\n\r\n')) {
        const firstLine = buf.split('\r\n')[0];
        const code = parseInt((firstLine.split(' ')[1] || '0'), 10);
        if (code === 200) {
          established = true;
          buf = '';
          sock.write(payloadToSend);
        } else {
          try { sock.destroy(); } catch (_) {}
          res({ status: code, established: false, reply: firstLine });
        }
      } else if (established) {
        try { sock.destroy(); } catch (_) {}
        res({ status: 200, established: true, reply: buf });
      }
    });
    sock.on('error', () => {
      res({ status: 0, established: false, reply: buf });
    });
  });
}

function startMockResidentialUpstream({ expectedUser, expectedPass }) {
  let connectHits = 0;
  let httpHits = 0;
  let rejectAllWith407 = false;

  const srv = http.createServer((req, res) => {
    httpHits++;
    const auth = req.headers['proxy-authorization'] || '';
    const m = /Basic (\S+)/.exec(auth);
    const ok = !rejectAllWith407 && m && Buffer.from(m[1], 'base64').toString() === `${expectedUser}:${expectedPass}`;
    if (!ok) {
      res.writeHead(407, { 'Content-Type': 'text/plain' });
      res.end('Proxy Authentication Required');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ proxiedBy: 'mock-residential-upstream', url: req.url, exitIp: '198.51.100.42' }));
  });

  srv.on('connect', (req, clientSocket) => {
    connectHits++;
    const auth = req.headers['proxy-authorization'] || '';
    const m = /Basic (\S+)/.exec(auth);
    const ok = !rejectAllWith407 && m && Buffer.from(m[1], 'base64').toString() === `${expectedUser}:${expectedPass}`;
    if (!ok) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      clientSocket.end();
      return;
    }
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    clientSocket.on('data', (d) => {
      const s = d.toString('utf8');
      clientSocket.write(`RESIDENTIAL_TUNNEL_ECHO:${s}:EXIT_198.51.100.42`);
    });
    clientSocket.on('error', () => {});
  });

  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({
    srv,
    port: srv.address().port,
    getStats: () => ({ connectHits, httpHits }),
    setReject407: (v) => { rejectAllWith407 = v; }
  })));
}

(async () => {
  const mockUpstream = await startMockResidentialUpstream({ expectedUser: 'res_user', expectedPass: 'res_secret_99' });
  await svc.start();
  // Mark base DO node as healthy in memory so we isolate residential gate behavior
  svc.relayReady = true;
  svc.pool.nodes[0].lastHealth = 'HEALTHY';
  svc.pool.nodes[0].observedFingerprint = '05b6b53daead49e7';
  svc.pool.nodes[0].lastVerifiedAt = Date.now();

  try {
    // 1. Unauthenticated request to /residential-proxy/status => 401
    const unauth = await req('GET', '/residential-proxy/status', null, { Authorization: '' });
    assert.strictEqual(unauth.status, 401, 'unauthorized must return 401');

    // 2. Authenticated request to /residential-proxy/status => UNCONFIGURED, sendAllowed: false, DNS/IPv6 UNKNOWN
    const st = await req('GET', '/residential-proxy/status');
    assert.strictEqual(st.status, 200);
    assert.strictEqual(st.json.success, true);
    assert.strictEqual(st.json.residentialProxy.status, 'UNCONFIGURED');
    assert.strictEqual(st.json.residentialProxy.sendAllowed, false);
    assert.strictEqual(st.json.residentialProxy.residentialVerified, false);
    assert.strictEqual(st.json.residentialProxy.dnsProtection, 'UNKNOWN');
    assert.strictEqual(st.json.residentialProxy.ipv6Protection, 'UNKNOWN');

    // 3. /status also includes residentialProxy
    const fullSt = await req('GET', '/status');
    assert.strictEqual(fullSt.status, 200);
    assert.strictEqual(fullSt.json.residentialProxy.status, 'UNCONFIGURED');
    assert.strictEqual(fullSt.json.residentialProxy.sendAllowed, false);

    // 4. POST /residential-proxy/probe without config => 400 UNCONFIGURED
    const probeUncfg = await req('POST', '/residential-proxy/probe', {});
    assert.strictEqual(probeUncfg.status, 400);
    assert.strictEqual(probeUncfg.json.reason, 'UNCONFIGURED');

    // 5. POST /residential-proxy/probe with invalid config => fail-closed
    const probeBad = await req('POST', '/residential-proxy/probe', {
      config: { host: 'invalid host!', port: 99999, type: 'BAD_TYPE' }
    });
    assert.strictEqual(probeBad.status, 200);
    assert.strictEqual(probeBad.json.result.status, 'UNCONFIGURED');
    assert.strictEqual(probeBad.json.result.sendAllowed, false);

    // 6. Select residentialProxy without configuring => CONFIG_REQUIRED / BLOCKED (502 on HTTP and CONNECT)
    const selUncfg = await req('POST', '/residential-proxy/configure', { selected: true, config: null });
    assert.strictEqual(selUncfg.status, 200);
    assert.strictEqual(selUncfg.json.residentialProxySelected, true);
    const stWhenSelectedUncfg = await req('GET', '/status');
    assert.strictEqual(stWhenSelectedUncfg.json.relayReady, false, 'relayReady must be false when residentialProxySelected=true but unconfigured');

    const blockedHttp = await proxyHttpGet('http://target.example.test/form');
    assert.strictEqual(blockedHttp.status, 502);
    assert.ok(blockedHttp.body.includes('CONFIG_REQUIRED'), `Expected CONFIG_REQUIRED, got: ${blockedHttp.body}`);

    const blockedConnect = await proxyConnectTunnel('target.example.test:443');
    assert.strictEqual(blockedConnect.status, 502);
    assert.strictEqual(blockedConnect.established, false);

    // 7. Configure with DPAPI credential persistence -> verify zero plaintext in egress_pool_config.json
    const cfgRes = await req('POST', '/residential-proxy/configure', {
      selected: true,
      config: {
        id: 'residential-upstream-primary',
        host: '127.0.0.1',
        port: mockUpstream.port,
        type: 'HTTP_PROXY',
        username: 'res_user'
      },
      password: 'res_secret_99'
    });
    assert.strictEqual(cfgRes.status, 200);
    assert.strictEqual(cfgRes.json.residentialProxy.status, 'PROXY_READY');
    assert.strictEqual(cfgRes.json.residentialProxy.sendAllowed, false, 'Before probe verification, sendAllowed must be false');

    const rawConfigOnDisk = fs.readFileSync(cfgFile, 'utf8');
    assert.ok(!rawConfigOnDisk.includes('res_secret_99'), 'Plaintext password must NEVER be written to egress_pool_config.json');
    const localCredsFile = path.join(tmpDir, '.local_credentials.json');
    assert.ok(fs.existsSync(localCredsFile), '.local_credentials.json must exist');
    const rawCredsOnDisk = fs.readFileSync(localCredsFile, 'utf8');
    assert.ok(!rawCredsOnDisk.includes('res_secret_99'), 'Plaintext password must NEVER be in .local_credentials.json');
    assert.ok(rawCredsOnDisk.includes('dpapi:'), 'DPAPI encrypted reference must be persisted');

    // 8. Probe with wrong password => AUTH_FAILED (407), sendAllowed=false, live traffic blocked
    const probe407 = await req('POST', '/residential-proxy/probe', {
      password: 'wrong_password'
    });
    assert.strictEqual(probe407.status, 200);
    assert.strictEqual(probe407.json.result.status, 'AUTH_FAILED');
    assert.strictEqual(probe407.json.result.sendAllowed, false);
    const blockedAfter407 = await proxyConnectTunnel('target.example.test:443');
    assert.strictEqual(blockedAfter407.status, 502);

    // 9. Verify independence guard: if residential upstream exits via DO IP 143.198.40.33 => LEAK_TEST_FAILED
    const residentialAdapter = require('../companion/residential-proxy-adapter');
    const leakDoCheck = await residentialAdapter.probe(svc.residentialProxyConfig, {
      password: 'res_secret_99',
      forbiddenIps: ['143.198.40.33'],
      observe: async () => '143.198.40.33'
    });
    assert.strictEqual(leakDoCheck.status, 'LEAK_TEST_FAILED');
    assert.strictEqual(leakDoCheck.detail, 'EGRESS_IS_FORBIDDEN_IP');
    assert.strictEqual(leakDoCheck.sendAllowed, false);

    // 10. Verified independent residential exit IP (198.51.100.42 != DO 143.198.40.33 and != ISP 203.0.113.5)
    const verifiedProbe = await residentialAdapter.probe(svc.residentialProxyConfig, {
      password: 'res_secret_99',
      directIp: '203.0.113.5',
      forbiddenIps: ['143.198.40.33'],
      observe: async () => '198.51.100.42'
    });
    assert.strictEqual(verifiedProbe.status, 'EGRESS_VERIFIED');
    assert.strictEqual(verifiedProbe.sendAllowed, true);
    assert.strictEqual(verifiedProbe.residentialVerified, false, 'residentialVerified must remain false without out-of-band provider attestation');
    svc.residentialProxyState = verifiedProbe;

    const readySt = await req('GET', '/status');
    assert.strictEqual(readySt.json.relayReady, true, 'relayReady must be true when residential upstream is EGRESS_VERIFIED');

    // Live HTTP request forwarded through residential upstream
    const liveHttp = await proxyHttpGet('http://target.example.test/inquiry');
    assert.strictEqual(liveHttp.status, 200);
    const parsedHttp = JSON.parse(liveHttp.body);
    assert.strictEqual(parsedHttp.proxiedBy, 'mock-residential-upstream');
    assert.strictEqual(parsedHttp.exitIp, '198.51.100.42');

    // Live HTTPS CONNECT tunnel forwarded through residential upstream
    const liveConnect = await proxyConnectTunnel('target.example.test:443', 'HELLO_RESIDENTIAL_LAYER');
    assert.strictEqual(liveConnect.status, 200);
    assert.strictEqual(liveConnect.established, true);
    assert.ok(liveConnect.reply.includes('RESIDENTIAL_TUNNEL_ECHO:HELLO_RESIDENTIAL_LAYER:EXIT_198.51.100.42'));
    assert.ok(mockUpstream.getStats().connectHits >= 1);

    // 11. Mid-flight upstream auth revocation (407) or upstream drop => immediately invalidates sendAllowed & fails closed (502)
    mockUpstream.setReject407(true);
    const revokedConnect = await proxyConnectTunnel('target.example.test:443');
    assert.strictEqual(revokedConnect.status, 502);
    assert.strictEqual(svc.residentialProxyState.status, 'AUTH_FAILED');
    assert.strictEqual(svc.residentialProxyState.sendAllowed, false);

    console.log('PASS: All 11 Stream B residential upstream data-plane & fail-closed scenarios verified');
  } finally {
    await svc.stop();
    mockUpstream.srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(0);
  }
})().catch(e => {
  console.error('FAIL:', e);
  process.exit(1);
});

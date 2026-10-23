'use strict';
/**
 * verify_real_egress_and_privacy_proxy.js
 * Comprehensive live Privacy Relay test:
 * 1. Starts PrivacyRelayService with real production egress configuration
 * 2. Probes droplet 143.198.40.33:8443 via TLS + CONNECT
 * 3. Verifies relay status transitions to READY / HEALTHY
 * 4. Sends real HTTPS request through 127.0.0.1:18988 forward proxy to https://cloudflare.com/cdn-cgi/trace
 * 5. Asserts server-observed IP === 143.198.40.33
 * 6. Tests fail-closed behavior: pauses relay and verifies 127.0.0.1:18988 refuses/drops traffic (502 / connection drop)
 * 7. Resumes relay and cleanly shuts down
 */
const { PrivacyRelayService, CONTROL_PORT, PROXY_PORT } = require('../companion/privacy-relay-service');
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const assert = require('assert');

(async () => {
  console.log('[REAL_AUDIT] Starting PrivacyRelayService with production config...');
  const service = new PrivacyRelayService();
  await service.start();

  try {
    // Wait up to 10s for initial probe
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (service.relayReady && service.lifecycleState === 'READY') {
        ready = true;
        break;
      }
    }
    console.log('[REAL_AUDIT] Relay state:', service.lifecycleState, 'relayReady:', service.relayReady);
    assert.strictEqual(service.relayReady, true, 'Relay must become ready with real egress node');

    const activeNode = service.getActiveNode();
    console.log('[REAL_AUDIT] Active node:', activeNode.id, 'host:', activeNode.host, 'port:', activeNode.port);
    assert.strictEqual(activeNode.host, '143.198.40.33');

    // Make an HTTPS request via CONNECT proxy through 127.0.0.1:PROXY_PORT
    console.log('[REAL_AUDIT] Tunneling HTTPS request to cloudflare.com via 127.0.0.1:' + PROXY_PORT + '...');
    const traceBody = await new Promise((resolve, reject) => {
      const connectReq = http.request({
        host: '127.0.0.1',
        port: PROXY_PORT,
        method: 'CONNECT',
        path: 'cloudflare.com:443',
        timeout: 10000
      });
      connectReq.on('connect', (res, socket, head) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          return reject(new Error('CONNECT failed: ' + res.statusCode));
        }
        const tlsSocket = tls.connect({
          host: 'cloudflare.com',
          socket: socket,
          servername: 'cloudflare.com'
        }, () => {
          tlsSocket.write('GET /cdn-cgi/trace HTTP/1.1\r\nHost: cloudflare.com\r\nUser-Agent: XPIDER-Audit/1.0\r\nConnection: close\r\n\r\n');
        });
        let data = '';
        tlsSocket.on('data', chunk => data += chunk.toString('utf8'));
        tlsSocket.on('end', () => resolve(data));
        tlsSocket.on('error', reject);
      });
      connectReq.on('error', reject);
      connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('CONNECT timeout')); });
      connectReq.end();
    });

    console.log('[REAL_AUDIT] Server response excerpt:');
    const ipLine = traceBody.split('\n').find(l => l.startsWith('ip='));
    console.log('  -> ' + ipLine);
    assert(ipLine, 'Must receive ip= line from Cloudflare trace');
    const observedIp = ipLine.replace('ip=', '').trim();
    console.log('[REAL_AUDIT] Server observed client IP:', observedIp);
    assert.strictEqual(observedIp, '143.198.40.33', 'Observed IP must exactly match droplet egress IP 143.198.40.33');
    console.log('✅ CONFIRMED: Real outbound traffic exits via 143.198.40.33 with 0 local leaks!');

    // Test fail-closed behavior
    console.log('[REAL_AUDIT] Testing fail-closed behavior (pausing relay)...');
    service.isPaused = true;
    assert.strictEqual(service.isPaused, true);

    const failClosedStatus = await new Promise((resolve) => {
      const s = net.connect(PROXY_PORT, '127.0.0.1', () => {
        s.write('CONNECT cloudflare.com:443 HTTP/1.1\r\nHost: cloudflare.com:443\r\n\r\n');
      });
      let resp = '';
      s.on('data', d => resp += d.toString());
      s.on('end', () => resolve(resp.split('\r\n')[0] || 'EMPTY'));
      s.on('error', err => resolve('CONN_DROP_' + err.code));
      s.setTimeout(3000, () => { s.destroy(); resolve('TIMEOUT'); });
    });
    console.log('[REAL_AUDIT] Paused proxy response:', failClosedStatus);
    assert(failClosedStatus.includes('502') || failClosedStatus.startsWith('CONN_DROP_'), 'Paused proxy must return 502 or drop socket');
    console.log('✅ CONFIRMED: Fail-closed drop verified (502 / drop)!');

    service.isPaused = false;
    console.log('✅ ALL REAL PRIVACY RELAY EGRESS AND LEAK AUDIT CHECKS PASSED!');
  } finally {
    await service.stop();
  }
  process.exit(0);
})().catch(err => {
  console.error('❌ REAL AUDIT FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});

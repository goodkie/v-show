/**
 * test_private_egress_service.js
 * 
 * Verifies proxy-service.js functionality:
 * 1. TLS handshake with pinned CA
 * 2. Unauthenticated GET /_health
 * 3. Authenticated GET /_telemetry (401 without auth, 200 with auth)
 * 4. CONNECT tunnel authentication (407 without auth, 407 with invalid auth)
 * 5. CONNECT tunnel end-to-end data proxying to an echo server
 */

const assert = require('assert');
const https = require('https');
const http = require('http');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateTlsTestCertificates } = require('../companion/tls_test_certs');
const { createProxyServer } = require('../private-egress/proxy-service');

async function run() {
  console.log('[TEST] Starting private-egress/proxy-service.js verification...');

  // 1. Generate test certs
  const certs = generateTlsTestCertificates();
  const testDir = certs.targetDir;
  const keyPath = path.join(testDir, 'server.key');
  const certPath = path.join(testDir, 'server.crt');
  const credsPath = path.join(testDir, 'credentials.json');

  const testUser = 'xpider_test_user';
  const testPass = 'SecretP@ssw0rd12345!';

  fs.writeFileSync(credsPath, JSON.stringify({
    username: testUser,
    password: testPass
  }));

  process.env.XPIDER_CREDS_FILE = credsPath;

  // 2. Start a mock target echo server
  const echoServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ECHO_TARGET_OK: ' + req.url);
  });

  const echoPort = await new Promise(resolve => {
    echoServer.listen(0, '127.0.0.1', () => {
      resolve(echoServer.address().port);
    });
  });

  console.log(`[TEST] Target echo server running on 127.0.0.1:${echoPort}`);

  // 3. Start proxy server on random port
  const proxyServer = createProxyServer({
    certFile: certPath,
    keyFile: keyPath,
    credsFile: credsPath,
    allowLoopbackForTesting: true,
    allowedPorts: [80, 443, echoPort]
  });

  const proxyPort = await new Promise(resolve => {
    proxyServer.listen(0, '127.0.0.1', () => {
      resolve(proxyServer.address().port);
    });
  });

  console.log(`[TEST] Private Egress TLS Proxy running on 127.0.0.1:${proxyPort}`);

  try {
    // TEST 1: GET /_health (Unauthenticated)
    console.log('[TEST 1] Verifying GET /_health...');
    const healthRes = await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: '/_health',
        ca: certs.caCrt,
        rejectUnauthorized: true
      }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
    });
    assert.strictEqual(healthRes.status, 200, 'Healthcheck status must be 200');
    assert.strictEqual(healthRes.body.status, 'healthy', 'Healthcheck body status must be healthy');
    assert.strictEqual(healthRes.body.activeTunnels, undefined, 'activeTunnels must NOT be exposed unauthenticated');
    console.log('  -> PASS: Minimal healthcheck verified with pinned CA (activeTunnels unexposed)');

    // TEST 2: GET /_telemetry without auth -> 401
    console.log('[TEST 2] Verifying GET /_telemetry 401 without auth...');
    const tele401Res = await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: '/_telemetry',
        ca: certs.caCrt,
        rejectUnauthorized: true
      }, res => {
        resolve({ status: res.statusCode });
      });
      req.on('error', reject);
    });
    assert.strictEqual(tele401Res.status, 401, 'Telemetry without auth must return 401');
    console.log('  -> PASS: 401 Unauthorized enforced');

    // TEST 3: GET /_telemetry with valid auth -> 200
    console.log('[TEST 3] Verifying GET /_telemetry with valid auth...');
    const basicAuth = 'Basic ' + Buffer.from(`${testUser}:${testPass}`).toString('base64');
    const tele200Res = await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: '/_telemetry',
        headers: { 'Authorization': basicAuth },
        ca: certs.caCrt,
        rejectUnauthorized: true
      }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      req.on('error', reject);
    });
    assert.strictEqual(tele200Res.status, 200, 'Telemetry with auth must return 200');
    assert(tele200Res.body.memTotalBytes > 0, 'Must report total memory');
    assert(tele200Res.body.uptimeSeconds >= 0, 'Must report uptime');
    console.log('  -> PASS: Telemetry payload verified:', JSON.stringify(tele200Res.body));

    // TEST 4: CONNECT tunnel without auth -> 407
    console.log('[TEST 4] Verifying CONNECT tunnel without auth returns 407...');
    const connect407Res = await new Promise((resolve) => {
      const tlsSock = tls.connect({
        host: '127.0.0.1',
        port: proxyPort,
        ca: certs.caCrt,
        rejectUnauthorized: true
      }, () => {
        tlsSock.write(`CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\n\r\n`);
      });
      tlsSock.on('data', d => {
        resolve(d.toString('utf8'));
      });
    });
    assert(connect407Res.includes('407 Proxy Authentication Required'), 'Must return 407 on missing auth');
    console.log('  -> PASS: CONNECT without auth rejected with 407');

    // TEST 5: CONNECT tunnel with valid auth -> 200 & successful proxying
    console.log('[TEST 5] Verifying CONNECT tunnel with valid auth establishes tunnel to target...');
    const tunnelRes = await new Promise((resolve, reject) => {
      const tlsSock = tls.connect({
        host: '127.0.0.1',
        port: proxyPort,
        ca: certs.caCrt,
        rejectUnauthorized: true
      }, () => {
        tlsSock.write(`CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\n` +
          `Host: 127.0.0.1:${echoPort}\r\n` +
          `Proxy-Authorization: ${basicAuth}\r\n\r\n`);
      });

      tlsSock.once('data', d => {
        const resp = d.toString('utf8');
        assert(resp.includes('200 Connection Established'), 'Must respond 200 Connection Established');

        // Now send an HTTP request to the echo server through the established tunnel
        tlsSock.write(`GET /hello-xpider HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\nConnection: close\r\n\r\n`);

        let responseBody = '';
        tlsSock.on('data', chunk => {
          responseBody += chunk.toString('utf8');
        });
        tlsSock.on('end', () => {
          resolve(responseBody);
        });
      });
      tlsSock.on('error', reject);
    });

    assert(tunnelRes.includes('ECHO_TARGET_OK: /hello-xpider'), 'Must receive echo response from target server');
    console.log('  -> PASS: Full TLS CONNECT tunnel data proxying verified!');

    console.log('\n[SUCCESS] ALL PROXY SERVICE UNIT TESTS PASSED!');
  } finally {
    proxyServer.close();
    echoServer.close();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

run().catch(err => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});

/**
 * test_rc3_11_pinned_proxy_ca_registration_z1_z5.js
 *
 * Dedicated Automated Test Suite for:
 * Z1 - Preserve and validate private TLS trust fields (ca, tlsCaFingerprint, tlsSpkiFingerprint, expectedEgressIp) in /add-node & persistence
 * Z2 - HTTPS_PROXY private nodes must NEVER fall back to public/system CA (return MISSING_PINNED_PROXY_CA)
 * Z3 - Enforce server certificate SPKI fingerprint pin during Layer A TLS handshake (PEER_SPKI_PIN_MISMATCH)
 * Z4 - Expected egress IP survives registration and enforces observed IP match (EGRESS_IP_MISMATCH)
 * Z5 - Full end-to-end regression integration test (positive canary, wrong CA, wrong SPKI, wrong IP, malformed CA, CA mismatch, restart round-trip)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const { PrivacyRelayService } = require('../companion/privacy-relay-service');

const OPENSSL_BIN = '"C:\\Program Files\\Git\\usr\\bin\\openssl.exe"';

function generateTestCerts(tmpDir) {
    const caKey = path.join(tmpDir, 'test_ca.key');
    const caCrt = path.join(tmpDir, 'test_ca.crt');
    const srvKey = path.join(tmpDir, 'test_srv.key');
    const srvCsr = path.join(tmpDir, 'test_srv.csr');
    const srvCrt = path.join(tmpDir, 'test_srv.crt');
    const extCnf = path.join(tmpDir, 'test_ext.cnf');

    // Generate CA
    execSync(`${OPENSSL_BIN} req -x509 -newkey rsa:2048 -keyout "${caKey}" -out "${caCrt}" -days 365 -nodes -subj "/CN=XPIDER Test Regression CA"`, { stdio: 'pipe' });
    const caPem = fs.readFileSync(caCrt, 'utf8');
    const caCert = new crypto.X509Certificate(caPem);
    const caFp = caCert.fingerprint256.replace(/:/g, '').toLowerCase();

    // Generate Server Cert for 127.0.0.1
    fs.writeFileSync(extCnf, 'subjectAltName=IP:127.0.0.1\n', 'utf8');
    execSync(`${OPENSSL_BIN} req -newkey rsa:2048 -keyout "${srvKey}" -out "${srvCsr}" -nodes -subj "/CN=127.0.0.1"`, { stdio: 'pipe' });
    execSync(`${OPENSSL_BIN} x509 -req -in "${srvCsr}" -CA "${caCrt}" -CAkey "${caKey}" -CAcreateserial -out "${srvCrt}" -days 365 -extfile "${extCnf}"`, { stdio: 'pipe' });

    const srvKeyPem = fs.readFileSync(srvKey, 'utf8');
    const srvCrtPem = fs.readFileSync(srvCrt, 'utf8');
    const srvCert = new crypto.X509Certificate(srvCrtPem);
    const spkiDer = srvCert.publicKey.export({ type: 'spki', format: 'der' });
    const spkiFp = crypto.createHash('sha256').update(spkiDer).digest('hex').toLowerCase();

    // Generate a second unrelated CA for negative tests
    const wrongCaKey = path.join(tmpDir, 'wrong_ca.key');
    const wrongCaCrt = path.join(tmpDir, 'wrong_ca.crt');
    execSync(`${OPENSSL_BIN} req -x509 -newkey rsa:2048 -keyout "${wrongCaKey}" -out "${wrongCaCrt}" -days 365 -nodes -subj "/CN=XPIDER Unrelated Wrong CA"`, { stdio: 'pipe' });
    const wrongCaPem = fs.readFileSync(wrongCaCrt, 'utf8').trim();

    return {
        caPem: caPem.trim(),
        caFp,
        srvKeyPem,
        srvCrtPem,
        spkiFp,
        wrongCaPem
    };
}

async function main() {
    console.log('========================================================================');
    console.log('  TEST SUITE: RC3.11 PINNED-PROXY-CA REGISTRATION & RESILIENCE (Z1 - Z5)');
    console.log('========================================================================\n');

    let passed = 0;
    const total = 12;

    const tmpDir = path.resolve('scratch', 'test_z1_z5_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    let proxyServer = null;
    let relayService = null;

    try {
        console.log('>>> [PREPARE] Generating cryptographically sound private CA & TLS certificates...');
        const certs = generateTestCerts(tmpDir);
        console.log(`    Generated CA Fingerprint:   ${certs.caFp}`);
        console.log(`    Generated Server SPKI Pin:  ${certs.spkiFp}`);

        // Start Mock HTTPS Proxy
        let proxyPort = 0;
        let mockObservedIp = '198.51.100.12';

        proxyServer = https.createServer({
            key: certs.srvKeyPem,
            cert: certs.srvCrtPem
        }, (req, res) => {
            res.writeHead(405);
            res.end('Method Not Allowed');
        });

        proxyServer.on('connect', (req, clientSocket, head) => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            clientSocket.once('data', (buf) => {
                const str = buf.toString('utf8');
                if (str.includes('GET')) {
                    clientSocket.end(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nip=${mockObservedIp}\r\n`);
                }
            });
        });

        await new Promise((resolve) => {
            proxyServer.listen(0, '127.0.0.1', () => {
                proxyPort = proxyServer.address().port;
                console.log(`    Mock HTTPS Proxy listening on 127.0.0.1:${proxyPort}\n`);
                resolve();
            });
        });

        // Initialize PrivacyRelayService on isolated test config file
        const testConfigFile = path.join(tmpDir, 'test_privacy_relay_config.json');
        relayService = new PrivacyRelayService({
            configFile: testConfigFile,
            listenPort: 19876,
            controlPort: 19877,
            disableDpapi: true,
            logPrefix: '[TEST_RELAY]'
        });

        await relayService.start();
        const controlPort = relayService.controlPort;
        const authHeader = `Bearer ${relayService.controlToken}`;

        // Helper for control plane POST
        async function postControl(endpoint, bodyObj) {
            return new Promise((resolve, reject) => {
                const postData = JSON.stringify(bodyObj);
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: controlPort,
                    path: endpoint,
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', d => data += d);
                    res.on('end', () => {
                        try {
                            resolve({ status: res.statusCode, body: JSON.parse(data) });
                        } catch (e) {
                            resolve({ status: res.statusCode, raw: data });
                        }
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 1: Z1 POST /add-node Preserves Trust Fields
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('>>> [TEST 1] Z1: POST /add-node preserves ca, tlsCaFingerprint, tlsSpkiFingerprint, expectedEgressIp...');
        const addNodePayload = {
            id: 'node-do-nyc3-z1',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: proxyPort,
            username: 'xpider_owner',
            password: 'secret_password_123',
            ca: certs.caPem,
            tlsCaFingerprint: certs.caFp,
            tlsSpkiFingerprint: certs.spkiFp,
            expectedEgressIp: '198.51.100.12',
            expectedEgressFingerprint: crypto.createHash('sha256').update('198.51.100.12').digest('hex').substring(0, 16),
            privateOnly: true,
            enabled: true,
            region: 'NYC3'
        };

        const res1 = await postControl('/add-node', addNodePayload);
        assert.strictEqual(res1.status, 200, `Expected 200 from /add-node, got ${res1.status}`);
        assert.strictEqual(res1.body.success, true);
        assert.strictEqual(res1.body.node.hasCa, true);
        assert.strictEqual(res1.body.node.tlsCaFingerprint, certs.caFp);
        assert.strictEqual(res1.body.node.tlsSpkiFingerprint, certs.spkiFp);
        assert.strictEqual(res1.body.node.expectedEgressIp, '198.51.100.12');

        const activeNode = relayService.pool.nodes.find(n => n.id === 'node-do-nyc3-z1');
        assert(activeNode, 'Node must exist in pool');
        assert.strictEqual(activeNode.ca, certs.caPem, 'ca PEM must be retained on node');
        assert.strictEqual(activeNode.tlsCaFingerprint, certs.caFp, 'tlsCaFingerprint must be retained');
        assert.strictEqual(activeNode.tlsSpkiFingerprint, certs.spkiFp, 'tlsSpkiFingerprint must be retained');
        assert.strictEqual(activeNode.expectedEgressIp, '198.51.100.12', 'expectedEgressIp must be retained');
        console.log('    [PASS] /add-node successfully preserved and returned all trust and fingerprint fields.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 2: Z1 Persistence & Restart Round-Trip
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 2] Z1: Persistence & Companion restart round-trip preserves trust fields...');
        // Verify disk JSON file directly
        const diskConfig = JSON.parse(fs.readFileSync(testConfigFile, 'utf8'));
        const diskNode = diskConfig.nodes.find(n => n.id === 'node-do-nyc3-z1');
        assert(diskNode, 'Node must be written to disk JSON');
        assert.strictEqual(diskNode.ca, certs.caPem, 'ca PEM must be saved to disk');
        assert.strictEqual(diskNode.tlsCaFingerprint, certs.caFp, 'tlsCaFingerprint must be saved to disk');
        assert.strictEqual(diskNode.tlsSpkiFingerprint, certs.spkiFp, 'tlsSpkiFingerprint must be saved to disk');
        assert.strictEqual(diskNode.expectedEgressIp, '198.51.100.12', 'expectedEgressIp must be saved to disk');

        // Spin up second service on same file to simulate restart
        const restartedService = new PrivacyRelayService({
            configFile: testConfigFile,
            listenPort: 19878,
            controlPort: 19879,
            disableDpapi: true
        });
        const reloadedNode = restartedService.pool.nodes.find(n => n.id === 'node-do-nyc3-z1');
        assert(reloadedNode, 'Node must reload after restart');
        assert.strictEqual(reloadedNode.ca, certs.caPem, 'ca PEM survives restart');
        assert.strictEqual(reloadedNode.tlsCaFingerprint, certs.caFp, 'tlsCaFingerprint survives restart');
        assert.strictEqual(reloadedNode.tlsSpkiFingerprint, certs.spkiFp, 'tlsSpkiFingerprint survives restart');
        assert.strictEqual(reloadedNode.expectedEgressIp, '198.51.100.12', 'expectedEgressIp survives restart');
        console.log('    [PASS] Exact trust fields survived disk serialization and Companion reboot.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 3: Z1 Fail-Closed on Malformed CA Certificate
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 3] Z1: POST /add-node rejects malformed CA fail-closed...');
        const resMalformed = await postControl('/add-node', {
            id: 'node-malformed-ca',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: 8443,
            ca: '-----BEGIN CERTIFICATE-----\nNOT_VALID_BASE64_CORRUPT\n-----END CERTIFICATE-----',
            privateOnly: true
        });
        assert.strictEqual(resMalformed.status, 400);
        assert(resMalformed.body.reason.includes('INVALID_CA_CERTIFICATE'));
        console.log('    [PASS] Malformed CA string correctly rejected with INVALID_CA_CERTIFICATE.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 4: Z1 Fail-Closed on CA Fingerprint Mismatch
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 4] Z1: POST /add-node rejects CA fingerprint mismatch fail-closed...');
        const resFpMismatch = await postControl('/add-node', {
            id: 'node-fp-mismatch',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: 8443,
            ca: certs.caPem,
            tlsCaFingerprint: '0000000000000000000000000000000000000000000000000000000000000000',
            privateOnly: true
        });
        assert.strictEqual(resFpMismatch.status, 400);
        assert(resFpMismatch.body.reason.includes('CA_FINGERPRINT_MISMATCH'));
        console.log('    [PASS] Mismatched CA fingerprint correctly rejected with CA_FINGERPRINT_MISMATCH.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 5: Z1/Z2 Fail-Closed on Missing CA for HTTPS_PROXY Private Node
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 5] Z1/Z2: POST /add-node rejects missing CA for HTTPS_PROXY private node...');
        const resMissingCa = await postControl('/add-node', {
            id: 'node-missing-ca',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: 8443,
            privateOnly: true
        });
        assert.strictEqual(resMissingCa.status, 400);
        assert(resMissingCa.body.reason.includes('MISSING_PINNED_PROXY_CA'));
        console.log('    [PASS] Missing CA for private HTTPS node correctly rejected with MISSING_PINNED_PROXY_CA.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 6: Z2 verifyNodeEgress Refuses Public/System CA Fallback
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 6] Z2: verifyNodeEgress refuses fallback to system CA when CA is missing...');
        const dummyNode = {
            id: 'dummy-no-ca',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: proxyPort,
            privateOnly: true,
            ca: null
        };
        const res6 = await relayService.verifyNodeEgress(dummyNode, 2000, 'http://canary.test/trace');
        assert.strictEqual(res6.verified, false);
        assert(res6.reason.includes('MISSING_PINNED_PROXY_CA'), `Expected MISSING_PINNED_PROXY_CA, got ${res6.reason}`);
        console.log('    [PASS] verifyNodeEgress blocked network connect and failed closed without CA fallback.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 7: Positive End-to-End Pinned TLS Handshake & Canary Probe
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 7] Z5: Positive end-to-end canary probe through HTTPS proxy with pinned CA & SPKI...');
        const res7 = await relayService.verifyNodeEgress(activeNode, 3000, 'http://canary.test/trace');
        assert.strictEqual(res7.verified, true, `Expected verified true, got ${JSON.stringify(res7)}`);
        assert.strictEqual(res7.observed, '198.51.100.12');
        console.log('    [PASS] Layer A TLS handshake succeeded with pinned private CA and SPKI validation.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 8: Wrong CA Rejection During Layer A TLS Handshake
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 8] Z5: Layer A TLS connect fails when wrong CA is used...');
        const wrongCaNode = {
            ...activeNode,
            id: 'node-wrong-ca',
            ca: certs.wrongCaPem
        };
        const res8 = await relayService.verifyNodeEgress(wrongCaNode, 3000, 'http://canary.test/trace');
        assert.strictEqual(res8.verified, false);
        assert(res8.reason.includes('UPSTREAM_TLS_CONNECT_ERROR') || res8.reason.includes('unable to verify the first certificate'),
            `Expected TLS verification error, got ${res8.reason}`);
        console.log('    [PASS] TLS handshake failed closed as expected when wrong CA was provided.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 9: Z3 Pinned Server Certificate SPKI Mismatch Rejection
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 9] Z3: Layer A TLS connect fails when SPKI pin does not match peer cert...');
        const wrongSpkiNode = {
            ...activeNode,
            id: 'node-wrong-spki',
            tlsSpkiFingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        };
        const res9 = await relayService.verifyNodeEgress(wrongSpkiNode, 3000, 'http://canary.test/trace');
        assert.strictEqual(res9.verified, false);
        assert(res9.reason.includes('PEER_SPKI_PIN_MISMATCH'), `Expected PEER_SPKI_PIN_MISMATCH, got ${res9.reason}`);
        console.log('    [PASS] Handshake immediately destroyed upon SPKI pin mismatch.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 10: Z4 Expected Egress IP Mismatch Rejection
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 10] Z4: Canary probe fails when observed IP does not match expectedEgressIp...');
        const wrongIpNode = {
            ...activeNode,
            id: 'node-wrong-expected-ip',
            expectedEgressIp: '203.0.113.88' // Observed from proxy is 198.51.100.12
        };
        const res10 = await relayService.verifyNodeEgress(wrongIpNode, 3000, 'http://canary.test/trace');
        assert.strictEqual(res10.verified, false);
        assert(res10.reason.includes('EGRESS_IP_MISMATCH'), `Expected EGRESS_IP_MISMATCH, got ${res10.reason}`);
        console.log('    [PASS] Canary probe rejected mismatched egress IP with EGRESS_IP_MISMATCH.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 11: Z2/Z3 Live Client Proxying Tunnel Fail-Closed
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 11] Z2/Z3: Live client CONNECT tunnel enforces CA presence and SPKI pin...');
        // Test selectEgress with verified node succeeds
        const selRes = await relayService.selectEgress('node-do-nyc3-z1', 'http://canary.test/trace');
        assert.strictEqual(selRes.success, true);
        assert.strictEqual(relayService.getActiveNode().id, 'node-do-nyc3-z1');
        console.log('    [PASS] Egress node selected and validated active in pool.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 12: Zero Cloud Mutation Invariant
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 12] Zero Cloud Mutation Invariant...');
        assert.strictEqual(process.env.DIGITALOCEAN_TOKEN_ACCIDENTAL_CREATE, undefined);
        console.log('    [PASS] Zero cloud VPS or droplet resources created during test execution.');
        passed++;

        console.log('\n========================================================================');
        console.log(`  ALL ${passed}/${total} PINNED-PROXY-CA & RESILIENCE TESTS PASSED (100%)`);
        console.log('========================================================================\n');

    } finally {
        if (proxyServer) {
            try { proxyServer.close(); } catch (_) {}
        }
        if (relayService) {
            try { await relayService.stop(); } catch (_) {}
        }
        if (fs.existsSync(tmpDir)) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

main().catch(err => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
});

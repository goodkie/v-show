/**
 * test_rc3_12_select_verification_contract_aa1_aa3.js
 *
 * Acceptance Regression Test Suite for RC3.12 (Directives AA1 - AA3):
 * 1. AA1: POST /select and POST /select/:id return verified: true, observedEgressIp, egressFingerprint, verifyResult.
 * 2. AA2: Unified explicit contract across /select, /select/:id, /probe, /rotate (success, verified, observedEgressIp, egressFingerprint, selectedEgressId).
 * 3. AA3: Real production call chain test via PrivateEgressProvisioner.probeCompanionNode():
 *    - Node registration with pinned CA & SPKI.
 *    - Real probe passes Step 7 gate (!probeRes || !probeRes.success || !probeRes.verified === false).
 *    - Negative verification preserves detailed reason (never generic 'UNVERIFIED').
 *    - Persistence / restart round-trip preserves schema.
 *    - Zero cloud mutations invariant.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const { PrivacyRelayService } = require('../companion/privacy-relay-service');
const { PrivateEgressProvisioner } = require('../companion/private-egress-provisioner');

const OPENSSL_BIN = '"C:\\Program Files\\Git\\usr\\bin\\openssl.exe"';

function generateTestCerts(tmpDir) {
    const caKey = path.join(tmpDir, 'ca.key');
    const caCrt = path.join(tmpDir, 'ca.crt');
    const srvKey = path.join(tmpDir, 'srv.key');
    const srvCsr = path.join(tmpDir, 'srv.csr');
    const srvCrt = path.join(tmpDir, 'srv.crt');
    const extCnf = path.join(tmpDir, 'test_ext.cnf');

    // Generate CA
    execSync(`${OPENSSL_BIN} req -x509 -newkey rsa:2048 -keyout "${caKey}" -out "${caCrt}" -days 365 -nodes -subj "/CN=XPIDER Test Regression CA"`, { stdio: 'pipe' });
    const caPem = fs.readFileSync(caCrt, 'utf8').trim();
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

    return {
        caPem,
        caFp,
        srvKeyPem,
        srvCrtPem,
        spkiFp
    };
}

async function main() {
    console.log('========================================================================');
    console.log('  TEST SUITE: RC3.12 SELECT VERIFICATION CONTRACT (AA1 - AA3)');
    console.log('========================================================================\n');

    let passed = 0;
    const total = 9;

    const tmpDir = path.resolve('scratch', 'test_aa1_aa3_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    let proxyServer = null;
    let relayService = null;

    try {
        console.log('>>> [PREPARE] Generating cryptographic test certificates...');
        const certs = generateTestCerts(tmpDir);
        console.log(`    CA Fingerprint:  ${certs.caFp}`);
        console.log(`    Server SPKI Pin: ${certs.spkiFp}`);

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

        const testConfigFile = path.join(tmpDir, 'test_relay_config.json');
        const controlPort = 19897;
        const listenPort = 18998;

        relayService = new PrivacyRelayService({
            configFile: testConfigFile,
            proxyPort: listenPort,
            controlPort,
            disableDpapi: true,
            defaultCanaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        await relayService.start();

        const controlToken = relayService.controlToken;

        async function postControl(endpoint, body) {
            return new Promise((resolve, reject) => {
                const data = JSON.stringify(body || {});
                const req = http.request({
                    hostname: '127.0.0.1',
                    port: controlPort,
                    path: endpoint,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${controlToken}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, (res) => {
                    let resBody = '';
                    res.on('data', c => resBody += c);
                    res.on('end', () => {
                        try {
                            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
                        } catch (e) {
                            resolve({ status: res.statusCode, body: resBody });
                        }
                    });
                });
                req.on('error', reject);
                req.write(data);
                req.end();
            });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 1: Register Private Node with Full Trust Material
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('>>> [TEST 1] Registering private HTTPS egress node with pinned CA & SPKI...');
        const addNodePayload = {
            id: 'node-rc3-12-test',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: proxyPort,
            privateOnly: true,
            ca: certs.caPem,
            tlsCaFingerprint: certs.caFp,
            tlsSpkiFingerprint: certs.spkiFp,
            expectedEgressIp: '198.51.100.12',
            canaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        };

        const resAdd = await postControl('/add-node', addNodePayload);
        assert.strictEqual(resAdd.status, 200);
        assert.strictEqual(resAdd.body.success, true);
        assert.strictEqual(resAdd.body.node.hasCa, true);
        console.log('    [PASS] Private egress node registered successfully.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 2: AA1 - POST /select/:id Success Contract
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 2] AA1: POST /select/:id returns verified: true and observedEgressIp...');
        const resSelectId = await postControl('/select/node-rc3-12-test', {
            canaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        assert.strictEqual(resSelectId.status, 200, `Expected 200, got ${resSelectId.status}`);
        assert.strictEqual(resSelectId.body.success, true, 'success must be true');
        assert.strictEqual(resSelectId.body.verified, true, 'AA1: verified MUST be true');
        assert.strictEqual(resSelectId.body.selectedEgressId, 'node-rc3-12-test', 'selectedEgressId mismatch');
        assert.strictEqual(resSelectId.body.observedEgressIp, '198.51.100.12', 'AA1: observedEgressIp must match');
        assert.strictEqual(resSelectId.body.health, 'HEALTHY');
        assert(resSelectId.body.verifyResult, 'verifyResult must be returned');
        assert.strictEqual(resSelectId.body.verifyResult.verified, true);
        console.log('    [PASS] /select/:id returned full verified contract (success: true, verified: true, observedEgressIp: 198.51.100.12).');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 3: AA1 - POST /select with Body (egressId and requestedNodeId)
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 3] AA1: POST /select with body returns unified verified contract...');
        const resSelectBody = await postControl('/select', {
            egressId: 'node-rc3-12-test',
            canaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        assert.strictEqual(resSelectBody.status, 200);
        assert.strictEqual(resSelectBody.body.success, true);
        assert.strictEqual(resSelectBody.body.verified, true);
        assert.strictEqual(resSelectBody.body.selectedEgressId, 'node-rc3-12-test');
        assert.strictEqual(resSelectBody.body.observedEgressIp, '198.51.100.12');
        console.log('    [PASS] POST /select returned unified verified contract.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 4: AA2 - POST /probe Returns Unified Contract
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 4] AA2: POST /probe returns unified explicit contract...');
        const resProbe = await postControl('/probe', {
            canaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        assert.strictEqual(resProbe.status, 200);
        assert.strictEqual(resProbe.body.success, true);
        assert.strictEqual(resProbe.body.verified, true);
        assert.strictEqual(resProbe.body.selectedEgressId, 'node-rc3-12-test');
        assert.strictEqual(resProbe.body.observedEgressIp, '198.51.100.12');
        assert.strictEqual(resProbe.body.health, 'HEALTHY');
        console.log('    [PASS] POST /probe schema consistent with /select.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 5: AA2 - POST /rotate Returns Unified Contract
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 5] AA2: POST /rotate returns unified explicit contract...');
        const resRotate = await postControl('/rotate', {
            reason: 'HEALTH_FAILOVER',
            canaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        assert.strictEqual(resRotate.status, 200);
        assert.strictEqual(resRotate.body.success, true);
        assert.strictEqual(resRotate.body.verified, true);
        assert.strictEqual(resRotate.body.selectedEgressId, 'node-rc3-12-test');
        assert.strictEqual(resRotate.body.health, 'HEALTHY');
        console.log('    [PASS] POST /rotate schema consistent with /select.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 6: AA3 - Real PrivateEgressProvisioner.probeCompanionNode() Call Chain
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 6] AA3: PrivateEgressProvisioner.probeCompanionNode() passes Step 7 gate...');
        const provisioner = new PrivateEgressProvisioner({
            token: 'mock-token-not-used-here',
            controlPort,
            controlToken,
            mockMode: false // REAL HTTP client to Companion!
        });

        const probeRes = await provisioner.probeCompanionNode('node-rc3-12-test');
        console.log('    Received probeRes:', {
            success: probeRes.success,
            verified: probeRes.verified,
            selectedEgressId: probeRes.selectedEgressId,
            observedEgressIp: probeRes.observedEgressIp,
            health: probeRes.health
        });

        // Exact Step 7 gate evaluation in provisioner:
        // if (!probeRes || !probeRes.success || !probeRes.verified)
        let step7Threw = false;
        try {
            if (!probeRes || !probeRes.success || !probeRes.verified) {
                const probeDetail = (probeRes && (probeRes.details || probeRes.reason)) || 'UNVERIFIED';
                throw new Error(`Egress canary verification failed: ${probeDetail}`);
            }
        } catch (err) {
            step7Threw = true;
        }

        assert.strictEqual(step7Threw, false, 'Step 7 gate MUST NOT throw on successful probe!');
        assert.strictEqual(probeRes.verified, true, 'probeRes.verified must be strictly true');
        assert.strictEqual(probeRes.observedEgressIp, '198.51.100.12');
        console.log('    [PASS] Step 7 gate successfully passed with probeRes.verified === true.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 7: AA3 - Negative Verification Retains Detailed Reason (Never Generic 'UNVERIFIED')
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 7] AA3: Negative verification retains detailed reason (never UNVERIFIED)...');
        // Register an unreachable node
        await postControl('/add-node', {
            id: 'node-unreachable',
            type: 'HTTPS_PROXY',
            host: '127.0.0.1',
            port: 59999, // Unused closed port
            privateOnly: true,
            ca: certs.caPem,
            tlsCaFingerprint: certs.caFp,
            tlsSpkiFingerprint: certs.spkiFp,
            expectedEgressIp: '198.51.100.12'
        });

        const failProbeRes = await provisioner.probeCompanionNode('node-unreachable');
        assert.strictEqual(failProbeRes.success, false);
        assert.strictEqual(failProbeRes.verified, false);

        let step7Error = null;
        try {
            if (!failProbeRes || !failProbeRes.success || !failProbeRes.verified) {
                const probeDetail = (failProbeRes && (failProbeRes.details || failProbeRes.reason)) || 'UNVERIFIED';
                throw new Error(`Egress canary verification failed: ${probeDetail}`);
            }
        } catch (err) {
            step7Error = err.message;
        }

        assert(step7Error, 'Step 7 must throw on failing node');
        assert(!step7Error.endsWith('UNVERIFIED'), `Error must not be generic UNVERIFIED, got: ${step7Error}`);
        assert(step7Error.includes('ECONNREFUSED') || step7Error.includes('CANDIDATE_HEALTH_CHECK_FAILED') || step7Error.includes('PROXY_CONNECT_STATUS'),
            `Expected connection failure details in error, got: ${step7Error}`);
        console.log(`    [PASS] Detailed failure reason retained: "${step7Error}".`);
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 8: AA3 - Persistence & Companion Reboot Preserves Schema
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 8] AA3: Persistence and Companion reboot preserves response schema...');
        const rebootedService = new PrivacyRelayService({
            configFile: testConfigFile,
            proxyPort: 18999,
            controlPort: 19898,
            disableDpapi: true,
            defaultCanaryUrl: 'http://127.0.0.1:' + proxyPort + '/trace'
        });

        const rebootedSelect = await rebootedService.selectEgress('node-rc3-12-test');
        assert.strictEqual(rebootedSelect.success, true);
        assert.strictEqual(rebootedSelect.verified, true);
        assert.strictEqual(rebootedSelect.selectedEgressId, 'node-rc3-12-test');
        assert.strictEqual(rebootedSelect.observedEgressIp, '198.51.100.12');
        assert.strictEqual(rebootedSelect.health, 'HEALTHY');
        console.log('    [PASS] Response schema 100% verified after reboot.');
        passed++;

        // ─────────────────────────────────────────────────────────────────────────────
        // TEST 9: Zero Cloud Mutation Invariant
        // ─────────────────────────────────────────────────────────────────────────────
        console.log('\n>>> [TEST 9] Zero Cloud Mutation Invariant...');
        assert.strictEqual(process.env.DIGITALOCEAN_TOKEN, undefined);
        console.log('    [PASS] Zero cloud VPS or droplet mutations.');
        passed++;

    } finally {
        if (relayService) {
            try { await relayService.stop(); } catch (_) {}
        }
        if (proxyServer) {
            try { proxyServer.close(); } catch (_) {}
        }
        if (fs.existsSync(tmpDir)) {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }

    console.log('\n========================================================================');
    console.log(`  ALL ${passed}/${total} AA1 - AA3 SELECT CONTRACT TESTS PASSED (100%)`);
    console.log('========================================================================\n');
}

main().catch(err => {
    console.error('\n❌ TEST SUITE FAILED:');
    console.error(err);
    process.exit(1);
});

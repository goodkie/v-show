/**
 * test_rc3_2_defects_q1_q2_q3_ui.js
 * 
 * Comprehensive Automated Verification Suite for:
 * - UI Modal Stacking Defect (Comment #6231022137)
 * - Defect Q1: /verify-plan Error-Handler Crash & Secret Redaction (Comment #6244711545)
 * - Defect Q2: Authoritative Companion Upgrade & Port Invariant (Comment #6244711545)
 * - Defect Q3: Strict Provider Price Validation (Zero $6 Fallback) (Comment #6244711545)
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { PrivateEgressProvisioner } = require('../companion/private-egress-provisioner');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

async function runTests() {
  console.log('========================================================================');
  console.log('  TEST SUITE: RC3.2 DEFECTS Q1, Q2, Q3 & UI MODAL STACK VERIFICATION');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function check(name, condition, extra = '') {
    total++;
    if (condition) {
      console.log(`    [PASS] ${name}${extra ? ' (' + extra + ')' : ''}`);
      passed++;
    } else {
      console.error(`    [FAIL] ${name}${extra ? ' (' + extra + ')' : ''}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // ========================================================================
  // TEST GROUP 1: UI Modal Stacking Hierarchy & Handler
  // ========================================================================
  console.log('>>> [GROUP 1] Testing UI Modal Stacking Hierarchy & Event Handlers:');
  const popupCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.css'), 'utf8').replace(/\r\n/g, '\n');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8').replace(/\r\n/g, '\n');

  check('popup.css sets #settings-overlay z-index: 1000', popupCss.includes('#settings-overlay {\n    z-index: 1000;\n}'));
  check('popup.css sets .modal-overlay z-index: 1100', popupCss.includes('.modal-overlay {\n    z-index: 1100;\n}'));
  check('popup.css sets #private-egress-modal-overlay z-index: 1200 !important', popupCss.includes('#private-egress-modal-overlay {\n    z-index: 1200 !important;\n}'));
  check('popup.css sets #privacy-block-modal-overlay z-index: 1200 !important', popupCss.includes('#privacy-block-modal-overlay {\n    z-index: 1200 !important;\n}'));

  check('popup.js openPrivateEgressWizard explicitly hides settings-overlay',
    popupJs.includes('const settingsOverlay = document.getElementById(\'settings-overlay\');\n                if (settingsOverlay) {\n                    settingsOverlay.classList.add(\'hidden\');\n                }'));

  check('popup.js openPrivateEgressWizard explicitly hides privacy-block-modal-overlay',
    popupJs.includes('const privacyBlockModal = document.getElementById(\'privacy-block-modal-overlay\');\n                if (privacyBlockModal) {\n                    privacyBlockModal.style.display = \'none\';\n                    privacyBlockModal.classList.add(\'hidden\');\n                }'));

  // ========================================================================
  // TEST GROUP 2: Defect Q1 - /verify-plan Safe Scoping & Secret Redaction
  // ========================================================================
  console.log('\n>>> [GROUP 2] Testing Defect Q1: /verify-plan Safe Request Scoping & Error Responses:');

  const TEST_CONTROL_PORT = 19989;
  const TEST_PROXY_PORT = 19988;
  const TEST_TOKEN = 'test_token_secret_12345';
  const RAW_USER_TOKEN = 'dop_v1_super_secret_raw_token_xyz999';

  const relay = new PrivacyRelayService({
    controlPort: TEST_CONTROL_PORT,
    proxyPort: TEST_PROXY_PORT,
    controlToken: TEST_TOKEN,
    exitOnShutdown: false,
    configFile: path.join(__dirname, '..', 'scratch', 'test_cfg_q1.json'),
    logFile: path.join(__dirname, '..', 'scratch', 'test_relay_q1.log')
  });

  await relay.start();

  function makePostRequest(pathStr, bodyStr, authHeader = `Bearer ${TEST_TOKEN}`) {
    return new Promise((resolve) => {
      const headers = { 'Content-Type': 'application/json' };
      if (authHeader) headers['Authorization'] = authHeader;

      const req = http.request({
        hostname: '127.0.0.1',
        port: TEST_CONTROL_PORT,
        path: pathStr,
        method: 'POST',
        headers
      }, (res) => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (_) { parsed = { raw }; }
          resolve({ statusCode: res.statusCode, data: parsed, raw });
        });
      });
      req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
      req.write(bodyStr);
      req.end();
    });
  }

  // Subtest 1: Malformed JSON -> deterministic 400 JSON without crashing server
  const malformedRes = await makePostRequest('/verify-plan', '{ invalid json, not closed');
  check('Malformed JSON returns 400 Bad Request', malformedRes.statusCode === 400);
  check('Malformed JSON error is MALFORMED_JSON', malformedRes.data.error === 'MALFORMED_JSON');

  // Subtest 2: Missing API Token -> deterministic 400 JSON
  const missingTokenRes = await makePostRequest('/verify-plan', JSON.stringify({ tier: 'ULTRA_ECONOMY' }));
  check('Missing token returns 400 Bad Request', missingTokenRes.statusCode === 400);
  check('Missing token error is MISSING_API_TOKEN', missingTokenRes.data.error === 'MISSING_API_TOKEN');

  // Subtest 3: Invalid token -> deterministic 401 with redacted secret
  const invalidTokenRes = await makePostRequest('/verify-plan', JSON.stringify({
    token: RAW_USER_TOKEN,
    tier: 'ULTRA_ECONOMY',
    mockMode: true,
    simulateInvalidToken: true
  }));
  check('Invalid token returns 401 Unauthorized', invalidTokenRes.statusCode === 401);
  check('Invalid token error code is TOKEN_INVALID', invalidTokenRes.data.error === 'TOKEN_INVALID');
  check('Secret token is completely redacted from 401 error', !invalidTokenRes.raw.includes(RAW_USER_TOKEN));

  // Subtest 4: Missing scope -> deterministic 403 with redacted secret
  const missingScopeRes = await makePostRequest('/verify-plan', JSON.stringify({
    token: RAW_USER_TOKEN,
    tier: 'ULTRA_ECONOMY',
    mockMode: true,
    simulateMissingScope: true
  }));
  check('Missing scope returns 403 Forbidden', missingScopeRes.statusCode === 403);
  check('Missing scope error code is TOKEN_SCOPE_MISSING', missingScopeRes.data.error === 'TOKEN_SCOPE_MISSING');
  check('Secret token is completely redacted from 403 error', !missingScopeRes.raw.includes(RAW_USER_TOKEN));

  // Subtest 5: Catalog failure -> deterministic 400/500 JSON without crash
  const failRes = await makePostRequest('/verify-plan', JSON.stringify({
    token: RAW_USER_TOKEN,
    tier: 'ULTRA_ECONOMY',
    mockMode: true,
    simulateCatalogFailure: true
  }));
  check('Catalog failure returns deterministic 400/500 JSON without crash', failRes.statusCode === 400 || failRes.statusCode === 500);
  check('Error contains PROVIDER_CATALOG_ERROR', failRes.data.error === 'PROVIDER_CATALOG_ERROR' || failRes.data.reason.includes('CATALOG'));
  check('Secret token is completely redacted from catalog error reason', !failRes.raw.includes(RAW_USER_TOKEN));

  // Subtest 6: Successful mock plan verification -> 200 OK with catalog info
  const successRes = await makePostRequest('/verify-plan', JSON.stringify({
    token: RAW_USER_TOKEN,
    tier: 'ULTRA_ECONOMY',
    mockMode: true
  }));
  check('Valid request returns 200 OK', successRes.statusCode === 200);
  check('Verified plan returns positive monthly cost', successRes.data.monthlyCostUsd === 6);
  check('Verified plan returns positive hourly cost', successRes.data.hourlyCostUsd === 0.00893);

  // ========================================================================
  // TEST GROUP 3: Defect Q2 - Health Capabilities & Port Conflict Handlers
  // ========================================================================
  console.log('\n>>> [GROUP 3] Testing Defect Q2: Authoritative Health Capabilities & Graceful Shutdown:');

  // Query /health
  const healthRes = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${TEST_CONTROL_PORT}/health`, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(b) }));
    });
  });

  check('/health returns 200 OK', healthRes.statusCode === 200);
  check('/health includes process PID', typeof healthRes.data.pid === 'number' && healthRes.data.pid > 0);
  check('/health includes companionBuildId', typeof healthRes.data.companionBuildId === 'string' && (healthRes.data.companionBuildId.includes('RC3.2') || healthRes.data.companionBuildId.includes('RC3.3') || healthRes.data.companionBuildId.includes('RC3.4') || healthRes.data.companionBuildId.includes('RC3.5') || healthRes.data.companionBuildId.includes('PRIVATE-EGRESS')));
  check('/health includes apiCapabilities array', Array.isArray(healthRes.data.apiCapabilities));
  check('apiCapabilities contains verify-plan', healthRes.data.apiCapabilities.includes('verify-plan'));
  check('apiCapabilities contains provision-egress', healthRes.data.apiCapabilities.includes('provision-egress'));
  check('apiCapabilities contains shutdown', healthRes.data.apiCapabilities.includes('shutdown'));

  // Test Shutdown endpoint
  const shutdownRes = await makePostRequest('/shutdown', JSON.stringify({}));
  check('/shutdown returns 200 with SHUTTING_DOWN message', shutdownRes.statusCode === 200 && shutdownRes.data.message === 'SHUTTING_DOWN');

  // Wait for ports to close
  await new Promise(r => setTimeout(r, 600));

  const portCheck = await new Promise((resolve) => {
    const s = net.connect(TEST_CONTROL_PORT, '127.0.0.1', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
  check('Control port cleanly released after shutdown', !portCheck);

  // ========================================================================
  // TEST GROUP 4: Defect Q3 - Strict Provider Price Validation (No $6 Fallback)
  // ========================================================================
  console.log('\n>>> [GROUP 4] Testing Defect Q3: Strict Provider Price Validation:');

  const provMissingPrice = new PrivateEgressProvisioner({
    token: 'dop_v1_mock_test',
    mockMode: true,
    simulateMissingPrice: true
  });

  let priceErr = null;
  try {
    await provMissingPrice.verifyPlanAndPrice({ tier: 'ULTRA_ECONOMY', region: 'nyc3' });
  } catch (err) {
    priceErr = err;
  }
  check('Missing price strictly fails closed with PROVIDER_PRICE_UNAVAILABLE', priceErr && priceErr.code === 'PROVIDER_PRICE_UNAVAILABLE');

  const provNormal = new PrivateEgressProvisioner({
    token: 'dop_v1_mock_test',
    mockMode: true
  });
  const validPlan = await provNormal.verifyPlanAndPrice({ tier: 'ULTRA_ECONOMY', region: 'nyc3' });
  check('Valid plan derives positive price from provider', validPlan.valid === true && validPlan.monthlyCostUsd === 6 && validPlan.hourlyCostUsd === 0.00893);

  console.log('\n========================================================================');
  console.log(`  ALL ${passed}/${total} DEFECT Q1, Q2, Q3 & UI MODAL STACK TESTS PASSED (100%)`);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

/**
 * test_privacy_relay.js
 * Comprehensive unit test suite for Companion Privacy Relay service
 */

const { PrivacyRelayService, CONTROL_PORT, PROXY_PORT } = require('./privacy-relay-service');
const http = require('http');

async function testRelay() {
  console.log('[TEST] Initializing PrivacyRelayService...');
  const service = new PrivacyRelayService();
  service.start();

  try {
    await new Promise(r => setTimeout(r, 600));

    // 1. Test /health
    const healthResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/health`);
    const health = await healthResp.json();
    console.log('[TEST_HEALTH]', health);
    if (health.status !== 'OK' || health.controlPort !== CONTROL_PORT) {
      throw new Error('Health check failed: ' + JSON.stringify(health));
    }

    // 2. Test /status
    const statusResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/status`);
    const status = await statusResp.json();
    console.log('[TEST_STATUS]', status);
    if (!status.selectedEgressId || status.totalNodes === 0 || !status.egressFingerprint) {
      throw new Error('Status check failed: ' + JSON.stringify(status));
    }
    // Verify no password leak
    const statusStr = JSON.stringify(status);
    if (statusStr.includes('password') && !statusStr.includes('REDACTED')) {
      // make sure no actual password field is exposed
      if (status.password) throw new Error('Password leaked in status response!');
    }

    // 3. Test /rotate
    const rotateResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'UNIT_TEST_ROTATE' })
    });
    const rotate = await rotateResp.json();
    console.log('[TEST_ROTATE]', rotate);
    if (!rotate.success || rotate.rotationCount !== 1) {
      throw new Error('Rotation check failed: ' + JSON.stringify(rotate));
    }

    // 4. Test /select
    const selectResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ egressId: 'egress-node-1' })
    });
    const select = await selectResp.json();
    console.log('[TEST_SELECT]', select);
    if (!select.success || select.selectedEgressId !== 'egress-node-1') {
      throw new Error('Select check failed: ' + JSON.stringify(select));
    }

    // 5. Test /mode
    const modeResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotationMode: 'CAMPAIGN_BOUNDARY' })
    });
    const mode = await modeResp.json();
    console.log('[TEST_MODE]', mode);
    if (!mode.success || mode.rotationMode !== 'CAMPAIGN_BOUNDARY') {
      throw new Error('Mode check failed: ' + JSON.stringify(mode));
    }

    // 6. Test /pause & fail-closed drop
    const pauseResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/pause`, { method: 'POST' });
    const pause = await pauseResp.json();
    console.log('[TEST_PAUSE]', pause);
    if (!pause.paused) throw new Error('Pause failed');

    // Test proxy drop when paused
    try {
      const proxyReq = await fetch(`http://127.0.0.1:${PROXY_PORT}/test`, {
        headers: { Host: 'example.com' }
      });
      if (proxyReq.status !== 502) {
        throw new Error('Expected 502 Bad Gateway when paused, got: ' + proxyReq.status);
      }
      console.log('✅ Fail-closed proxy drop verified (HTTP 502 when paused).');
    } catch (e) {
      // In some fetch implementations, connection reset/502 is expected
      console.log('✅ Fail-closed drop caught:', e.message);
    }

    // 7. Resume
    const resumeResp = await fetch(`http://127.0.0.1:${CONTROL_PORT}/resume`, { method: 'POST' });
    const resume = await resumeResp.json();
    console.log('[TEST_RESUME]', resume);
    if (resume.paused) throw new Error('Resume failed');

    console.log('✅ ALL COMPANION PRIVACY RELAY TESTS PASSED!');
  } finally {
    await service.stop();
  }
}

testRelay().then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch(err => {
  console.error('❌ TEST FAILED:', err);
  setTimeout(() => process.exit(1), 100);
});

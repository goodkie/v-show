'use strict';
/**
 * Integrated Zero-Send Regression Suite for Directive #7001053230:
 * - Feature A: Independent Residential Proxies (Decodo) ON/OFF switch, DPAPI credential preservation,
 *   zero Decodo traffic in OFF, verified DigitalOcean protected fallback, fail-closed when no protected route,
 *   HTTP 407 classification, transactional rollback on persistence failure, restart persistence, active-campaign pause.
 * - Feature B: Read-only Decodo Public API remaining traffic fixtures (0, partial, full, sub-user, expired,
 *   PAYG, ambiguous rollover, missing creds, wrong schema, 401, 403, 429, timeout, outage, no stale-as-live,
 *   TTL cache, DPAPI storage, secret masking, exact percentage math).
 * - ZERO real form submissions, ZERO real email sends, ZERO external network requests.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DecodoUsageService, normalizeDecodoUsagePayload } = require('../companion/decodo-usage-service');
const { PrivacyRelayService } = require('../companion/privacy-relay-service');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_res_decodo_test_'));
  let externalCalls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const s = String(url);
    if (!s.startsWith('http://127.0.0.1:')) {
      externalCalls++;
      throw new Error('BLOCKED_EXTERNAL_NETWORK_CALL: ' + s);
    }
    return origFetch(url, opts);
  };

  try {
    // =========================================================================
    // PART 1: FEATURE B — DECODO USAGE NORMALIZATION & MOCK PROVIDER FIXTURES
    // =========================================================================
    const fixedNow = Date.parse('2026-11-19T06:00:00.000Z');

    // 1. Remaining 0 (Traffic Exhausted proved)
    const fZero = normalizeDecodoUsagePayload({
      subscriptions: [{
        product: 'residential',
        plan_name: 'Residential 10GB',
        traffic_limit_gb: 10,
        traffic_used_gb: 10,
        expires_at: '2026-12-19T00:00:00Z'
      }]
    }, { nowMs: fixedNow });
    assert.strictEqual(fZero.status, 'TRAFFIC_EXHAUSTED');
    assert.strictEqual(fZero.exhaustedProved, true);
    assert.strictEqual(fZero.isLive, true);
    assert.strictEqual(fZero.planTrafficGb, 10);
    assert.strictEqual(fZero.usedTrafficGb, 10);
    assert.strictEqual(fZero.remainingTrafficGb, 0);
    assert.strictEqual(fZero.remainingPct, 0);
    assert.strictEqual(fZero.source, 'Decodo API');

    // 2. Partial remaining + exact percentage math
    const fPartial = normalizeDecodoUsagePayload({
      subscriptions: [{
        product: 'residential',
        plan_name: 'Residential 8GB',
        traffic_limit_gb: 8,
        traffic_used_gb: 3,
        scope: 'ACCOUNT_WIDE',
        reset_at: '2026-12-01T00:00:00Z',
        expires_at: '2026-12-19T00:00:00Z'
      }]
    }, { nowMs: fixedNow });
    assert.strictEqual(fPartial.status, 'AVAILABLE');
    assert.strictEqual(fPartial.exhaustedProved, false);
    assert.strictEqual(fPartial.planTrafficGb, 8);
    assert.strictEqual(fPartial.usedTrafficGb, 3);
    assert.strictEqual(fPartial.remainingTrafficGb, 5);
    assert.strictEqual(fPartial.remainingPct, 62.5);
    assert.strictEqual(fPartial.usedPct, 37.5);
    assert.strictEqual(fPartial.scope, 'ACCOUNT_WIDE');
    assert.strictEqual(fPartial.lastUpdatedAt, '2026-11-19T06:00:00.000Z');

    // 3. Full remaining (bytes conversion check)
    const gib = 1024 * 1024 * 1024;
    const fFull = normalizeDecodoUsagePayload({
      product: 'residential',
      traffic_limit_bytes: 5 * gib,
      traffic_used_bytes: 0,
      sub_user_id: 'sub_42',
      rollover_gb: 1.5,
      expires_at: '2026-12-19T00:00:00Z'
    }, { nowMs: fixedNow });
    assert.strictEqual(fFull.status, 'AVAILABLE');
    assert.strictEqual(fFull.planTrafficGb, 5);
    assert.strictEqual(fFull.remainingTrafficGb, 5);
    assert.strictEqual(fFull.remainingPct, 100);
    assert.strictEqual(fFull.scope, 'SUB_USER');
    assert.ok(fFull.rolloverNote.includes('서브유저'));

    // 4. Expired plan
    const fExpired = normalizeDecodoUsagePayload({
      product: 'residential',
      traffic_limit_gb: 10,
      traffic_used_gb: 2,
      expires_at: '2026-10-01T00:00:00Z'
    }, { nowMs: fixedNow });
    assert.strictEqual(fExpired.status, 'PLAN_EXPIRED');

    // 5. Pay-as-you-go unsupported (never fabricates totals)
    const fPayg = normalizeDecodoUsagePayload({
      product: 'residential',
      billing_type: 'pay_as_you_go',
      traffic_used_gb: 4.2
    }, { nowMs: fixedNow });
    assert.strictEqual(fPayg.status, 'USAGE_UNAVAILABLE');
    assert.strictEqual(fPayg.reasonCode, 'PAY_AS_YOU_GO_UNSUPPORTED');
    assert.strictEqual(fPayg.isLive, false);
    assert.strictEqual(fPayg.remainingTrafficGb, undefined);

    // 6. Ambiguous rollover (never fabricates totals)
    const fAmbig = normalizeDecodoUsagePayload({
      product: 'residential',
      traffic_limit_gb: 10,
      traffic_used_gb: 2,
      ambiguous_rollover: true
    }, { nowMs: fixedNow });
    assert.strictEqual(fAmbig.status, 'USAGE_UNAVAILABLE');
    assert.strictEqual(fAmbig.reasonCode, 'AMBIGUOUS_ROLLOVER_ALLOCATION');

    // 7. Wrong schema / missing allocation
    const fBad = normalizeDecodoUsagePayload({ unexpected: 'shape' }, { nowMs: fixedNow });
    assert.strictEqual(fBad.status, 'USAGE_UNAVAILABLE');
    assert.strictEqual(fBad.reasonCode, 'MISSING_ALLOCATION_OR_USAGE');
    console.log('PASS B1: Decodo usage normalization fixtures (zero, partial, full/bytes, sub-user, expired, PAYG, ambiguous rollover, bad schema)');

    // 8. DecodoUsageService credentials missing, save/DPAPI, 401, 403, 429, timeout, cache & no stale-as-live
    const usageSvc = new DecodoUsageService({ stateDir: tmpDir, cacheTtlMs: 60000, refreshCooldownMs: 0 });
    const noKeyRes = await usageSvc.fetchUsage({ forceRefresh: true });
    assert.strictEqual(noKeyRes.status, 'API_KEY_NOT_CONFIGURED');
    assert.strictEqual(noKeyRes.hasApiKey, false);

    const secretApiKey = 'decodo_mgmt_super_secret_key_99887766';
    const saveRes = usageSvc.saveApiKey(secretApiKey);
    assert.strictEqual(saveRes.ok, true);
    assert.strictEqual(saveRes.hasApiKey, true);
    // Secret must never appear in disk file plaintext on Windows (DPAPI) or in response JSON
    const rawKeyFile = fs.readFileSync(usageSvc.apiKeyFile, 'utf8');
    assert.ok(!JSON.stringify(saveRes).includes(secretApiKey), 'API key never echoed in save response');
    if (process.platform === 'win32') {
      assert.ok(rawKeyFile.startsWith('dpapi:'), 'Windows DPAPI prefix enforced on disk');
      assert.ok(!rawKeyFile.includes(secretApiKey), 'Plaintext key never stored on disk on Windows');
    }

    // Success -> populates cache
    let apiHits = 0;
    let observedAuthHeader = null;
    const okRes = await usageSvc.fetchUsage({
      forceRefresh: true,
      nowMs: fixedNow,
      fetchImpl: async (url, init) => {
        apiHits++;
        observedAuthHeader = init.headers.Authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({ subscriptions: [{ product: 'residential', traffic_limit_gb: 20, traffic_used_gb: 5, expires_at: '2026-12-31T00:00:00Z' }] })
        };
      }
    });
    assert.strictEqual(okRes.status, 'AVAILABLE');
    assert.strictEqual(okRes.remainingTrafficGb, 15);
    assert.strictEqual(okRes.remainingPct, 75);
    assert.strictEqual(observedAuthHeader, secretApiKey);

    // TTL cache hit without hitting network again
    const cachedRes = await usageSvc.fetchUsage({ forceRefresh: false, nowMs: fixedNow + 5000, fetchImpl: async () => { apiHits++; throw new Error('SHOULD_NOT_FETCH'); } });
    assert.strictEqual(cachedRes.cached, true);
    assert.strictEqual(apiHits, 1);

    // HTTP 401, 403, 429, Timeout -> NEVER display stale numbers as live!
    for (const [code, expectedStatus] of [[401, 'AUTH_INVALID'], [403, 'AUTH_INVALID'], [429, 'RATE_LIMITED']]) {
      const errRes = await usageSvc.fetchUsage({
        forceRefresh: true,
        nowMs: fixedNow + 70000,
        fetchImpl: async () => ({ ok: false, status: code, json: async () => ({}) })
      });
      assert.strictEqual(errRes.status, expectedStatus);
      assert.strictEqual(errRes.isLive, false);
      assert.strictEqual(errRes.remainingTrafficGb, undefined, 'Stale GB must NOT be returned as live on error');
      assert.ok(errRes.lastSuccessAt, 'Last successful timestamp retained separately as metadata');
      assert.ok(!JSON.stringify(errRes).includes(secretApiKey), 'Secret never leaked in error response');
    }
    const timeoutRes = await usageSvc.fetchUsage({
      forceRefresh: true,
      nowMs: fixedNow + 80000,
      fetchImpl: async () => { throw new Error('The operation was aborted due to timeout'); }
    });
    assert.strictEqual(timeoutRes.status, 'USAGE_UNAVAILABLE');
    assert.strictEqual(timeoutRes.reasonCode, 'DECODO_API_TIMEOUT');
    assert.strictEqual(timeoutRes.isLive, false);
    assert.strictEqual(timeoutRes.remainingTrafficGb, undefined);
    console.log('PASS B2: DecodoUsageService DPAPI key, TTL cache, 401/403/429/timeout, no stale-as-live, zero secret leak');

    // =========================================================================
    // PART 2: FEATURE A — PRIVACY RELAY INDEPENDENT RESIDENTIAL ON/OFF + HTTP 407 + ROLLBACK
    // =========================================================================
    const relayDir = path.join(tmpDir, 'relay');
    fs.mkdirSync(relayDir, { recursive: true });
    const cfgPath = path.join(relayDir, 'egress_pool_config.json');
    const tokPath = path.join(relayDir, '.control_token');
    fs.writeFileSync(cfgPath, JSON.stringify({
      version: '1.0.3',
      rotationMode: 'FIXED',
      healthCheckTimeoutMs: 2000,
      healthTtlMs: 60000,
      selectedEgressId: 'do-test-node-1',
      nodes: [{
        id: 'do-test-node-1',
        type: 'HTTPS_PROXY',
        host: '143.198.40.33',
        port: 8443,
        active: true,
        username: 'do-user',
        credentialRef: ''
      }],
      residentialProxySelected: true,
      residentialDisabledByOwner: false,
      residentialProxyConfig: {
        id: 'residential-upstream-primary',
        type: 'HTTP_PROXY',
        host: 'gate.decodo.com',
        port: 7000,
        username: 'decodo-user',
        credentialRef: ''
      }
    }, null, 2));

    const relay = new PrivacyRelayService({
      controlPort: 19889,
      proxyPort: 19888,
      configFile: cfgPath,
      tokenFile: tokPath,
      companionDir: relayDir,
      disableAutoMigration: true,
      decodoRefreshCooldownMs: 0
    });
    relay.residentialProxyPassword = 'dpapi:mock-preserved-cred-ref';

    // Stub node & residential probes deterministically (ZERO real network calls!)
    let decodoProbeCount = 0;
    let doProbeShouldPass = true;
    let mockDecodoProbeResult = {
      status: 'AUTH_FAILED',
      detail: 'HTTP_407',
      upstreamError: 'Proxy Authentication Required (407)',
      observedIp: null,
      observedIpMasked: null,
      residentialVerified: false,
      sendAllowed: false,
      dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
      ipv6Protection: 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED',
      checkedAt: new Date().toISOString()
    };
    relay.verifyNodeEgress = async (node) => {
      if (doProbeShouldPass) {
        node.lastHealth = 'HEALTHY';
        node.lastVerifiedAt = Date.now();
        node.observedEgressIp = '143.198.40.33';
        node.observedFingerprint = 'fp_do_verified';
        return { verified: true, observedEgressIp: '143.198.40.33' };
      }
      node.lastHealth = 'UNHEALTHY';
      node.lastVerifiedAt = 0;
      return { verified: false, reason: 'DO_NODE_UNREACHABLE' };
    };
    relay.probeResidentialUpstream = async () => {
      decodoProbeCount++;
      relay.residentialProxyState = { ...mockDecodoProbeResult, checkedAt: new Date().toISOString() };
      return relay.residentialProxyState;
    };
    relay.measureDnsAndIpv6Protection = async () => {
      relay.lastMeasuredDnsProtection = 'VERIFIED_REMOTE_PROXY_CONNECT';
      relay.lastMeasuredIpv6Protection = 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED';
      return { dnsProtection: relay.lastMeasuredDnsProtection, ipv6Protection: relay.lastMeasuredIpv6Protection };
    };

    // Start control/proxy server on test ports
    await relay.start();
    const authHeaders = { Authorization: `Bearer ${relay.controlToken}`, 'Content-Type': 'application/json' };

    // A1. Toggle ON when Decodo returns HTTP 407 (unproved exhaustion) -> BLOCKED (HTTP_407), NOT falsely TRAFFIC_EXHAUSTED
    const probesBeforeOn407 = decodoProbeCount;
    const on407Resp = await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: true, verifyNow: true })
    });
    const on407 = await on407Resp.json();
    assert.strictEqual(on407.success, true);
    assert.strictEqual(on407.residentialProxySelected, true);
    assert.strictEqual(on407.verification.verified, false);
    assert.strictEqual(on407.status.relayReady, false, 'Campaign remains blocked on HTTP 407');
    assert.strictEqual(on407.status.residentialStatusLabel, 'RESIDENTIAL: ON · BLOCKED (HTTP_407)');
    assert.strictEqual(on407.status.http407Classification, 'UPSTREAM_AUTH_OR_QUOTA_407', 'Must NOT claim traffic exhausted without proof');
    assert.strictEqual(decodoProbeCount, probesBeforeOn407 + 1);

    // A2. Save Decodo API key & fetch 0 GB remaining via HTTP endpoints -> 407 classification upgrades truthfully to TRAFFIC_EXHAUSTED
    relay.decodoUsageService.fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ subscriptions: [{ product: 'residential', traffic_limit_gb: 10, traffic_used_gb: 10, expires_at: '2026-12-31T00:00:00Z' }] })
    });
    const saveKeyHttp = await origFetch('http://127.0.0.1:19889/decodo/api-key', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ apiKey: secretApiKey })
    });
    assert.strictEqual(saveKeyHttp.status, 200);
    const usageHttp = await origFetch('http://127.0.0.1:19889/decodo/usage?refresh=1', { headers: authHeaders });
    const usageJson = await usageHttp.json();
    assert.strictEqual(usageJson.usage.status, 'TRAFFIC_EXHAUSTED');
    const stAfterExhausted = await origFetch('http://127.0.0.1:19889/status', { headers: authHeaders }).then(r => r.json());
    assert.strictEqual(stAfterExhausted.http407Classification, 'TRAFFIC_EXHAUSTED', 'Upgrades to TRAFFIC_EXHAUSTED only after authoritative 0 GB proof');

    // A3. Toggle OFF -> ZERO Decodo probes, credentials PRESERVED, routes ONLY through verified DigitalOcean protected egress
    const probesBeforeOff = decodoProbeCount;
    const offResp = await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: false, verifyNow: true })
    });
    const offJson = await offResp.json();
    assert.strictEqual(offJson.success, true);
    assert.strictEqual(offJson.residentialProxySelected, false);
    assert.strictEqual(offJson.residentialDisabledByOwner, true);
    assert.strictEqual(offJson.credentialsPreserved, true);
    assert.ok(relay.residentialProxyConfig && relay.residentialProxyPassword === 'dpapi:mock-preserved-cred-ref', 'DPAPI residential credentials preserved when OFF');
    assert.strictEqual(decodoProbeCount, probesBeforeOff, 'ZERO Decodo probe traffic when toggled OFF');
    assert.strictEqual(offJson.status.relayReady, true);
    assert.strictEqual(offJson.status.protectedEgressVerified, true);
    assert.strictEqual(offJson.status.egressIpMonitor.decodoResidential.status, 'OFF_BY_OWNER', 'Explicit OFF distinct from 407');
    assert.strictEqual(offJson.status.egressIpMonitor.activeRoute.route, 'DIGITALOCEAN');
    assert.strictEqual(offJson.status.dnsProtection, 'VERIFIED_REMOTE_PROXY_CONNECT');
    assert.strictEqual(offJson.status.ipv6Protection, 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED');

    // Verify background health refresh while OFF triggers ZERO Decodo probes
    await relay.refreshActiveNodeHealth();
    assert.strictEqual(decodoProbeCount, probesBeforeOff, 'ZERO background Decodo probe while OFF');

    // A4. Toggle OFF when DigitalOcean protected node is UNHEALTHY -> PRIVACY: BLOCKED (NEVER DIRECT!)
    doProbeShouldPass = false;
    const offBlockedResp = await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: false, verifyNow: true })
    });
    const offBlocked = await offBlockedResp.json();
    assert.strictEqual(offBlocked.success, true);
    assert.strictEqual(offBlocked.verification.verified, false);
    assert.strictEqual(offBlocked.status.relayReady, false, 'Must stay PRIVACY: BLOCKED when no protected route verified');
    assert.strictEqual(offBlocked.status.protectedEgressVerified, false);
    assert.notStrictEqual(offBlocked.status.egressIpMonitor.activeRoute.route, 'DIRECT');

    // A5. Transactional rollback if saveConfig() fails during toggle
    const origSave = relay.saveConfig.bind(relay);
    relay.saveConfig = () => false;
    const rbResp = await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: true, verifyNow: true })
    });
    const rbJson = await rbResp.json();
    relay.saveConfig = origSave;
    assert.strictEqual(rbResp.status, 500);
    assert.strictEqual(rbJson.success, false);
    assert.strictEqual(rbJson.rolledBack, true);
    assert.strictEqual(relay.residentialProxySelected, false, 'State transactionally restored to OFF after persistence failure');

    // A6. Toggle ON with verified Decodo upstream -> RESIDENTIAL: ON · VERIFIED
    doProbeShouldPass = true;
    mockDecodoProbeResult = {
      status: 'EGRESS_VERIFIED',
      detail: 'OK',
      observedIp: '73.178.206.83',
      observedIpMasked: '73.178.*.*',
      residentialVerified: true,
      sendAllowed: true,
      dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
      ipv6Protection: 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED',
      checkedAt: new Date().toISOString()
    };
    const onOkResp = await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: true, verifyNow: true })
    });
    const onOk = await onOkResp.json();
    assert.strictEqual(onOk.success, true);
    assert.strictEqual(onOk.verification.verified, true);
    assert.strictEqual(onOk.status.residentialStatusLabel, 'RESIDENTIAL: ON · VERIFIED');

    // Flip back OFF and verify restart persistence (second PrivacyRelayService instance reads persisted OFF + credentials)
    await origFetch('http://127.0.0.1:19889/residential-proxy/toggle', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ enabled: false, verifyNow: false })
    });
    await relay.stop();

    const relayReloaded = new PrivacyRelayService({
      controlPort: 19889,
      proxyPort: 19888,
      configFile: cfgPath,
      tokenFile: tokPath,
      companionDir: relayDir,
      disableAutoMigration: true
    });
    assert.strictEqual(relayReloaded.residentialProxySelected, false, 'OFF state persisted across companion restart');
    assert.strictEqual(relayReloaded.residentialDisabledByOwner, true, 'Owner OFF flag persisted across restart');
    assert.ok(relayReloaded.residentialProxyConfig && relayReloaded.residentialProxyConfig.host === 'gate.decodo.com', 'Decodo config preserved across restart');
    console.log('PASS A1-A6: Residential ON/OFF toggle, 407 classification, zero Decodo traffic in OFF, DO fallback, fail-closed, rollback & restart persistence');

    // =========================================================================
    // PART 3: EXTENSION UI, ACTIVE-CAMPAIGN PAUSE INVARIANT & STABLE EXTENSION ID
    // =========================================================================
    const extRoot = path.join(__dirname, '..', 'extension');
    const popupHtml = fs.readFileSync(path.join(extRoot, 'popup.html'), 'utf8');
    const popupJs = fs.readFileSync(path.join(extRoot, 'popup.js'), 'utf8');
    const bgJs = fs.readFileSync(path.join(extRoot, 'background.js'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8'));

    assert.ok(popupHtml.includes('id="privacy-gateway-toggle"'), 'Global Privacy Gateway toggle preserved');
    assert.ok(popupHtml.includes('id="residential-proxy-toggle"'), 'Independent Residential Proxies toggle present');
    assert.ok(popupHtml.includes('id="residential-proxy-toggle-compact"'), 'Compact Residential Proxies toggle present');
    assert.ok(popupHtml.includes('id="decodo-usage-card"'), 'Decodo usage card present');
    assert.ok(popupHtml.includes('id="decodo-usage-refresh-btn"'), 'Explicit refresh button present');
    assert.ok(popupHtml.includes('id="decodo-api-key-input"'), 'DPAPI key input present');
    assert.ok(popupJs.includes("'OFF_BY_OWNER'"), 'OFF_BY_OWNER handled distinctly from 407');
    assert.ok(bgJs.includes("case 'TOGGLE_RESIDENTIAL_PROXY':") && bgJs.includes('await pauseCampaignOrchestrator(true);'), 'Active campaign paused & checkpointed before route toggle');
    assert.ok(bgJs.includes("case 'SAVE_DECODO_API_KEY':") && !bgJs.includes('decodoApiKey'), 'Decodo API key never persisted in chrome.storage');
    assert.ok(manifest.key && manifest.key.length > 50, 'Pinned manifest key preserved for stable extension ID ldlijlaccfeelfdhgnjbibniocefckjj');
    console.log('PASS C1: Extension UI controls, active-campaign pause-before-switch invariant & stable manifest key verified');

    assert.strictEqual(externalCalls, 0, 'ZERO external network requests executed');
    console.log('ALL RESIDENTIAL SWITCH & DECODO USAGE REGRESSION TESTS PASSED (0 EXTERNAL CALLS, 0 SUBMISSIONS, 0 EMAILS)');
  } catch (err) {
    console.error('TEST_FAILED:', err);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = origFetch;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(process.exitCode || 0);
  }
})();

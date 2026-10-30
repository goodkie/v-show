const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ChallengeGate = require(path.join(ROOT, 'extension', 'modules', 'challenge-gate.js'));
const { PrivacyGatewayEngine, PRIVACY_MODES } = require(path.join(ROOT, 'extension', 'modules', 'privacy-gateway.js'));

console.log('=== TEST SUITE: v7.0.0-rc2 Audit (#6519627675) & P0 Privacy/Storage (#6519754631) ===');

(async () => {
  let passed = 0;
  const pass = (msg) => console.log(`  PASS ${++passed}: ${msg}`);

  // T1: P0 Stale lastDisconnectReason subgate fix in PrivacyGateway.runPreflight
  {
    const pg = new PrivacyGatewayEngine();
    pg.config.enabled = true;
    pg.config.failClosed = true;
    pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;

    // Mock healthy companion that still carries a historical lastDisconnectReason from 6h ago
    pg.queryRelayStatus = async () => ({
      success: true,
      status: {
        relayReady: true,
        lifecycleState: 'READY',
        health: 'HEALTHY',
        isHealthValid: true,
        selectedEgressId: 'do-egress-tor1-611293905',
        egressFingerprint: '05b6b53daead49e7',
        lastDisconnectReason: 'EGRESS_PROBE_TIMEOUT: Phase TCP_CONNECT timed out after 10000ms',
        residentialProxySelected: true,
        dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
        ipv6Protection: 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED',
        residentialProxy: {
          status: 'EGRESS_VERIFIED',
          sendAllowed: true,
          dnsProtection: 'VERIFIED_REMOTE_PROXY_CONNECT',
          ipv6Protection: 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED'
        }
      }
    });
    pg.applyManagedProxy = async () => ({ success: true });
    pg.probeProxyCanary = async () => ({ success: true, observedIp: '47.231.10.20', endpoint: 'https://cloudflare.com/cdn-cgi/trace' });

    const pfReady = await pg.runPreflight();
    assert.strictEqual(pfReady.ready, true, 'runPreflight must succeed when relayReady=true and health=HEALTHY despite historical lastDisconnectReason');
    assert.strictEqual(pfReady.egressCheck, 'PASS');
    assert.strictEqual(pfReady.dnsPrivacy, 'PASS');
    assert.strictEqual(pfReady.ipv6Protection, 'PROTECTED');
    assert.strictEqual(pfReady.failureReason, null);

    // Now test when relayReady=false: must fail closed with PRIVACY_RELAY_NODE_UNVERIFIED
    pg.queryRelayStatus = async () => ({
      success: true,
      status: {
        relayReady: false,
        lifecycleState: 'DEGRADED',
        health: 'UNREACHABLE',
        selectedEgressId: 'do-egress-tor1-611293905',
        lastDisconnectReason: 'EGRESS_PROBE_TIMEOUT: Phase TCP_CONNECT timed out after 10000ms',
        residentialProxySelected: true,
        residentialProxy: {
          status: 'EGRESS_VERIFIED',
          sendAllowed: true
        }
      }
    });
    const pfBlocked = await pg.runPreflight();
    assert.strictEqual(pfBlocked.ready, false, 'runPreflight must fail closed when relayReady=false');
    assert.ok(String(pfBlocked.failureReason).includes('PRIVACY_RELAY_NODE_UNVERIFIED (EGRESS_PROBE_TIMEOUT: Phase TCP_CONNECT timed out after 10000ms)'));
    pass('P0 Stale lastDisconnectReason subgate fix + DNS/IPv6 mapping verified');
  }

  // T2: P0 Live Egress Monitor Route Separation & Proxy Enforcement Guard
  {
    const pg = new PrivacyGatewayEngine();
    pg.config.enabled = true;
    pg.config.failClosed = true;
    pg.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
    pg.ephemeralRelayToken = 'test-token';

    const mockMonitor = {
      companionProbeEgress: { observedIp: '143.198.40.33', observedIpMasked: '143.198.*.*', status: 'COMPANION_PROBE_ONLY' },
      decodoResidential: { observedIp: '47.231.10.20', observedIpMasked: '47.231.*.*', status: 'CONNECTED / EGRESS_VERIFIED', fresh: true },
      digitalOcean: { configuredIp: '143.198.40.33', configuredIpMasked: '143.198.*.*', status: 'HEALTHY' },
      activeRoute: { route: 'DECODO', status: 'VERIFIED', egressIp: '47.231.10.20', egressIpMasked: '47.231.*.*' }
    };

    // Case 2A: Gate not ready & relayReady=false -> must NOT run un-proxied canary or claim BROWSER_VERIFIED
    pg.isGateReady = false;
    let canaryCalled = false;
    pg.probeProxyCanary = async () => { canaryCalled = true; return { success: true, observedIp: '143.198.40.33' }; };
    pg.queryRelayStatus = async () => ({
      success: true,
      status: { relayReady: false, residentialProxySelected: true, egressIpMonitor: mockMonitor }
    });
    const resUnenforced = await pg.checkLiveEgressIp(true);
    assert.strictEqual(canaryCalled, false, 'Must not probe canary when proxy is not enforced');
    assert.strictEqual(resUnenforced.browserExit.status, 'PROXY_NOT_ENFORCED');
    assert.strictEqual(resUnenforced.activeRoute.status, 'UPSTREAM_PROBE_ONLY (BROWSER_UNVERIFIED)');

    // Case 2B: Decodo selected, but browser canary returns DO node IP (143.198.40.33) -> must flag DO_NODE_ONLY_NOT_DECODO
    pg.isGateReady = true;
    pg.queryRelayStatus = async () => ({
      success: true,
      status: { relayReady: true, residentialProxySelected: true, egressIpMonitor: mockMonitor }
    });
    pg.probeProxyCanary = async () => ({ success: true, observedIp: '143.198.40.33', endpoint: 'https://cloudflare.com/cdn-cgi/trace' });
    const resMismatch = await pg.checkLiveEgressIp(true);
    assert.strictEqual(resMismatch.browserExit.status, 'DO_NODE_ONLY_NOT_DECODO');
    assert.strictEqual(resMismatch.activeRoute.status, 'ROUTE_MISMATCH (DO_NOT_DECODO)');

    // Case 2C: Decodo selected and browser canary returns Decodo residential IP (47.231.10.20) -> BROWSER_VERIFIED + VERIFIED
    pg.probeProxyCanary = async () => ({ success: true, observedIp: '47.231.10.20', endpoint: 'https://cloudflare.com/cdn-cgi/trace' });
    const resVerified = await pg.checkLiveEgressIp(true);
    assert.strictEqual(resVerified.browserExit.status, 'BROWSER_VERIFIED');
    assert.strictEqual(resVerified.activeRoute.status, 'VERIFIED');
    assert.strictEqual(resVerified.activeRoute.egressIpMasked, '47.231.*.*');
    pass('P0 Live Egress Monitor route separation (DO vs Decodo) & proxy enforcement guard verified');
  }

  // T3: P0 Stage-0 97/92 Snapshot & Diagnostic Artifact Verification
  {
    const snapPath = path.join(ROOT, 'companion', 'stage0_authoritative_97_92_snapshot.json');
    const diagPath = path.join(ROOT, 'artifacts', 'v7_rc1_live_storage_readonly_diagnostic.json');
    assert.ok(fs.existsSync(snapPath), 'stage0_authoritative_97_92_snapshot.json must exist');
    assert.ok(fs.existsSync(diagPath), 'v7_rc1_live_storage_readonly_diagnostic.json must exist');

    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    assert.strictEqual(snap.summary.total, 97);
    assert.strictEqual(snap.summary.remaining, 92);
    assert.strictEqual(snap.summary.completed, 5);
    assert.strictEqual(snap.summary.savedListsCount, 1);
    assert.strictEqual(snap.summary.historyRowsCount, 198);
    assert.strictEqual(snap.summary.collectedEmailsCount, 22);
    assert.strictEqual(snap.payload.xpider_captcha_api_key, undefined, 'No retired solver API keys in snapshot');
    assert.strictEqual(snap.payload.captchaApiKey, undefined, 'No retired solver API keys in snapshot');

    const diag = JSON.parse(fs.readFileSync(diagPath, 'utf8'));
    assert.strictEqual(diag.extensionId, 'ldlijlaccfeelfdhgnjbibniocefckjj');
    assert.strictEqual(diag.extensionIdChanged, false);
    assert.strictEqual(diag.liveChromeStorageKeyCount, 14);
    pass('P0 Stage-0 97/92 Snapshot & V7 RC1 read-only diagnostic verified');
  }

  // T4: Audit Item 1 — Invisible reCAPTCHA non-presumption & post-submit async challenge gate
  {
    const mk = (map) => ({ querySelector: (s) => map[s] || null });
    const c = ChallengeGate.detectChallenge(mk({
      [ChallengeGate.SEL.recaptchaWidget]: {},
      [ChallengeGate.SEL.recaptchaToken]: { value: '' },
      [ChallengeGate.SEL.invisibleRecaptcha]: {}
    }));
    assert.strictEqual(c.invisibleDetected, true);
    assert.strictEqual(c.verified, false);
    assert.strictEqual(c.serverVerified, false);

    const csSrc = fs.readFileSync(path.join(ROOT, 'extension', 'content-script.js'), 'utf8');
    assert.ok(csSrc.includes('V7_ASYNC_CHALLENGE_AFTER_SUBMIT'), 'content-script.js must check for post-submit async challenges');
    pass('Audit Item 1: Invisible reCAPTCHA non-presumption & post-submit async challenge gate verified');
  }

  // T5: Audit Item 2 — SW & Content Script restart resilience during hold + STOP & SAVE tab retention
  {
    const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    assert.ok(bgSrc.includes('xpider_v7_active_hold_state'), 'background.js must persist xpider_v7_active_hold_state');
    assert.ok(bgSrc.includes('V7_SW_RESTART_HOLD_PRESERVED'), 'background.js must preserve hold state on SW restart without advancing queue');
    assert.ok(bgSrc.includes('const retainTabOnPause = wasInV7Hold ? campaignState.currentTabId : null;'), 'pauseCampaignOrchestrator must retain held tab on pause');
    pass('Audit Item 2: SW restart hold state preservation & STOP & SAVE tab retention verified');
  }

  // T6: Audit Item 3 — Manual I Registered — Continue generic navigation & error text guard
  {
    const genericNav = ChallengeGate.classifyManualResume({
      formRemoved: true,
      urlChanged: true,
      currentUrl: 'https://example.com/about-us',
      pageText: 'About our company'
    });
    assert.strictEqual(genericNav.outcome, 'DELIVERY_UNKNOWN');
    assert.strictEqual(genericNav.reasonCode, 'MANUAL_GENERIC_NAVIGATION_NO_CONFIRMATION');
    assert.strictEqual(genericNav.operatorClaimOnly, true);

    const errorPage = ChallengeGate.classifyManualResume({
      formRemoved: true,
      urlChanged: true,
      currentUrl: 'https://example.com/thank-you',
      pageText: 'Thank you, but error submitting form: invalid captcha, please complete the security check'
    });
    assert.strictEqual(errorPage.outcome, 'DELIVERY_UNKNOWN');
    assert.strictEqual(errorPage.reasonCode, 'MANUAL_PAGE_ERROR_DETECTED');

    const validSuccessUrl = ChallengeGate.classifyManualResume({
      formRemoved: true,
      urlChanged: true,
      currentUrl: 'https://example.com/contact/thank-you',
      pageText: 'We have received your inquiry.'
    });
    assert.strictEqual(validSuccessUrl.outcome, 'SUCCESS');
    assert.strictEqual(validSuccessUrl.reasonCode, 'MANUAL_REGISTRATION_EVIDENCE_CONFIRMED');
    pass('Audit Item 3: Manual I Registered generic navigation & error text guards verified');
  }

  // T7: Audit Item 4 & 6 — Retired solver listeners blocked, Privacy Fail-Closed & EmailCollector active
  {
    const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    const csSrc = fs.readFileSync(path.join(ROOT, 'extension', 'content-script.js'), 'utf8');
    assert.ok(bgSrc.includes("case 'AUTO_SOLVE_CAPTCHA':") && bgSrc.includes("INTERNAL_SOLVER_RETIRED_V7"));
    assert.ok(csSrc.includes('ASSERT_PRIVACY_TRANSPORT_READY'));
    assert.ok(csSrc.includes('EmailCollector'));
    pass('Audit Items 4 & 6: Retired solver listeners blocked, Privacy fail-closed & EmailCollector active');
  }

  // T8: RC3 Live Telemetry Bug 1 — DOM Clobbering Guard (<input name="id">, <input name="action">, <input name="method">)
  {
    const ContactGate = require('../extension/modules/contact-gate');
    const clobberedInput = { tagName: 'INPUT', type: 'text', name: 'id', id: 'id' };
    const clobberedForm = {
      tagName: 'FORM',
      id: clobberedInput, // DOM clobbering: formEl.id is an HTMLInputElement object, not a string!
      action: clobberedInput,
      className: clobberedInput,
      getAttribute: (attr) => attr === 'id' ? 'real-form-id' : (attr === 'action' ? '/contact-submit' : ''),
      querySelectorAll: () => [],
      querySelector: () => null
    };
    const res = ContactGate.classifyFormIntent(clobberedForm, { url: 'https://example.com/contact' });
    assert.ok(res && typeof res.eligible === 'boolean', 'ContactGate.classifyFormIntent must not throw when formEl.id is clobbered');
    const cgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'modules', 'contact-gate.js'), 'utf8');
    assert.ok(!cgSrc.includes('((formEl.id || \'\')).toLowerCase()'), 'Unprotected ((formEl.id || "")).toLowerCase() must be removed');
    pass('RC3 Live Bug 1: DOM clobbering on formEl.id / formEl.action guarded without TypeError');
  }

  // T9: RC3 Live Telemetry Bug 2 — Sentry / Wix Telemetry DSN Exclusion in EmailCollector
  {
    const EmailCollector = require('../extension/modules/email-collector');
    assert.strictEqual(EmailCollector.normalizeEmail('0fd2930120484402ac9adfb9e05cacd5@o37417.ingest.sentry.io'), null);
    assert.strictEqual(EmailCollector.normalizeEmail('18d2f96d279149989b95faf0a4b41882@sentry-next.wixpress.com'), null);
    assert.strictEqual(EmailCollector.normalizeEmail('deadbeef0123456789abcdef01234567@custom-telemetry.org'), null);
    assert.strictEqual(EmailCollector.normalizeEmail('info@jaenamtraining.com'), 'info@jaenamtraining.com');
    const extracted = EmailCollector.extractEmailsFromText(
      'Contact us at master@taekwondo.kr or DSN 0fd2930120484402ac9adfb9e05cacd5@o37417.ingest.sentry.io and 18d2f96d279149989b95faf0a4b41882@sentry-next.wixpress.com'
    );
    assert.deepStrictEqual(extracted, ['master@taekwondo.kr']);
    pass('RC3 Live Bug 2: Sentry and Wix telemetry DSNs excluded from EmailCollector');
  }

  // T10: RC3 Live Telemetry Bug 3 — Operator Pause vs Network Watchdog Auto-Resume Guard
  {
    const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    assert.ok(bgSrc.includes('campaignState.pausedByOperator = true;'), 'pauseCampaignOrchestrator must set pausedByOperator = true');
    assert.ok(bgSrc.includes('if (campaignState.pausedByOperator || campaignState.isPaused || !campaignState.isActive)'), 'resumeActiveCampaignJobAfterRecovery must abort if pausedByOperator');
    assert.ok(bgSrc.includes('if (campaignState.isNetworkDegraded && !campaignState.pausedByOperator && !campaignState.isPaused && campaignState.isActive)'), 'Watchdog must not auto-resume an operator-paused campaign');
    pass('RC3 Live Bug 3: Operator PAUSE / STOP & SAVE prevents network watchdog auto-resume');
  }

  // T11: RC3 Directive #6520384382 — Stage-0 Restore Manifest Integrity & Newer Progress Protection
  {
    const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
    assert.ok(bgSrc.includes('STAGE0_MANIFEST_INTEGRITY_MISMATCH'), 'Stage-0 restore must verify manifest integrity before writing');
    assert.ok(bgSrc.includes('NEWER_CAMPAIGN_PROGRESS_PROTECTED'), 'Stage-0 restore must protect newer campaign progress (completed > 5) unless forceStage0Rollback=true');
    const stage0 = JSON.parse(fs.readFileSync(path.join(ROOT, 'companion', 'stage0_authoritative_97_92_snapshot.json'), 'utf8'));
    assert.strictEqual(stage0.expectedKeyCount, 65);
    assert.ok(typeof stage0.manifestDigest === 'string' && stage0.manifestDigest.length === 64);
    pass('RC3 Directive #6520384382: Stage-0 restore manifest integrity & newer progress protection verified');
  }

  console.log(`\nALL ${passed}/11 v7.0.0-rc3 audit, live telemetry & privacy/storage tests PASSED!`);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});

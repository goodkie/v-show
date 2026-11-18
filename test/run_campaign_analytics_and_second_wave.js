'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CampaignAnalyticsEngine, sha256Hex } = require('../companion/email-campaign-analytics');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-analytics-'));
  try {
    // 1. Seed 298-target snapshot (201 ACCEPTED, 97 FAILED)
    const entries = [];
    for (let i = 0; i < 298; i++) {
      const email = `user${i}@example.com`;
      entries.push({
        email,
        name: `User ${i}`,
        idempotencyKey: `prod_${i}`,
        status: i < 201 ? 'ACCEPTED' : 'FAILED',
        error: i < 201 ? null : 'You have reached your daily email sending quota.',
        attempts: 1,
        providerMessageId: i < 201 ? `msg_${i}` : null,
        deliveryState: i < 201 ? 'ACCEPTED' : null,
        updatedAt: '2026-11-18T17:24:00.000Z'
      });
    }
    fs.writeFileSync(path.join(tmpDir, '.email_production_queue.json'), JSON.stringify({
      campaignId: 'default',
      messageKind: 'service',
      lawfulBasis: 'EXPLICIT_OPT_IN',
      jurisdiction: 'GLOBAL',
      startedAt: '2026-11-18T17:23:50.553Z',
      finishedAt: '2026-11-18T17:25:12.233Z',
      stopped: false,
      entries
    }), 'utf8');

    const eng = new CampaignAnalyticsEngine({ stateDir: tmpDir, trustedTestMode: true });
    const p0 = eng.getCampaignProgress('default');
    assert.strictEqual(p0.target, 298);
    assert.strictEqual(p0.apiAccepted, 201);
    assert.strictEqual(p0.failed, 97);
    assert.strictEqual(p0.delivered, 0);
    assert.strictEqual(p0.deliveryPending, 201);
    assert.strictEqual(p0.acceptedPct, 67.4);
    assert.strictEqual(p0.deliveredPct, 0);
    console.log('PASS 1: 298 snapshot invariants (201 ACCEPTED, 97 FAILED, 0 DELIVERED before webhooks)');

    // 2. Out-of-order & duplicate webhook events (open before delivered, repeated opens, hard/soft bounce, complaint)
    eng.recordEvent({ event_id: 'svix_1', type: 'email.opened', email_id: 'msg_0', recipient_hashes: [sha256Hex('user0@example.com')], created_at: '2026-11-18T17:26:00Z' });
    eng.recordEvent({ event_id: 'svix_1', type: 'email.opened', email_id: 'msg_0', recipient_hashes: [sha256Hex('user0@example.com')], created_at: '2026-11-18T17:26:00Z' }); // dup event_id
    eng.recordEvent({ event_id: 'svix_2', type: 'email.opened', email_id: 'msg_0', recipient_hashes: [sha256Hex('user0@example.com')], created_at: '2026-11-18T17:27:00Z' }); // repeated open same user
    eng.recordEvent({ event_id: 'svix_3', type: 'email.delivered', email_id: 'msg_0', recipient_hashes: [sha256Hex('user0@example.com')], created_at: '2026-11-18T17:25:30Z' });
    eng.recordEvent({ event_id: 'svix_4', type: 'email.delivered', email_id: 'msg_1', recipient_hashes: [sha256Hex('user1@example.com')], created_at: '2026-11-18T17:25:31Z' });
    eng.recordEvent({ event_id: 'svix_5', type: 'email.bounced', email_id: 'msg_2', bounce_type: 'hard', recipient_hashes: [sha256Hex('user2@example.com')], created_at: '2026-11-18T17:25:32Z' });
    eng.recordEvent({ event_id: 'svix_6', type: 'email.bounced', email_id: 'msg_3', bounce_type: 'soft', recipient_hashes: [sha256Hex('user3@example.com')], created_at: '2026-11-18T17:25:33Z' });
    eng.recordEvent({ event_id: 'svix_7', type: 'email.complained', email_id: 'msg_4', recipient_hashes: [sha256Hex('user4@example.com')], created_at: '2026-11-18T17:25:34Z' });

    const p1 = eng.getCampaignProgress('default');
    assert.strictEqual(p1.delivered, 2);
    assert.strictEqual(p1.openedUnique, 1);
    assert.strictEqual(p1.bouncedHard, 1);
    assert.strictEqual(p1.bouncedSoft, 1);
    assert.strictEqual(p1.complained, 1);
    assert.strictEqual(p1.deliveryPending, 196);
    console.log('PASS 2: out-of-order, duplicate-safe, unique opens, hard/soft bounce & complaint reconciled');

    // 3. Opened vs Not-Confirmed-Opened segmentation & Second-Wave preview
    const seg = eng.getCampaignSegments('default', { cutoffHours: 0 });
    assert.strictEqual(seg.openedCount, 1);
    assert.strictEqual(seg.notConfirmedOpenedCount, 1); // user1@example.com only
    assert.ok(seg.caveat.includes('MPP'));
    const prev = eng.previewSecondWave({ parentCampaignId: 'default', cutoffHours: 0 });
    assert.strictEqual(prev.eligibleCount, 1);
    assert.strictEqual(prev.eligibleMasked[0], 'us***@example.com');
    console.log('PASS 3: opened vs not-confirmed-opened segments & second-wave exclusion');

    // 4. Master list sync, backup, and CSV export (masked PII)
    const ml = eng.syncMasterListFromRuntime();
    assert.strictEqual(ml.total, 298);
    assert.strictEqual(ml.suppressedCount, 2); // hard bounce + complaint
    const csv = eng.exportMasterListCsv();
    assert.ok(!csv.includes('user0@example.com'));
    assert.ok(csv.includes('us***@example.com'));
    console.log('PASS 4: master list sync, opt-out precedence, and masked CSV export');

    // 5. Daily quota exhaustion pauses runQueue cleanly without marking remaining as FAILED
    const pPipe = new EmailProductionPipeline({ stateDir: tmpDir, trustedTestMode: true });
    pPipe.evaluatePreflight = async () => ({ deliverabilityGate: { action: 'REVIEW', reasons: [] } });
    pPipe.importAndPersistRecipients({
      csvText: 'email,name\nq1@example.com,Q1\nq2@example.com,Q2',
      messageKind: 'service',
      consentAttested: true,
      campaignId: 'quota-test'
    });
    const qOut = await pPipe.runQueue({
      mode: 'LIVE_PRODUCTION',
      subject: 'Quota Stop',
      html: '<p>Hi</p>',
      text: 'Hi',
      baseUrl: 'https://unsubscribe.vivpr.pro',
      syncToken: 'sync-tok-1234567890',
      syncFetchImpl: async (u) => {
        if (String(u).includes('/api/sync/suppressions')) return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
        if (String(u).includes('/api/sync/tokens')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        return { ok: false, status: 429, json: async () => ({ message: 'You have reached your daily email sending quota.' }) };
      },
      hasResendKey: true,
      apiKey: 're_mock',
      ownerExplicitApproval: true,
      publicUnsubscribeHttpsVerified: true
    });
    assert.strictEqual(qOut.status, 'STOPPED');
    assert.strictEqual(qOut.summary.counts.PENDING, 2);
    assert.strictEqual(qOut.summary.counts.FAILED, 0);
    console.log('PASS 5: daily quota exhaustion stops batch & preserves PENDING');

    // 6. Sidecar authenticated endpoints
    const sidecar = new EmailTestSidecar({ stateDir: tmpDir, port: 19993, trustedTestMode: true });
    await sidecar.start();
    try {
      const tok = fs.readFileSync(path.join(tmpDir, '.email_sidecar_token'), 'utf8').trim();
      const hdr = { 'Authorization': `Bearer ${tok}`, 'Content-Type': 'application/json' };
      const unauth = await fetch('http://127.0.0.1:19993/email/campaigns/default/progress?sync=0');
      assert.strictEqual(unauth.status, 401);
      const prog = await fetch('http://127.0.0.1:19993/email/campaigns/default/progress?sync=0', { headers: hdr }).then(r => r.json());
      assert.strictEqual(prog.ok, true);
      const swBlock = await fetch('http://127.0.0.1:19993/email/campaigns/second-wave/start', {
        method: 'POST', headers: hdr, body: JSON.stringify({ ownerConfirmed: false })
      });
      assert.strictEqual(swBlock.status, 400);
      console.log('PASS 6: Sidecar campaign progress & second-wave auth/confirmation gates');
    } finally {
      await sidecar.stop();
    }

    // 7. No stale 동의원장 strings in email-template-studio.js
    const studioJs = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/email-template-studio.js'), 'utf8');
    assert.ok(!studioJs.includes('동의원장'), 'Stale 동의원장 wording must be removed');
    console.log('PASS 7: stale 동의원장 UI strings removed');
    console.log('ALL CAMPAIGN ANALYTICS & SECOND-WAVE TESTS PASSED (7/7)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();

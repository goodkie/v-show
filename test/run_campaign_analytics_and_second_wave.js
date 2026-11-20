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

    // 8. Legacy array -> rich object suppression schema upgrade, accurate Unsub count, and 2nd-wave exclusion
    {
      const tmpSup = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-sup-schema-'));
      try {
        const pipeSup = new EmailProductionPipeline({ stateDir: tmpSup, trustedTestMode: true });
        const unsubEmail = 'optout_user@example.test';
        const keepEmail = 'active_user@example.test';
        const unsubHash = sha256Hex(unsubEmail);
        // Simulate legacy array file on disk (which previously caused Unsub=0 and leaked unsubscribed users into 2nd wave)
        fs.writeFileSync(path.join(tmpSup, '.suppressed_recipient_hashes.json'), JSON.stringify([unsubHash]), 'utf8');
        const pipeSup2 = new EmailProductionPipeline({ stateDir: tmpSup, trustedTestMode: true });
        const syncOut = await pipeSup2.syncRemoteSuppressions({
          baseUrl: 'https://unsubscribe.vivpr.pro',
          syncToken: 'mock-sync-token-1234567890',
          fetchImpl: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              suppressions: [{ recipient_hash: unsubHash, reason: 'UNSUBSCRIBED', suppressed_at: '2026-11-19T12:00:00Z', updated_at: '2026-11-19T12:00:00Z' }]
            })
          })
        });
        assert.strictEqual(syncOut.ok, true);
        const onDisk = JSON.parse(fs.readFileSync(path.join(tmpSup, '.suppressed_recipient_hashes.json'), 'utf8'));
        assert.strictEqual(Array.isArray(onDisk), false, 'suppressed hashes file must upgrade from array to object map');
        assert.strictEqual(onDisk[unsubHash].reason, 'UNSUBSCRIBED');

        fs.writeFileSync(path.join(tmpSup, '.email_production_queue.json'), JSON.stringify({
          campaignId: 'default',
          startedAt: '2026-11-19T10:00:00Z',
          finishedAt: '2026-11-19T10:05:00Z',
          entries: [
            { email: unsubEmail, idempotencyKey: 'k_unsub', status: 'ACCEPTED', providerMessageId: 'msg_u1', updatedAt: '2026-11-19T10:01:00Z' },
            { email: keepEmail, idempotencyKey: 'k_keep', status: 'ACCEPTED', providerMessageId: 'msg_k1', updatedAt: '2026-11-19T10:01:00Z' }
          ]
        }), 'utf8');
        const engSup = new CampaignAnalyticsEngine({ stateDir: tmpSup, trustedTestMode: true });
        engSup.recordEvent({ event_id: 'e_d1', type: 'email.delivered', email_id: 'msg_u1', recipient_hashes: [unsubHash], created_at: '2026-11-19T10:02:00Z' });
        engSup.recordEvent({ event_id: 'e_d2', type: 'email.delivered', email_id: 'msg_k1', recipient_hashes: [sha256Hex(keepEmail)], created_at: '2026-11-19T10:02:00Z' });

        const progSup = engSup.getCampaignProgress('default');
        assert.strictEqual(progSup.unsubscribed, 1, 'Campaign progress must report unsubscribed=1');
        assert.strictEqual(progSup.remoteUnsubscribedTotal, 1);

        const prevSup = engSup.previewSecondWave({ parentCampaignId: 'default', cutoffHours: 0 });
        assert.strictEqual(prevSup.eligibleCount, 1, 'Unsubscribed user must be excluded from 2nd wave');
        assert.deepStrictEqual(prevSup.eligibleMasked, ['ac***@example.test']);

        const mlSup = engSup.syncMasterListFromRuntime();
        assert.strictEqual(mlSup.suppressedCount, 1, 'Master list must record unsubscribed suppression');
        console.log('PASS 8: suppression schema upgrade, Unsub count & 2nd-wave exclusion verified');
      } finally {
        fs.rmSync(tmpSup, { recursive: true, force: true });
      }
    }

    // 9. prior_accepted real UUID recovery via audit log + Resend suppressed/failed Backfill reconciliation
    {
      const tmpRec = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-rec-audit-'));
      try {
        fs.writeFileSync(path.join(tmpRec, '.email_production_audit.jsonl'), [
          JSON.stringify({ type: 'SEND_ATTEMPT_ACCEPTED', idempotencyKey: 'k_prior_1', providerMessageId: 'uuid-real-prior-001', timestamp: '2026-11-18T17:24:00Z' }),
          JSON.stringify({ type: 'SEND_ATTEMPT_ACCEPTED', idempotencyKey: 'k_sup_2', providerMessageId: 'uuid-real-sup-002', timestamp: '2026-11-19T16:30:00Z' })
        ].join('\n') + '\n', 'utf8');
        fs.writeFileSync(path.join(tmpRec, '.email_production_queue.json'), JSON.stringify({
          campaignId: 'default',
          entries: [
            { email: 'prior1@example.test', idempotencyKey: 'k_prior_1', status: 'ACCEPTED', providerMessageId: 'prior_accepted', updatedAt: '2026-11-19T16:28:00Z' },
            { email: 'sup2@example.test', idempotencyKey: 'k_sup_2', status: 'ACCEPTED', providerMessageId: 'uuid-real-sup-002', updatedAt: '2026-11-19T16:30:00Z' }
          ]
        }), 'utf8');
        const engRec = new CampaignAnalyticsEngine({ stateDir: tmpRec, trustedTestMode: true });
        const queriedUrls = [];
        const recOut = await engRec.reconcileWithResendApi({
          apiKey: 're_mock',
          campaignId: 'default',
          limit: 50,
          fetchImpl: async (u) => {
            queriedUrls.push(String(u));
            if (String(u).endsWith('uuid-real-prior-001')) {
              return { ok: true, status: 200, json: async () => ({ id: 'uuid-real-prior-001', last_event: 'delivered', created_at: '2026-11-18T17:24:00Z' }) };
            }
            if (String(u).endsWith('uuid-real-sup-002')) {
              return { ok: true, status: 200, json: async () => ({ id: 'uuid-real-sup-002', last_event: 'suppressed', created_at: '2026-11-19T16:30:00Z' }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
          }
        });
        assert.ok(!queriedUrls.some(u => u.includes('prior_accepted')), 'Reconcile must NEVER query literal prior_accepted');
        assert.strictEqual(recOut.checked, 2);
        assert.strictEqual(recOut.updated, 2);
        const progRec = engRec.getCampaignProgress('default');
        assert.strictEqual(progRec.delivered, 1);
        assert.strictEqual(progRec.providerSuppressed, 1);
        assert.strictEqual(progRec.deliveryPending, 0, 'Both delivered and suppressed must clear deliveryPending');
        console.log('PASS 9: prior_accepted audit UUID recovery & Resend suppressed backfill verified');
      } finally {
        fs.rmSync(tmpRec, { recursive: true, force: true });
      }
    }

    // 10. Campaign ID isolation + real UUID preserved on re-import + Studio UI controls
    {
      const tmpCid = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-cid-iso-'));
      try {
        const pipeCid = new EmailProductionPipeline({ stateDir: tmpCid, trustedTestMode: true });
        const keyDefault = 'prod_' + crypto.createHash('sha256').update('default:repeat@example.test').digest('hex').slice(0, 32);
        fs.writeFileSync(path.join(tmpCid, '.email_production_audit.jsonl'),
          JSON.stringify({ type: 'SEND_ATTEMPT_ACCEPTED', idempotencyKey: keyDefault, providerMessageId: 'uuid-from-yesterday-999', timestamp: '2026-11-18T17:00:00Z' }) + '\n',
          'utf8'
        );
        // Same campaignId 'default': skipped idempotently BUT preserves real UUID instead of 'prior_accepted'
        const impSame = pipeCid.importAndPersistRecipients({
          csvText: 'email,name\nrepeat@example.test,Repeat',
          messageKind: 'marketing',
          consentAttested: true,
          campaignId: 'default'
        });
        assert.strictEqual(impSame.summary.counts.ACCEPTED, 1);
        assert.strictEqual(pipeCid.queue.entries[0].providerMessageId, 'uuid-from-yesterday-999');

        // New campaignId 'camp_20261120_new': NOT skipped by yesterday's 'default' campaign!
        const impNew = pipeCid.importAndPersistRecipients({
          csvText: 'email,name\nrepeat@example.test,Repeat',
          messageKind: 'marketing',
          consentAttested: true,
          campaignId: 'camp_20261120_new'
        });
        assert.strictEqual(impNew.summary.counts.PENDING, 1, 'New campaignId must queue recipient as PENDING instead of skipping from prior campaign');
        const htmlStudio = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/index.html'), 'utf8');
        assert.ok(htmlStudio.includes('id="prodCampaignIdInput"') && htmlStudio.includes('id="btnNewProdCampaignId"'), 'Studio HTML must include Campaign ID controls');
        assert.ok(studioJs.includes('COMPLETED —') && studioJs.includes('getProdCampaignId'), 'Studio JS must update completed badge and support campaignId');
        console.log('PASS 10: campaignId isolation, real UUID preservation & completed badge UI verified');
      } finally {
        fs.rmSync(tmpCid, { recursive: true, force: true });
      }
    }

    console.log('ALL CAMPAIGN ANALYTICS & SECOND-WAVE TESTS PASSED (10/10)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})();

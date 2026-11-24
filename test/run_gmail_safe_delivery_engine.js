'use strict';
/**
 * XPIDER V7.1 GMass-Inspired Safe Delivery Engine Deterministic Contract Suite.
 * 100% Mocked / Zero Real Outbound Emails / Zero Live DNS Required.
 * Covers Directive #7051437541 items (1)-(8).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GmailAccountVault, GMAIL_OAUTH_SCOPES } = require('../companion/gmail-account-vault');
const { GmailCampaignRunner } = require('../companion/gmail-campaign-runner');
const { GmailSendBlocked, rawGmailMime, encodeQuotedPrintable, foldAsciiHeader } = require('../companion/gmail-sender-foundation');
const { AdaptiveThrottleController, assessDeliverabilityHygiene, isValidPublicHttpsUnsubscribeBase } = require('../companion/gmail-safe-delivery-engine');
const { optimizeAndScoreGmailMessage, optimizeAndScoreEmailMessage, buildGmailSpamSearchHelper, buildMultiAccountGmailSpamHelpers, buildGmailNativeComposeUrl, buildGmailNativeCleanHtml, buildLightweightNaturalHtml, stripHtmlToPlain, decodeHtmlEntities, softenSpamPhrasesInCopy, countEmojiPictographs, countAllCapsLines, transformPromoCopyToTextBasedEmail, stripHiddenPreheaderDivs, isOfficialGmailWebUrl } = require('../companion/gmail-deliverability-optimizer');
const { EmailCampaignStore, sanitizeCampaignSnapshot } = require('../companion/email-campaign-store');
const { GmailWebComposeEngine, buildOfficialWebComposeUrl, WARMUP_PRESETS } = require('../companion/gmail-web-compose-engine');
const { injectUnsubscribeFooter, isPrimarilyEnglishContent } = require('../companion/email-unsubscribe-server');
const { embedHtmlImagesAsCid } = require('../companion/gmail-inline-image-embedder');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
const { CampaignAnalyticsEngine, sha256Hex } = require('../companion/email-campaign-analytics');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');
const { verifyWindowsDacl } = require('../companion/email-test-sidecar-set-key');

function makeTestCryptoBox(salt = 'safe-engine-box') {
  return {
    encrypt(plain) {
      return 'testbox:' + Buffer.from(salt + '::' + plain, 'utf8').toString('base64');
    },
    decrypt(cipherRef) {
      if (!String(cipherRef || '').startsWith('testbox:')) return '';
      const raw = Buffer.from(cipherRef.slice('testbox:'.length), 'base64').toString('utf8');
      if (!raw.startsWith(salt + '::')) return '';
      return raw.slice((salt + '::').length);
    }
  };
}

const okSyncFetch = async (url) => {
  if (String(url).endsWith('/api/sync/suppressions')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, recorded: true }) };
};

function makeRefreshVaultFetch(counterRef) {
  return async (url) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      counterRef.refreshes = (counterRef.refreshes || 0) + 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: `SYNTHETIC_REFRESHED_${counterRef.refreshes}`, expires_in: 3600 })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

(async function run() {
  let checks = 0;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-gmail-safe-'));
  const box = makeTestCryptoBox('safe-delivery-key');

  try {
    // ===== 1. Rolling 1m / 1h / 24h Windows & Multi-Day Distributed Scheduling =====
    {
      const dir = path.join(tmpRoot, 'multiday_rolling');
      let nowMs = Date.parse('2026-11-20T12:00:00.000Z');
      const clock = () => nowMs;

      const refreshStats = { refreshes: 0 };
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const analytics = new CampaignAnalyticsEngine({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box, nowFn: clock, fetchImpl: makeRefreshVaultFetch(refreshStats) });
      vault.saveOAuthClientConfig({ clientId: '1234567890-multiday.apps.googleusercontent.com', userConsentConfirmed: true });
      const acct = vault.upsertMockAccountForTest({
        email: 'schedule@gmail.com',
        cap24h: 4,
        capPerHour: 3,
        capPerMinute: 2
      });

      const runner = new GmailCampaignRunner({
        stateDir: dir,
        pipeline,
        analytics,
        vault,
        trustedTestMode: true,
        syncFetchImpl: okSyncFetch,
        nowFn: clock
      });

      const rows = ['email,name'];
      for (let i = 1; i <= 7; i++) rows.push(`sched_u${i}@example.test,User ${i}`);

      const prep = runner.prepareGmailQueue({
        csvText: rows.join('\n'),
        campaignId: 'camp_multiday_1',
        sendingMode: 'SINGLE_ACCOUNT',
        scheduleMode: 'DISTRIBUTED_MULTI_DAY',
        selectedAccountIds: [acct.id],
        consentAttested: true,
        physicalAddress: '100 Safe Ave, Seoul'
      });
      assert.equal(prep.ok, true);
      assert.equal(prep.schedulePlan.estimatedDays, 2, '7 recipients at cap24h=4 must forecast 2 days');
      assert.equal(prep.schedulePlan.requiresMultiDay, true);
      assert.equal(prep.schedulePlan.daySchedule[0].plannedTotal, 4);
      assert.equal(prep.schedulePlan.daySchedule[1].plannedTotal, 3);
      checks++;

      let sentCounter = 0;
      const okSendFetch = async () => ({ status: 200, json: async () => ({ id: `gm_sched_${++sentCounter}` }) });
      const commonRunOpts = {
        subject: 'Distributed Multi-Day Test',
        html: '<p>Hello</p>',
        text: 'Hello',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: okSendFetch,
        pacingMs: 0
      };

      // Wave 1 (T0): sends 2 -> hits 1m cap (2/min) -> SCHEDULED_WAIT
      const r1 = await runner.runGmailQueue(commonRunOpts);
      assert.equal(r1.status, 'PAUSED');
      assert.equal(r1.campaignState, 'SCHEDULED_WAIT');
      assert.equal(r1.scheduledWait, true);
      assert.equal(r1.enforcementPaused, false);
      assert.equal(r1.reason, 'MINUTE_THROTTLE_CAP_REACHED');
      assert.equal(r1.acceptedInThisRun, 2);
      assert.equal(r1.nextPermittedExecutionAt, new Date(nowMs + 60000 + 1000).toISOString());
      assert.equal(r1.dashboard.state, 'SCHEDULED_WAIT');
      assert.equal(r1.dashboard.metrics.gmailApiAccepted, 2);
      assert.equal(r1.dashboard.metrics.verifiedDelivered, null);
      assert.equal(r1.dashboard.metrics.remaining, 5);
      checks++;

      // Wave 2 (T0 + 62s): sends 1 -> total 3 in hour -> hits 1h cap (3/hr) -> SCHEDULED_WAIT
      const t0 = nowMs;
      nowMs = t0 + 62 * 1000;
      const r2 = await runner.runGmailQueue(commonRunOpts);
      assert.equal(r2.campaignState, 'SCHEDULED_WAIT');
      assert.equal(r2.reason, 'HOURLY_THROTTLE_CAP_REACHED');
      assert.equal(r2.acceptedInThisRun, 1);
      assert.equal(r2.nextPermittedExecutionAt, new Date(t0 + 3600 * 1000 + 1000).toISOString());
      checks++;

      // Wave 3 (T0 + 1h + 2s): sends 1 -> total 4 in 24h -> hits 24h cap (4/day) -> SCHEDULED_WAIT until Day 2!
      nowMs = t0 + 3600 * 1000 + 2000;
      const r3 = await runner.runGmailQueue(commonRunOpts);
      assert.equal(r3.campaignState, 'SCHEDULED_WAIT');
      assert.equal(r3.reason, 'ACCOUNT_CAP_REACHED_PAUSE_CAMPAIGN');
      assert.equal(r3.acceptedInThisRun, 1);
      assert.equal(r3.nextPermittedExecutionAt, new Date(t0 + 24 * 3600 * 1000 + 1000).toISOString());
      assert.equal(r3.dashboard.metrics.gmailApiAccepted, 4);
      assert.equal(r3.dashboard.metrics.remaining, 3);
      checks++;

      // Wave 4 (Day 2: T0 + 24h + 2s): #1 & #2 rolled off 24h window (leaving #3 at T0+62s and #4 at T0+1h+2s) -> sends #5 & #6, then hits true rolling 24h cap (4/4)!
      nowMs = t0 + 24 * 3600 * 1000 + 2000;
      const r4 = await runner.runGmailQueue(commonRunOpts);
      assert.equal(r4.campaignState, 'SCHEDULED_WAIT');
      assert.equal(r4.reason, 'ACCOUNT_CAP_REACHED_PAUSE_CAMPAIGN');
      assert.equal(r4.acceptedInThisRun, 2);

      // Wave 5 (+62s -> T0 + 24h + 64s): #3 rolled off 24h window -> sends final #7 -> COMPLETED (7/7)
      nowMs += 62 * 1000;
      const r5 = await runner.runGmailQueue(commonRunOpts);
      assert.equal(r5.ok, true);
      assert.equal(r5.status, 'COMPLETED');
      assert.equal(r5.campaignState, 'COMPLETED');
      assert.equal(r5.acceptedInThisRun, 1);
      assert.equal(sentCounter, 7, 'All 7 recipients sent across 2 days with zero duplicates');
      assert.ok(refreshStats.refreshes >= 2, 'Multi-day scheduling must cleanly refresh OAuth access token via DPAPI vault');
      assert.equal(r5.dashboard.metrics.gmailApiAccepted, 7);
      assert.equal(r5.dashboard.metrics.remaining, 0);
      checks++;
      console.log('PASS 1: Rolling 1m / 1h / 24h caps & multi-day distributed scheduling verified');
    }

    // ===== 2. Fixed Multi-Account Pool Partition Across Days (Zero Opportunistic Rotation) =====
    {
      const dir = path.join(tmpRoot, 'fixed_pool_multiday');
      let nowMs = Date.parse('2026-11-20T15:00:00.000Z');
      const clock = () => nowMs;

      const poolRefreshStats = { refreshes: 0 };
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box, nowFn: clock, fetchImpl: makeRefreshVaultFetch(poolRefreshStats) });
      vault.saveOAuthClientConfig({ clientId: '1234567890-poolmd.apps.googleusercontent.com', userConsentConfirmed: true });
      const a1 = vault.upsertMockAccountForTest({ email: 'team1@alpha.test', type: 'workspace_paid', cap24h: 2, capPerHour: 2, capPerMinute: 2 });
      const a2 = vault.upsertMockAccountForTest({ email: 'team2@beta.test', type: 'workspace_paid', cap24h: 2, capPerHour: 2, capPerMinute: 2 });
      const runner = new GmailCampaignRunner({ stateDir: dir, pipeline, vault, trustedTestMode: true, syncFetchImpl: okSyncFetch, nowFn: clock });

      const rows = ['email,name'];
      for (let i = 1; i <= 10; i++) rows.push(`pool_md_${i}@example.test,P${i}`);
      const prep = runner.prepareGmailQueue({
        csvText: rows.join('\n'),
        campaignId: 'camp_pool_md',
        sendingMode: 'APPROVED_ACCOUNT_POOL',
        scheduleMode: 'DISTRIBUTED_MULTI_DAY',
        selectedAccountIds: [a1.id, a2.id],
        consentAttested: true
      });
      assert.equal(prep.ok, true);
      assert.ok(prep.schedulePlan.estimatedDays >= 2);
      // Record exact pre-launch fixed assignment for every recipient
      const initialAssignment = new Map(runner.queue.entries.map(e => [e.email, e.assignedAccountId]));

      const sentByAcct = {};
      const poolFetch = async (url, init) => {
        const raw = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
        const fromMatch = raw.match(/From: .*?<([^>]+)>/);
        const toMatch = raw.match(/To: <([^>]+)>/);
        assert.ok(fromMatch && toMatch);
        const fromEmail = fromMatch[1].toLowerCase();
        const toEmail = toMatch[1].toLowerCase();
        const expectedAcctId = initialAssignment.get(toEmail);
        const expectedEmail = expectedAcctId === a1.id ? 'team1@alpha.test' : 'team2@beta.test';
        assert.equal(fromEmail, expectedEmail, 'Recipient MUST ONLY ever be sent by its pre-persisted fixed account (no opportunistic rotation)');
        sentByAcct[expectedAcctId] = (sentByAcct[expectedAcctId] || 0) + 1;
        return { status: 200, json: async () => ({ id: `gm_pmd_${Date.now()}_${Math.random()}` }) };
      };

      // Day 1: each account sends at most 2 (its cap24h), total <= 4
      const d1 = await runner.runGmailQueue({
        subject: 'Fixed Pool Multi-Day',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: poolFetch,
        pacingMs: 0
      });
      assert.equal(d1.campaignState, 'SCHEDULED_WAIT');
      assert.ok((sentByAcct[a1.id] || 0) <= 2 && (sentByAcct[a2.id] || 0) <= 2);
      assert.equal(d1.acceptedInThisRun, prep.schedulePlan.daySchedule[0].plannedTotal, 'Day 1 actual sends must match pre-launch Day 1 forecast');

      // Advance days until completed
      let guardLoops = 0;
      let last = d1;
      while (last.campaignState === 'SCHEDULED_WAIT' && guardLoops < 10) {
        nowMs += 24 * 3600 * 1000 + 2000;
        last = await runner.runGmailQueue({
          subject: 'Fixed Pool Multi-Day',
          html: '<p>Hi</p>',
          text: 'Hi',
          ownerExplicitApproval: true,
          hygieneConfirmed: true,
          baseUrlOverride: 'https://unsubscribe.vivpr.pro',
          syncTokenOverride: 'sync-tok-1234567890',
          fetchImpl: poolFetch,
          pacingMs: 0
        });
        guardLoops++;
      }
      assert.equal(last.ok, true);
      assert.equal(last.campaignState, 'COMPLETED');
      assert.equal((sentByAcct[a1.id] || 0) + (sentByAcct[a2.id] || 0), 10);
      checks += 2;
      console.log('PASS 2: Fixed multi-account pool multi-day execution with zero account rotation verified');
    }

    // ===== 3. Downward-Only Adaptive Throttling (Never Accelerates) & Negative Signal Hard Stops =====
    {
      const ctrl = new AdaptiveThrottleController({ baseMinDelayMs: 1500 });
      assert.equal(ctrl.toJSON().downwardOnly, true);
      assert.equal(ctrl.level, 0);
      assert.equal(ctrl.attemptAccelerate().reason, 'ACCELERATION_FORBIDDEN_DOWNWARD_ONLY');

      const baseCaps = { capPerMinute: 4, capPerHour: 40, cap24h: 200 };
      const c0 = ctrl.getEffectiveCaps(baseCaps);
      assert.deepEqual(c0, { effectivePerMinute: 4, effectivePerHour: 40, effectivePerDay: 200 });

      // Slow latency -> steps down monotonically to REDUCED_50PCT
      ctrl.observeLatency(4500);
      assert.equal(ctrl.level, 1);
      assert.equal(ctrl.getEffectiveDelayMs(), 3000);
      const c1 = ctrl.getEffectiveCaps(baseCaps);
      assert.deepEqual(c1, { effectivePerMinute: 2, effectivePerHour: 20, effectivePerDay: 100 });

      // Fast latency afterwards MUST NEVER accelerate back up!
      ctrl.observeLatency(100);
      assert.equal(ctrl.level, 1, 'Fast response MUST NOT accelerate rate back up');
      assert.equal(ctrl.stepDown(0, 'TRY_FASTER').reason, 'ACCELERATION_FORBIDDEN_DOWNWARD_ONLY');

      // Severe latency -> REDUCED_25PCT
      ctrl.observeLatency(9000);
      assert.equal(ctrl.level, 2);
      assert.equal(ctrl.getEffectiveDelayMs(), 6000);
      const c2 = ctrl.getEffectiveCaps(baseCaps);
      assert.deepEqual(c2, { effectivePerMinute: 1, effectivePerHour: 10, effectivePerDay: 50 });

      // Test live runner negative signals: complaint, abnormal bounce, abuse warning -> PAUSED_ENFORCEMENT
      const dir = path.join(tmpRoot, 'negative_signals');
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });
      const acct = vault.upsertMockAccountForTest({ email: 'sig@gmail.com', cap24h: 50, capPerHour: 20, capPerMinute: 4 });
      const runner = new GmailCampaignRunner({ stateDir: dir, pipeline, vault, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      // (a) Slow latency triggers downward throttle mid-run
      runner.prepareGmailQueue({
        csvText: 'email,name\ns1@example.test,S1\ns2@example.test,S2\ns3@example.test,S3',
        campaignId: 'camp_lat',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acct.id],
        consentAttested: true
      });
      let latCalls = 0;
      const latRes = await runner.runGmailQueue({
        subject: 'Latency Throttle',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        simulatedLatencyMs: 5000,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => ({ status: 200, json: async () => ({ id: `gm_lat_${++latCalls}` }) }),
        pacingMs: 0
      });
      // After send #1 (5000ms -> level 1, effPerMin=2) and send #2 (5000ms -> level 2, effPerMin=1), send #3 sees sent1m=2 >= effPerMin=1 -> SCHEDULED_WAIT!
      assert.equal(latRes.campaignState, 'SCHEDULED_WAIT');
      assert.equal(latRes.dashboard.throttle.downwardOnly, true);
      assert.equal(latRes.dashboard.throttle.level, 2);
      assert.equal(latRes.dashboard.throttle.recommendedMinDelayMs, 6000);

      // (b) Live complaint -> immediate PAUSED_ENFORCEMENT, 0 sends, blocks blind resume
      runner.prepareGmailQueue({
        csvText: 'email,name\nc1@example.test,C1',
        campaignId: 'camp_comp',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acct.id],
        consentAttested: true
      });
      const compRes = await runner.runGmailQueue({
        subject: 'Complaint Stop',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        observedLiveComplaints: 1,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND_ON_COMPLAINT'); },
        pacingMs: 0
      });
      assert.equal(compRes.campaignState, 'PAUSED_ENFORCEMENT');
      assert.equal(compRes.enforcementPaused, true);
      assert.equal(compRes.reason, 'COMPLAINT_THRESHOLD_EXCEEDED');
      assert.equal(compRes.nextPermittedExecutionAt, null);
      // Blind resume must remain blocked
      const blindResume = await runner.runGmailQueue({
        subject: 'Complaint Stop',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_RESUME'); },
        pacingMs: 0
      });
      assert.equal(blindResume.ok, false);
      assert.equal(blindResume.campaignState, 'PAUSED_ENFORCEMENT');

      // (c) Abnormal bounce rate (>=5%) & abuse warning -> immediate PAUSED_ENFORCEMENT
      runner.prepareGmailQueue({
        csvText: 'email,name\nb1@example.test,B1',
        campaignId: 'camp_bnc',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acct.id],
        consentAttested: true
      });
      const bncRes = await runner.runGmailQueue({
        subject: 'Bounce Stop',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        observedLiveBounced: 3,
        observedLiveTotal: 40,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND_ON_ABNORMAL_BOUNCE'); },
        pacingMs: 0
      });
      assert.equal(bncRes.campaignState, 'PAUSED_ENFORCEMENT');
      assert.equal(bncRes.reason, 'ABNORMAL_BOUNCE_RATE_STOP');

      runner.prepareGmailQueue({
        csvText: 'email,name\nab1@example.test,AB1',
        campaignId: 'camp_abuse',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acct.id],
        consentAttested: true
      });
      const abuseRes = await runner.runGmailQueue({
        subject: 'Abuse Stop',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        abuseWarning: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND_ON_ABUSE'); },
        pacingMs: 0
      });
      assert.equal(abuseRes.campaignState, 'PAUSED_ENFORCEMENT');
      assert.equal(abuseRes.reason, 'PROVIDER_ABUSE_WARNING');
      checks += 4;
      console.log('PASS 3: Downward-only adaptive throttle, latency slowdown & complaint/bounce/abuse PAUSED_ENFORCEMENT verified');
    }

    // ===== 4. 401 / 403 / 429 Enforcement Pause & Strict Resend / Gmail Provider Separation =====
    {
      for (const status of [401, 403, 429]) {
        const dir = path.join(tmpRoot, `enf_${status}`);
        const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
        const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });
        const p1 = vault.upsertMockAccountForTest({ email: 'e1@gmail.com', cap24h: 20 });
        const p2 = vault.upsertMockAccountForTest({ email: 'e2@gmail.com', cap24h: 20 });
        const runner = new GmailCampaignRunner({ stateDir: dir, pipeline, vault, trustedTestMode: true, syncFetchImpl: okSyncFetch });

        runner.prepareGmailQueue({
          csvText: 'email,name\nu1@example.test,U1\nu2@example.test,U2\nu3@example.test,U3\nu4@example.test,U4',
          campaignId: `camp_enf_${status}`,
          sendingMode: 'APPROVED_ACCOUNT_POOL',
          selectedAccountIds: [p1.id, p2.id],
          consentAttested: true
        });
        let calls = 0;
        const r = await runner.runGmailQueue({
          subject: `HTTP ${status} Stop`,
          html: '<p>Hi</p>',
          text: 'Hi',
          ownerExplicitApproval: true,
          hygieneConfirmed: true,
          baseUrlOverride: 'https://unsubscribe.vivpr.pro',
          syncTokenOverride: 'sync-tok-1234567890',
          fetchImpl: async () => {
            calls++;
            return { status, json: async () => ({ error: { message: `Simulated ${status}` } }) };
          },
          pacingMs: 0
        });
        assert.equal(calls, 1, `HTTP ${status} must stop immediately without hopping to 2nd account`);
        assert.equal(r.campaignState, 'PAUSED_ENFORCEMENT');
        assert.equal(r.enforcementPaused, true);
        assert.equal(r.nextPermittedExecutionAt, null);
        assert.equal(r.dashboard.state, 'PAUSED_ENFORCEMENT');
        assert.equal(pipeline.queue.entries.length, 0, 'Must NEVER silently switch or fall back to Resend');
      }

      // Explicit Provider Switch Guard when Resend has active/pending campaign
      const dirSep = path.join(tmpRoot, 'provider_sep');
      const pipelineSep = new EmailProductionPipeline({ stateDir: dirSep, trustedTestMode: true });
      pipelineSep.queue.entries = [{ email: 'resend_pending@example.test', status: 'PENDING' }];
      const vaultSep = new GmailAccountVault({ stateDir: dirSep, trustedTestMode: true, cryptoBox: box });
      const aSep = vaultSep.upsertMockAccountForTest({ email: 'sep@gmail.com', cap24h: 20 });
      const runnerSep = new GmailCampaignRunner({ stateDir: dirSep, pipeline: pipelineSep, vault: vaultSep, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      const deniedSwitch = runnerSep.prepareGmailQueue({
        csvText: 'email,name\ng1@example.test,G1',
        campaignId: 'camp_sep',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [aSep.id],
        consentAttested: true,
        providerSwitchConfirmed: false
      });
      assert.equal(deniedSwitch.ok, false);
      assert.equal(deniedSwitch.reason, 'PROVIDER_SWITCH_CONFIRMATION_REQUIRED');

      const allowedSwitch = runnerSep.prepareGmailQueue({
        csvText: 'email,name\ng1@example.test,G1',
        campaignId: 'camp_sep',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [aSep.id],
        consentAttested: true,
        providerSwitchConfirmed: true
      });
      assert.equal(allowedSwitch.ok, true);
      assert.equal(pipelineSep.queue.entries[0].status, 'PENDING', 'Resend queue must stay untouched');
      checks += 4;
      console.log('PASS 4: 401/403/429 enforcement hard stop (zero hopping/fallback) & explicit provider switch confirmation verified');
    }

    // ===== 5. Deliverability Hygiene (SPF/DMARC/DKIM, Consumer Disclosure, Reply-To Injection & Alignment) =====
    {
      const passDns = async (host) => {
        if (host === 'corp.example') return ['v=spf1 include:_spf.google.com ~all'];
        if (host === '_dmarc.corp.example') return ['v=DMARC1; p=reject; rua=mailto:dmarc@corp.example'];
        if (host === 'google._domainkey.corp.example') return ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A'];
        return [];
      };
      const passReport = await assessDeliverabilityHygiene({
        accounts: [{ id: 'a1', email: 'hello@corp.example', domain: 'corp.example', type: 'workspace_paid' }],
        selectedAccountIds: ['a1'],
        replyTo: 'support@corp.example',
        physicalAddress: '100 Corporate Blvd, Seoul',
        publicUnsubBase: 'https://unsubscribe.vivpr.pro',
        supStats: { mergedHashSuppressedCount: 49, historicalComplained: 0, historicalBounceRatePct: 1.2, elevatedBounceWarning: false },
        dnsResolver: passDns
      });
      assert.equal(passReport.ok, true);
      assert.equal(passReport.status, 'PASS');
      assert.equal(passReport.domainChecks[0].spf.status, 'PASS');
      assert.equal(passReport.domainChecks[0].dmarc.status, 'PASS');
      assert.equal(passReport.domainChecks[0].dkim.status, 'PASS_GOOGLE_SELECTOR');
      assert.equal(passReport.replyToCheck.aligned, true);
      assert.ok(passReport.honestDisclosure.includes('GMAIL_API_ACCEPTED != DELIVERED'));

      // Missing SPF/DMARC + Reply-To header injection -> BLOCKED
      const failReport = await assessDeliverabilityHygiene({
        accounts: [{ id: 'a2', email: 'hello@nodns.example', domain: 'nodns.example', type: 'workspace_paid' }],
        selectedAccountIds: ['a2'],
        replyTo: 'evil@nodns.example\r\nBcc: victim@example.test',
        physicalAddress: '',
        publicUnsubBase: 'http://insecure.local',
        supStats: { mergedHashSuppressedCount: 0, historicalComplained: 2, historicalBounceRatePct: 9.0, elevatedBounceWarning: true },
        dnsResolver: async () => []
      });
      assert.equal(failReport.ok, false);
      assert.equal(failReport.status, 'BLOCKED');
      const blockerCodes = failReport.blockers.map(b => b.code);
      assert.ok(blockerCodes.includes('WORKSPACE_SPF_MISSING'));
      assert.ok(blockerCodes.includes('WORKSPACE_DMARC_MISSING'));
      assert.ok(blockerCodes.includes('REPLY_TO_INVALID_OR_INJECTION'));
      assert.ok(blockerCodes.includes('PUBLIC_HTTPS_UNSUBSCRIBE_REQUIRED'));

      // Consumer gmail.com honest disclosure + Reply-To domain mismatch warning
      const consReport = await assessDeliverabilityHygiene({
        accounts: [{ id: 'a3', email: 'owner@gmail.com', domain: 'gmail.com', type: 'gmail_personal' }],
        selectedAccountIds: ['a3'],
        replyTo: 'reply@other-domain.example',
        physicalAddress: '100 Safe St, Seoul',
        publicUnsubBase: 'https://unsubscribe.vivpr.pro',
        supStats: { mergedHashSuppressedCount: 10 },
        dnsResolver: async () => []
      });
      assert.equal(consReport.ok, true);
      assert.equal(consReport.domainChecks[0].domainType, 'CONSUMER_GMAIL');
      const warnCodes = consReport.warnings.map(w => w.code);
      assert.ok(warnCodes.includes('CONSUMER_GMAIL_DOMAIN_LIMITATIONS'));
      assert.ok(warnCodes.includes('REPLY_TO_DOMAIN_MISMATCH'));

      // Verify rawGmailMime accepts sanitized Reply-To and blocks CR/LF injection
      const mimeOk = Buffer.from(rawGmailMime({
        from: 'hello@corp.example',
        replyTo: 'support@corp.example',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['hello@corp.example'],
        displayName: 'Corp Sender',
        subject: 'Aligned Reply-To',
        text: 'Body text',
        html: '<p>Body html</p>',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok123',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), 'base64url').toString('utf8');
      assert.match(mimeOk, /Reply-To: <support@corp\.example>/);
      assert.throws(() => rawGmailMime({
        from: 'hello@corp.example',
        replyTo: 'bad@corp.example\r\nBcc: x@example.test',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['hello@corp.example'],
        displayName: 'Corp Sender',
        subject: 'Injected Reply-To',
        text: 'Body',
        html: '<p>Body</p>',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok123',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), e => e instanceof GmailSendBlocked && e.code === 'INVALID_EMAIL');
      checks += 4;
      console.log('PASS 5: Deliverability hygiene (SPF/DMARC/DKIM, consumer disclosure, Reply-To injection/alignment, RFC 8058) verified');
    }

    // ===== 6. Crash / Restart Recovery & IN_FLIGHT_UNKNOWN Rolling Quota Conservation =====
    {
      const dir = path.join(tmpRoot, 'crash_restart');
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });
      const acct = vault.upsertMockAccountForTest({ email: 'crash@gmail.com', cap24h: 10, capPerHour: 5, capPerMinute: 2 });
      const runner1 = new GmailCampaignRunner({ stateDir: dir, pipeline, vault, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      runner1.prepareGmailQueue({
        csvText: 'email,name\ncr1@example.test,CR1\ncr2@example.test,CR2',
        campaignId: 'camp_crash',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acct.id],
        consentAttested: true
      });
      // Simulate process crash while entry #1 was in-flight ('SENDING')
      runner1.queue.entries[0].status = 'SENDING';
      runner1.queue.entries[0].attempts = 1;
      runner1._saveQueue();

      // Restart runner from disk -> MUST mark HALTED_RECONCILE_REQUIRED, record IN_FLIGHT_UNKNOWN in quota, and block blind resume!
      const vault2 = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });
      const runner2 = new GmailCampaignRunner({ stateDir: dir, pipeline, vault: vault2, trustedTestMode: true, syncFetchImpl: okSyncFetch });
      assert.equal(runner2.queue.entries[0].status, 'HALTED_RECONCILE_REQUIRED');
      const dash = runner2.getTrueDashboard();
      assert.equal(dash.state, 'HALTED_RECONCILE_REQUIRED');
      assert.equal(dash.metrics.unknown, 1);
      assert.equal(vault2.listAccountsSafe()[0].sent24h, 1, 'Crashed in-flight send must count against rolling 24h quota');
      assert.equal(vault2.listAccountsSafe()[0].sent1m, 1, 'Crashed in-flight send must count against rolling 1m quota');

      const blockedResume = await runner2.runGmailQueue({
        subject: 'Crash Resume Attempt',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_REPLAY_AFTER_CRASH'); },
        pacingMs: 0
      });
      assert.equal(blockedResume.ok, false);
      assert.equal(blockedResume.reason, 'HALTED_RECONCILE_REQUIRED_NO_BLIND_RESUME');
      checks += 2;
      console.log('PASS 6: Crash/restart HALTED_RECONCILE_REQUIRED + IN_FLIGHT_UNKNOWN quota conservation + no blind replay verified');
    }

    // ===== 7. Sidecar True Dashboard & Hygiene HTTP Endpoints + Studio UI Controls =====
    {
      const dir = path.join(tmpRoot, 'sidecar_dash');
      const testPort = 19200 + (process.pid % 4000);
      const sidecar = new EmailTestSidecar({ port: testPort, stateDir: dir, trustedTestMode: true, gmailCryptoBox: box });
      await sidecar.start();
      try {
        const base = `http://127.0.0.1:${sidecar.port}`;
        const tok = fs.readFileSync(path.join(dir, '.email_sidecar_token'), 'utf8').trim();
        const seeded = sidecar.gmailVault.upsertMockAccountForTest({ email: 'dash@gmail.com', cap24h: 40 });

        // Unauthenticated dashboard must be 401
        const unauth = await fetch(`${base}/email/gmail/dashboard`);
        assert.equal(unauth.status, 401);

        // Authenticated dashboard, hygiene check & per-minute/hour/day cap update
        const updOk = await fetch(`${base}/email/gmail/accounts/update`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: seeded.id, cap24h: 30, capPerHour: 10, capPerMinute: 2 })
        });
        assert.equal(updOk.status, 200);
        const updBad = await fetch(`${base}/email/gmail/accounts/update`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: seeded.id, capPerMinute: 999 })
        });
        assert.equal(updBad.status, 400);

        const dResp = await fetch(`${base}/email/gmail/dashboard`, { headers: { Authorization: `Bearer ${tok}` } });
        assert.equal(dResp.status, 200);
        const dJson = await dResp.json();
        assert.equal(dJson.ok, true);
        assert.equal(dJson.dashboard.provider, 'GMAIL');
        assert.equal(dJson.dashboard.metrics.verifiedDelivered, null);
        assert.equal(dJson.dashboard.metrics.verifiedDeliveredStatus, 'UNAVAILABLE_FOR_GMAIL_API');
        assert.equal(dJson.dashboard.throttle.downwardOnly, true);
        assert.ok(dJson.dashboard.honestDeliveryDisclaimer.includes('GMAIL_API_ACCEPTED != DELIVERED'));

        const hResp = await fetch(`${base}/email/gmail/hygiene/check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ replyTo: 'bad@x.test\r\nBcc: y@x.test', physicalAddress: '123 Main St' })
        });
        assert.equal(hResp.status, 200);
        const hJson = await hResp.json();
        assert.equal(hJson.ok, true);
        assert.equal(hJson.hygiene.ok, false);
        assert.ok(hJson.hygiene.blockers.some(b => b.code === 'REPLY_TO_INVALID_OR_INJECTION'));
      } finally {
        await sidecar.stop();
      }

      // Static verification of Email Studio UI controls
      const htmlPath = path.join(__dirname, '..', 'extension', 'email-studio', 'index.html');
      const jsPath = path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js');
      const studioHtml = fs.readFileSync(htmlPath, 'utf8');
      const studioJs = fs.readFileSync(jsPath, 'utf8');
      assert.ok(studioHtml.includes('id="gmailTrueDashboard"'), 'Studio HTML must render True Dashboard');
      assert.ok(studioHtml.includes('id="gmailScheduleMode"'), 'Studio HTML must include distributed schedule selector');
      assert.ok(studioHtml.includes('id="gmailReplyTo"'), 'Studio HTML must include Reply-To input');
      assert.ok(studioHtml.includes('id="btnGmailHygieneCheck"'), 'Studio HTML must include deliverability hygiene check button');
      assert.ok(studioHtml.includes('id="gmailProviderSwitchConfirm"'), 'Studio HTML must include explicit provider switch confirmation');
      assert.ok(studioJs.includes('renderGmailTrueDashboard'), 'Studio JS must render True Dashboard');
      assert.ok(studioJs.includes('CHECK_GMAIL_HYGIENE'), 'Studio JS must call CHECK_GMAIL_HYGIENE');
      assert.ok(!studioJs.includes('logStudioDiag'), 'Studio JS must NOT call undefined logStudioDiag (must use studioDebugLog)');
      assert.ok(studioJs.includes("studioDebugLog('INFO', 'PROVIDER', 'EXPLICIT_SWITCH_CONFIRMED'"), 'Provider switch must log via studioDebugLog');
      assert.ok(!studioJs.includes('동의원장'), 'Studio JS must preserve spacing invariant (동의 원장)');
      checks += 2;
      console.log('PASS 7: Sidecar /email/gmail/dashboard + /hygiene/check HTTP contracts & Email Studio UI controls verified');
    }

    // ===== 8. Independent RC2 Audit Hardening Regressions (PKCE Replay/State Isolation, id_token aud/iss, From Guard, Corrupt Quota Ledger, Packaged Injection Guard, NTFS ACL) =====
    {
      // (a) Packaged mode MUST reject Gmail test injection options fail-closed
      assert.throws(() => new EmailTestSidecar({ trustedTestMode: false, gmailCryptoBox: box }), e => e.code === 'PACKAGED_MODE_TEST_INJECTION_REJECTED');
      assert.throws(() => new EmailTestSidecar({ trustedTestMode: false, gmailFetchImpl: okSyncFetch }), e => e.code === 'PACKAGED_MODE_TEST_INJECTION_REJECTED');

      // (b) Loopback PKCE callback rejects wrong state without destroying legitimate session, and rejects concurrent duplicate replay
      const dirPkce = path.join(tmpRoot, 'audit_pkce_hardening');
      const makeJwt = (payload) => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
      let tokenHits = 0;
      const pkceFetch = async (url, init) => {
        if (String(url) === 'https://oauth2.googleapis.com/token') {
          tokenHits++;
          await new Promise(r => setTimeout(r, 25)); // simulate async token exchange window for TOCTOU replay check
          const bodyStr = String(init.body || '');
          if (bodyStr.includes('code=BAD_AUD')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                access_token: 'ya29.syn_badaud',
                refresh_token: '1//syn_badaud',
                scope: 'https://www.googleapis.com/auth/gmail.send openid email',
                id_token: makeJwt({ iss: 'https://accounts.google.com', aud: 'WRONG-CLIENT.apps.googleusercontent.com', email: 'a@gmail.com', email_verified: true })
              })
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'ya29.syn_good',
              refresh_token: '1//syn_good',
              scope: 'https://www.googleapis.com/auth/gmail.send openid email',
              id_token: makeJwt({ iss: 'https://accounts.google.com', aud: 'audit-client-123456.apps.googleusercontent.com', email: 'pkce_audit@gmail.com', email_verified: true })
            })
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const vaultPkce = new GmailAccountVault({ stateDir: dirPkce, trustedTestMode: true, cryptoBox: box, fetchImpl: pkceFetch });
      vaultPkce.saveOAuthClientConfig({ clientId: 'audit-client-123456.apps.googleusercontent.com', userConsentConfirmed: true });

      const flow = await vaultPkce.startOAuthPkceFlow({ startLoopbackServer: true });
      assert.equal(flow.ok, true);
      try {
        // Rogue request with wrong state must get 400 and leave legitimate session intact!
        const rogueResp = await fetch(`${flow.redirectUri}?state=WRONG_STATE_ATTACK&error=access_denied`);
        assert.equal(rogueResp.status, 400);
        assert.ok(vaultPkce._pendingOAuthSessions.has(flow.state), 'Wrong-state request must NOT destroy legitimate pending OAuth session');

        // Concurrent replay race with same legitimate state -> only 1 succeeds, 2nd rejected immediately!
        const [cb1, cb2] = await Promise.all([
          vaultPkce.completeOAuthCallback({ state: flow.state, code: 'VALID_CODE' }),
          vaultPkce.completeOAuthCallback({ state: flow.state, code: 'VALID_CODE' })
        ]);
        const okResults = [cb1, cb2].filter(r => r.ok);
        const rejResults = [cb1, cb2].filter(r => !r.ok);
        assert.equal(okResults.length, 1, 'Exactly one callback may consume single-use PKCE state');
        assert.equal(rejResults.length, 1);
        assert.equal(rejResults[0].reason, 'OAUTH_STATE_INVALID_OR_EXPIRED');
        assert.equal(tokenHits, 1, 'Token endpoint must be called at most once despite concurrent callback race');

        // Mismatched id_token aud must be rejected fail-closed
        const flowAud = await vaultPkce.startOAuthPkceFlow({ startLoopbackServer: false });
        const badAudRes = await vaultPkce.completeOAuthCallback({ state: flowAud.state, code: 'BAD_AUD' });
        assert.equal(badAudRes.ok, false);
        assert.equal(badAudRes.reason, 'OAUTH_ID_TOKEN_CLAIMS_INVALID');
      } finally {
        vaultPkce.closeAllOAuthServers();
      }

      // (c) Malformed/injected fromAddress in sendGmailSelfTest MUST fail closed (never silently fall back to selected.from)
      const dirFrom = path.join(tmpRoot, 'audit_from_and_corrupt');
      const pipeFrom = new EmailProductionPipeline({ stateDir: dirFrom, trustedTestMode: true });
      const vaultFrom = new GmailAccountVault({ stateDir: dirFrom, trustedTestMode: true, cryptoBox: box });
      const acctFrom = vaultFrom.upsertMockAccountForTest({ email: 'verified_owner@gmail.com', cap24h: 20 });
      const runnerFrom = new GmailCampaignRunner({ stateDir: dirFrom, pipeline: pipeFrom, vault: vaultFrom, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      const badFrom = await runnerFrom.sendGmailSelfTest({
        accountId: acctFrom.id,
        fromAddress: 'evil@gmail.com\r\nBcc: spy@example.test',
        to: 'owner_rcpt@example.test',
        subject: 'Bad From',
        html: '<p>Hi</p>',
        text: 'Hi',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND'); }
      });
      assert.equal(badFrom.ok, false);
      assert.equal(badFrom.reason, 'INVALID_FROM_ADDRESS');

      const spoofAlias = await runnerFrom.sendGmailSelfTest({
        accountId: acctFrom.id,
        fromAddress: 'unverified_alias@gmail.com',
        to: 'owner_rcpt@example.test',
        subject: 'Spoof Alias',
        html: '<p>Hi</p>',
        text: 'Hi',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND'); }
      });
      assert.equal(spoofAlias.ok, false);
      assert.equal(spoofAlias.reason, 'UNVERIFIED_SEND_AS');

      // (d) Corrupt line in .gmail_quota_ledger.jsonl -> detected & fail-closed blocks sends + NTFS ACL verification on Windows
      vaultFrom.recordQuotaEvent({ accountId: acctFrom.id, domain: 'gmail.com', campaignId: 'c_acl', recipientHash: 'a'.repeat(64), idempotencyKey: 'k_acl_1', status: 'GMAIL_API_ACCEPTED' });
      if (process.platform === 'win32' && process.env.USERNAME) {
        assert.equal(verifyWindowsDacl(vaultPkce.oauthClientFile, process.env.USERNAME), true);
        assert.equal(verifyWindowsDacl(vaultPkce.vaultFile, process.env.USERNAME), true);
        assert.equal(verifyWindowsDacl(vaultFrom.quotaLedgerFile, process.env.USERNAME), true);
      }
      fs.appendFileSync(vaultFrom.quotaLedgerFile, '{CORRUPT_PARTIAL_CRASH_LINE\n');
      assert.equal(vaultFrom.getRolling24hUsage().corruptLineCount, 1);
      runnerFrom.prepareGmailQueue({
        csvText: 'email,name\nu_corrupt@example.test,U',
        campaignId: 'camp_corrupt',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acctFrom.id],
        consentAttested: true
      });
      const corruptBlocked = await runnerFrom.runGmailQueue({
        subject: 'Corrupt Ledger Stop',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND_ON_CORRUPT_QUOTA_LEDGER'); },
        pacingMs: 0
      });
      assert.equal(corruptBlocked.ok, false);
      assert.equal(corruptBlocked.reason, 'QUOTA_LEDGER_CORRUPT_RECONCILE_REQUIRED');
      checks += 4;
      console.log('PASS 8: Independent audit hardening (packaged injection guard, PKCE state isolation/replay, id_token aud/iss, From guard, corrupt ledger fail-closed & Windows NTFS ACL) verified');
    }

    // ===== 9. Automatic Deliverability & Spam-Risk Optimizer + RFC 2047 Folding + Date Header + Sidecar Endpoint =====
    {
      // (a) RFC 2047 multi-line UTF-8 folding for long Korean subjects & RFC 5322 Date header
      const longKrSubject = '신규 예약 안내 및 고객 감사 이벤트 상세 공지 안내 메일입니다';
      const foldedRaw = rawGmailMime({
        from: 'owner@gmail.com',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['owner@gmail.com'],
        displayName: 'Example Sender',
        subject: longKrSubject,
        text: '안녕하세요. 테스트 안내입니다.',
        html: '<p>안녕하세요. 테스트 안내입니다.</p>',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok_fold',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      });
      const foldedDecoded = Buffer.from(foldedRaw, 'base64url').toString('utf8');
      assert.match(foldedDecoded, /^Date: [A-Z][a-z]{2}, /m, 'MIME must include valid RFC 5322 Date header');
      assert.match(foldedDecoded, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/, 'Long UTF-8 subject must fold cleanly per RFC 2047');

      // (b) Auto-fix foreign-domain displayName ("vivpr.pro"), mismatched Reply-To, placeholder image, shouting subject & heavy marketing HTML on @gmail.com
      const optRes = optimizeAndScoreGmailMessage({
        from: 'owner_test@gmail.com',
        displayName: 'vivpr.pro',
        replyTo: 'info@other-brand.example',
        subject: 'EXAMPLE BRAND UPDATE!!!',
        html: '<table style="background-color:#eee;border-radius:8px;"><tr><td><img src="https://vivpr.pro/images/news.jpg"><script>alert(1)</script><p>안녕하세요. 요청하신 서비스 안내와 상세 일정 정보를 전달드립니다. 궁금하신 점은 편하게 회신해 주세요.</p></td></tr></table>',
        text: '안녕하세요. 요청하신 서비스 안내와 상세 일정 정보를 전달드립니다. 궁금하신 점은 편하게 회신해 주세요.',
        physicalAddress: '100 Synthetic Way, Suite 200, Seoul',
        autoOptimize: true,
        autoAlignReplyTo: true,
        preferLightweightHtml: true
      });
      assert.equal(optRes.ok, true);
      const fixCodes = optRes.autoFixesApplied.map(f => f.code);
      assert.ok(fixCodes.includes('AUTO_FIX_DISPLAY_NAME_DOMAIN_MISMATCH'), 'Must sanitize foreign domain displayName');
      assert.ok(!/vivpr\.pro/i.test(optRes.optimized.displayName));
      assert.ok(fixCodes.includes('AUTO_ALIGN_REPLY_TO_OMITTED_MISMATCH'), 'Must auto-align/omit mismatched external Reply-To');
      assert.equal(optRes.optimized.replyTo, '');
      assert.ok(fixCodes.includes('AUTO_FIX_SUBJECT_HYGIENE'), 'Must collapse shouting/excessive punctuation');
      assert.ok(fixCodes.includes('AUTO_REMOVED_UNSAFE_HTML_TAGS'));
      assert.ok(fixCodes.includes('AUTO_REMOVED_PLACEHOLDER_IMAGE'));
      assert.ok(fixCodes.includes('AUTO_CONVERTED_LIGHTWEIGHT_NATURAL_HTML'));
      assert.ok(!optRes.optimized.html.includes('<table') && !optRes.optimized.html.includes('news.jpg') && !optRes.optimized.html.includes('<script'));
      assert.ok(optRes.riskScore < 55, 'After legitimate auto-optimization, clean body should not be HIGH_RISK');
      assert.ok(optRes.honestDisclaimer.includes('보장하지 않습니다'));

      // (c) High-risk spammy content (URL shortener + spam phrases + short boilerplate) -> HIGH_RISK & blocked when blockHighRiskSpam=true
      const dirSpam = path.join(tmpRoot, 'spam_opt_block');
      const pipeSpam = new EmailProductionPipeline({ stateDir: dirSpam, trustedTestMode: true });
      const vaultSpam = new GmailAccountVault({ stateDir: dirSpam, trustedTestMode: true, cryptoBox: box });
      const acctSpam = vaultSpam.upsertMockAccountForTest({ email: 'clean_sender@gmail.com', cap24h: 20 });
      const runnerSpam = new GmailCampaignRunner({ stateDir: dirSpam, pipeline: pipeSpam, vault: vaultSpam, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      const blockedHigh = await runnerSpam.sendGmailSelfTest({
        accountId: acctSpam.id,
        to: 'owner_rcpt@example.test',
        subject: 'Re: 100% 보장 무료 증정 긴급 클릭',
        html: '<p>지금 당장 클릭 https://bit.ly/evil</p>',
        text: '지금 당장 클릭 https://bit.ly/evil',
        autoSpamPrevention: true,
        blockHighRiskSpam: true,
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND_HIGH_SPAM_RISK'); }
      });
      assert.equal(blockedHigh.ok, false);
      assert.equal(blockedHigh.reason, 'HIGH_SPAM_RISK_BLOCKED');
      assert.equal(blockedHigh.spamOptimization.grade, 'HIGH_RISK');

      // (d) Sidecar POST /email/gmail/deliverability/optimize + Studio HTML/JS controls verified
      const scPort = 19250 + (process.pid % 3000);
      const scOpt = new EmailTestSidecar({ port: scPort, stateDir: path.join(tmpRoot, 'sidecar_opt'), trustedTestMode: true, gmailCryptoBox: box });
      await scOpt.start();
      try {
        const tok = fs.readFileSync(path.join(tmpRoot, 'sidecar_opt', '.email_sidecar_token'), 'utf8').trim();
        scOpt.gmailVault.upsertMockAccountForTest({ email: 'opt_acct@gmail.com', cap24h: 30 });
        const oResp = await fetch(`http://127.0.0.1:${scOpt.port}/email/gmail/deliverability/optimize`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: 'vivpr.pro',
            replyTo: 'info@other-brand.example',
            subject: '테스트 안내입니다!!!',
            html: '<p>안녕하세요. 테스트 안내 본문입니다. 충분히 긴 자연스러운 문장을 작성합니다.</p>',
            text: '안녕하세요. 테스트 안내 본문입니다. 충분히 긴 자연스러운 문장을 작성합니다.',
            physicalAddress: '100 Synthetic Way, Suite 200'
          })
        });
        assert.equal(oResp.status, 200);
        const oJson = await oResp.json();
        assert.equal(oJson.ok, true);
        assert.ok(oJson.optimization.autoFixesApplied.length >= 2);
      } finally {
        await scOpt.stop();
      }
      const htmlNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      assert.ok(htmlNow.includes('id="gmailAutoSpamOpt"') && htmlNow.includes('id="btnGmailSpamOptimizePreview"'));
      assert.ok(jsNow.includes('OPTIMIZE_GMAIL_DELIVERABILITY') && jsNow.includes('getGmailSpamOptFlags'));
      checks += 4;
      console.log('PASS 9: Automatic deliverability & spam-risk optimizer, RFC 2047 folding, Date header, HIGH_SPAM_RISK_BLOCKED & Sidecar/UI wiring verified');
    }

    // ===== 10. Unified Dual-Provider (Gmail + Resend) Anti-Spam Checklist, Auto/Semi-Auto Engine & Resend Gate =====
    {
      // (a) Dual-provider structured checklist (AUTO / SEMI_AUTO / MANUAL_GUIDE) for RESEND and GMAIL
      const resOpt = optimizeAndScoreEmailMessage({
        provider: 'RESEND',
        from: 'noreply@vivpr.pro',
        displayName: 'vivpr.pro',
        replyTo: 'support@other-brand.example',
        subject: 'RESEND SERVICE UPDATE!!!',
        preheader: '서비스 안내 요약입니다.',
        html: '<div><img src="https://vivpr.pro/images/news.jpg"><img src="https://cdn.example.test/ok.png"><script>x()</script><p>안녕하세요. 정상 서비스 안내 본문입니다. 충분히 자연스럽고 구체적인 안내 문장을 작성했습니다.</p></div>',
        text: '안녕하세요. 정상 서비스 안내 본문입니다. 충분히 자연스럽고 구체적인 안내 문장을 작성했습니다.',
        physicalAddress: '100 Synthetic Way, Suite 200, Seoul',
        autoOptimize: true,
        autoAlignReplyTo: true,
        preferLightweightHtml: false
      });
      assert.equal(resOpt.ok, true);
      assert.equal(resOpt.provider, 'RESEND');
      assert.equal(resOpt.optimized.displayName, 'vivpr.pro', 'Resend vivpr.pro displayName matches sender domain and stays intact');
      assert.equal(resOpt.optimized.replyTo, '', 'Mismatched external Reply-To auto-aligned when autoAlignReplyTo=true');
      assert.ok(!resOpt.optimized.html.includes('news.jpg') && !resOpt.optimized.html.includes('<script'));
      assert.match(resOpt.optimized.html, /<img alt=""[^>]*ok\.png/, 'Missing img alt auto-filled');
      assert.ok(Array.isArray(resOpt.checklist) && resOpt.checklist.length >= 14);
      assert.ok(resOpt.checklist.some(i => i.mode === 'AUTO') && resOpt.checklist.some(i => i.mode === 'SEMI_AUTO') && resOpt.checklist.some(i => i.mode === 'MANUAL_GUIDE'));
      assert.ok(resOpt.checklistSummary.autoTotal >= 7 && resOpt.checklistSummary.semiAutoTotal >= 5 && resOpt.checklistSummary.manualTotal === 4);

      // (b) Resend EmailProductionPipeline.runQueue with autoSpamPrevention=true (clean auto-fix + HIGH_SPAM_RISK_BLOCKED)
      const dirRes = path.join(tmpRoot, 'resend_spam_opt');
      const sentPayloads = [];
      const pipeRes = new EmailProductionPipeline({
        stateDir: dirRes,
        trustedTestMode: true,
        providerTransport: async (msg) => {
          sentPayloads.push(msg);
          return { ok: true, providerMessageId: 'mock_resend_opt_1' };
        }
      });
      pipeRes.importAndPersistRecipients({
        csvText: 'email,name\nok1@example.test,OK1',
        messageKind: 'marketing',
        consentAttested: true,
        lawfulBasis: 'EXPLICIT_OPT_IN',
        campaignId: 'camp_resend_opt'
      });

      // High-risk spam content MUST fail-closed BEFORE calling providerTransport!
      const blockedResend = await pipeRes.runQueue({
        mode: 'ISOLATED_PROVIDER_TEST',
        subject: 'Re: 100% 보장 무료 증정 긴급 클릭',
        html: '<p>지금 당장 클릭 https://bit.ly/spam</p>',
        text: '지금 당장 클릭 https://bit.ly/spam',
        autoSpamPrevention: true,
        blockHighRiskSpam: true,
        baseUrl: 'https://unsubscribe.vivpr.pro'
      });
      assert.equal(blockedResend.ok, false);
      assert.equal(blockedResend.reason, 'HIGH_SPAM_RISK_BLOCKED');
      assert.equal(sentPayloads.length, 0, 'HIGH_SPAM_RISK_BLOCKED must dispatch 0 Resend emails');

      // Clean content with fixable issues auto-sanitizes & sends with RFC 8058 unsubscribe + physical address intact
      const okResend = await pipeRes.runQueue({
        mode: 'ISOLATED_PROVIDER_TEST',
        senderDisplayName: 'Acme Studio',
        replyTo: 'info@external-other.example',
        subject: 'ACME STUDIO UPDATE!!!',
        html: '<p><img src="https://vivpr.pro/images/news.jpg"><script>bad()</script>안녕하세요. 요청하신 서비스 일정 안내를 전달드립니다. 궁금하신 점은 언제든 회신해 주세요.</p>',
        text: '안녕하세요. 요청하신 서비스 일정 안내를 전달드립니다. 궁금하신 점은 언제든 회신해 주세요.',
        physicalAddress: '100 Synthetic Way, Suite 200, Seoul',
        autoSpamPrevention: true,
        autoAlignReplyTo: true,
        blockHighRiskSpam: true,
        baseUrl: 'https://unsubscribe.vivpr.pro'
      });
      assert.equal(okResend.ok, true);
      assert.equal(sentPayloads.length, 1);
      assert.equal(sentPayloads[0].subject, 'Acme studio update!');
      assert.equal(sentPayloads[0].reply_to, undefined, 'Mismatched Reply-To omitted on Resend when autoAlignReplyTo=true');
      assert.ok(!sentPayloads[0].html.includes('news.jpg') && !sentPayloads[0].html.includes('<script'));
      assert.ok(sentPayloads[0].html.includes('100 Synthetic Way, Suite 200, Seoul'), 'Physical address footer preserved');
      assert.ok(sentPayloads[0].headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');

      // (c) Sidecar POST /email/deliverability/optimize (RESEND + GMAIL) & POST /email/production/real-test-send HIGH_SPAM_RISK_BLOCKED
      const scDualPort = 19300 + (process.pid % 2500);
      const scDualDir = path.join(tmpRoot, 'sidecar_dual_opt');
      const scDual = new EmailTestSidecar({ port: scDualPort, stateDir: scDualDir, trustedTestMode: true, gmailCryptoBox: box });
      await scDual.start();
      try {
        const tok = fs.readFileSync(path.join(scDualDir, '.email_sidecar_token'), 'utf8').trim();
        const unauthOpt = await fetch(`http://127.0.0.1:${scDual.port}/email/deliverability/optimize`, { method: 'POST' });
        assert.equal(unauthOpt.status, 401);

        const dualRes = await fetch(`http://127.0.0.1:${scDual.port}/email/deliverability/optimize`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'RESEND',
            displayName: 'Acme Corp',
            subject: '서비스 안내입니다!!!',
            preheader: '안내 요약',
            html: '<p>안녕하세요. 요청하신 서비스 상세 일정 안내를 보내드립니다. 편하게 회신해 주세요.</p>',
            text: '안녕하세요. 요청하신 서비스 상세 일정 안내를 보내드립니다. 편하게 회신해 주세요.',
            physicalAddress: '100 Synthetic Way, Suite 200'
          })
        });
        assert.equal(dualRes.status, 200);
        const dualJson = await dualRes.json();
        assert.equal(dualJson.ok, true);
        assert.equal(dualJson.provider, 'RESEND');
        assert.ok(Array.isArray(dualJson.optimization.checklist) && dualJson.optimization.checklist.length >= 14);

        // Real-test-send high-risk spam must fail-closed with 409 HIGH_SPAM_RISK_BLOCKED (0 outbound calls)
        const rtBlocked = await fetch(`http://127.0.0.1:${scDual.port}/email/production/real-test-send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: 'owner-check@example.test',
            ownerTestConsentConfirmed: true,
            subject: 'Re: 100% 보장 무료 증정 긴급 클릭',
            html: '<p>지금 당장 클릭 https://bit.ly/blocked</p>',
            text: '지금 당장 클릭 https://bit.ly/blocked',
            autoSpamPrevention: true,
            blockHighRiskSpam: true
          })
        });
        assert.equal(rtBlocked.status, 409);
        const rtJson = await rtBlocked.json();
        assert.equal(rtJson.ok, false);
        assert.equal(rtJson.reason, 'HIGH_SPAM_RISK_BLOCKED');
      } finally {
        await scDual.stop();
      }

      // (d) Studio HTML/JS & Background unified checklist controls contract check
      const htmlNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      const bgNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
      assert.ok(htmlNow.includes('id="antiSpamChecklistSection"') && htmlNow.includes('id="btnRunAntiSpamChecklist"') && htmlNow.includes('id="btnApplyAutoAntiSpamFixes"') && htmlNow.includes('id="btnSemiAutoCopyAndDraftFix"'));
      assert.ok(htmlNow.includes('id="spamOptApplyGmail"') && htmlNow.includes('id="spamOptApplyResend"') && htmlNow.includes('id="spamChecklistProvider"'));
      assert.ok(jsNow.includes('OPTIMIZE_EMAIL_DELIVERABILITY') && jsNow.includes('getUnifiedSpamOptFlags') && jsNow.includes('runAntiSpamChecklist') && jsNow.includes('applyAutoAntiSpamFixesToEditor'));
      assert.ok(bgNow.includes('OPTIMIZE_EMAIL_DELIVERABILITY') && bgNow.includes('/email/deliverability/optimize'));
      assert.ok(!/\blogStudioDiag\b/.test(jsNow), 'Must never regress logStudioDiag typo');
      checks += 4;
      console.log('PASS 10: Unified Gmail+Resend anti-spam auto/semi-auto checklist engine, Resend HIGH_SPAM_RISK_BLOCKED gate & Studio UI wiring verified');
    }

    // ===== 11. Policy-Safe Semi-Auto "Open Last Test Email in Gmail Spam & Not-Spam Guide" Helper =====
    {
      // (a) Official Gmail Spam search URL builder (authuser binding, query sanitization, masked sender skipped)
      const hGmail = buildGmailSpamSearchHelper({
        provider: 'GMAIL',
        recipient: 'owner-inbox@example.test',
        from: 'sender@gmail.com',
        subject: '테스트 "안내" 메일\r\nBcc:evil'
      });
      assert.equal(hGmail.ok, true);
      assert.equal(hGmail.authUserBound, true);
      assert.ok(hGmail.searchUrl.startsWith('https://mail.google.com/mail/?authuser=owner-inbox%40example.test#search/'));
      assert.ok(hGmail.spamFolderUrl === 'https://mail.google.com/mail/?authuser=owner-inbox%40example.test#spam');
      assert.ok(hGmail.query.includes('in:spam') && hGmail.query.includes('from:sender@gmail.com') && !hGmail.query.includes('\r') && !hGmail.query.includes('\n'));
      assert.ok(hGmail.policyNote.includes('gmail.send') && hGmail.policyNote.includes('gmail.modify'));

      const hResend = buildGmailSpamSearchHelper({
        provider: 'RESEND',
        recipient: '',
        from: 'se***@gmail.com',
        subject: '서비스 일정 안내'
      });
      assert.equal(hResend.authUserBound, false);
      assert.ok(hResend.searchUrl.startsWith('https://mail.google.com/mail/u/0/#search/'));
      assert.ok(hResend.query.includes('from:vivpr.pro') && !hResend.query.includes('***'));

      // (b) Checklist item MANUAL_NOT_SPAM_TRAIN exposes semiAutoAction + spamReviewHelper (and NEVER leaks raw personal Gmail address)
      const optWithHelper = optimizeAndScoreEmailMessage({
        provider: 'GMAIL',
        from: 'secret-owner-addr@gmail.com',
        subject: '정상 테스트 안내',
        html: '<p>안녕하세요. 정상 안내 본문입니다. 충분히 자연스러운 문장으로 작성했습니다.</p>',
        text: '안녕하세요. 정상 안내 본문입니다. 충분히 자연스러운 문장으로 작성했습니다.',
        physicalAddress: '100 Synthetic Way, Suite 200'
      });
      assert.ok(optWithHelper.spamReviewHelper && optWithHelper.spamReviewHelper.searchUrl.startsWith('https://mail.google.com/mail/'));
      assert.ok(!JSON.stringify(optWithHelper).includes('secret-owner-addr@gmail.com'), 'Optimizer response must NEVER leak unmasked personal Gmail address');
      const notSpamItem = optWithHelper.checklist.find(i => i.id === 'MANUAL_NOT_SPAM_TRAIN');
      assert.ok(notSpamItem && notSpamItem.semiAutoAction === 'OPEN_GMAIL_SPAM_NOT_SPAM_HELPER');

      // (c) Zero OAuth scope creep & zero mail.google.com host permission / DOM bot injection
      const manifestSrc = fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8');
      assert.deepEqual(GMAIL_OAUTH_SCOPES, ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'], 'OAuth scope must strictly remain minimal gmail.send');
      assert.ok(!/mail\.google\.com/i.test(manifestSrc), 'Extension manifest must NOT request mail.google.com host permission');

      // (d) Studio HTML/JS controls for 1-click Gmail Spam Not-Spam Helper present
      const htmlNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      assert.ok(htmlNow.includes('id="btnOpenGmailSpamHelper"') && htmlNow.includes('id="gmailSpamHelperGuide"') && htmlNow.includes('id="btnOpenRealTestInSpam"') && htmlNow.includes('id="btnOpenGmailSelfTestInSpam"') && htmlNow.includes('id="btnMarkNotSpamDone"'));
      assert.ok(jsNow.includes('openLastTestEmailInGmailSpam') && jsNow.includes('OPEN_GMAIL_SPAM_NOT_SPAM_HELPER') && jsNow.includes('buildStudioGmailSpamHelper'));
      checks += 4;
      console.log('PASS 11: Policy-safe semi-auto Gmail Spam Not-Spam helper, zero OAuth scope creep & Studio UI hooks verified');
    }

    // ===== 12. Multi-Account Gmail Spam Folder Quick-Launcher (Policy-Safe, Deduplicated, Capped) =====
    {
      const multi = buildMultiAccountGmailSpamHelpers({
        provider: 'RESEND',
        subject: '서비스 일정 안내',
        maxAccounts: 3,
        accounts: [
          { email: 'InboxOne@example.test', label: '메인' },
          'inboxone@example.test', // duplicate -> deduplicated
          'bad-email',             // invalid -> skipped
          'ma***@gmail.com',       // masked -> skipped
          { email: 'inbox2@example.test', label: '보조1' },
          { email: 'inbox3@example.test', label: '보조2' },
          { email: 'inbox4@example.test', label: '초과' } // capped at 3
        ]
      });
      assert.equal(multi.ok, true);
      assert.equal(multi.count, 3);
      assert.equal(multi.skippedInvalid, 2);
      assert.equal(multi.items[0].email, 'inboxone@example.test');
      assert.equal(multi.items[0].label, '메인');
      assert.equal(multi.items[0].spamFolderUrl, 'https://mail.google.com/mail/?authuser=inboxone%40example.test#spam');
      assert.ok(multi.items[0].searchUrl.startsWith('https://mail.google.com/mail/?authuser=inboxone%40example.test#search/'));
      assert.ok(multi.items[0].query.includes('in:spam') && multi.items[0].query.includes('from:vivpr.pro'));
      assert.equal(multi.items[2].email, 'inbox3@example.test');
      assert.ok(multi.policyNote.includes('gmail.modify'));

      const htmlNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      assert.ok(htmlNow.includes('id="spamReviewAccountInput"') && htmlNow.includes('id="btnAddSpamReviewAccount"') && htmlNow.includes('id="btnSyncTestRecipientToReviewList"') && htmlNow.includes('id="spamReviewAccountsList"') && htmlNow.includes('id="btnOpenSelectedSpamSearch"') && htmlNow.includes('id="btnOpenSelectedSpamFolders"'));
      assert.ok(jsNow.includes('parseAndAddSpamReviewAccounts') && jsNow.includes('openMultiAccountSpamTabs') && jsNow.includes('renderSpamReviewAccountsList') && jsNow.includes('xpider_spam_review_accounts_v1'));
      checks += 2;
      console.log('PASS 12: Multi-account Gmail Spam folder quick-launcher helper, deduplication/cap & Studio UI controls verified');
    }

    // ===== 13. RC10 Narrow Fixes (Directive #7093262370): Genuine Brand/Reply-To Preservation, MIME Hygiene, Privacy/URL & Metric Semantics =====
    {
      // (a) Protect genuine brand name & intentional cross-domain Reply-To (NO silent mutation!) + reject malicious CRLF injection
      const legitBrand = optimizeAndScoreEmailMessage({
        provider: 'GMAIL',
        from: 'owner@gmail.com',
        displayName: 'Acme.plus Studio',
        replyTo: 'support@acme.example',
        subject: '정상 서비스 안내',
        html: '<table style="background-color:#fafafa;"><tr><td><img src="https://cdn.example.test/hero.png" alt="Hero"><a href="https://acme.example/info">상세 보기</a><p>안녕하세요. 요청하신 서비스 일정과 문의 안내를 보내드립니다. 편하게 회신해 주세요.</p></td></tr></table>',
        text: '안녕하세요. 요청하신 서비스 일정과 문의 안내를 보내드립니다. 편하게 회신해 주세요.',
        physicalAddress: '100 Synthetic Way, Suite 200, Seoul',
        autoOptimize: true
      });
      assert.equal(legitBrand.ok, true);
      assert.equal(legitBrand.optimized.displayName, 'Acme.plus Studio', 'Genuine brand name with TLD must NOT be silently rewritten');
      assert.equal(legitBrand.optimized.replyTo, 'support@acme.example', 'Intentional cross-domain Reply-To must NOT be silently dropped by default');
      assert.ok(legitBrand.optimized.html.includes('<table') && legitBrand.optimized.html.includes('https://cdn.example.test/hero.png') && legitBrand.optimized.html.includes('https://acme.example/info'), 'Existing template, custom HTTPS image & links must NOT silently disappear by default');
      assert.ok(legitBrand.signals.some(s => s.code === 'DISPLAY_NAME_FOREIGN_DOMAIN_CONFIRM_REQUIRED'), 'Unapproved foreign-domain brand must warn transparently rather than silently mutating');

      const approvedBrand = optimizeAndScoreEmailMessage({
        provider: 'GMAIL',
        from: 'owner@gmail.com',
        displayName: 'Acme.plus Studio',
        replyTo: 'support@acme.example',
        subject: '정상 서비스 안내',
        html: '<p>안녕하세요. 요청하신 서비스 일정과 문의 안내를 보내드립니다. 편하게 회신해 주세요.</p>',
        text: '안녕하세요. 요청하신 서비스 일정과 문의 안내를 보내드립니다. 편하게 회신해 주세요.',
        physicalAddress: '100 Synthetic Way, Suite 200, Seoul',
        ownerApprovedBrand: true,
        authorizedReplyTo: true
      });
      assert.equal(approvedBrand.optimized.displayName, 'Acme.plus Studio');
      assert.equal(approvedBrand.optimized.replyTo, 'support@acme.example');
      assert.ok(!approvedBrand.signals.some(s => s.code === 'DISPLAY_NAME_FOREIGN_DOMAIN_CONFIRM_REQUIRED'));
      assert.ok(!approvedBrand.signals.some(s => s.code === 'REPLY_TO_DOMAIN_MISMATCH'));

      // Malicious CRLF header injection MUST fail-closed (NEVER silently pass!)
      const maliciousCrlf = optimizeAndScoreEmailMessage({
        provider: 'GMAIL',
        from: 'owner@gmail.com',
        displayName: 'Evil\r\nBcc: victim@example.test',
        subject: 'Test',
        html: '<p>Hello world</p>',
        text: 'Hello world'
      });
      assert.equal(maliciousCrlf.ok, false);
      assert.equal(maliciousCrlf.blocked, true);
      assert.equal(maliciousCrlf.reason, 'INVALID_HEADER_INJECTION');

      // (b) MIME standards hygiene: neutral boundary (no xpider_), ASCII folding, explicit PLAIN_TEXT_ONLY + quoted-printable preserving RFC 8058
      const longAsciiSubj = 'Quarterly Service Maintenance Schedule And Support Contact Information Overview For Authorized Subscribers';
      assert.ok(foldAsciiHeader(longAsciiSubj, 76).includes('\r\n '), 'Long ASCII subject must fold cleanly');
      const qpSample = encodeQuotedPrintable('Hello = World! 안녕하세요 trailing ');
      assert.ok(qpSample.includes('=3D') && qpSample.endsWith('=20'), 'Quoted-printable must escape = and trailing space per RFC 2045');

      const neutralMulti = Buffer.from(rawGmailMime({
        from: 'owner@gmail.com',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['owner@gmail.com'],
        displayName: 'Acme.plus Studio',
        subject: longAsciiSubj,
        html: '<p>Hello world</p>',
        text: 'Hello world',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok_rc10_m',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), 'base64url').toString('utf8');
      assert.ok(!neutralMulti.includes('boundary="xpider_'), 'MIME boundary must be implementation-neutral');
      assert.match(neutralMulti, /boundary="b_[a-f0-9]{32}"/);
      assert.match(neutralMulti, /Subject: .+\r\n /);

      const plainOnlyUrl = 'https://unsubscribe.vivpr.pro/unsubscribe/tok_rc10_p';
      const plainOnlyMime = Buffer.from(rawGmailMime({
        from: 'owner@gmail.com',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['owner@gmail.com'],
        displayName: 'Acme.plus Studio',
        subject: '순수 텍스트 모드 테스트',
        html: '',
        text: `안녕하세요. 순수 텍스트 안내입니다.\n\n수신거부: ${plainOnlyUrl}\n발신자 주소: 100 Synthetic Way`,
        unsubscribeUrl: plainOnlyUrl,
        mimeContentMode: 'PLAIN_TEXT_ONLY',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), 'base64url').toString('utf8');
      assert.match(plainOnlyMime, /Content-Type: text\/plain; charset=utf-8/);
      assert.match(plainOnlyMime, /Content-Transfer-Encoding: quoted-printable/);
      assert.match(plainOnlyMime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
      assert.ok(!plainOnlyMime.includes('multipart/alternative'));
      assert.throws(() => rawGmailMime({
        from: 'owner@gmail.com',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['owner@gmail.com'],
        displayName: 'Acme',
        subject: 'Missing unsub in plain',
        html: '',
        text: 'No unsubscribe URL included here',
        unsubscribeUrl: plainOnlyUrl,
        mimeContentMode: 'PLAIN_TEXT_ONLY',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), e => e instanceof GmailSendBlocked && e.code === 'MISSING_BODY_OR_UNSUBSCRIBE');

      // (c) Privacy/URL audit: ONLY official https://mail.google.com/mail/ URLs accepted; spoofed domains rejected
      assert.equal(isOfficialGmailWebUrl('https://mail.google.com/mail/?authuser=a%40example.test#spam'), true);
      assert.equal(isOfficialGmailWebUrl('https://mail.google.com.evil.test/mail/#spam'), false);
      assert.equal(isOfficialGmailWebUrl('http://mail.google.com/mail/#spam'), false);
      assert.equal(isOfficialGmailWebUrl('javascript:alert(1)'), false);
      assert.equal(isOfficialGmailWebUrl('https://user:pass@mail.google.com/mail/#spam'), false);

      // (d) Metric semantics & Studio UI defaults (no silent Reply-To drop / no silent HTML drop / test-mailbox attestation)
      const dirSem = path.join(tmpRoot, 'rc10_semantics');
      const pipeSem = new EmailProductionPipeline({ stateDir: dirSem, trustedTestMode: true });
      const vaultSem = new GmailAccountVault({ stateDir: dirSem, trustedTestMode: true, cryptoBox: box });
      vaultSem.upsertMockAccountForTest({ email: 'sem@gmail.com', cap24h: 20 });
      const runnerSem = new GmailCampaignRunner({ stateDir: dirSem, pipeline: pipeSem, vault: vaultSem, trustedTestMode: true, syncFetchImpl: okSyncFetch });
      const dashSem = runnerSem.getTrueDashboard();
      assert.equal(dashSem.metrics.verifiedPrimary, null);
      assert.equal(dashSem.metrics.verifiedPrimaryStatus, 'UNAVAILABLE_FOR_GMAIL_API');
      assert.ok(dashSem.metricSemantics && dashSem.metricSemantics.ownerObservedCategories.includes('OWNER_OBSERVED_INBOX_PROMOTIONS'));
      assert.ok(dashSem.metricSemantics.ownerObservedCategories.includes('PRIMARY_UNKNOWN'));

      const htmlNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsNow = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      assert.ok(htmlNow.includes('id="spamOptOwnerApprovedBrand"') && htmlNow.includes('id="emailMimeContentMode"') && htmlNow.includes('id="spamReviewOwnMailboxConfirm"'));
      assert.ok(!/<input id="spamOptAutoAlignReplyTo"[^>]*checked/i.test(htmlNow), 'Reply-To auto-drop must NOT be checked by default');
      assert.ok(!/<input id="spamOptLightweightGmail"[^>]*checked/i.test(htmlNow), 'Lightweight HTML rewrite must NOT be checked by default');
      assert.ok(jsNow.includes('isOfficialGmailTabUrl') && jsNow.includes('PRODUCTION_CSV_NOT_ALLOWED_IN_TEST_MAILBOXES') && jsNow.includes('OWNER_OBSERVED_INBOX_PROMOTIONS'));
      checks += 4;
      console.log('PASS 13: RC10 genuine brand/Reply-To preservation, neutral MIME + quoted-printable/plain-text mode, official URL & metric semantics verified');
    }

    // ===== PASS 14: RC11 Gmail Native MIME Architecture (quoted-printable default, RFC 5322 +0000 Date, multipart/related Inline CID, Clickable Image Link Preservation, Clean <div dir="ltr"> HTML, Valid </body> Address Injection, Native Compose URL) =====
    {
      // (a) Default MULTIPART_HTML now uses quoted-printable (eliminates MIME_BASE64_TEXT) & RFC 5322 +0000 Date (no obsolete GMT)
      const qpMulti = Buffer.from(rawGmailMime({
        from: 'owner@gmail.com',
        to: 'rcpt@example.test',
        verifiedFromAddresses: ['owner@gmail.com'],
        displayName: 'Acme Studio',
        subject: 'RC11 Native QP Check',
        html: '<div dir="ltr"><p>Hello = World</p></div>',
        text: 'Hello = World',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok_rc11_qp',
        campaignAuthorized: true,
        recipientEligible: true,
        ledgerIntentPersisted: true
      }), 'base64url').toString('utf8');
      assert.match(qpMulti, /Date: [^\r\n]+\+0000\r\n/);
      assert.ok(!/Date: [^\r\n]+GMT\r\n/.test(qpMulti), 'Must use RFC 5322 +0000 timezone instead of obsolete GMT');
      assert.match(qpMulti, /Content-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable/);
      assert.match(qpMulti, /Content-Type: text\/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable/);
      assert.ok(!qpMulti.includes('Content-Transfer-Encoding: base64'), 'Text/HTML must NOT default to base64');

      // (b) Inline CID embedder: converts high-risk raw.githubusercontent.com image -> multipart/related CID while preserving <a href="..."> wrapper!
      // Minimal valid 1x1 PNG bytes
      const tinyPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
      const mockImgFetch = async (urlStr) => {
        if (String(urlStr).includes('bad-svg')) {
          return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('<svg><script>alert(1)</script></svg>', 'utf8') };
        }
        return { ok: true, status: 200, arrayBuffer: async () => tinyPng };
      };
      const rawPromoHtml = '<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#f3f5f8"><div style="display:none;font-size:1px;max-height:0;overflow:hidden">Hidden Preheader</div><table role="presentation" width="100%" style="background:#f3f5f8"><tr><td><table role="presentation" width="600" style="background:#fff"><tr><td><h1>Welcome</h1><a href="https://acme-brand.example/offer" target="_blank"><img src="https://raw.githubusercontent.com/acme/assets/main/hero.png" alt="Hero"></a><p>Real message body here.</p></td></tr></table></td></tr></table></body></html>';

      const nativeHtml = buildGmailNativeCleanHtml(rawPromoHtml);
      assert.ok(nativeHtml.startsWith('<div dir="ltr"'), 'Gmail Native Clean HTML must use native <div dir="ltr"> container');
      assert.ok(!nativeHtml.includes('display:none'), 'Hidden 1px preheader div must be stripped');
      assert.ok(!nativeHtml.includes('<table'), 'Outer presentation newsletter table chrome must be removed');
      assert.ok(nativeHtml.includes('href="https://acme-brand.example/offer"'), 'Clickable image link <a href> MUST be preserved');
      assert.ok(nativeHtml.includes('raw.githubusercontent.com/acme/assets/main/hero.png'), 'Image tag MUST be preserved before CID embedding');

      const cidEmbed = await embedHtmlImagesAsCid(nativeHtml, { fetchImpl: mockImgFetch, trustedTestMode: true });
      assert.equal(cidEmbed.embeddedCount, 1);
      assert.deepEqual(cidEmbed.replacedHosts, ['raw.githubusercontent.com']);
      assert.ok(!cidEmbed.html.includes('raw.githubusercontent.com'), 'raw.githubusercontent.com URL must be eliminated from sent HTML');
      assert.ok(cidEmbed.html.includes('href="https://acme-brand.example/offer"'), 'Clickable <a href> around CID image MUST remain intact');
      assert.match(cidEmbed.html, /<img\b[^>]*src="cid:ii_[a-f0-9]{14}"/);

      // SVG disguised as image must be rejected fail-closed (fallback leaves original URL, 0 CID embedded)
      const svgRes = await embedHtmlImagesAsCid('<img src="https://example.test/bad-svg.png">', { fetchImpl: mockImgFetch, trustedTestMode: true });
      assert.equal(svgRes.embeddedCount, 0);
      assert.equal(svgRes.failedCount, 1);
      assert.ok(svgRes.failedReasons.includes('INVALID_IMAGE_SIGNATURE'));

      // (c) End-to-end Gmail self-test with GMAIL_NATIVE_HTML + inline CID + physical address inside closing tag (zero trailing tags outside </html>!)
      const dirRc11 = path.join(tmpRoot, 'rc11_native_mime');
      const pipeRc11 = new EmailProductionPipeline({ stateDir: dirRc11, trustedTestMode: true });
      const vaultRc11 = new GmailAccountVault({ stateDir: dirRc11, trustedTestMode: true, cryptoBox: box });
      vaultRc11.upsertMockAccountForTest({ email: 'rc11@gmail.com', cap24h: 20 });
      const acctRc11 = vaultRc11.listAccountsSafe()[0];
      let capturedRc11Mime = '';
      const mockGmailRc11 = async (url, init) => {
        const body = JSON.parse(init.body);
        capturedRc11Mime = Buffer.from(body.raw, 'base64url').toString('utf8');
        return { ok: true, status: 200, json: async () => ({ id: 'gm_rc11_1', threadId: 'thr_rc11_1' }) };
      };
      const runnerRc11 = new GmailCampaignRunner({ stateDir: dirRc11, pipeline: pipeRc11, vault: vaultRc11, trustedTestMode: true, syncFetchImpl: okSyncFetch });
      const selfRc11 = await runnerRc11.sendGmailSelfTest({
        accountId: acctRc11.id,
        to: 'rc11-target@example.test',
        displayName: 'Acme Studio',
        subject: 'RC11 Native Inline CID Test',
        html: rawPromoHtml,
        text: 'Welcome. Real message body here.',
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        mimeContentMode: 'GMAIL_NATIVE_HTML',
        embedInlineImages: true,
        ownerApprovedBrand: true,
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'tok_rc11_sync_1234567890',
        fetchImpl: mockGmailRc11,
        syncFetchImpl: okSyncFetch,
        imageFetchImpl: mockImgFetch
      });
      assert.equal(selfRc11.ok, true);
      assert.equal(selfRc11.mimeContentMode, 'GMAIL_NATIVE_HTML');
      assert.equal(selfRc11.mimeHygiene.transferEncoding, 'quoted-printable');
      assert.equal(selfRc11.mimeHygiene.inlineImagesEmbedded, 1);
      assert.deepEqual(selfRc11.mimeHygiene.replacedImageHosts, ['raw.githubusercontent.com']);
      assert.match(capturedRc11Mime, /Content-Type: multipart\/related; boundary="r_[a-f0-9]{32}"/);
      assert.match(capturedRc11Mime, /Content-Type: multipart\/alternative; boundary="b_[a-f0-9]{32}"/);
      assert.match(capturedRc11Mime, /Content-Type: image\/png; name="hero\.png"/);
      assert.match(capturedRc11Mime, /Content-ID: <ii_[a-f0-9]{14}>/);
      assert.match(capturedRc11Mime, /Content-Disposition: inline; filename="hero\.png"/);
      assert.match(capturedRc11Mime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
      assert.ok(!capturedRc11Mime.includes('raw.githubusercontent.com'), 'Sent Gmail MIME must not reference raw.githubusercontent.com');
      assert.ok(!/<\/html>\s*<p/i.test(capturedRc11Mime), 'Physical address must NEVER trail after </html>');

      // (d) Optimizer detects THIRD_PARTY_RAW_IMAGE_HOST_RISK when CID is off & AUTO_FIXED when CID is on; Native Compose URL strictly official
      const optOff = optimizeAndScoreGmailMessage({
        from: 'rc11@gmail.com',
        displayName: 'Acme Studio',
        subject: 'Image Host Test',
        html: '<p>Hi</p><img src="https://raw.githubusercontent.com/a/b/main/c.jpg" alt="c">',
        text: 'Hi',
        embedInlineImages: false,
        mimeContentMode: 'MULTIPART_HTML'
      });
      assert.ok(optOff.signals.some(s => s.code === 'THIRD_PARTY_RAW_IMAGE_HOST_RISK'));
      const optOn = optimizeAndScoreGmailMessage({
        from: 'rc11@gmail.com',
        displayName: 'Acme Studio',
        subject: 'Image Host Test',
        html: rawPromoHtml,
        text: 'Hi',
        embedInlineImages: true,
        mimeContentMode: 'GMAIL_NATIVE_HTML'
      });
      assert.ok(optOn.autoFixesApplied.some(f => f.code === 'AUTO_INLINE_CID_IMAGE_EMBED_READY'));
      assert.ok(optOn.autoFixesApplied.some(f => f.code === 'AUTO_APPLIED_GMAIL_NATIVE_CLEAN_HTML'));
      const composeInfo = buildGmailNativeComposeUrl({ from: 'rc11@gmail.com', to: 'target@example.test', subject: 'Hi', body: 'Hello' });
      assert.equal(composeInfo.ok, true);
      assert.equal(isOfficialGmailWebUrl(composeInfo.composeUrl), true);
      assert.ok(composeInfo.composeUrl.includes('view=cm'));

      const htmlRc11 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsRc11 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      assert.ok(htmlRc11.includes('value="GMAIL_NATIVE_HTML"') && htmlRc11.includes('id="spamOptEmbedInlineCid"') && htmlRc11.includes('id="btnOpenGmailNativeCompose"'));
      assert.ok(jsRc11.includes('ctaLinkUrl') && jsRc11.includes('embedInlineImages') && jsRc11.includes('btnOpenGmailNativeCompose'));
      checks += 4;
      console.log('PASS 14: RC11 Gmail Native MIME (quoted-printable, RFC 5322 +0000, multipart/related CID, clickable image link, clean <div dir="ltr">, valid </body> footer & official compose helper) verified');
    }

    // ===== PASS 15: RC12 Show-Original Root-Cause Fixes (HTML Entity Double-Escape, Trailing ) Auto-Link, Lightweight Image Preservation, Language-Matched Footers, Promo/Emoji/ALL-CAPS/Local-Part Signals) =====
    {
      // (a) HTML entity decoding & trailing-punctuation URL auto-link fix (zero literal can&#39;t or broken href="https://.../)")
      assert.equal(decodeHtmlEntities('We can&#39;t wait &mdash; &ldquo;welcome&rdquo; &amp; enjoy!'), 'We can\'t wait — “welcome” & enjoy!');
      const plainDecoded = stripHtmlToPlain('<p>We can&#39;t wait to welcome you &mdash; visit <a href="https://acme.example/">Acme Portal</a>.</p>');
      assert.ok(plainDecoded.includes("can't"), 'stripHtmlToPlain must decode &#39; cleanly');
      assert.ok(!plainDecoded.includes('&#39;') && !plainDecoded.includes('&amp;#39;'), 'No raw HTML entities left in text/plain');
      assert.ok(plainDecoded.includes('Acme Portal (https://acme.example/)'));

      const lightHtmlFixed = buildLightweightNaturalHtml("We can&#39;t wait! Visit Acme Portal (https://acme.example/). Also check [https://acme.example/book]!");
      assert.ok(!lightHtmlFixed.includes('&#39;') && !lightHtmlFixed.includes('&amp;#39;'), 'Lightweight HTML must never double-escape &#39; into &amp;#39;');
      assert.ok(lightHtmlFixed.includes("can't"), 'Apostrophe must remain clean human text');
      assert.ok(lightHtmlFixed.includes('<a href="https://acme.example/" style="color:#1a73e8;text-decoration:underline;">https://acme.example/</a>).'), 'Trailing ). MUST stay outside href');
      assert.ok(lightHtmlFixed.includes('<a href="https://acme.example/book" style="color:#1a73e8;text-decoration:underline;">https://acme.example/book</a>]!'), 'Trailing ]! MUST stay outside href');
      assert.ok(!lightHtmlFixed.includes('href="https://acme.example/)"'), 'Broken trailing-paren href regression prevented');

      // (b) preferLightweightHtml=true MUST preserve real user <a><img></a> and allow multipart/related inline CID embedding!
      const tinyPng12 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
      const mockImgFetch12 = async () => ({ ok: true, status: 200, arrayBuffer: async () => tinyPng12 });
      const engPromoTableHtml = '<!doctype html><html><body><div style="display:none">Hidden preview</div><table role="presentation" width="600" style="background:#f3f5f8"><tr><td><a href="https://acme.example/book"><img src="https://raw.githubusercontent.com/acme/assets/main/banner.png" alt="Banner"></a><p>We can&#39;t wait to welcome you to our updated location this season. Visit our booking page for details.</p></td></tr></table></body></html>';
      const lightImgOpt = optimizeAndScoreGmailMessage({
        from: 'owner@gmail.com',
        displayName: 'Acme Studio',
        subject: 'Updated Location Details',
        html: engPromoTableHtml,
        text: "We can't wait to welcome you to our updated location this season. Visit our booking page for details.",
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        preferLightweightHtml: true,
        embedInlineImages: true,
        autoOptimize: true
      });
      assert.equal(lightImgOpt.ok, true);
      assert.ok(lightImgOpt.optimized.html.includes('<img '), 'preferLightweightHtml=true must NEVER strip real user <img> tags');
      assert.ok(lightImgOpt.optimized.html.includes('href="https://acme.example/book"'), 'Clickable image link must stay intact');
      assert.ok(!lightImgOpt.optimized.html.includes('<table') && !lightImgOpt.optimized.html.includes('display:none'));

      // (c) Language-matched unsubscribe & physical address footers (English email -> English footer & Address:; Korean -> Korean footer)
      assert.equal(isPrimarilyEnglishContent('Hello everyone, we are pleased to share our schedule update for this week.', ''), true);
      assert.equal(isPrimarilyEnglishContent('안녕하세요. 이번 주 일정 안내를 드립니다.', ''), false);
      const krFooter = injectUnsubscribeFooter({
        html: '<div dir="ltr"><p>안녕하세요. 이번 주 예약 일정 안내입니다.</p></div>',
        text: '안녕하세요. 이번 주 예약 일정 안내입니다.',
        unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/tok_kr_12'
      });
      assert.ok(krFooter.html.includes('구독 취소(수신 거부)') && krFooter.text.includes('구독 취소(수신 거부)'));

      const dirRc12 = path.join(tmpRoot, 'rc12_lang_and_cid');
      const pipeRc12 = new EmailProductionPipeline({ stateDir: dirRc12, trustedTestMode: true });
      const vaultRc12 = new GmailAccountVault({ stateDir: dirRc12, trustedTestMode: true, cryptoBox: box });
      vaultRc12.upsertMockAccountForTest({ email: 'rc12@gmail.com', cap24h: 20 });
      const acctRc12 = vaultRc12.listAccountsSafe()[0];
      let capturedRc12Mime = '';
      const mockGmailRc12 = async (url, init) => {
        capturedRc12Mime = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
        return { ok: true, status: 200, json: async () => ({ id: 'gm_rc12_1', threadId: 'thr_rc12_1' }) };
      };
      const runnerRc12 = new GmailCampaignRunner({ stateDir: dirRc12, pipeline: pipeRc12, vault: vaultRc12, trustedTestMode: true, syncFetchImpl: okSyncFetch });
      const selfRc12 = await runnerRc12.sendGmailSelfTest({
        accountId: acctRc12.id,
        to: 'rc12-target@example.test',
        displayName: 'Acme Studio',
        subject: 'Acme Studio: New Location Details',
        html: engPromoTableHtml,
        text: "We can't wait to welcome you to our updated location this season. Visit our booking page for details.",
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        preferLightweightHtml: true,
        embedInlineImages: true,
        ownerApprovedBrand: true,
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'tok_rc12_sync_1234567890',
        fetchImpl: mockGmailRc12,
        syncFetchImpl: okSyncFetch,
        imageFetchImpl: mockImgFetch12
      });
      const decodeQpUtf8 = (raw) => {
        const unfolded = String(raw || '').replace(/=\r?\n/g, '');
        const bytes = [];
        for (let i = 0; i < unfolded.length; i++) {
          if (unfolded[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
            bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            const b = Buffer.from(unfolded[i], 'utf8');
            for (const x of b) bytes.push(x);
          }
        }
        return Buffer.from(bytes).toString('utf8');
      };
      const decodedRc12Mime = decodeQpUtf8(capturedRc12Mime);
      assert.equal(selfRc12.ok, true);
      assert.equal(selfRc12.mimeHygiene.inlineImagesEmbedded, 1, 'Inline CID MUST embed even when preferLightweightHtml=true');
      assert.match(capturedRc12Mime, /Content-Type: multipart\/related; boundary="r_[a-f0-9]{32}"/);
      assert.ok(!decodedRc12Mime.includes('raw.githubusercontent.com'), 'raw.githubusercontent.com eliminated from MIME');
      assert.ok(decodedRc12Mime.includes('unsubscribe here') && decodedRc12Mime.includes('Unsubscribe: https://unsubscribe.vivpr.pro/unsubscribe/'), 'English email must get English unsubscribe footer');
      assert.ok(decodedRc12Mime.includes('Address: 200 Native Way, Synthetic City, ZZ 00000'), 'English email must get English Address: label');
      assert.ok(!/[가-힣]/.test(decodedRc12Mime), 'English email MIME must not leak Korean footer text');

      // (d) New RC12 anti-spam signals (Emoji bursts, ALL-CAPS shouting lines, Promo % OFF density, Consumer local-part domain mismatch) & copy softening
      const noisyPromoBody = [
        '🎉✨🎄🎁📸🔥 GRAND REOPENING HOLIDAY SPECIAL!',
        'NEW LOCATION AND NEW LOOK FOR THE SEASON!',
        '20% OFF ALL PACKAGES THIS MONTH!',
        'NOW BOOKING FOR EARLY SESSIONS!',
        'RESERVE YOUR SESSION TODAY!',
        'Visit us at https://acme.plus/ to see more!'
      ].join('\n');
      const rc12Risk = optimizeAndScoreGmailMessage({
        from: 'other-example.com@gmail.com',
        displayName: 'acme.plus',
        subject: 'Acme Plus: Holiday Special!',
        html: `<p>${noisyPromoBody.replace(/\n/g, '<br>')}</p>`,
        text: noisyPromoBody,
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        autoOptimize: true
      });
      const rc12Codes = rc12Risk.signals.map(s => s.code);
      assert.ok(rc12Codes.includes('EXCESSIVE_EMOJI_BURST_RISK'), 'Must detect >=5 emoji bursts');
      assert.ok(rc12Codes.includes('ALL_CAPS_SHOUTING_LINES_RISK'), 'Must detect >=3 ALL-CAPS shouting lines');
      assert.ok(rc12Codes.includes('PROMOTIONAL_DISCOUNT_DENSITY_RISK'), 'Must detect heavy promo % OFF / urgency / ! bursts');
      assert.ok(rc12Codes.includes('SENDER_LOCALPART_DOMAIN_MISMATCH_RISK'), 'Must detect consumer @gmail.com local-part brand domain mismatch');
      const promoChecklistItem = rc12Risk.checklist.find(c => c.id === 'PROMO_STYLE_EMOJI_CAPS_HYGIENE');
      assert.ok(promoChecklistItem && promoChecklistItem.status === 'ACTION_REQUIRED');

      const softenedPromo = softenSpamPhrasesInCopy(noisyPromoBody, false);
      assert.equal(countAllCapsLines(softenedPromo), 0, 'Copy softener must de-shout ALL-CAPS lines');
      assert.ok(countEmojiPictographs(softenedPromo) <= 1, 'Copy softener must trim excessive emoji bursts');
      assert.ok(/20% savings/i.test(softenedPromo) && /Booking open/i.test(softenedPromo));
      assert.ok(softenedPromo.includes('https://acme.plus/'), 'URLs must remain intact during copy softening');
      checks += 4;
      console.log('PASS 15: RC12 Show-Original root-cause fixes (entity decode, trailing ) link, lightweight image/CID preservation, EN/KR footer language match, promo/emoji/ALL-CAPS/local-part signals) verified');
    }

    // ===== PASS 16: RC13 Gmail Domain/Unsubscribe Unification, Auto Promo-to-Text Conversion & Full Campaign Save/Load Store =====
    {
      // (a) Public HTTPS custom unsubscribe URL validation (supports custom brand domain, blocks private/http/creds)
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://unsubscribe.acme.plus'), true);
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://unsubscribe.vivpr.pro'), true);
      assert.equal(isValidPublicHttpsUnsubscribeBase('http://unsubscribe.acme.plus'), false);
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://127.0.0.1:18990'), false);
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://localhost/unsub'), false);
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://10.0.0.5'), false);
      assert.equal(isValidPublicHttpsUnsubscribeBase('https://user:pass@unsubscribe.acme.plus'), false);

      // (b) Gmail Domain Config save, alignment check, custom unsubscribe live send + DNS-pending safe fallback + strict fail-closed
      const dirRc13 = path.join(tmpRoot, 'rc13_domain_promo_store');
      const pipeRc13 = new EmailProductionPipeline({ stateDir: dirRc13, trustedTestMode: true });
      pipeRc13.saveUnsubscribePublicConfig({ publicBaseUrl: 'https://unsubscribe.vivpr.pro' });
      fs.writeFileSync(path.join(dirRc13, '.unsubscribe_sync_token'), 'tok_rc13_sync_1234567890\n', { mode: 0o600 });
      const vaultRc13 = new GmailAccountVault({ stateDir: dirRc13, trustedTestMode: true, cryptoBox: box });
      vaultRc13.upsertMockAccountForTest({ email: 'hello@acme.plus', cap24h: 30, type: 'workspace_paid' });
      const acctRc13 = vaultRc13.listAccountsSafe()[0];
      const runnerRc13 = new GmailCampaignRunner({ stateDir: dirRc13, pipeline: pipeRc13, vault: vaultRc13, trustedTestMode: true, syncFetchImpl: okSyncFetch });

      const badDomain = runnerRc13.saveGmailDomainConfig({ brandDomain: 'acme.plus', unsubscribeBaseUrl: 'http://insecure.acme.plus' });
      assert.equal(badDomain.ok, false);
      assert.equal(badDomain.reason, 'INVALID_GMAIL_UNSUBSCRIBE_BASE_URL');

      const savedDom = runnerRc13.saveGmailDomainConfig({
        brandDomain: 'acme.plus',
        unsubscribeBaseUrl: 'https://unsubscribe.acme.plus',
        defaultDisplayName: 'Acme Plus',
        defaultWebsiteUrl: 'https://acme.plus',
        fallbackToDefaultIfDnsPending: true
      });
      assert.equal(savedDom.ok, true);
      assert.equal(savedDom.config.brandDomain, 'acme.plus');
      assert.equal(savedDom.config.unsubscribeBaseUrl, 'https://unsubscribe.acme.plus');

      const alignCheck = await runnerRc13.checkGmailDomainAlignment({
        dnsResolver: async (host, rr) => {
          if (host === 'acme.plus' && rr === 'TXT') return ['v=spf1 include:_spf.google.com ~all'];
          if (host === '_dmarc.acme.plus' && rr === 'TXT') return { error: 'ENOTFOUND' };
          if (host === 'unsubscribe.acme.plus' && rr === 'CNAME') return ['target.up.railway.app'];
          return { error: 'ENOTFOUND' };
        },
        fetchImpl: async (url) => {
          if (String(url) === 'https://unsubscribe.acme.plus/health') {
            return { ok: true, status: 200, json: async () => ({ ok: true, service: 'xpider-unsubscribe', suppressionCount: 42 }) };
          }
          return { ok: false, status: 404, json: async () => ({}) };
        }
      });
      assert.equal(alignCheck.spf.status, 'PASS_GOOGLE_INCLUDED');
      assert.equal(alignCheck.dmarc.status, 'MISSING');
      assert.ok(alignCheck.recommendedRecords.some(r => r.host === '_dmarc.acme.plus' && r.value.includes('v=DMARC1')));
      assert.equal(alignCheck.unsubscribeDns.status, 'RESOLVED');
      assert.equal(alignCheck.unsubscribeHealth.status, 'LIVE_READY');

      // Live send uses custom domain https://unsubscribe.acme.plus when reachable
      let capturedCustomMime = '';
      const selfCustom = await runnerRc13.sendGmailSelfTest({
        accountId: acctRc13.id,
        to: 'rc13-live@example.test',
        displayName: 'Acme Plus',
        subject: 'Acme Plus Update',
        html: '<p>We are happy to share our seasonal schedule update with you. Reply anytime with questions.</p>',
        text: 'We are happy to share our seasonal schedule update with you. Reply anytime with questions.',
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        fetchImpl: async (u, init) => {
          capturedCustomMime = Buffer.from(JSON.parse(init.body).raw, 'base64url').toString('utf8');
          return { ok: true, status: 200, json: async () => ({ id: 'gm_rc13_custom', threadId: 'thr_rc13_1' }) };
        },
        syncFetchImpl: async (u) => {
          if (String(u).startsWith('https://unsubscribe.acme.plus/')) {
            return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [], recorded: true }) };
          }
          throw new Error('UNEXPECTED_HOST:' + u);
        }
      });
      assert.equal(selfCustom.ok, true);
      assert.equal(selfCustom.unsubscribeBaseUsed, 'https://unsubscribe.acme.plus');
      assert.equal(selfCustom.unsubscribeDomainFallback, null);
      assert.ok(capturedCustomMime.includes('List-Unsubscribe: <https://unsubscribe.acme.plus/unsubscribe/'));

      // DNS-pending fallback: when custom host throws ENOTFOUND & fallback=true -> uses default host with explicit notice!
      const selfFallback = await runnerRc13.sendGmailSelfTest({
        accountId: acctRc13.id,
        to: 'rc13-fb@example.test',
        displayName: 'Acme Plus',
        subject: 'Acme Plus Fallback Check',
        html: '<p>We are happy to share our seasonal schedule update with you. Reply anytime with questions.</p>',
        text: 'We are happy to share our seasonal schedule update with you. Reply anytime with questions.',
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'gm_rc13_fb', threadId: 'thr_rc13_2' }) }),
        syncFetchImpl: async (u) => {
          if (String(u).startsWith('https://unsubscribe.acme.plus/')) throw new Error('ENOTFOUND');
          return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [], recorded: true }) };
        }
      });
      assert.equal(selfFallback.ok, true);
      assert.equal(selfFallback.unsubscribeBaseUsed, 'https://unsubscribe.vivpr.pro');
      assert.equal(selfFallback.unsubscribeDomainFallback.reason, 'CUSTOM_UNSUB_DNS_PENDING_SAFE_FALLBACK');

      // Strict mode (fallbackToDefaultIfDnsPending=false) fails closed when custom DNS pending
      runnerRc13.saveGmailDomainConfig({
        brandDomain: 'acme.plus',
        unsubscribeBaseUrl: 'https://unsubscribe.acme.plus',
        fallbackToDefaultIfDnsPending: false
      });
      const selfStrictBlock = await runnerRc13.sendGmailSelfTest({
        accountId: acctRc13.id,
        to: 'rc13-strict@example.test',
        displayName: 'Acme Plus',
        subject: 'Strict Check',
        html: '<p>Schedule update body text with enough natural content for verification.</p>',
        text: 'Schedule update body text with enough natural content for verification.',
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        fetchImpl: async () => { throw new Error('MUST_NOT_SEND'); },
        syncFetchImpl: async () => { throw new Error('ENOTFOUND'); }
      });
      assert.equal(selfStrictBlock.ok, false);
      assert.equal(selfStrictBlock.reason, 'UNSUBSCRIBE_SYNC_UNAVAILABLE');

      // (c) Automatic Promo-to-Text-Based Email Structure Conversion on Gmail Method (clears emoji + ALL-CAPS + promo density signals!)
      const heavyPromoText = [
        '🎉✨🎄🎁📸🔥🌟💫🎊🎈🎀❄️🎅⛄🎉 GRAND REOPENING HOLIDAY SPECIAL!',
        'NEW LOCATION AND NEW LOOK FOR THE HOLIDAY SEASON!',
        '20% OFF ALL PORTRAIT PACKAGES THIS MONTH!',
        'NOW BOOKING FOR EARLY DECEMBER SESSIONS!',
        'LIMITED TIME OFFER FOR RETURNING FAMILIES!',
        'RESERVE YOUR SESSION TODAY!',
        'Learn more at https://acme.plus/book!'
      ].join('\n');
      const heavyPromoHtml = `<table role="presentation" width="600" style="background:#f3f5f8"><tr><td><a href="https://acme.plus/book"><img src="https://raw.githubusercontent.com/acme/assets/main/hero.png" alt="Hero"></a><p>${heavyPromoText.replace(/\n/g, '<br>')}</p></td></tr></table>`;

      const promoWithoutAuto = optimizeAndScoreGmailMessage({
        from: 'hello@acme.plus',
        displayName: 'Acme Plus',
        subject: '🎉 GRAND REOPENING HOLIDAY SPECIAL!!!',
        html: heavyPromoHtml,
        text: heavyPromoText,
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        publicUnsubBase: 'https://unsubscribe.acme.plus',
        autoCalmPromoToTextStyle: false
      });
      const promoWithAuto = optimizeAndScoreGmailMessage({
        from: 'hello@acme.plus',
        displayName: 'Acme Plus',
        subject: '🎉 GRAND REOPENING HOLIDAY SPECIAL!!!',
        html: heavyPromoHtml,
        text: heavyPromoText,
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000',
        publicUnsubBase: 'https://unsubscribe.acme.plus',
        embedInlineImages: true,
        autoCalmPromoToTextStyle: true
      });
      assert.ok(promoWithAuto.autoFixesApplied.some(f => f.code === 'AUTO_CALMED_PROMO_TO_TEXT_STRUCTURE'), 'Must apply automatic promo-to-text structure conversion');
      assert.ok(promoWithAuto.riskScore < promoWithoutAuto.riskScore - 30, 'Auto promo-to-text conversion must substantially lower spam risk score');
      assert.equal(countAllCapsLines(promoWithAuto.optimized.text), 0, 'Zero ALL-CAPS shouting lines remaining');
      assert.equal(countEmojiPictographs(promoWithAuto.optimized.text), 0, 'Zero decorative emoji bursts remaining');
      assert.ok(!promoWithAuto.signals.some(s => s.code === 'EXCESSIVE_EMOJI_BURST_RISK' || s.code === 'ALL_CAPS_SHOUTING_LINES_RISK' || s.code === 'PROMOTIONAL_DISCOUNT_DENSITY_RISK'));
      assert.ok(promoWithAuto.optimized.html.startsWith('<div dir="ltr"') && !promoWithAuto.optimized.html.includes('<table'), 'Converted HTML must be clean text-based <div dir="ltr"> without promo tables');
      assert.ok(promoWithAuto.optimized.html.includes('href="https://acme.plus/book"') && promoWithAuto.optimized.html.includes('<img '), 'User clickable link & image preserved for inline CID');
      const autoCalmItem = promoWithAuto.checklist.find(c => c.id === 'PROMO_STYLE_EMOJI_CAPS_HYGIENE');
      assert.ok(autoCalmItem && autoCalmItem.mode === 'AUTO' && autoCalmItem.status === 'AUTO_FIXED');

      // (d) Full Campaign Store (save/load/delete + secret/approval stripping) + Sidecar HTTP endpoints + Studio UI contracts
      const store = new EmailCampaignStore({ stateDir: dirRc13, trustedTestMode: true });
      const savedCamp = store.saveCampaign({
        id: 'camp_holiday_2026',
        name: 'Holiday Reopening Campaign',
        provider: 'GMAIL',
        campaignId: 'camp_hol_1',
        apiKey: 're_SHOULD_BE_STRIPPED_12345678',
        refreshToken: '1//SHOULD_BE_STRIPPED_TOKEN',
        consentAttest: true,
        ownerExplicitApproval: true,
        template: { subject: 'Holiday Update', body: 'Clean text body', link: 'https://acme.plus' },
        recipients: { recipientCsv: 'email,name\na@example.test,Alice' },
        deliverability: { spamOptAutoCalmPromo: true, emailMimeContentMode: 'GMAIL_NATIVE_HTML' },
        gmail: { sendingMode: 'SINGLE_ACCOUNT', replyTo: 'hello@acme.plus' }
      });
      assert.equal(savedCamp.ok, true);
      const serializedSaved = JSON.stringify(savedCamp.campaign);
      assert.ok(!serializedSaved.includes('re_SHOULD_BE_STRIPPED') && !serializedSaved.includes('1//SHOULD_BE_STRIPPED') && !serializedSaved.includes('consentAttest') && !serializedSaved.includes('ownerExplicitApproval'), 'Secrets and human approval flags MUST be stripped from saved campaigns');
      assert.equal(store.listCampaigns().count, 1);
      assert.equal(store.listCampaigns().campaigns[0].template.subject, 'Holiday Update');
      assert.equal(store.deleteCampaign('camp_holiday_2026').deleted, true);
      assert.equal(store.listCampaigns().count, 0);

      // Sidecar HTTP contracts for /email/campaigns/saved* and /email/gmail/domain-config*
      const sc13Port = 19350 + (process.pid % 2200);
      const sc13Dir = path.join(tmpRoot, 'sidecar_rc13');
      const sc13 = new EmailTestSidecar({ port: sc13Port, stateDir: sc13Dir, trustedTestMode: true, gmailCryptoBox: box });
      await sc13.start();
      try {
        const tok13 = fs.readFileSync(path.join(sc13Dir, '.email_sidecar_token'), 'utf8').trim();
        assert.equal((await fetch(`http://127.0.0.1:${sc13.port}/email/campaigns/saved`)).status, 401);
        assert.equal((await fetch(`http://127.0.0.1:${sc13.port}/email/gmail/domain-config`)).status, 401);

        const svRes = await fetch(`http://127.0.0.1:${sc13.port}/email/campaigns/saved/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok13}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'camp_http_1', name: 'HTTP Saved', provider: 'GMAIL', template: { subject: 'S1', body: 'B1' } })
        });
        assert.equal(svRes.status, 200);
        const listRes = await (await fetch(`http://127.0.0.1:${sc13.port}/email/campaigns/saved`, { headers: { Authorization: `Bearer ${tok13}` } })).json();
        assert.equal(listRes.ok, true);
        assert.equal(listRes.count, 1);

        const domSv = await fetch(`http://127.0.0.1:${sc13.port}/email/gmail/domain-config`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok13}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandDomain: 'acme.plus', unsubscribeBaseUrl: 'https://unsubscribe.acme.plus', defaultDisplayName: 'Acme Plus' })
        });
        assert.equal(domSv.status, 200);
        const domGet = await (await fetch(`http://127.0.0.1:${sc13.port}/email/gmail/domain-config`, { headers: { Authorization: `Bearer ${tok13}` } })).json();
        assert.equal(domGet.config.brandDomain, 'acme.plus');
        assert.equal(domGet.config.unsubscribeBaseUrl, 'https://unsubscribe.acme.plus');
      } finally {
        await sc13.stop();
      }

      // Studio UI & background.js RC13 wiring + banned term guard
      const htmlRc13 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsRc13 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      const bgRc13 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
      assert.ok(htmlRc13.includes('id="fullCampaignManagerBox"') && htmlRc13.includes('id="btnSaveFullCampaign"') && htmlRc13.includes('id="btnLoadFullCampaign"') && htmlRc13.includes('id="btnExportFullCampaignJson"') && htmlRc13.includes('id="btnImportFullCampaignJson"'));
      assert.ok(htmlRc13.includes('id="spamOptAutoCalmPromo"') && htmlRc13.includes('id="gmailAutoCalmPromo"') && htmlRc13.includes('id="gmailDomainUnifyBox"') && htmlRc13.includes('id="btnSaveGmailDomainConfig"') && htmlRc13.includes('id="btnCheckGmailDomainAlignment"'));
      assert.ok(jsRc13.includes('collectFullCampaignSnapshot') && jsRc13.includes('applyFullCampaignSnapshot') && jsRc13.includes('autoCalmPromoToTextStyle') && jsRc13.includes('SAVE_GMAIL_DOMAIN_CONFIG') && jsRc13.includes('SAVE_FULL_CAMPAIGN'));
      assert.ok(bgRc13.includes('LIST_SAVED_CAMPAIGNS') && bgRc13.includes('SAVE_FULL_CAMPAIGN') && bgRc13.includes('SAVE_GMAIL_DOMAIN_CONFIG') && bgRc13.includes('CHECK_GMAIL_DOMAIN_ALIGNMENT'));
      assert.ok(!htmlRc13.includes('동의원장') && !jsRc13.includes('동의원장'));
      checks += 4;
      console.log('PASS 16: RC13 Gmail domain/unsubscribe unification, automatic promo-to-text structure conversion & full campaign save/load store verified');
    }

    // ===== PASS 17: RC14 Multi-Account Gmail Native Web Compose Default Engine (Warmup Caps, Fixed Assignment, Zero Hopping, Pacing Cooldown, Cross-Provider Suppression, Official URL Only, Warning Hard-Pause) =====
    {
      const dirRc14 = path.join(tmpRoot, 'rc14_web_compose');
      const pipeRc14 = new EmailProductionPipeline({ stateDir: dirRc14, trustedTestMode: true });
      pipeRc14.saveUnsubscribePublicConfig({ publicBaseUrl: 'https://unsubscribe.acme.plus' });
      fs.writeFileSync(path.join(dirRc14, '.unsubscribe_sync_token'), 'tok_rc14_sync_1234567890\n', { mode: 0o600 });
      pipeRc14.outbox.suppress('suppressed_wc@example.test', 'UNSUBSCRIBED');

      const vaultRc14 = new GmailAccountVault({ stateDir: dirRc14, trustedTestMode: true, cryptoBox: box });
      let fakeNow = Date.parse('2026-11-24T10:00:00Z');
      const runnerRc14 = new GmailCampaignRunner({ stateDir: dirRc14, pipeline: pipeRc14, vault: vaultRc14, trustedTestMode: true, nowFn: () => fakeNow, syncFetchImpl: okSyncFetch });
      const wcEngine = new GmailWebComposeEngine({ stateDir: dirRc14, pipeline: pipeRc14, gmailRunner: runnerRc14, trustedTestMode: true, nowFn: () => fakeNow });

      // (a) Register 2 owned accounts with Warmup anti-suspension presets (personal NEW_WARMUP + workspace WARMING)
      const a1 = wcEngine.addOrUpdateAccount({ email: 'sender1@gmail.com', label: 'Acct1', warmupStage: 'NEW_WARMUP' });
      const a2 = wcEngine.addOrUpdateAccount({ email: 'hello@acme.plus', label: 'Workspace1', warmupStage: 'WARMING' });
      assert.equal(a1.ok, true);
      assert.equal(a2.ok, true);
      assert.equal(a2.accounts.length, 2);
      assert.equal(a2.accounts[0].cap24h, WARMUP_PRESETS.gmail_personal.NEW_WARMUP.cap24h);
      assert.equal(a2.accounts[0].minSpacingSec, WARMUP_PRESETS.gmail_personal.NEW_WARMUP.minSpacingSec);
      assert.equal(a2.accounts[1].type, 'workspace_paid');
      assert.equal(a2.accounts[1].cap24h, WARMUP_PRESETS.workspace_paid.WARMING.cap24h);

      // Header injection rejected fail-closed
      assert.equal(wcEngine.addOrUpdateAccount({ email: 'bad@gmail.com\r\nBcc:x@y.com' }).ok, false);

      // (b) Prepare queue: suppresses cross-provider address & deterministically assigns remaining recipients across 2 owned accounts
      const prep = wcEngine.prepareWebComposeQueue({
        csvText: 'email,name\nsuppressed_wc@example.test,Sup\nr1@example.test,R1\nr2@example.test,R2\nr3@example.test,R3\nr4@example.test,R4',
        campaignId: 'camp_wc_14',
        consentAttested: true,
        physicalAddress: '200 Native Way, Synthetic City, ZZ 00000'
      });
      assert.equal(prep.ok, true);
      assert.equal(prep.status.queue.counts.SKIPPED_SUPPRESSED_CROSS_PROVIDER, 1);
      assert.equal(prep.status.queue.counts.PENDING, 4);

      // (c) Issue batch of 2 -> opens 1 per distinct owned account (strictly official mail.google.com/?view=cm&authuser=...) + auto-calms promo copy!
      const b1 = await wcEngine.issueNextComposeBatch({
        subject: '🎉 GRAND REOPENING HOLIDAY SPECIAL!!!',
        html: '<p>🎉✨🎄🎁📸🔥 GRAND REOPENING HOLIDAY SPECIAL!<br>NEW LOCATION AND NEW LOOK!<br>20% OFF ALL PACKAGES!<br>NOW BOOKING!<br>RESERVE YOUR SESSION TODAY!</p>',
        text: '🎉✨🎄🎁📸🔥 GRAND REOPENING HOLIDAY SPECIAL!\nNEW LOCATION AND NEW LOOK!\n20% OFF ALL PACKAGES!\nNOW BOOKING!\nRESERVE YOUR SESSION TODAY!',
        maxBatch: 2,
        autoCalmPromoToTextStyle: true,
        syncFetchImpl: okSyncFetch
      });
      assert.equal(b1.ok, true);
      assert.equal(b1.issued.length, 2, 'Should issue 1 compose tab per distinct owned account');
      assert.notEqual(b1.issued[0].accountId, b1.issued[1].accountId, 'Must never issue 2 simultaneous tabs to the same account');
      assert.equal(isOfficialGmailWebUrl(b1.issued[0].composeUrl), true);
      assert.ok(b1.issued[0].composeUrl.includes('view=cm') && b1.issued[0].composeUrl.includes('authuser=sender1%40gmail.com'));
      assert.ok(b1.issued[1].composeUrl.includes('authuser=hello%40acme.plus'));
      assert.equal(b1.issued[0].autoCalmedPromo, true, 'Promo copy must be auto-calmed to conversational text before compose');
      assert.ok(b1.issued[0].unsubscribeUrlUsed && b1.issued[0].unsubscribeUrlUsed.startsWith('https://unsubscribe.acme.plus/unsubscribe/'));

      // Immediate back-to-back call MUST respect pacing cooldown (zero rapid-fire ban trigger!)
      const tooFast = await wcEngine.issueNextComposeBatch({ subject: 'Hi', text: 'Clean hello body text for testing pacing guard.', maxBatch: 2, syncFetchImpl: okSyncFetch });
      assert.equal(tooFast.ok, false);
      assert.ok(tooFast.reason === 'ACCOUNT_1M_CAP_REACHED' || tooFast.reason === 'PACING_COOLDOWN_WAIT');

      // Confirm sent + advance clock past 90s spacing -> next recipients open cleanly
      const conf1 = wcEngine.markComposeItemResult({ entryId: b1.issued[0].entryId, result: 'OPERATOR_CONFIRMED_SENT' });
      assert.equal(conf1.ok, true);
      assert.equal(conf1.status.queue.counts.OPERATOR_CONFIRMED_SENT, 1);

      // Account warning triggers 24h protective cooldown + PAUSES ENTIRE CAMPAIGN (zero account hopping!)
      const warnRes = wcEngine.markComposeItemResult({ entryId: b1.issued[1].entryId, result: 'ACCOUNT_WARNING_PAUSE', warningNote: 'GMAIL_TEMP_LIMIT' });
      assert.equal(warnRes.ok, true);
      assert.equal(warnRes.pausedAll, true);
      assert.equal(warnRes.status.queue.enforcementPaused, true);
      fakeNow += 120 * 1000;
      const blockedAfterWarn = await wcEngine.issueNextComposeBatch({ subject: 'Hi', text: 'Must remain paused', maxBatch: 1, syncFetchImpl: okSyncFetch });
      assert.equal(blockedAfterWarn.ok, false);
      assert.equal(blockedAfterWarn.reason, 'ACCOUNT_WARNING_PROTECTION_PAUSE_ALL');

      // (d) Sidecar HTTP auth + Studio HTML/JS/manifest policy contracts (default GMAIL_WEB_COMPOSE_ASSISTED, ZERO mail.google.com manifest host permission!)
      const sc14Port = 19400 + (process.pid % 2000);
      const sc14Dir = path.join(tmpRoot, 'sidecar_rc14');
      const sc14 = new EmailTestSidecar({ port: sc14Port, stateDir: sc14Dir, trustedTestMode: true, gmailCryptoBox: box });
      await sc14.start();
      try {
        const tok14 = fs.readFileSync(path.join(sc14Dir, '.email_sidecar_token'), 'utf8').trim();
        assert.equal((await fetch(`http://127.0.0.1:${sc14.port}/email/gmail/web-compose/status`)).status, 401);
        const addR = await fetch(`http://127.0.0.1:${sc14.port}/email/gmail/web-compose/accounts/save`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok14}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'pool1@gmail.com', label: 'P1', warmupStage: 'NEW_WARMUP' })
        });
        assert.equal(addR.status, 200);
        const stR = await (await fetch(`http://127.0.0.1:${sc14.port}/email/gmail/web-compose/status`, { headers: { Authorization: `Bearer ${tok14}` } })).json();
        assert.equal(stR.ok, true);
        assert.equal(stR.mode, 'GMAIL_WEB_COMPOSE_ASSISTED');
        assert.equal(stR.accounts.length, 1);
      } finally {
        await sc14.stop();
      }

      const htmlRc14 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'index.html'), 'utf8');
      const jsRc14 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'email-studio', 'email-template-studio.js'), 'utf8');
      const bgRc14 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
      const mfRc14 = fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8');
      assert.ok(htmlRc14.includes('id="gmailDispatchMode"') && htmlRc14.includes('value="GMAIL_WEB_COMPOSE_ASSISTED" selected') && htmlRc14.includes('id="gmailWebComposePanel"') && htmlRc14.includes('id="btnOpenNextWebComposeBatch"') && htmlRc14.includes('id="btnCopyRichHtmlForGmailCompose"'));
      assert.ok(jsRc14.includes('syncGmailDispatchModeUI') && jsRc14.includes('GET_GMAIL_WEB_COMPOSE_STATUS') && jsRc14.includes('NEXT_GMAIL_WEB_COMPOSE_BATCH') && jsRc14.includes('btnCopyRichHtmlForGmailCompose'));
      assert.ok(bgRc14.includes('GET_GMAIL_WEB_COMPOSE_STATUS') && bgRc14.includes('NEXT_GMAIL_WEB_COMPOSE_BATCH') && bgRc14.includes('MARK_GMAIL_WEB_COMPOSE_ITEM'));
      assert.ok(!/mail\.google\.com/i.test(mfRc14), 'Manifest MUST still have zero mail.google.com host permission (no DOM scraping)');
      const bannedTermRc14 = ['동의', '원장'].join('');
      assert.ok(!htmlRc14.includes(bannedTermRc14) && !jsRc14.includes(bannedTermRc14));
      checks += 4;
      console.log('PASS 17: RC14 multi-account Gmail Native Web Compose default engine (warmup caps, fixed assignment, zero hopping, pacing guard, cross-provider suppression, official URL & zero DOM scraping) verified');
    }

    console.log(`XPIDER V7.1 Gmail Safe Delivery Engine suite: ${checks}/${checks} PASS; ZERO REAL SENDS`);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

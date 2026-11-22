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
const { GmailSendBlocked, rawGmailMime } = require('../companion/gmail-sender-foundation');
const { AdaptiveThrottleController, assessDeliverabilityHygiene } = require('../companion/gmail-safe-delivery-engine');
const { optimizeAndScoreGmailMessage, optimizeAndScoreEmailMessage, buildGmailSpamSearchHelper, buildMultiAccountGmailSpamHelpers } = require('../companion/gmail-deliverability-optimizer');
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

    console.log(`XPIDER V7.1 Gmail Safe Delivery Engine suite: ${checks}/${checks} PASS; ZERO REAL SENDS`);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

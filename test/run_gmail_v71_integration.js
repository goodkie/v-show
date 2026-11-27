'use strict';
/**
 * XPIDER V7.1 Gmail Integration Contract Suite (100% Mocked, ZERO Real Outbound Emails).
 * Verifies Directive #7047833293 Gates (A)-(G) & (I).
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GmailAccountVault, GMAIL_SEND_SCOPE } = require('../companion/gmail-account-vault');
const { GmailCampaignRunner } = require('../companion/gmail-campaign-runner');
const { EmailProductionPipeline } = require('../companion/email-production-pipeline');
const { CampaignAnalyticsEngine, sha256Hex } = require('../companion/email-campaign-analytics');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');

function makeTestCryptoBox(secretSalt = 'box-key-1') {
  return {
    encrypt(plain) {
      const b64 = Buffer.from(secretSalt + '::' + plain, 'utf8').toString('base64');
      return 'testbox:' + b64;
    },
    decrypt(cipherRef) {
      if (!String(cipherRef || '').startsWith('testbox:')) return '';
      const raw = Buffer.from(cipherRef.slice('testbox:'.length), 'base64').toString('utf8');
      if (!raw.startsWith(secretSalt + '::')) return ''; // simulates different-machine DPAPI failure!
      return raw.slice((secretSalt + '::').length);
    }
  };
}

function makeFakeIdToken(payloadObj) {
  const hdr = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  return `${hdr}.${body}.sig`;
}

(async function run() {
  let checks = 0;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-gmail-v71-'));
  try {
    // ===== 1. OAuth PKCE Flow, Scope Minimization, DPAPI Encryption & New-Machine Reprovision =====
    {
      const dir = path.join(tmpRoot, 'oauth_vault');
      const box1 = makeTestCryptoBox('machine-A');
      let tokenPostBody = '';
      const mockFetch = async (url, init) => {
        if (String(url) === 'https://oauth2.googleapis.com/token') {
          tokenPostBody = String(init.body || '');
          if (tokenPostBody.includes('code=OVERBROAD_CODE')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                access_token: 'ya29.synthetic_broad',
                refresh_token: '1//synthetic_broad',
                scope: `${GMAIL_SEND_SCOPE} https://www.googleapis.com/auth/gmail.readonly`,
                expires_in: 3600
              })
            };
          }
          if (tokenPostBody.includes('grant_type=refresh_token')) {
            return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'ya29.synthetic_access_token_secret_abc',
              refresh_token: '1//synthetic_refresh_token_secret_xyz',
              scope: `${GMAIL_SEND_SCOPE} openid email`,
              expires_in: 3600,
              id_token: makeFakeIdToken({ email: 'OwnerSender@Gmail.com', email_verified: true })
            })
          };
        }
        if (String(url).startsWith('https://oauth2.googleapis.com/revoke')) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };

      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, fetchImpl: mockFetch, cryptoBox: box1 });
      // Must fail closed without userConsentConfirmed
      const noConsent = vault.saveOAuthClientConfig({ clientId: '1234567890-abc.apps.googleusercontent.com', userConsentConfirmed: false });
      assert.equal(noConsent.ok, false);
      assert.equal(noConsent.reason, 'USER_CONSENT_REQUIRED');

      const savedClient = vault.saveOAuthClientConfig({
        clientId: '1234567890-abc.apps.googleusercontent.com',
        clientSecret: 'GOCSPX-synthetic-client-secret-999',
        userConsentConfirmed: true
      });
      assert.equal(savedClient.ok, true);
      // Verify secret is NOT stored in plaintext on disk
      const rawClientDisk = fs.readFileSync(path.join(dir, '.gmail_oauth_client.dpapi.json'), 'utf8');
      assert.ok(!rawClientDisk.includes('GOCSPX-synthetic-client-secret-999'), 'Client secret must NEVER be plaintext on disk');

      // PKCE S256 start & reject overbroad gmail.readonly scope
      const stBroad = await vault.startOAuthPkceFlow({ startLoopbackServer: false });
      assert.equal(stBroad.ok, true);
      assert.ok(stBroad.authUrl.includes('code_challenge_method=S256'));
      assert.ok(stBroad.authUrl.includes(encodeURIComponent(GMAIL_SEND_SCOPE)));
      const broadRes = await vault.completeOAuthCallback({ state: stBroad.state, code: 'OVERBROAD_CODE' });
      assert.equal(broadRes.ok, false);
      assert.equal(broadRes.reason, 'FORBIDDEN_OVERBROAD_GMAIL_SCOPE_REJECTED');

      // Valid minimal-scope PKCE exchange
      const stOk = await vault.startOAuthPkceFlow({ startLoopbackServer: false });
      const okRes = await vault.completeOAuthCallback({ state: stOk.state, code: 'VALID_PKCE_CODE' });
      assert.equal(okRes.ok, true);
      assert.equal(okRes.account.maskedEmail, 'ow***@gmail.com');
      assert.equal(okRes.account.cap24h, 50); // conservative default strictly < 500
      assert.equal(okRes.account.status, 'CONNECTED');
      // Verify zero plaintext tokens on disk AND zero tokens in safe projection
      const rawVaultDisk = fs.readFileSync(path.join(dir, '.gmail_accounts_vault.dpapi.json'), 'utf8');
      assert.ok(!rawVaultDisk.includes('ya29.synthetic_access_token_secret_abc'), 'Access token must NOT be plaintext on disk');
      assert.ok(!rawVaultDisk.includes('1//synthetic_refresh_token_secret_xyz'), 'Refresh token must NOT be plaintext on disk');
      const safeJson = JSON.stringify(vault.listAccountsSafe());
      assert.ok(!safeJson.includes('ya29.') && !safeJson.includes('1//') && !safeJson.includes('ownersender@gmail.com'), 'Safe account list must mask email and omit all tokens');

      // Reject cap >= published ceiling (500 for personal)
      const badCap = vault.updateAccountSettings({ accountId: okRes.account.id, cap24h: 500 });
      assert.equal(badCap.ok, false);
      assert.equal(badCap.reason, 'CONSERVATIVE_CAP_REQUIRED_BELOW_PUBLISHED_CEILING');

      // New-machine DPAPI decryption failure marks NEEDS_RECONNECT_NEW_MACHINE cleanly
      const boxOtherPc = makeTestCryptoBox('machine-B-new-pc');
      const vaultNewPc = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, fetchImpl: mockFetch, cryptoBox: boxOtherPc });
      await assert.rejects(() => vaultNewPc.getValidAccessToken(okRes.account.id), e => e.code === 'DPAPI_REPROVISION_REQUIRED');
      assert.equal(vaultNewPc.listAccountsSafe()[0].status, 'NEEDS_RECONNECT_NEW_MACHINE');
      checks += 5;
      console.log('PASS 1: OAuth PKCE S256, minimal scope, encrypted vault, masked projection & new-machine DPAPI handling');
    }

    // ===== 2. Authorized One-Account Self-Test + RFC 8058 Unsubscribe E2E (Gates B, F, I) =====
    {
      const dir = path.join(tmpRoot, 'selftest');
      const box = makeTestCryptoBox('self-test-box');
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const analytics = new CampaignAnalyticsEngine({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });
      const acct = vault.upsertMockAccountForTest({ email: 'owner@gmail.com', cap24h: 25 });

      let unsubTokenSynced = false;
      let capturedRawMime = '';
      const mockSyncFetch = async (url, init) => {
        if (String(url).endsWith('/api/sync/suppressions')) {
          return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
        }
        if (String(url).endsWith('/api/sync/tokens')) {
          const b = JSON.parse(init.body);
          assert.ok(b.tokenHash && b.recipientHash);
          unsubTokenSynced = true;
          return { ok: true, status: 200, json: async () => ({ ok: true, recorded: true }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      const mockGmailFetch = async (url, init) => {
        assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
        assert.equal(unsubTokenSynced, true, 'Unsubscribe token MUST be synced to unsubscribe.vivpr.pro BEFORE Gmail POST');
        const body = JSON.parse(init.body);
        capturedRawMime = Buffer.from(body.raw, 'base64url').toString('utf8');
        return { status: 200, json: async () => ({ id: 'gm_selftest_msg_001', threadId: 'gm_thr_001' }) };
      };

      const runner = new GmailCampaignRunner({ stateDir: dir, pipeline, analytics, vault, trustedTestMode: true, fetchImpl: mockGmailFetch, syncFetchImpl: mockSyncFetch });
      const out = await runner.sendGmailSelfTest({
        accountId: acct.id,
        to: 'owner.selftest@example.test',
        displayName: 'Studioberry Plus',
        subject: 'Gmail Self-Test Check',
        html: '<p>Hello Owner</p>',
        text: 'Hello Owner',
        physicalAddress: '123 Studio Way, Seoul',
        recipientConsentConfirmed: true,
        ownerExplicitApproval: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890'
      });
      assert.equal(out.ok, true);
      assert.equal(out.status, 'GMAIL_API_ACCEPTED');
      assert.equal(out.delivery, 'UNKNOWN');
      assert.equal(out.inbox, 'UNKNOWN');
      assert.equal(out.providerMessageId, 'gm_selftest_msg_001');
      assert.match(capturedRawMime, /List-Unsubscribe: <https:\/\/unsubscribe\.vivpr\.pro\/unsubscribe\//);
      assert.match(capturedRawMime, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
      assert.match(capturedRawMime, /Content-Type: multipart\/alternative/);
      // Rolling 24h usage incremented to 1
      assert.equal(vault.listAccountsSafe()[0].sent24h, 1);
      checks += 3;
      console.log('PASS 2: Authorized one-account Gmail self-test + RFC 8058 unsubscribe E2E + honest GMAIL_API_ACCEPTED status');
    }

    // ===== 3. Two-Account Allocation + Cross-Provider Suppression + Elevated Bounce Guard + Zero Account Hopping (Gates C, D, E) =====
    {
      const dir = path.join(tmpRoot, 'pool_and_guard');
      const box = makeTestCryptoBox('pool-box');
      const pipeline = new EmailProductionPipeline({ stateDir: dir, trustedTestMode: true });
      const analytics = new CampaignAnalyticsEngine({ stateDir: dir, trustedTestMode: true });
      const vault = new GmailAccountVault({ stateDir: dir, trustedTestMode: true, cryptoBox: box });

      // Seed elevated historical Resend bounce history (100 delivered, 60 bounced = 37.5% bounce rate!) + 1 Resend hard bounce + 1 remote UNSUBSCRIBED + 1 Resend already-sent
      for (let i = 0; i < 100; i++) {
        analytics.recordEvent({ event_id: `hd_${i}`, type: 'email.delivered', email_id: `res_d_${i}`, recipient_hashes: [sha256Hex(`hist_d_${i}@example.test`)], created_at: '2026-11-19T10:00:00Z' });
      }
      for (let i = 0; i < 60; i++) {
        analytics.recordEvent({ event_id: `hb_${i}`, type: 'email.bounced', bounce_type: 'hard', email_id: `res_b_${i}`, recipient_hashes: [sha256Hex(i === 0 ? 'bounced_on_resend@example.test' : `hist_b_${i}@example.test`)], created_at: '2026-11-19T10:00:00Z' });
      }
      // Remote UNSUBSCRIBED hash
      const unsubHash = sha256Hex('unsub_remote@example.test');
      pipeline.suppressedHashes.add(unsubHash);
      pipeline.suppressedRecords[unsubHash] = { reason: 'UNSUBSCRIBED', suppressedAt: '2026-11-19T12:00:00Z', updatedAt: '2026-11-19T12:00:00Z' };
      pipeline._saveSuppressedHashes();
      // Already sent on Resend in campaign 'camp_cross_1'
      const resendKey = 'prod_' + crypto.createHash('sha256').update('camp_cross_1:sent_on_resend@example.test').digest('hex').slice(0, 32);
      pipeline._appendAudit({ type: 'SEND_ATTEMPT_ACCEPTED', idempotencyKey: resendKey, providerMessageId: 'res-uuid-1' });

      const acctA = vault.upsertMockAccountForTest({ email: 'acct_a@gmail.com', cap24h: 10 });
      const acctB = vault.upsertMockAccountForTest({ email: 'acct_b@gmail.com', cap24h: 10 });

      // Prepare pool across 2 accounts with 12 valid + 3 suppressed/duplicate recipients
      const csvRows = [
        'email,name',
        'bounced_on_resend@example.test,Bounced',
        'unsub_remote@example.test,Unsub',
        'sent_on_resend@example.test,ResendSent'
      ];
      for (let i = 0; i < 12; i++) csvRows.push(`pool_user_${i}@example.test,User ${i}`);

      const syncMock = async (url) => {
        if (String(url).endsWith('/api/sync/suppressions')) return { ok: true, status: 200, json: async () => ({ ok: true, suppressions: [] }) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      };
      const runner = new GmailCampaignRunner({ stateDir: dir, pipeline, analytics, vault, trustedTestMode: true, syncFetchImpl: syncMock });

      const prep = runner.prepareGmailQueue({
        csvText: csvRows.join('\n'),
        campaignId: 'camp_cross_1',
        sendingMode: 'APPROVED_ACCOUNT_POOL',
        selectedAccountIds: [acctA.id, acctB.id],
        messageKind: 'marketing',
        consentAttested: true
      });
      assert.equal(prep.ok, true);
      assert.equal(prep.summary.counts.PENDING, 12);
      assert.equal(prep.summary.counts.SKIPPED_SUPPRESSED_CROSS_PROVIDER, 2, 'Resend bounce + remote UNSUBSCRIBED must both be skipped');
      assert.equal(prep.summary.counts.ALREADY_SENT_IDEMPOTENT, 1, 'Resend already-sent on same campaignId must not duplicate');
      assert.equal(prep.hygiene.elevatedBounceWarning, true, 'Elevated historical bounce rate must raise hygiene warning');
      // Both accounts received deterministic pre-persisted allocation
      assert.ok((prep.allocationCounts[acctA.id] || 0) > 0 && (prep.allocationCounts[acctB.id] || 0) > 0, 'Both pool accounts must receive fixed allocation');

      // Attempting run WITHOUT hygieneConfirmed must FAIL CLOSED
      const blockedHyg = await runner.runGmailQueue({
        subject: 'Pool Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: false,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890'
      });
      assert.equal(blockedHyg.ok, false);
      assert.equal(blockedHyg.reason, 'LIST_HYGIENE_REVIEW_REQUIRED');

      // Now inject HTTP 429 on the 2nd send -> ENTIRE CAMPAIGN MUST PAUSE IMMEDIATELY (NEVER hop to other account!)
      let postCalls = 0;
      const pauseOn429Fetch = async () => {
        postCalls++;
        if (postCalls === 1) return { status: 200, json: async () => ({ id: 'gm_pool_ok_1' }) };
        return { status: 429, json: async () => ({ error: { message: 'User-rate limit exceeded' } }) };
      };
      const run429 = await runner.runGmailQueue({
        subject: 'Pool Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: pauseOn429Fetch,
        pacingMs: 0
      });
      assert.equal(run429.ok, false);
      assert.equal(run429.status, 'PAUSED');
      assert.equal(run429.reason, 'GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL');
      assert.equal(postCalls, 2, 'Must stop immediately on 429 without hopping to other account for remaining 10 recipients');
      assert.equal(run429.summary.counts.GMAIL_API_ACCEPTED, 1);
      assert.equal(run429.summary.counts.PENDING, 11);

      // Verify timeout -> HALTED_RECONCILE_REQUIRED (zero blind auto-retry) & restart recovery keeps it halted
      const dirT = path.join(tmpRoot, 'timeout_no_retry');
      const pipeT = new EmailProductionPipeline({ stateDir: dirT, trustedTestMode: true });
      const vaultT = new GmailAccountVault({ stateDir: dirT, trustedTestMode: true, cryptoBox: box });
      const acctT = vaultT.upsertMockAccountForTest({ email: 'timeout@gmail.com', cap24h: 10 });
      const runnerT = new GmailCampaignRunner({ stateDir: dirT, pipeline: pipeT, vault: vaultT, trustedTestMode: true, syncFetchImpl: syncMock });
      runnerT.prepareGmailQueue({
        csvText: 'email,name\nt1@example.test,T1\nt2@example.test,T2',
        campaignId: 'camp_timeout',
        sendingMode: 'SINGLE_ACCOUNT',
        selectedAccountIds: [acctT.id],
        consentAttested: true
      });
      let tCalls = 0;
      const runTimeout = await runnerT.runGmailQueue({
        subject: 'Timeout Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => { tCalls++; throw new Error('ETIMEDOUT'); },
        pacingMs: 0
      });
      assert.equal(tCalls, 1, 'Timeout must NOT auto-retry');
      assert.equal(runTimeout.reason, 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY');
      assert.equal(runTimeout.summary.counts.HALTED_RECONCILE_REQUIRED, 1);
      assert.equal(vaultT.listAccountsSafe()[0].sent24h, 1, 'Uncertain timeout must count conservatively against rolling 24h cap');

      // Domain aggregate rolling-24h cap across TWO accounts sharing same domain pauses campaign!
      const dirDom = path.join(tmpRoot, 'domain_cap');
      const pipeDom = new EmailProductionPipeline({ stateDir: dirDom, trustedTestMode: true });
      const vaultDom = new GmailAccountVault({ stateDir: dirDom, trustedTestMode: true, cryptoBox: box });
      const d1 = vaultDom.upsertMockAccountForTest({ email: 's1@company.test', type: 'workspace_paid', cap24h: 50 });
      const d2 = vaultDom.upsertMockAccountForTest({ email: 's2@company.test', type: 'workspace_paid', cap24h: 50 });
      vaultDom.updateAccountSettings({ accountId: d1.id, domainCap24h: 2 });
      const runnerDom = new GmailCampaignRunner({ stateDir: dirDom, pipeline: pipeDom, vault: vaultDom, trustedTestMode: true, syncFetchImpl: syncMock });
      runnerDom.prepareGmailQueue({
        csvText: 'email,name\na1@example.test,A1\na2@example.test,A2\na3@example.test,A3\na4@example.test,A4',
        campaignId: 'camp_domcap',
        sendingMode: 'APPROVED_ACCOUNT_POOL',
        selectedAccountIds: [d1.id, d2.id],
        consentAttested: true
      });
      let domPosts = 0;
      const runDom = await runnerDom.runGmailQueue({
        subject: 'Domain Cap Test',
        html: '<p>Hi</p>',
        text: 'Hi',
        ownerExplicitApproval: true,
        hygieneConfirmed: true,
        baseUrlOverride: 'https://unsubscribe.vivpr.pro',
        syncTokenOverride: 'sync-tok-1234567890',
        fetchImpl: async () => ({ status: 200, json: async () => ({ id: `gm_dom_${++domPosts}` }) }),
        pacingMs: 0
      });
      assert.equal(domPosts, 2, 'Aggregate domain 24h cap (2) must stop across ALL accounts on same domain');
      assert.equal(runDom.status, 'PAUSED');
      assert.equal(runDom.reason, 'DOMAIN_CAP_REACHED');
      checks += 6;
      console.log('PASS 3: Two-account pool, cross-provider suppression, bounce hygiene gate, 429/domain-cap fail-closed pause & timeout HALT verified');
    }

    // ===== 4. Authenticated Sidecar /email/gmail/* Endpoints + UI Controls Check =====
    {
      const dir = path.join(tmpRoot, 'sidecar_gmail');
      const box = makeTestCryptoBox('sidecar-box');
      const sidecar = new EmailTestSidecar({ stateDir: dir, port: 19995, trustedTestMode: true, gmailCryptoBox: box });
      await sidecar.start();
      try {
        const tok = fs.readFileSync(path.join(dir, '.email_sidecar_token'), 'utf8').trim();
        const hdr = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
        const unauth = await fetch('http://127.0.0.1:19995/email/gmail/status');
        assert.equal(unauth.status, 401);
        const st = await fetch('http://127.0.0.1:19995/email/gmail/status', { headers: hdr }).then(r => r.json());
        assert.equal(st.ok, true);
        assert.equal(st.provider, 'GMAIL');
        assert.equal(st.oauthClient.configured, false);

        const cfgResp = await fetch('http://127.0.0.1:19995/email/gmail/oauth/client-config', {
          method: 'POST',
          headers: hdr,
          body: JSON.stringify({ clientId: '9999999999-test.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret-never-leaked', userConsentConfirmed: true })
        }).then(r => r.json());
        assert.equal(cfgResp.ok, true);
        assert.ok(!JSON.stringify(cfgResp).includes('GOCSPX-secret-never-leaked'));

        const diag = await fetch('http://127.0.0.1:19995/email/diagnostics/logs?limit=50', { headers: hdr }).then(r => r.json());
        assert.ok(!JSON.stringify(diag).includes('GOCSPX-secret-never-leaked'));
      } finally {
        await sidecar.stop();
      }

      // Verify Email Studio UI & background.js wiring
      const html = fs.readFileSync(path.resolve(__dirname, '../extension/email-studio/index.html'), 'utf8');
      for (const id of ['emailProviderSelect', 'resendProviderPanel', 'gmailProviderPanel', 'gmailOAuthClientId', 'btnConnectGmailAccount', 'gmailAccountsList', 'gmailSendingMode', 'btnGmailSelfTestSend', 'btnGmailPrepareQueue', 'btnGmailProdSend', 'btnGmailProdStop']) {
        assert.ok(html.includes(`id="${id}"`), `Missing Gmail Studio UI element #${id}`);
      }
      const bg = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
      for (const act of ['GET_GMAIL_STATUS', 'SAVE_GMAIL_OAUTH_CLIENT', 'START_GMAIL_OAUTH', 'SEND_GMAIL_SELF_TEST', 'PREPARE_GMAIL_QUEUE', 'RUN_GMAIL_PRODUCTION_QUEUE']) {
        assert.ok(bg.includes(act), `Missing background.js action ${act}`);
      }
      checks += 3;
      console.log('PASS 4: Sidecar /email/gmail/* auth gates, zero secret leak & Email Studio provider selector UI verified');
    }

    console.log(`XPIDER V7.1 Gmail integration suite: ${checks}/${checks} PASS; ZERO REAL SENDS`);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

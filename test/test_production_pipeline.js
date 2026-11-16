'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EmailTestSidecar } = require('../companion/email-test-sidecar');
const { verifySenderDomainDns } = require('../companion/email-production-pipeline');
const { signSvixPayload } = require('../companion/resend-webhook-intake');

function httpReq(port, method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data), raw: data }); }
        catch (_) { resolve({ status: res.statusCode, json: null, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_prod_pipe_'));
  let pass = 0;
  async function run(name, fn) { await fn(); pass++; console.log('PASS ' + name); }

  try {
    await run('DNS_VERIFIER_INCOMPLETE_COMPLETE_AND_LIVE_VIVPR_PRO', async () => {
      // 1. Incomplete DNS (registrar forwarding SPF only, missing DKIM/DMARC)
      const inc = await verifySenderDomainDns({
        domain: 'vivpr.pro',
        resolveTxt: async (h) => {
          if (h === 'vivpr.pro') return [['v=spf1 include:spf.efwd.registrar-servers.com ~all']];
          const err = new Error('ENOTFOUND'); err.code = 'ENOTFOUND'; throw err;
        }
      });
      assert.equal(inc.allVerified, false);
      assert.equal(inc.spf.pass, false);
      assert.equal(inc.dkim.pass, false);
      assert.equal(inc.dmarc.pass, false);

      // 2. Complete Resend DNS
      const comp = await verifySenderDomainDns({
        domain: 'vivpr.pro',
        resolveTxt: async (h) => {
          if (h === 'vivpr.pro') return [['v=spf1 include:amazonses.com ~all']];
          if (h === 'send.vivpr.pro') return [['v=spf1 include:amazonses.com ~all']];
          if (h === 'resend._domainkey.vivpr.pro') return [['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1234567890abcdef']];
          if (h === '_dmarc.vivpr.pro') return [['v=DMARC1; p=quarantine; rua=mailto:dmarc@vivpr.pro']];
          return [];
        }
      });
      assert.equal(comp.allVerified, true);
      assert.equal(comp.spf.pass, true);
      assert.equal(comp.dkim.pass, true);
      assert.equal(comp.dmarc.pass, true);
      assert.equal(comp.dmarc.policy, 'quarantine');

      // 3. Live DNS query against vivpr.pro
      const live = await verifySenderDomainDns({ domain: 'vivpr.pro' });
      assert.equal(live.domain, 'vivpr.pro');
      assert.equal(typeof live.allVerified, 'boolean');
    });

    await run('END_TO_END_CONSENT_PERSISTENCE_RFC8058_UNSUBSCRIBE_SVIX_WEBHOOK_AND_AUDITED_QUEUE', async () => {
      const stateDir = path.join(tmpDir, 'sidecar_prod_state');
      const sentMessages = [];
      let sc = new EmailTestSidecar({
        trustedTestMode: true,
        port: 20025,
        stateDir,
        apiKeyOverride: 're_prod_pipe_test_12345678',
        dnsResolver: async (h) => {
          if (h === 'vivpr.pro') return [['v=spf1 include:spf.efwd.registrar-servers.com ~all']];
          const e = new Error('ENOTFOUND'); e.code = 'ENOTFOUND'; throw e;
        },
        providerTransport: async (msg) => {
          sentMessages.push(msg);
          if (sentMessages.length === 1) {
            // Stop queue after first recipient to test stop/resume + no duplicate send!
            sc.pipeline.stopQueue();
          }
          return { ok: true, providerMessageId: `provider_msg_${sentMessages.length}` };
        }
      });
      await sc.start();
      const auth = { Authorization: `Bearer ${sc.token}` };

      try {
        // 1. Import 3 recipients with consent attestation
        const imp = await httpReq(20025, 'POST', '/email/production/import', auth, {
          csvText: 'email,name\nu1@example.org,User1\nu2@example.org,User2\nu3@example.org,User3\nu1@example.org,Dup',
          optOutText: '',
          messageKind: 'marketing',
          consentAttested: true,
          campaignId: 'camp_p0'
        });
        assert.equal(imp.status, 200);
        assert.equal(imp.json.imported.validCount, 3);
        assert.equal(imp.json.imported.duplicateCount, 1);
        assert.equal(imp.json.summary.consentedRecordsOnDisk, 3);
        // Verify DraftOutbox jobs are LEDGER_VERIFIED
        const jobs = sc.pipeline.outbox.snapshot().jobs;
        assert.equal(jobs.length, 3);
        assert.ok(jobs.every(j => j.consentVerification === 'LEDGER_VERIFIED'));

        // 2. Preflight reports live DNS status + minimal authorization needed
        const pf = await httpReq(20025, 'GET', '/email/production/preflight', auth);
        assert.equal(pf.status, 200);
        assert.equal(pf.json.dns.allVerified, false);
        assert.ok(pf.json.minimalAuthorizationNeededForSingleLiveSend.some(s => s.includes('DKIM')));

        // 3. LIVE_PRODUCTION mode is strictly blocked when DNS / Owner approval not met
        const liveBlocked = await httpReq(20025, 'POST', '/email/production/queue/run', auth, {
          mode: 'LIVE_PRODUCTION',
          subject: 'Prod Test'
        });
        assert.equal(liveBlocked.status, 409);
        assert.equal(liveBlocked.json.status, 'BLOCKED');
        assert.equal(sentMessages.length, 0);

        // 4. RFC 8058 One-Click Unsubscribe for u3@example.org BEFORE send
        const unsubU3 = sc.pipeline.issueRecipientUnsubscribeHeaders('u3@example.org', 'camp_p0', 'http://127.0.0.1:20025');
        const unsubPath = new URL(unsubU3.url).pathname;
        // GET never mutates suppression
        const getUnsub = await httpReq(20025, 'GET', unsubPath);
        assert.equal(getUnsub.status, 200);
        assert.equal(sc.pipeline.outbox.isSuppressed('u3@example.org'), false);
        // POST List-Unsubscribe=One-Click suppresses u3@example.org and is idempotent
        const postUnsub = await httpReq(20025, 'POST', unsubPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(postUnsub.status, 200);
        assert.equal(postUnsub.json.status, 'UNSUBSCRIBED');
        assert.equal(sc.pipeline.outbox.isSuppressed('u3@example.org'), true);
        const postUnsubReplay = await httpReq(20025, 'POST', unsubPath, { 'Content-Type': 'application/x-www-form-urlencoded' }, 'List-Unsubscribe=One-Click');
        assert.equal(postUnsubReplay.json.idempotentReplay, true);

        // 5. Run queue in ISOLATED_PROVIDER_TEST: sends u1@example.org then stops (per transport hook)
        const run1 = await httpReq(20025, 'POST', '/email/production/queue/run', auth, {
          mode: 'ISOLATED_PROVIDER_TEST',
          subject: 'Isolated Queue Test'
        });
        assert.equal(run1.status, 200);
        assert.equal(run1.json.status, 'STOPPED');
        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].to, 'u1@example.org');
        assert.ok(sentMessages[0].headers['List-Unsubscribe']);
        assert.equal(sentMessages[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');

        // 6. Resume queue: u1@example.org is ALREADY ACCEPTED (never re-sent!), u2@example.org is sent, u3@example.org is SKIPPED_SUPPRESSED!
        const run2 = await httpReq(20025, 'POST', '/email/production/queue/run', auth, {
          mode: 'ISOLATED_PROVIDER_TEST',
          subject: 'Isolated Queue Test'
        });
        assert.equal(run2.status, 200);
        assert.equal(run2.json.status, 'COMPLETED');
        assert.equal(sentMessages.length, 2);
        assert.equal(sentMessages[1].to, 'u2@example.org');
        assert.equal(run2.json.summary.counts.ACCEPTED, 2);
        assert.equal(run2.json.summary.counts.SKIPPED_SUPPRESSED, 1);

        // 7. Resend Svix Webhook Intake:
        //    - Invalid signature -> 401
        //    - Valid email.delivered for provider_msg_1 -> updates u1 to DELIVERED
        //    - Valid email.bounced for provider_msg_2 -> suppresses u2@example.org in DraftOutbox!
        const whSecret = sc.pipeline.getWebhookSecret();
        const badWh = await httpReq(20025, 'POST', '/webhooks/resend', {
          'svix-id': 'msg_evt_bad',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,bad_sig'
        }, JSON.stringify({ type: 'email.delivered', data: { email_id: 'provider_msg_1', to: ['u1@example.org'] } }));
        assert.equal(badWh.status, 401);

        const ts = String(Math.floor(Date.now() / 1000));
        const delivBody = JSON.stringify({ type: 'email.delivered', data: { email_id: 'provider_msg_1', to: ['u1@example.org'] } });
        const delivSig = signSvixPayload({ svixId: 'msg_evt_deliv_1', svixTimestamp: ts, rawBody: delivBody, secret: whSecret });
        const okDeliv = await httpReq(20025, 'POST', '/webhooks/resend', {
          'svix-id': 'msg_evt_deliv_1',
          'svix-timestamp': ts,
          'svix-signature': delivSig
        }, delivBody);
        assert.equal(okDeliv.status, 200);
        assert.equal(okDeliv.json.delivered, true);

        const bounceBody = JSON.stringify({ type: 'email.bounced', data: { email_id: 'provider_msg_2', to: ['u2@example.org'] } });
        const bounceSig = signSvixPayload({ svixId: 'msg_evt_bounce_2', svixTimestamp: ts, rawBody: bounceBody, secret: whSecret });
        const okBounce = await httpReq(20025, 'POST', '/webhooks/resend', {
          'svix-id': 'msg_evt_bounce_2',
          'svix-timestamp': ts,
          'svix-signature': bounceSig
        }, bounceBody);
        assert.equal(okBounce.status, 200);
        assert.equal(sc.pipeline.outbox.isSuppressed('u2@example.org'), true);
      } finally {
        await sc.stop();
      }
    });

    console.log(`\nALL PRODUCTION PIPELINE TESTS PASSED (${pass}/${pass})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });

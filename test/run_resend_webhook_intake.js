'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { DraftOutbox } = require('../companion/email-draft-outbox');
const {
  signSvixPayload,
  ResendWebhookIntake,
  startLocalWebhookServer,
  PRODUCTION_WEBHOOK_ENDPOINT_STATUS
} = require('../companion/resend-webhook-intake');

function postJson(url, headers, rawBody) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers }, res => {
      let d = '';
      res.on('data', c => (d += c));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, json: JSON.parse(d) });
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-webhook-test-'));
  const outboxFile = path.join(dir, 'outbox.json');
  const stateFile = path.join(dir, 'webhook-state.json');
  const secret = 'whsec_' + crypto.randomBytes(24).toString('base64');
  let nowMs = Date.parse('2026-11-09T15:00:00Z');
  let n = 0;
  async function check(name, fn) {
    await fn();
    n++;
    console.log('PASS', name);
  }

  let srv = null;
  try {
    const outbox = new DraftOutbox(outboxFile);
    outbox.add({
      email: 'bounce-target@example.test',
      authorized: true,
      authorizationSource: 'written_contract',
      authorizationAt: '2026-11-01T00:00:00Z',
      source: 'CUSTOMER',
      templateId: 't1',
      key: 'webhook-bounce-draft-key-01'
    });
    outbox.add({
      email: 'complaint-target@example.test',
      authorized: true,
      authorizationSource: 'written_contract',
      authorizationAt: '2026-11-01T00:00:00Z',
      source: 'CUSTOMER',
      templateId: 't1',
      key: 'webhook-complaint-draft-key-02'
    });

    const intake = new ResendWebhookIntake({ stateFile, outbox, secret, toleranceSec: 300 });
    srv = await startLocalWebhookServer({ intake, nowFn: () => nowMs });

    await check('production webhook status explicitly marked UNKNOWN', async () => {
      assert.equal(PRODUCTION_WEBHOOK_ENDPOINT_STATUS.publicWebhookConfiguredInResend, 'UNKNOWN');
      assert.equal(PRODUCTION_WEBHOOK_ENDPOINT_STATUS.signingSecretProvisionedByOwner, 'UNKNOWN');
    });

    await check('invalid webhook secret format is rejected', async () => {
      assert.throws(
        () => new ResendWebhookIntake({ stateFile, outbox, secret: 'invalid_secret' }),
        /WEBHOOK_SECRET_INVALID/
      );
    });

    await check('missing svix headers rejected with 401 MISSING_SVIX_HEADERS', async () => {
      const r = await postJson(srv.webhookUrl, {}, JSON.stringify({ type: 'email.sent' }));
      assert.equal(r.statusCode, 401);
      assert.equal(r.json.reason, 'MISSING_SVIX_HEADERS');
    });

    await check('stale timestamp outside tolerance window rejected with 401 WEBHOOK_TIMESTAMP_OUT_OF_WINDOW', async () => {
      const staleTs = String(Math.floor(nowMs / 1000) - 900);
      const rawBody = JSON.stringify({
        type: 'email.sent',
        data: { email_id: 'em_stale_1', to: ['ok@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_stale_1', svixTimestamp: staleTs, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_stale_1', 'svix-timestamp': staleTs, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 401);
      assert.equal(r.json.reason, 'WEBHOOK_TIMESTAMP_OUT_OF_WINDOW');
    });

    await check('tampered payload or bad signature rejected with 401 WEBHOOK_SIGNATURE_INVALID', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'em_tamper_1', to: ['ok@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_tamper_1', svixTimestamp: ts, rawBody, secret });
      const tamperedBody = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'em_tamper_1', to: ['attacker@example.test'] }
      });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_tamper_1', 'svix-timestamp': ts, 'svix-signature': sig },
        tamperedBody
      );
      assert.equal(r.statusCode, 401);
      assert.equal(r.json.reason, 'WEBHOOK_SIGNATURE_INVALID');
    });

    await check('email.sent records ACCEPTED state and explicitly sets delivered=false (accepted != delivered)', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.sent',
        data: { email_id: 'em_flow_1', to: ['reader@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_sent_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_sent_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.state, 'ACCEPTED');
      assert.equal(r.json.delivered, false);
      assert.equal(r.json.acceptedNotDelivered, true);
    });

    await check('email.delivered transitions ACCEPTED to DELIVERED with delivered=true', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'em_flow_1', to: ['reader@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_deliv_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_deliv_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.state, 'DELIVERED');
      assert.equal(r.json.delivered, true);
      assert.equal(r.json.acceptedNotDelivered, false);
    });

    await check('replayed svix-id is ignored idempotently', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'em_flow_1', to: ['reader@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_deliv_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_deliv_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.status, 'DUPLICATE_EVENT_IGNORED');
      assert.equal(r.json.idempotentReplay, true);
    });

    await check('email.bounced marks BOUNCED, suppresses recipient, and cancels pending draft', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.bounced',
        data: { email_id: 'em_bounce_1', to: ['Bounce-Target@Example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_bounce_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_bounce_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.state, 'BOUNCED');
      assert.equal(r.json.delivered, false);
      assert.equal(outbox.isSuppressed('bounce-target@example.test'), true);
      const job = outbox.snapshot().jobs.find(j => j.email === 'bounce-target@example.test');
      assert.equal(job.status, 'CANCELLED');
    });

    await check('email.complained marks COMPLAINED, suppresses recipient, and cancels pending draft', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.complained',
        data: { email_id: 'em_complaint_1', to: ['complaint-target@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_complaint_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_complaint_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.state, 'COMPLAINED');
      assert.equal(outbox.isSuppressed('complaint-target@example.test'), true);
      const job = outbox.snapshot().jobs.find(j => j.email === 'complaint-target@example.test');
      assert.equal(job.status, 'CANCELLED');
    });

    await check('out-of-order email.delivered after BOUNCED never downgrades terminal BOUNCED state', async () => {
      const ts = String(Math.floor(nowMs / 1000));
      const rawBody = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'em_bounce_1', to: ['bounce-target@example.test'] }
      });
      const sig = signSvixPayload({ svixId: 'msg_late_deliv_1', svixTimestamp: ts, rawBody, secret });
      const r = await postJson(
        srv.webhookUrl,
        { 'svix-id': 'msg_late_deliv_1', 'svix-timestamp': ts, 'svix-signature': sig },
        rawBody
      );
      assert.equal(r.statusCode, 200);
      assert.equal(r.json.state, 'BOUNCED');
      assert.equal(r.json.delivered, false);
    });

    await check('webhook state and outbox suppression survive restart', async () => {
      await srv.close();
      srv = null;
      const reloadedIntake = new ResendWebhookIntake({ stateFile, outbox: new DraftOutbox(outboxFile), secret });
      assert.equal(reloadedIntake.getMessageState('em_flow_1').state, 'DELIVERED');
      assert.equal(reloadedIntake.getMessageState('em_bounce_1').state, 'BOUNCED');
      assert.equal(reloadedIntake.getMessageState('em_complaint_1').state, 'COMPLAINED');
    });

    console.log(`${n}/${n} PASS`);
  } finally {
    if (srv) await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { DraftOutbox } = require('../companion/email-draft-outbox');
const {
  issueUnsubscribeToken,
  verifyUnsubscribeToken,
  startLocalUnsubscribeServer,
  PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS
} = require('../companion/email-unsubscribe-server');

function httpRequest({ method, url, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, text: data, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-unsub-test-'));
  const outboxFile = path.join(dir, 'outbox.json');
  const keyRing = {
    activeKeyId: 'k2',
    keys: {
      k1: '0123456789abcdef0123456789abcdef-old-rotated-key',
      k2: 'fedcba9876543210fedcba9876543210-active-signing-key'
    }
  };
  let now = Date.parse('2026-11-09T12:00:00Z');
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
      email: 'sub1@example.test',
      authorized: true,
      authorizationSource: 'double_opt_in_web',
      authorizationAt: '2026-11-01T00:00:00Z',
      source: 'CUSTOMER',
      templateId: 'newsletter_nov',
      key: 'unsub-test-draft-key-0001'
    });

    srv = await startLocalUnsubscribeServer({
      outbox,
      keyRing,
      nowFn: () => now
    });

    await check('production endpoint status explicitly marked UNKNOWN', async () => {
      assert.equal(PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS.publicHttpsDeployed, 'UNKNOWN');
      assert.equal(PRODUCTION_UNSUBSCRIBE_ENDPOINT_STATUS.ownerDeploymentRequired, true);
    });

    await check('non-loopback bind host is rejected', async () => {
      assert.throws(
        () => startLocalUnsubscribeServer({ outbox, keyRing, host: '0.0.0.0' }),
        /LOCAL_LOOPBACK_ONLY_REQUIRED/
      );
    });

    await check('weak signing secret (<32 bytes) is rejected', async () => {
      assert.throws(
        () => issueUnsubscribeToken({ email: 'a@example.test', keyRing: { activeKeyId: 'k1', secret: 'short-secret' } }),
        /TOKEN_SECRET_TOO_SHORT/
      );
    });

    await check('issued tokens have distinct unguessable jti nonces', async () => {
      const t1 = issueUnsubscribeToken({ email: 'sub1@example.test', campaignId: 'c1', keyRing, now });
      const t2 = issueUnsubscribeToken({ email: 'sub1@example.test', campaignId: 'c1', keyRing, now });
      assert.notEqual(t1, t2);
      const v1 = verifyUnsubscribeToken(t1, { keyRing, now });
      const v2 = verifyUnsubscribeToken(t2, { keyRing, now });
      assert.notEqual(v1.jti, v2.jti);
    });

    await check('raw email parameter in query or POST body is rejected and never suppresses', async () => {
      const rQuery = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe?email=sub1@example.test`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(rQuery.statusCode, 400);
      assert.equal(rQuery.json.reason, 'RAW_EMAIL_UNSUBSCRIBE_FORBIDDEN');
      assert.equal(outbox.isSuppressed('sub1@example.test'), false);
    });

    const validToken = issueUnsubscribeToken({
      email: 'sub1@example.test',
      campaignId: 'newsletter_nov',
      keyRing,
      now,
      ttlMs: 3600_000
    });

    await check('direct GET on unsubscribe URL does NOT mutate state (scanner-safe confirmation)', async () => {
      const rGetJson = await httpRequest({
        method: 'GET',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(validToken)}`
      });
      assert.equal(rGetJson.statusCode, 200);
      assert.equal(rGetJson.json.status, 'CONFIRMATION_REQUIRED_ON_GET');
      assert.equal(rGetJson.json.stateMutated, false);

      const rGetHtml = await httpRequest({
        method: 'GET',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(validToken)}`,
        headers: { Accept: 'text/html' }
      });
      assert.equal(rGetHtml.statusCode, 200);
      assert(/<form method="POST"/i.test(rGetHtml.text));
      assert.equal(outbox.isSuppressed('sub1@example.test'), false);
      assert.equal(outbox.snapshot().jobs[0].status, 'DRAFT');
    });

    await check('RFC 8058 One-Click POST unsubscribes without login and cancels pending draft', async () => {
      const rPost = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(validToken)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(rPost.statusCode, 200);
      assert.equal(rPost.json.status, 'UNSUBSCRIBED');
      assert.equal(rPost.json.idempotentReplay, false);
      assert.equal(outbox.isSuppressed('sub1@example.test'), true);
      assert.equal(outbox.snapshot().jobs[0].status, 'CANCELLED');
    });

    await check('duplicate / replayed POST is idempotent and does not duplicate suppression entry', async () => {
      const rReplay = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(validToken)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(rReplay.statusCode, 200);
      assert.equal(rReplay.json.status, 'UNSUBSCRIBED');
      assert.equal(rReplay.json.idempotentReplay, true);
      assert.equal(outbox.snapshot().suppressed.length, 1);
    });

    await check('tampered signature is rejected with 403 INVALID_SIGNATURE', async () => {
      const [p, s] = validToken.split('.');
      const tampered = `${p}.${s.slice(0, -2)}ab`;
      const r = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(tampered)}`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(r.statusCode, 403);
      assert.equal(r.json.reason, 'INVALID_SIGNATURE');
    });

    await check('malformed token is rejected with 400 MALFORMED_TOKEN', async () => {
      const r = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/not-a-valid-token`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(r.statusCode, 400);
      assert.equal(r.json.reason, 'MALFORMED_TOKEN');
    });

    await check('expired token is rejected with 403 TOKEN_EXPIRED and does not suppress', async () => {
      const shortToken = issueUnsubscribeToken({
        email: 'sub2@example.test',
        campaignId: 'c1',
        keyRing,
        now,
        ttlMs: 1000
      });
      now += 5000; // advance past expiry
      const r = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(shortToken)}`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(r.statusCode, 403);
      assert.equal(r.json.reason, 'TOKEN_EXPIRED');
      assert.equal(outbox.isSuppressed('sub2@example.test'), false);
    });

    await check('key rotation: token signed with older key k1 still verifies; unknown key k99 rejected', async () => {
      const k1Token = issueUnsubscribeToken({
        email: 'rotated@example.test',
        campaignId: 'c1',
        keyRing: { activeKeyId: 'k1', keys: keyRing.keys },
        now,
        ttlMs: 60000
      });
      const rOk = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(k1Token)}`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(rOk.statusCode, 200);
      assert.equal(outbox.isSuppressed('rotated@example.test'), true);

      const unknownKeyToken = issueUnsubscribeToken({
        email: 'other@example.test',
        campaignId: 'c1',
        keyRing: { activeKeyId: 'k99', keys: { k99: '99999999999999999999999999999999-unknown-key' } },
        now,
        ttlMs: 60000
      });
      const rBadKey = await httpRequest({
        method: 'POST',
        url: `${srv.baseUrl}/unsubscribe/${encodeURIComponent(unknownKeyToken)}`,
        body: 'List-Unsubscribe=One-Click'
      });
      assert.equal(rBadKey.statusCode, 403);
      assert.equal(rBadKey.json.reason, 'UNKNOWN_KEY_ID');
    });

    await check('suppression persists after server close and fresh DraftOutbox reload', async () => {
      await srv.close();
      srv = null;
      const reloaded = new DraftOutbox(outboxFile);
      assert.equal(reloaded.isSuppressed('sub1@example.test'), true);
      assert.equal(reloaded.isSuppressed('rotated@example.test'), true);
      const q = reloaded.add({
        email: 'sub1@example.test',
        authorized: true,
        authorizationSource: 'double_opt_in_web',
        authorizationAt: '2026-11-01T00:00:00Z',
        source: 'CUSTOMER',
        templateId: 'newsletter_nov',
        key: 'unsub-test-draft-key-0002'
      });
      assert.equal(q.status, 'SUPPRESSED');
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

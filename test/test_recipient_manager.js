'use strict';
const assert = require('node:assert/strict');
const RM = require('../extension/email-studio/recipient-manager');

let pass = 0;
async function t(name, fn) { await fn(); pass++; console.log('PASS ' + name); }

(async () => {
  await t('CSV_IMPORT_HEADER_DEDUPE_INVALID_ROLE', async () => {
    const csv = 'email,name\r\nA@Example.com,"Kim, A"\r\na@example.com,Dup\r\nbad@,X\r\nnoreply@x.com,R\r\nb@example.org,B\r\n';
    const r = RM.importRecipients(csv);
    assert.equal(r.valid.length, 2);
    assert.equal(r.valid[0].email, 'a@example.com');
    assert.equal(r.valid[0].name, 'Kim, A');
    assert.equal(r.duplicates.length, 1);
    assert.equal(r.invalid.length, 2);
    assert.deepEqual(r.invalid.map(i => i.reason).sort(), ['INVALID_FORMAT', 'ROLE_ADDRESS']);
  });

  await t('CSV_NO_HEADER_AND_BOM_AND_SEMICOLON', async () => {
    const r = RM.importRecipients('\uFEFFx@a.com;Xx\ny@b.com;Yy');
    assert.equal(r.valid.length, 2);
  });

  await t('SUPPRESSION_EMAIL_AND_DOMAIN_OPT_OUT', async () => {
    const sup = RM.parseSuppression('blocked@a.com, @bad.org\nnotanemail');
    assert.equal(RM.isSuppressed('blocked@a.com', sup), true);
    assert.equal(RM.isSuppressed('x@bad.org', sup), true);
    assert.equal(RM.isSuppressed('ok@a.com', sup), false);
  });

  await t('MARKETING_REQUIRES_CONSENT_ATTESTATION', async () => {
    const recips = [{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@bad.org' }];
    const sup = RM.parseSuppression('@bad.org');
    const noAtt = RM.buildReview(recips, sup, { messageKind: 'marketing', consentAttestation: false });
    assert.deepEqual(noAtt.summary, { total: 3, ready: 0, suppressed: 1, noConsent: 2 });
    const att = RM.buildReview(recips, sup, { messageKind: 'marketing', consentAttestation: true });
    assert.deepEqual(att.summary, { total: 3, ready: 2, suppressed: 1, noConsent: 0 });
    const svc = RM.buildReview(recips, sup, { messageKind: 'service', consentAttestation: false });
    assert.equal(svc.summary.ready, 2);
  });

  await t('QUEUE_RUN_IDEMPOTENT_NO_DUPLICATE_SEND_AND_RETRY_LIMIT', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@c.com' }], new Set(), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    const calls = {};
    const sender = async (e) => {
      calls[e.email] = (calls[e.email] || 0) + 1;
      if (e.email === 'b@b.com') return { ok: false, error: 'PROVIDER_ERROR' };
      return { ok: true, providerMessageId: 'm_' + e.email };
    };
    let s = await RM.runQueue(q, sender, { maxAttempts: 2 });
    assert.equal(s.ACCEPTED, 2);
    assert.equal(s.FAILED, 1);
    s = await RM.runQueue(q, sender, { maxAttempts: 2 });   // retries only failed
    assert.equal(calls['a@a.com'], 1);
    assert.equal(calls['c@c.com'], 1);
    assert.equal(calls['b@b.com'], 2);
    s = await RM.runQueue(q, sender, { maxAttempts: 2 });   // attempts exhausted -> no more calls
    assert.equal(calls['b@b.com'], 2);
    assert.ok(q.finishedAt);
  });

  await t('STOP_RESUME_NO_DUPLICATE_AND_INTERRUPTED_SENDING_RESET', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'b@b.com' }, { email: 'c@c.com' }], new Set(), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    const calls = [];
    const sender = async (e) => { calls.push(e.email); if (calls.length === 1) RM.stopQueue(q); return { ok: true, providerMessageId: 'x' }; };
    await RM.runQueue(q, sender);
    assert.deepEqual(calls, ['a@a.com']);
    q.entries[1].status = 'SENDING'; // simulate crash mid-send
    RM.resumeNormalize(q);
    assert.equal(q.entries[1].status, 'PENDING');
    await RM.runQueue(q, async (e) => { calls.push(e.email); return { ok: true }; });
    assert.deepEqual(calls, ['a@a.com', 'b@b.com', 'c@c.com']);
  });

  await t('DRY_RUN_NEVER_MARKS_ACCEPTED_AND_SKIPPED_NEVER_SENT', async () => {
    const rv = RM.buildReview([{ email: 'a@a.com' }, { email: 'z@bad.org' }], RM.parseSuppression('@bad.org'), { messageKind: 'service' });
    const q = RM.createQueue(rv.entries);
    let sent = 0;
    const s = await RM.runQueue(q, async () => { sent++; return { ok: true, dryRun: true }; });
    assert.equal(sent, 1);
    assert.equal(s.ACCEPTED, 0);
    assert.equal(s.DRY_RUN_READY, 1);
    assert.equal(s.SKIPPED_SUPPRESSED, 1);
  });

  await t('CSV_EXPORT_ESCAPES_QUOTES', async () => {
    const q = RM.createQueue([{ email: 'a@a.com', name: 'Q"uote', status: 'PENDING', reason: null, attempts: 0 }]);
    assert.ok(RM.queueToCsv(q).includes('"Q""uote"'));
  });

  console.log(`\nALL RECIPIENT MANAGER TESTS PASSED (${pass}/${pass})`);
})().catch(e => { console.error(e); process.exit(1); });

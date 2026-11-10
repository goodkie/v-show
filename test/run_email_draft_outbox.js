'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DraftOutbox, PRIVACY_STORAGE_REQUIREMENTS } = require('../companion/email-draft-outbox');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-outbox-test-'));
const file = path.join(dir, 'nested', 'drafts.json');
const base = {
  email: 'Approved@Example.test',
  authorized: true,
  authorizationSource: 'customer written permission',
  authorizationAt: '2026-11-01T12:00:00Z',
  source: 'CUSTOMER',
  templateId: 'notice_1',
  key: 'authorized-job-key-20261109'
};

let n = 0;
function check(name, fn) {
  fn();
  n++;
  console.log('PASS', name);
}

try {
  const box = new DraftOutbox(file);
  check('new outbox is empty', () => assert.equal(box.snapshot().jobs.length, 0));
  check('invalid address rejected', () => assert.throws(() => box.add({ ...base, email: 'bad' }), /INVALID_EMAIL/));
  check('email collector source rejected', () => assert.throws(() => box.add({ ...base, source: 'EMAIL_COLLECTOR' }), /COLLECTED_ADDRESS_NOT_AUTHORIZATION/));
  check('no authorization denied', () => assert.throws(() => box.add({ ...base, authorized: false }), /AUTHORIZATION_EVIDENCE_REQUIRED/));
  check('invalid idempotency key denied', () => assert.throws(() => box.add({ ...base, key: 'abc' }), /IDEMPOTENCY_KEY_REQUIRED/));
  check('authorized draft saved', () => assert.equal(box.add(base).status, 'DRAFT'));
  check('file persisted', () => assert(fs.existsSync(file)));
  check('idempotency duplicate denied', () => assert.equal(box.add(base).status, 'DUPLICATE'));
  check('reload keeps draft', () => assert.equal(new DraftOutbox(file).snapshot().jobs.length, 1));
  check('draft has no sending state', () => assert.equal(box.snapshot().jobs[0].status, 'DRAFT'));
  check('suppress cancels drafts', () => {
    box.suppress('approved@example.test', 'UNSUBSCRIBED');
    assert.equal(box.snapshot().jobs[0].status, 'CANCELLED');
  });
  check('suppression persists across restart', () => assert.equal(new DraftOutbox(file).snapshot().suppressed.length, 1));
  check('suppressed recipient cannot queue', () => assert.equal(box.add({ ...base, key: 'authorized-second-key-20261109' }).status, 'SUPPRESSED'));
  check('hold never changes cancellation', () => {
    box.holdAll();
    assert.equal(box.snapshot().jobs[0].status, 'CANCELLED');
  });
  check('snapshot cannot mutate internal state', () => {
    const x = box.snapshot();
    x.jobs[0].status = 'HOLD';
    assert.equal(box.snapshot().jobs[0].status, 'CANCELLED');
  });
  check('corrupted JSON is rejected', () => {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{bad');
    assert.throws(() => new DraftOutbox(bad), SyntaxError);
  });
  check('invalid state is rejected', () => {
    const bad = path.join(dir, 'bad-state.json');
    fs.writeFileSync(bad, JSON.stringify({ version: 1, jobs: [{ status: 'SENT' }], suppressed: [] }));
    assert.throws(() => new DraftOutbox(bad), /INVALID_JOB_STATE/);
  });

  // --- New P0 Item 2 Audit & Concurrency Hardening Checks ---
  check('relative path is rejected', () => {
    assert.throws(() => new DraftOutbox('relative/drafts.json'), /ABSOLUTE_FILE_REQUIRED/);
  });

  check('caller boolean consent is tagged UNVERIFIED_CALLER_ASSERTION and sendEligible=false', () => {
    const j = box.snapshot().jobs[0];
    assert.equal(j.consentVerification, 'UNVERIFIED_CALLER_ASSERTION');
    assert.equal(j.sendEligible, false);
  });

  check('cryptographic consentLedger verifier blocks unverified token and accepts valid HMAC token', () => {
    const ledgerFile = path.join(dir, 'ledger-outbox.json');
    const secret = 'test-ledger-hmac-key-20261109';
    const consentLedger = {
      verify({ email, authorizationSource, authorizationAt, consentProofToken }) {
        if (!consentProofToken) return false;
        const expected = crypto.createHmac('sha256', secret).update(`${email}|${authorizationSource}|${authorizationAt}`).digest('hex');
        return consentProofToken === expected;
      }
    };
    const lbox = new DraftOutbox(ledgerFile, { consentLedger });
    assert.throws(() => lbox.add({ ...base, key: 'ledger-unverified-key-0001' }), /CONSENT_LEDGER_VERIFICATION_FAILED/);
    const validToken = crypto.createHmac('sha256', secret).update(`approved@example.test|${base.authorizationSource}|${base.authorizationAt}`).digest('hex');
    const res = lbox.add({ ...base, key: 'ledger-verified-key-0002', consentProofToken: validToken });
    assert.equal(res.status, 'DRAFT');
    assert.equal(res.consentVerification, 'LEDGER_VERIFIED');
  });

  check('credentials and API keys in outbox payload or metadata are rejected', () => {
    assert.throws(() => box.add({ ...base, email: 'u2@example.test', key: 'cred-test-key-000001', apiKey: 're_1234567890abcdef' }), /CREDENTIALS_FORBIDDEN_IN_OUTBOX/);
    assert.throws(() => box.add({ ...base, email: 'u2@example.test', key: 'cred-test-key-000002', authorizationSource: 're_secretKeyLeak12345' }), /CREDENTIALS_FORBIDDEN_IN_OUTBOX/);
    assert.throws(() => box.suppress('u2@example.test', 'MANUAL', { proxyPassword: 'secret' }), /CREDENTIALS_FORBIDDEN_IN_OUTBOX/);
  });

  check('interleaved multi-instance writers do not lose updates (single-writer lock + reload)', () => {
    const sharedFile = path.join(dir, 'concurrent', 'shared.json');
    const writerA = new DraftOutbox(sharedFile);
    const writerB = new DraftOutbox(sharedFile); // instantiated before writerA writes!
    writerA.add({ ...base, email: 'a@example.test', key: 'writer-a-job-key-00001' });
    writerB.add({ ...base, email: 'b@example.test', key: 'writer-b-job-key-00002' });
    writerA.suppress('a@example.test', 'BOUNCED');
    const finalSnap = new DraftOutbox(sharedFile).snapshot();
    assert.equal(finalSnap.jobs.length, 2, 'both writerA and writerB jobs must survive');
    assert.equal(finalSnap.jobs.find(j => j.email === 'a@example.test').status, 'CANCELLED');
    assert.equal(finalSnap.jobs.find(j => j.email === 'b@example.test').status, 'DRAFT');
    assert.equal(finalSnap.suppressed.length, 1);
  });

  check('multi-process child writers preserve all updates without corruption', () => {
    const mpFile = path.join(dir, 'multiprocess', 'mp.json');
    const modPath = path.resolve(__dirname, '../companion/email-draft-outbox.js');
    const workerScript = `
      const { DraftOutbox } = require(${JSON.stringify(modPath)});
      const [file, idx] = process.argv.slice(1);
      const box = new DraftOutbox(file, { lockTimeoutMs: 5000 });
      for (let i = 0; i < 4; i++) {
        box.add({
          email: 'mp_' + idx + '_' + i + '@example.test',
          authorized: true,
          authorizationSource: 'mp_fixture',
          authorizationAt: '2026-11-01T12:00:00Z',
          source: 'CUSTOMER',
          templateId: 't1',
          key: 'mp-worker-' + idx + '-item-0000' + i
        });
      }
    `;
    const r1 = spawnSync(process.execPath, ['-e', workerScript, mpFile, 'w1'], { encoding: 'utf8' });
    const r2 = spawnSync(process.execPath, ['-e', workerScript, mpFile, 'w2'], { encoding: 'utf8' });
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r2.status, 0, r2.stderr);
    const snap = new DraftOutbox(mpFile).snapshot();
    assert.equal(snap.jobs.length, 8);
  });

  check('orphaned partial write .tmp files are swept on startup without corrupting committed store', () => {
    const orphanTemp = `${file}.99999.deadbeef.tmp`;
    fs.writeFileSync(orphanTemp, '{"corrupt_partial_write');
    assert(fs.existsSync(orphanTemp));
    const recovered = new DraftOutbox(file);
    assert.equal(recovered.sweptOrphanTemps, 1);
    assert(!fs.existsSync(orphanTemp));
    assert.equal(recovered.snapshot().jobs.length, 1);
  });

  check('stale lockfile from crashed writer is recovered automatically', () => {
    const staleFile = path.join(dir, 'stale', 'store.json');
    fs.mkdirSync(path.dirname(staleFile), { recursive: true });
    const lockPath = `${staleFile}.lock`;
    fs.writeFileSync(lockPath, '{"pid":999999,"acquiredAt":1000}');
    const oldTime = new Date(Date.now() - 120000);
    fs.utimesSync(lockPath, oldTime, oldTime);
    const sbox = new DraftOutbox(staleFile, { staleLockMs: 1000 });
    assert.equal(sbox.add({ ...base, email: 'stale@example.test', key: 'stale-recovery-key-0001' }).status, 'DRAFT');
    assert(!fs.existsSync(lockPath));
  });

  check('active lock contention times out fail-closed without corrupting store', () => {
    const lockTestFile = path.join(dir, 'contention', 'store.json');
    const lbox = new DraftOutbox(lockTestFile, { lockTimeoutMs: 80, staleLockMs: 60000 });
    fs.mkdirSync(path.dirname(lockTestFile), { recursive: true });
    fs.writeFileSync(`${lockTestFile}.lock`, JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }));
    try {
      assert.throws(() => lbox.add({ ...base, key: 'contention-key-000001' }), /OUTBOX_LOCK_TIMEOUT/);
    } finally {
      fs.unlinkSync(`${lockTestFile}.lock`);
    }
  });

  check('privacy storage requirements metadata is frozen and explicit', () => {
    assert.equal(PRIVACY_STORAGE_REQUIREMENTS.developmentOnlyPlaintextJson, true);
    assert.equal(PRIVACY_STORAGE_REQUIREMENTS.credentialsInStoreForbidden, true);
  });

  console.log(n + '/' + n + ' PASS; NO SENDS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

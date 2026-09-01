'use strict';
/**
 * test_p3_7_token_ledger.js  (C11.16-P3.7)
 */
const path = require('path');
const db = require(path.join(__dirname, 'app_build', 'server', 'db.js'));
let pass = 0; let fail = 0;
function assert(label, cond, info) {
  if (cond) { console.log('  PASS: ' + label); pass++; }
  else { console.error('  FAIL: ' + label, info != null ? info : ''); fail++; }
}
async function run() {
  console.log('\n=== test_p3_7_token_ledger ===\n');
  const acctId = 'test-acct-' + Date.now();

  await db.initTokenLedger(acctId, { initialTokens: 10, isTestAccount: true });
  const l1 = db.getTokenLedger(acctId);
  assert('initTokenLedger: availableTokens=10', l1.availableTokens === 10);
  assert('initTokenLedger: reservedTokens=0', l1.reservedTokens === 0);

  const r2 = await db.reserveTokens(acctId, 3, 'test-job-1', 'TEST_RESERVE');
  assert('reserveTokens: success', r2.success === true);
  const l2 = db.getTokenLedger(acctId);
  assert('reserveTokens: available=7', l2.availableTokens === 7);
  assert('reserveTokens: reserved=3', l2.reservedTokens === 3);

  const r3 = await db.consumeTokens(acctId, 3, 'test-job-1', 'JOB_COMPLETED');
  assert('consumeTokens: success', r3.success === true);
  const l3 = db.getTokenLedger(acctId);
  assert('consumeTokens: reserved back to 0', l3.reservedTokens === 0);
  assert('consumeTokens: consumedTokens=3', l3.consumedTokens === 3);
  assert('consumeTokens: available still 7', l3.availableTokens === 7);

  await db.reserveTokens(acctId, 2, 'test-job-2', 'JOB_RESERVE');
  const r4 = await db.releaseTokens(acctId, 2, 'test-job-2', 'JOB_EXCEPTION');
  assert('FAILED_JOB_TOKEN_LOSS=0: releaseTokens success', r4.success === true);
  const l4 = db.getTokenLedger(acctId);
  assert('FAILED_JOB_TOKEN_LOSS=0: available restored to 7', l4.availableTokens === 7);
  assert('FAILED_JOB_TOKEN_LOSS=0: reserved back to 0', l4.reservedTokens === 0);

  try {
    await db.reserveTokens(acctId, 9999, 'overspend', 'OVERSPEND');
    assert('TOKEN_OVERSPEND_TEST: should have thrown', false, 'No error thrown');
  } catch (e) {
    assert('TOKEN_OVERSPEND_TEST: throws INSUFFICIENT_TOKEN_BALANCE', e.code === 'INSUFFICIENT_TOKEN_BALANCE');
  }

  await db.grantTokens(acctId, 5, 'TEST_GRANT');
  const l6 = db.getTokenLedger(acctId);
  assert('grantTokens: available=12', l6.availableTokens === 12);

  await db.refundTokens(acctId, 2, 'test-job-1', 'TEST_REFUND');
  const l7 = db.getTokenLedger(acctId);
  assert('refundTokens: consumed reduced', l7.consumedTokens === 1);
  assert('refundTokens: available+2=14', l7.availableTokens === 14);

  const txns = db.getTokenTransactions(acctId, 50);
  assert('getTokenTransactions: has entries', txns.length >= 5);
  assert('audit: RESERVE+CONSUME+RELEASE types', txns.some(function(t){return t.type==='TOKEN_RESERVE';}) && txns.some(function(t){return t.type==='TOKEN_CONSUME';}) && txns.some(function(t){return t.type==='TOKEN_RELEASE';}));

  const devId = 'dev-' + Date.now();
  const devLedger = db.getTokenLedger(devId, { isTestAccount: true });
  assert('INTERNAL_DEV auto-provision: 9999 tokens', devLedger.availableTokens === 9999);

  const cfg = db.getTokenCostConfig();
  assert('getTokenCostConfig: valid object', typeof cfg === 'object');
  assert('getTokenCostConfig: has token cost', typeof cfg.PRODUCT_3D_SINGLE_IMAGE_TOKEN_COST === 'number');

  console.log('\n=== RESULTS: ' + pass + ' passed, ' + fail + ' failed ===');
  if (fail > 0) process.exit(1);
}
run().catch(function(e) { console.error('FATAL:', e); process.exit(1); });

'use strict';
const assert = require('node:assert/strict');
const {
  GmailSendBlocked, rawGmailMime, selectAccount, sendViaGmailApi
} = require('../companion/gmail-sender-foundation');

function blocked(code, fn) {
  assert.throws(fn, e => e instanceof GmailSendBlocked && e.code === code);
}
function baseOptions() {
  return {
    from: 'sender@gmail.com', to: 'test@example.com',
    verifiedFromAddresses: ['sender@gmail.com'],
    displayName: 'STUDIOBERRY PLUS', subject: 'New studio',
    text: 'Hello. Unsubscribe with the link below.',
    html: '<p>Hello</p><a href="https://unsubscribe.vivpr.pro/unsubscribe/abc">Unsubscribe</a>',
    unsubscribeUrl: 'https://unsubscribe.vivpr.pro/unsubscribe/abc',
    campaignAuthorized: true, recipientEligible: true, ledgerIntentPersisted: true
  };
}

(async function run() {
  let checks = 0;
  const raw = rawGmailMime(baseOptions());
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /From: "STUDIOBERRY PLUS" <sender@gmail.com>/);
  assert.match(decoded, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(decoded, /Content-Type: multipart\/alternative/);
  checks++;

  blocked('UNVERIFIED_SEND_AS', () => rawGmailMime({ ...baseOptions(), from:'fake@vivpr.pro' }));
  blocked('INVALID_HEADER', () => rawGmailMime({ ...baseOptions(), subject:'evil\r\nBcc: spam@example.com' }));
  blocked('UNSUBSCRIBE_URL_NOT_VERIFIED', () => rawGmailMime({
    ...baseOptions(), unsubscribeUrl:'https://attacker.example/unsubscribe/abc'
  }));
  blocked('RECIPIENT_OR_LEDGER_BLOCKED', () => rawGmailMime({
    ...baseOptions(), ledgerIntentPersisted:false
  }));
  checks += 4;

  const account = {
    id:'a',email:'sender@gmail.com', type:'gmail_personal', ownerAuthorized:true,
    connected:true, verified:true, sent24h:2,cap24h:100
  };
  const opts = {
    accounts:[account],mode:'SINGLE_ACCOUNT',accountId:'a',
    recipientEligible:true,ledgerIntentPersisted:true,campaignAuthorized:true,
    domainSent24h:2,domainCap24h:200
  };
  assert.equal(selectAccount(opts).accountId, 'a');
  blocked('DOMAIN_LEDGER_UNKNOWN', () => selectAccount({...opts, domainSent24h:undefined}));
  blocked('DOMAIN_CAP_REACHED', () => selectAccount({...opts, domainSent24h:200}));
  blocked('ACCOUNT_CAP_REACHED_PAUSE_CAMPAIGN', () => selectAccount({
    ...opts, accounts:[{...account,sent24h:100}]
  }));
  blocked('ACCOUNT_LEDGER_OR_CONSERVATIVE_CAP_UNKNOWN', () => selectAccount({
    ...opts, accounts:[{...account,cap24h:500}]
  }));
  blocked('ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN', () => selectAccount({
    ...opts, accounts:[{...account, providerBlocked:true}]
  }));
  checks += 6;

  const b = {...account, id:'b',email:'second@gmail.com'};
  const pooled = {
    ...opts, mode:'APPROVED_ACCOUNT_POOL',accountIds:['a','b'],
    accounts:[account,b],recipientHash:'a'.repeat(64)
  };
  const first = selectAccount(pooled).accountId;
  assert.equal(selectAccount(pooled).accountId, first);
  blocked('ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN', () => selectAccount({
    ...pooled, accounts:[first === 'a' ? {...account, connected:false} : account,
      first === 'b' ? {...b, connected:false} : b]
  }));
  checks += 2;

  const transport = await sendViaGmailApi({
    approved:true, accessToken:'SYNTHETIC_TEST_TOKEN', raw,
    fetchImpl:async (url, request) => {
      assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      assert.equal(request.method,'POST');
      assert.deepEqual(JSON.parse(request.body),{raw});
      return {status:200,json:async()=>({id:'gmail-opaque-id'})};
    }
  });
  assert.deepEqual(transport, {
    status:'GMAIL_API_ACCEPTED', providerMessageId:'gmail-opaque-id',
    threadId:null, delivery:'UNKNOWN', inbox:'UNKNOWN'
  });
  checks++;

  for (const status of [403,429]) {
    await assert.rejects(sendViaGmailApi({
      approved:true, accessToken:'token', raw,
      fetchImpl:async()=>({status})
    }), e => e.code === 'GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL' && e.retryable === false);
    checks++;
  }
  await assert.rejects(sendViaGmailApi({
    approved:true, accessToken:'token', raw,
    fetchImpl:async()=>{ throw new Error('connection reset');}
  }), e => e.code === 'GMAIL_UNKNOWN_RESULT_NO_AUTORETRY' && e.retryable === false);
  checks++;
  await assert.rejects(sendViaGmailApi({
    approved:false, accessToken:'token', raw, fetchImpl:async()=>{throw Error('must not run');}
  }), e => e.code === 'GMAIL_AUTH_OR_APPROVAL_MISSING');
  checks++;

  console.log('XPIDER Gmail sender foundation: ' + checks + '/' + checks + ' PASS; ZERO REAL SENDS');
  const integrationTest = require('node:path').join(__dirname, 'run_gmail_v71_integration.js');
  if (require('node:fs').existsSync(integrationTest)) {
    const r = require('node:child_process').spawnSync(process.execPath, [integrationTest], { stdio: 'inherit' });
    if (r.status !== 0) process.exitCode = r.status || 1;
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

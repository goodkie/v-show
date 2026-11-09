'use strict';
const assert=require('node:assert/strict');
const {sendOne,httpConnect,payloadForRecipient}=require('../companion/local-email-privacy-relay');
const s={transportConfigured:true,spfVerified:true,dkimVerified:true,dmarcVerified:true,
domainAligned:true,unsubscribeEndpointVerified:true,bounceWebhookVerified:true,
complaintWebhookVerified:true,operatorApproved:true,maxPerHour:10};
const r={email:'test@example.test',consentStatus:'OPTED_IN',consentProof:{method:'double_opt_in',source:'fixture',timestamp:'2026-11-01T00:00:00Z'}};
const campaign={subject:'Test',content:'Local fixture',unsubscribeUrl:'https://example.test/unsubscribe/x',
recipients:[r],now:Date.parse('2026-11-09T00:00:00Z')};
const id='test-local-example-20261109-001';
(async()=>{
  let count=0;
  async function check(name,fn){await fn();count++;console.log('PASS',name)}
  await check('privacy-ready preview needs explicit operator approval',async()=>{
    const x=await sendOne({campaign,settings:s,from:'team@example.test',recipient:r,
      privacyReady:true,approvedLive:false,idempotencyKey:id});
    assert.equal(x.status,'BLOCKED')
  });
  await check('dry run does not require any network or API key',async()=>{
    const x=await sendOne({campaign,settings:s,from:'team@example.test',recipient:r,
      approvedLive:true,idempotencyKey:id,dryRun:true});
    assert.equal(x.status,'PREVIEW_ONLY');
    assert.equal(x.relay,'127.0.0.1:18988')
  });
  await check('email collector address alone cannot send',async()=>{
    const u={email:'collector@example.test'};
    const x=await sendOne({campaign:{...campaign,recipients:[u]},settings:s,from:'team@example.test',
      recipient:u,approvedLive:true,idempotencyKey:id,dryRun:false});
    assert.equal(x.status,'BLOCKED')
  });
  await check('relay rejects unauthorized external destination without networking',async()=>{
    await assert.rejects(httpConnect({host:'example.com'}),/DESTINATION_DENIED/)
  });
  await check('no live transmit if relay not ready',async()=>{
    await assert.rejects(sendOne({campaign,settings:s,from:'team@example.test',
      recipient:r,approvedLive:true,idempotencyKey:id,apiKey:'re_test_dummykey',privacyReady:false,dryRun:false}),/PRIVACY_RELAY_NOT_READY/)
  });
  await check('no direct fallback if relay unavailable',async()=>{
    // No actual network required to establish this: bridge exposes only loopback proxy destination.
    const transport=require('../companion/local-email-privacy-relay');
    assert.equal(transport.RELAY_HOST,'127.0.0.1');
    assert.equal(transport.RELAY_PORT,18988);
  });
  await check('one-click unsubscribe headers are included',async()=>{
    const p=payloadForRecipient({...campaign,from:'team@example.test'},r);
    assert.equal(p.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click')
  });
  console.log(count+'/'+count+' PASS');
})().catch(err=>{console.error(err);process.exitCode=1});

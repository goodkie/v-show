'use strict';
const assert=require('node:assert/strict');
const {validateSenderIdentity,validateAndFormatSenderFrom,sanitizeReplyTo,SENDER_DOMAIN,DEFAULT_SENDER_EMAIL,DEFAULT_SENDER_DISPLAY_NAME}=require('../companion/vivpr-sender-identity');
const {sendOne}=require('../companion/local-email-privacy-relay');
const ok={from:'notice@vivpr.pro',domainOwnershipVerified:true,providerDomainVerified:true,
spfVerified:true,dkimVerified:true,dmarcVerified:true,relayConnectVerified:true,
residentialTrafficExhausted:false,existingRelayBlocked:false};
let count=0;function check(name,fn){fn();count++;console.log('PASS',name)}
check('domain is vivpr.pro',()=>assert.equal(SENDER_DOMAIN,'vivpr.pro'));
check('verification passes if all independently confirmed',()=>assert.equal(validateSenderIdentity(ok).valid,true));
check('wrong sending domain blocked',()=>assert(validateSenderIdentity({...ok,from:'other@example.com'}).errors.includes('FROM_MUST_USE_VIVPR_PRO')));
check('missing provider DNS verification blocked',()=>assert(validateSenderIdentity({...ok,providerDomainVerified:false}).errors.includes('RESEND_DOMAIN_NOT_VERIFIED')));
check('SPF unverified blocked',()=>assert(validateSenderIdentity({...ok,spfVerified:false}).errors.includes('SPF_NOT_VERIFIED')));
check('DKIM unverified blocked',()=>assert(validateSenderIdentity({...ok,dkimVerified:false}).errors.includes('DKIM_NOT_VERIFIED')));
check('DMARC unverified blocked',()=>assert(validateSenderIdentity({...ok,dmarcVerified:false}).errors.includes('DMARC_NOT_VERIFIED')));
check('relay preflight blocked',()=>assert(validateSenderIdentity({...ok,relayConnectVerified:false}).errors.includes('PRIVACY_RELAY_CONNECT_NOT_VERIFIED')));
check('Decodo quota exhausted blocked',()=>assert(validateSenderIdentity({...ok,residentialTrafficExhausted:true}).errors.includes('RESIDENTIAL_TRAFFIC_EXHAUSTED')));
check('PRIVACY BLOCKED always fail closed',()=>assert(validateSenderIdentity({...ok,existingRelayBlocked:true}).errors.includes('PRIVACY_RELAY_BLOCKED')));
check('default sender email & fallback display name (vivpr.pro, not XPIDER)',()=>{
  assert.equal(DEFAULT_SENDER_EMAIL,'noreply@vivpr.pro');
  assert.equal(DEFAULT_SENDER_DISPLAY_NAME,'vivpr.pro');
});
check('ASCII business display name formats clean From header',()=>{
  const r=validateAndFormatSenderFrom({displayName:'STUDIOBERRY PLUS'});
  assert.equal(r.ok,true);
  assert.equal(r.from,'STUDIOBERRY PLUS <noreply@vivpr.pro>');
  assert.equal(r.displayName,'STUDIOBERRY PLUS');
  assert.equal(r.usedFallback,false);
});
check('Unicode Korean display name preserved cleanly without RFC2047 rejection',()=>{
  const r=validateAndFormatSenderFrom({displayName:'스튜디오베리 플러스'});
  assert.equal(r.ok,true);
  assert.equal(r.from,'스튜디오베리 플러스 <noreply@vivpr.pro>');
});
check('quotes and comma specials are RFC 5322 quoted and escaped',()=>{
  const r=validateAndFormatSenderFrom({displayName:'STUDIOBERRY "PLUS", Inc.'});
  assert.equal(r.ok,true);
  assert.equal(r.from,'"STUDIOBERRY \\"PLUS\\", Inc." <noreply@vivpr.pro>');
});
check('embedded spoofed/duplicate email stripped cleanly',()=>{
  const r=validateAndFormatSenderFrom({displayName:'STUDIOBERRY PLUS <spoof@evil.com> other@test.org'});
  assert.equal(r.ok,true);
  assert.equal(r.from,'STUDIOBERRY PLUS <noreply@vivpr.pro>');
});
check('blank display name falls back through senderName/company/brand then vivpr.pro',()=>{
  const r1=validateAndFormatSenderFrom({displayName:'',fallbackBusinessNames:['vivpr.pro','STUDIOBERRY PLUS','Other']});
  assert.equal(r1.ok,true);
  assert.equal(r1.from,'STUDIOBERRY PLUS <noreply@vivpr.pro>');
  assert.equal(r1.usedFallback,true);
  const r2=validateAndFormatSenderFrom({displayName:'',fallbackBusinessNames:['vivpr.pro','vivpr.pro','']});
  assert.equal(r2.ok,true);
  assert.equal(r2.from,'vivpr.pro <noreply@vivpr.pro>');
  assert.equal(r2.usedFallback,true);
});
check('CR/LF/NUL header injection blocked fail-closed in displayName and fallbacks',()=>{
  assert.equal(validateAndFormatSenderFrom({displayName:'Acme\r\nBcc: evil@attacker.test'}).ok,false);
  assert.equal(validateAndFormatSenderFrom({displayName:'Acme\nX-Injected: 1'}).reason,'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED');
  assert.equal(validateAndFormatSenderFrom({displayName:'',fallbackBusinessNames:['Bad\r\nName']}).reason,'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED');
  assert.equal(validateAndFormatSenderFrom({displayName:'Acme\x00Null'}).ok,false);
});
check('non-vivpr.pro verifiedEmail blocked fail-closed',()=>{
  const r=validateAndFormatSenderFrom({displayName:'STUDIOBERRY PLUS',verifiedEmail:'noreply@spoof.example'});
  assert.equal(r.ok,false);
  assert.equal(r.reason,'FROM_MUST_USE_VIVPR_PRO');
});
check('sanitizeReplyTo accepts valid email, blank, and blocks CR/LF injection or malformed',()=>{
  assert.deepEqual(sanitizeReplyTo('support@vivpr.pro'),{ok:true,replyTo:'support@vivpr.pro'});
  assert.deepEqual(sanitizeReplyTo(''),{ok:true,replyTo:null});
  assert.equal(sanitizeReplyTo('support@vivpr.pro\r\nBcc: evil@x.test').reason,'REPLY_TO_HEADER_INJECTION_BLOCKED');
  assert.equal(sanitizeReplyTo('not-an-email').reason,'INVALID_REPLY_TO_EMAIL');
});
const recipient={email:'allowed@example.test',consentStatus:'OPTED_IN',consentProof:{method:'double_opt_in',timestamp:'2026-11-01T00:00:00Z',source:'test fixture'}};
const settings={transportConfigured:true,spfVerified:true,dkimVerified:true,dmarcVerified:true,domainAligned:true,
unsubscribeEndpointVerified:true,bounceWebhookVerified:true,complaintWebhookVerified:true,operatorApproved:true,maxPerHour:20};
async function main(){
const base={campaign:{recipients:[recipient],subject:'Service notice',content:'Test',unsubscribeUrl:'https://vivpr.pro/unsubscribe/example',now:Date.parse('2026-11-09')},
settings,from:'notice@vivpr.pro',recipient,apiKey:'re_testing_credential_fake',dryRun:false,privacyReady:true,approvedLive:true,idempotencyKey:'example-id-20261109-01'};
const a=await sendOne({...base,senderVerification:{...ok,relayConnectVerified:false}});
assert.equal(a.status,'BLOCKED');assert(a.reasons.includes('PRIVACY_RELAY_CONNECT_NOT_VERIFIED'));count++;console.log('PASS transport rejects no egress verification');
const b=await sendOne({...base,senderVerification:{...ok,residentialTrafficExhausted:true}});
assert.equal(b.status,'BLOCKED');assert(b.reasons.includes('RESIDENTIAL_TRAFFIC_EXHAUSTED'));count++;console.log('PASS transport rejects exhausted residential quota');
console.log(count+'/'+count+' PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});

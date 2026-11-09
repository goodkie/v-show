'use strict';
const assert=require('node:assert/strict');
const {validateSenderIdentity,SENDER_DOMAIN}=require('../companion/vivpr-sender-identity');
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

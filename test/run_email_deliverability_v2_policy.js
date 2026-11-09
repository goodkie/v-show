'use strict';
const assert=require('node:assert/strict');
const {evaluate}=require('../companion/email-deliverability-v2-policy');
const valid={messageClass:'SERVICE_NOTIFICATION',recipientAuthorizationEvidenceVerified:true,fromDomain:'vivpr.pro',
domainOwnershipVerified:true,resendDomainVerified:true,spfVerified:true,dkimVerified:true,dmarcAlignedVerified:true,
replyToMailboxMonitored:true,suppressionListCurrent:true,bounceComplaintEventsCurrent:true,providerAccountApproved:true,
relayReady:true,relayConnectVerified:true,residentialQuotaExhausted:false,relayHttp407:false,
providerLimitsClear:true,ownerExplicitApproval:true};
const cases=[
['base verification only allows review',valid,'REVIEW',null],
['scraped addresses blocked',{...valid,scrapedContacts:true},'BLOCK','UNSOLICITED_SOURCE_DENIED'],
['cold outreach blocked',{...valid,coldOutreach:true},'BLOCK','UNSOLICITED_SOURCE_DENIED'],
['missing domain alignment blocked',{...valid,dmarcAlignedVerified:false},'BLOCK','DMARC_ALIGNMENT_UNVERIFIED'],
['unverified provider blocked',{...valid,resendDomainVerified:false},'BLOCK','RESEND_DOMAIN_UNVERIFIED'],
['privacy relay blocked',{...valid,relayReady:false},'BLOCK','PRIVACY_RELAY_NOT_VERIFIED'],
['HTTP 407 blocked',{...valid,relayHttp407:true},'BLOCK','RESIDENTIAL_UPSTREAM_HTTP_407'],
['traffic exhausted blocked',{...valid,residentialQuotaExhausted:true},'BLOCK','RESIDENTIAL_UPSTREAM_HTTP_407'],
['complaint spike blocked',{...valid,activeComplaintSpike:true},'BLOCK','DELIVERABILITY_RATE_SPIKE'],
['missing consent evidence blocked',{...valid,recipientAuthorizationEvidenceVerified:false},'BLOCK','RECIPIENT_AUTHORIZATION_UNKNOWN'],
['wrong domain blocked',{...valid,fromDomain:'unverified.test'},'BLOCK','FROM_DOMAIN_NOT_VIVPR_PRO'],
['marketing needs one click unsubscribe',{...valid,messageClass:'CONSENTED_MARKETING'},'BLOCK','ONE_CLICK_UNSUBSCRIBE_NOT_VERIFIED'],
['marketing must have visible unsubscribe',{...valid,messageClass:'CONSENTED_MARKETING',unsubscribeOneClickVerified:true},'BLOCK','VISIBLE_UNSUBSCRIBE_NOT_VERIFIED'],
['fully verified marketing only eligible for review',{...valid,messageClass:'CONSENTED_MARKETING',unsubscribeOneClickVerified:true,unsubscribeVisibleVerified:true},'REVIEW',null],
['none of these gates enable unattended sending',{...valid},'REVIEW',null],
];
let count=0;
for(const [name,v,expected,reason] of cases){const out=evaluate(v);assert.equal(out.action,expected,name);
if(reason)assert(out.reasons.includes(reason),name);assert.equal(out.readyForUnattendedSend,false);assert.equal(out.inboxPlacementGuaranteed,false);count++;console.log('PASS',name)}
console.log(count+'/'+count+' PASS');

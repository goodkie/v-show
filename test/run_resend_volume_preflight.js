'use strict';
const assert=require('node:assert/strict');
const {planVolume}=require('../companion/resend-volume-preflight');
const good={monthlyCount:10000,messageClass:'SERVICE_NOTIFICATION',scrapedOrPurchased:false,coldOutreach:false,
recipientAuthorizationVerified:true,domainOwnershipVerified:true,resendAccountApproved:true,
spfVerified:true,dkimVerified:true,dmarcVerified:true,suppressionSyncVerified:true,
unsubscribeVerified:true,privacyRelayDestinationPreflightPassed:true,ownerHourlyCap:20,explicitLiveApproval:true};
function run(){
 let n=0;function t(name,fn){fn();n++;console.log('PASS',name)}
 t('10k capacity needs approx 14 per hour',()=>{let x=planVolume(good);assert.equal(x.averageHourly,14);assert.equal(x.readyForLiveSend,true)});
 t('50k with cap 20 denied',()=>{let x=planVolume({...good,monthlyCount:50000});assert.equal(x.readyForLiveSend,false);assert(x.blockingReasons.includes('CAP_TOO_LOW_FOR_MONTHLY_TARGET'))});
 t('scraped contacts blocked',()=>assert.equal(planVolume({...good,scrapedOrPurchased:true}).readyForLiveSend,false));
 t('cold outreach blocked',()=>assert.equal(planVolume({...good,coldOutreach:true}).readyForLiveSend,false));
 t('sender ownership required',()=>assert.equal(planVolume({...good,domainOwnershipVerified:false}).readyForLiveSend,false));
 t('account approval required',()=>assert.equal(planVolume({...good,resendAccountApproved:false}).readyForLiveSend,false));
 t('relay API egress check required',()=>assert.equal(planVolume({...good,privacyRelayDestinationPreflightPassed:false}).readyForLiveSend,false));
 t('SPF DKIM DMARC all required',()=>assert.equal(planVolume({...good,dkimVerified:false}).readyForLiveSend,false));
 t('suppression and unsubscribe required',()=>assert.equal(planVolume({...good,unsubscribeVerified:false}).readyForLiveSend,false));
 t('operator live approval required',()=>assert.equal(planVolume({...good,explicitLiveApproval:false}).readyForLiveSend,false));
 t('no residential rotation mode',()=>assert.equal(planVolume(good).relayUsage,'HTTPS_CONNECT_ONLY_NO_RESIDENTIAL_ROTATION'));
 console.log(n+'/'+n+' PASS');
}
run();

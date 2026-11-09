/**
 * XPIDER Deliverability V2 release gate.
 * Side-effect-free. Never sends, changes relay settings or trusts collector data.
 * booleans passed into this policy are diagnostic evidence flags only; production
 * mail worker MUST independently check provider/DNS and durable authorization.
 */
'use strict';
const DOMAIN='vivpr.pro';
const ALLOWED_CLASSES=new Set(['TRANSACTIONAL','SERVICE_NOTIFICATION','CONSENTED_MARKETING']);
const RISK_ACTIONS=Object.freeze({BLOCK:'BLOCK',HOLD:'HOLD',REVIEW:'REVIEW',PREVIEW:'PREVIEW'});
function evaluate(input={}){
  const reasons=[];
  const add=(when,reason)=>{if(when)reasons.push(reason)};
  const kind=String(input.messageClass||'').toUpperCase();
  add(!ALLOWED_CLASSES.has(kind),'MESSAGE_CLASS_UNRECOGNIZED');
  add(input.coldOutreach===true||input.scrapedContacts===true||input.purchasedContacts===true,'UNSOLICITED_SOURCE_DENIED');
  add(input.recipientAuthorizationEvidenceVerified!==true,'RECIPIENT_AUTHORIZATION_UNKNOWN');
  add(input.fromDomain!==DOMAIN,'FROM_DOMAIN_NOT_VIVPR_PRO');
  add(input.domainOwnershipVerified!==true,'DOMAIN_OWNERSHIP_UNVERIFIED');
  add(input.resendDomainVerified!==true,'RESEND_DOMAIN_UNVERIFIED');
  add(input.spfVerified!==true,'SPF_UNVERIFIED');
  add(input.dkimVerified!==true,'DKIM_UNVERIFIED');
  add(input.dmarcAlignedVerified!==true,'DMARC_ALIGNMENT_UNVERIFIED');
  add(input.replyToMailboxMonitored!==true,'REPLY_TO_NOT_MONITORED');
  add(input.suppressionListCurrent!==true,'SUPPRESSION_LIST_NOT_CURRENT');
  add(input.bounceComplaintEventsCurrent!==true,'BOUNCE_COMPLAINT_MONITORING_MISSING');
  const mustUnsub=kind==='CONSENTED_MARKETING';
  add(mustUnsub && input.unsubscribeOneClickVerified!==true,'ONE_CLICK_UNSUBSCRIBE_NOT_VERIFIED');
  add(mustUnsub && input.unsubscribeVisibleVerified!==true,'VISIBLE_UNSUBSCRIBE_NOT_VERIFIED');
  add(input.providerAccountApproved!==true,'PROVIDER_NOT_APPROVED');
  add(input.relayReady!==true || input.relayConnectVerified!==true,'PRIVACY_RELAY_NOT_VERIFIED');
  add(input.residentialQuotaExhausted===true || input.relayHttp407===true,'RESIDENTIAL_UPSTREAM_HTTP_407');
  add(input.providerLimitsClear!==true,'PROVIDER_LIMIT_UNKNOWN');
  add(input.ownerExplicitApproval!==true,'OWNER_APPROVAL_REQUIRED');
  // Mailbox provider/ESP IP reputation is monitored, not falsely asserted by upstream residential IP.
  add(input.activeComplaintSpike===true || input.activeBounceSpike===true,'DELIVERABILITY_RATE_SPIKE');
  return Object.freeze({mode:'NO_SEND_GATE',domain:DOMAIN,provider:'RESEND_SHARED_POOL',
    action:reasons.length?'BLOCK':'REVIEW',reasons,readyForUnattendedSend:false,
    inboxPlacementGuaranteed:false});
}
module.exports={evaluate,RISK_ACTIONS,DOMAIN};

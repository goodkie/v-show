/**
 * XPIDER monthly sender capacity and safe onboarding gate.
 * This module plans verified operational email only; it cannot send messages.
 */
'use strict';
const VALID = new Set(['TRANSACTIONAL','SERVICE_NOTIFICATION','CONSENTED_MARKETING']);
function planVolume(input={}){
  const monthly=Math.max(0,Math.floor(Number(input.monthlyCount)||0));
  const kind=String(input.messageClass||'').toUpperCase();
  const errors=[];
  if(!VALID.has(kind))errors.push('MESSAGE_CLASSIFICATION_REQUIRED');
  if(input.scrapedOrPurchased===true || input.coldOutreach===true)errors.push('UNSOLICITED_EMAIL_NOT_SUPPORTED');
  if(input.recipientAuthorizationVerified!==true)errors.push('RECIPIENT_AUTHORIZATION_NOT_VERIFIED');
  if(input.domainOwnershipVerified!==true)errors.push('DOMAIN_OWNERSHIP_NOT_VERIFIED');
  if(input.resendAccountApproved!==true)errors.push('RESEND_APPROVAL_REQUIRED');
  if(input.spfVerified!==true || input.dkimVerified!==true || input.dmarcVerified!==true)errors.push('DOMAIN_AUTHENTICATION_INCOMPLETE');
  if(input.suppressionSyncVerified!==true || input.unsubscribeVerified!==true)errors.push('SUPPRESSION_AND_UNSUBSCRIBE_REQUIRED');
  if(input.privacyRelayDestinationPreflightPassed!==true)errors.push('RELAY_API_DESTINATION_NOT_VERIFIED');
  if(!Number.isFinite(monthly)||monthly<1||monthly>50000)errors.push('OUTSIDE_SELECTED_PRO_PLAN');
  // This is an even-distribution estimate, not a delivery schedule or spam bypass.
  const perDay=monthly/30;
  const perHour=monthly/(30*24);
  const ownerHourlyCap=Number(input.ownerHourlyCap);
  if(!Number.isInteger(ownerHourlyCap)||ownerHourlyCap<1||ownerHourlyCap>100)errors.push('HOURLY_CAP_NOT_APPROVED');
  if(Number.isInteger(ownerHourlyCap)&&ownerHourlyCap<Math.ceil(perHour))errors.push('CAP_TOO_LOW_FOR_MONTHLY_TARGET');
  return {
    provider:'RESEND_PRO', monthlyUSD:20, includedPerMonth:50000, requestedMonthly:monthly,
    averageDaily:Math.ceil(perDay),averageHourly:Math.ceil(perHour),
    mode:'PLAN_ONLY',readyForLiveSend:errors.length===0 && input.explicitLiveApproval===true,
    blockingReasons:errors.concat(input.explicitLiveApproval===true?[]:['LIVE_APPROVAL_REQUIRED']),
    relayUsage:'HTTPS_CONNECT_ONLY_NO_RESIDENTIAL_ROTATION'
  };
}
module.exports={planVolume};

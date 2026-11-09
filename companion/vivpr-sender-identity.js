/**
 * XPIDER sending identity for the owner-provided domain vivpr.pro.
 * Domain ownership, DNS, mailbox/SMTP and provider approval are not inferred.
 * A bare domain is NOT an SMTP hostname.
 */
'use strict';
const SENDER_DOMAIN='vivpr.pro';
const PROVIDER='resend';
const RELAY_PROXY='http://127.0.0.1:18988';
function validateSenderIdentity(value={}){
  const errors=[];
  const from=String(value.from||'').trim().toLowerCase();
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vivpr\.pro$/.test(from))errors.push('FROM_MUST_USE_VIVPR_PRO');
  if(value.domainOwnershipVerified!==true) errors.push('DOMAIN_OWNERSHIP_NOT_VERIFIED');
  if(value.providerDomainVerified!==true) errors.push('RESEND_DOMAIN_NOT_VERIFIED');
  if(value.spfVerified!==true) errors.push('SPF_NOT_VERIFIED');
  if(value.dkimVerified!==true) errors.push('DKIM_NOT_VERIFIED');
  if(value.dmarcVerified!==true) errors.push('DMARC_NOT_VERIFIED');
  if(value.relayConnectVerified!==true) errors.push('PRIVACY_RELAY_CONNECT_NOT_VERIFIED');
  if(value.residentialTrafficExhausted===true) errors.push('RESIDENTIAL_TRAFFIC_EXHAUSTED');
  if(value.existingRelayBlocked===true) errors.push('PRIVACY_RELAY_BLOCKED');
  return {valid:errors.length===0,errors,domain:SENDER_DOMAIN,provider:PROVIDER,relayProxy:RELAY_PROXY};
}
module.exports={SENDER_DOMAIN,PROVIDER,RELAY_PROXY,validateSenderIdentity};

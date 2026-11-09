/**
 * Resend test-mode address gate. No network calls.
 * Test mode can only target official Resend event simulator recipients.
 * Production requires separately authenticated vivpr.pro sending identity.
 */
'use strict';
const TEST_FROM='onboarding@resend.dev';
const TEST_RECIPIENTS=Object.freeze([
  'delivered@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev'
]);
const TEST_TO=new Set(TEST_RECIPIENTS);
function check(input={}){
  const mode=String(input.mode||'').toUpperCase();
  const from=String(input.from||'').trim().toLowerCase();
  const to=Array.isArray(input.to)?input.to:[input.to];
  const recipients=to.map(v=>String(v||'').trim().toLowerCase());
  const reasons=[];
  if(mode!=='TEST'&&mode!=='PRODUCTION') reasons.push('MODE_REQUIRED');
  if(mode==='TEST'){
    if(from!==TEST_FROM)reasons.push('TEST_FROM_MUST_BE_RESEND_DEV');
    if(recipients.length!==1 || !TEST_TO.has(recipients[0])) reasons.push('TEST_RECIPIENT_NOT_ALLOWED');
    if(input.allowExternalRecipients===true)reasons.push('TEST_EXTERNAL_RECIPIENTS_DENIED');
  }
  if(mode==='PRODUCTION'){
    if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vivpr\.pro$/.test(from))reasons.push('PRODUCTION_SENDER_NOT_VIVPR_PRO');
    if(recipients.length!==1 || !recipients[0] || TEST_TO.has(recipients[0]))reasons.push('PRODUCTION_RECIPIENT_INVALID');
    if(input.providerDomainVerified!==true)reasons.push('PRODUCTION_PROVIDER_DOMAIN_NOT_VERIFIED');
    if(input.recipientAuthorizationVerified!==true)reasons.push('PRODUCTION_RECIPIENT_AUTHORIZATION_REQUIRED');
  }
  return Object.freeze({mode,allowed:reasons.length===0,reasons,from,recipientCount:recipients.length,
    testModeIsolated:mode==='TEST',sendEnabled:false});
}
module.exports={TEST_FROM,TEST_RECIPIENTS,check};

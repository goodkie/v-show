/**
 * XPIDER consent-based email delivery preflight (no transport, no hidden send).
 * Pure functions: suitable for popup preview and trusted server-side re-validation.
 * Collected/discovered addresses are NEVER evidence of opt-in.
 */
(function(root,factory){
  if(typeof module === 'object' && module.exports) module.exports=factory();
  else root.XpiderEmailDeliveryPolicy=factory();
})(typeof globalThis !== 'undefined' ? globalThis : this,function(){
  'use strict';
  const MAX_BATCH = 50;
  function normalizedAddress(value){
    const s=String(value || '').trim().toLowerCase();
    if(s.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)) return null;
    return s;
  }
  function validConsent(row, now){
    if(row.consentStatus!=='OPTED_IN') return false;
    if(!row.consentProof || typeof row.consentProof !== 'object') return false;
    const proof=row.consentProof;
    if(!['signup_form','double_opt_in','written_permission','existing_customer_marketing_permission'].includes(proof.method)) return false;
    if(typeof proof.timestamp!=='string' || !Number.isFinite(Date.parse(proof.timestamp))) return false;
    if(Date.parse(proof.timestamp)>now) return false;
    if(typeof proof.source!=='string' || !proof.source.trim()) return false;
    return true;
  }
  function validateSettings(settings){
    const s=settings || {};
    const errors=[];
    if(s.transportConfigured!==true) errors.push('TRANSPORT_NOT_CONFIGURED');
    if(s.spfVerified!==true) errors.push('SPF_NOT_VERIFIED');
    if(s.dkimVerified!==true) errors.push('DKIM_NOT_VERIFIED');
    if(s.dmarcVerified!==true) errors.push('DMARC_NOT_VERIFIED');
    if(s.domainAligned!==true) errors.push('FROM_DOMAIN_NOT_ALIGNED');
    if(s.unsubscribeEndpointVerified!==true) errors.push('ONE_CLICK_UNSUBSCRIBE_NOT_VERIFIED');
    if(s.bounceWebhookVerified!==true) errors.push('BOUNCE_WEBHOOK_NOT_VERIFIED');
    if(s.complaintWebhookVerified!==true) errors.push('COMPLAINT_WEBHOOK_NOT_VERIFIED');
    if(s.operatorApproved!==true) errors.push('OPERATOR_APPROVAL_REQUIRED');
    if(!Number.isInteger(s.maxPerHour) || s.maxPerHour<1 || s.maxPerHour>100) errors.push('INVALID_HOURLY_LIMIT');
    return errors;
  }
  function planCampaign(input){
    const c=input || {};
    const now=Number.isFinite(c.now)?c.now:Date.now();
    const reasons=validateSettings(c.settings);
    const excluded=[];
    const recipients=[];
    const seen=new Set();
    const suppressed=new Set((c.suppressionList || []).map(normalizedAddress).filter(Boolean));
    const rows=Array.isArray(c.recipients)?c.recipients:[];
    if(!c.subject || !String(c.subject).trim()) reasons.push('SUBJECT_REQUIRED');
    if(!c.content || !String(c.content).trim()) reasons.push('CONTENT_REQUIRED');
    if(!c.unsubscribeUrl || !/^https:\/\/[^\s]+$/.test(c.unsubscribeUrl)) reasons.push('HTTPS_UNSUBSCRIBE_URL_REQUIRED');
    for(const row of rows){
      const r=row || {};
      const address=normalizedAddress(r.email);
      let code=null;
      if(!address) code='INVALID_ADDRESS';
      else if(seen.has(address)) code='DUPLICATE';
      else if(suppressed.has(address) || r.unsubscribed===true || r.bounced===true || r.complained===true) code='SUPPRESSED';
      else if(!validConsent(r,now)) code='CONSENT_NOT_VERIFIED';
      if(address) seen.add(address);
      if(code) excluded.push({index:recipients.length+excluded.length,reason:code});
      else recipients.push({email:address,consentMethod:r.consentProof.method});
    }
    if(recipients.length===0) reasons.push('NO_ELIGIBLE_RECIPIENTS');
    if(recipients.length>MAX_BATCH) reasons.push('BATCH_EXCEEDS_SAFE_LIMIT');
    const approved=reasons.length===0;
    // Do not include addresses in logs; a separate authenticated service must send.
    return {approved,mode:'PREVIEW_ONLY',eligibleCount:recipients.length,excludedCount:excluded.length,
      excluded,blockingReasons:reasons,recipientPreview:approved?recipients:[]};
  }
  return Object.freeze({planCampaign,validateSettings,normalizedAddress,MAX_BATCH});
});

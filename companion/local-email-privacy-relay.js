/**
 * XPIDER local-only email transport bridge.
 * The Privacy Relay is an HTTP CONNECT egress proxy, NOT an SMTP server.
 * No direct-network fallback; no email is sent without a distinct live opt-in.
 * This module does not modify or restart the existing relay or its firewall.
 */
'use strict';
const http = require('node:http');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { planCampaign, normalizedAddress } = require('../extension/modules/email-delivery-policy');

const RELAY_HOST = '127.0.0.1';
const RELAY_PORT = 18988;
const RESEND_API_HOST = 'api.resend.com';
function assertConfig(c) {
  if (!c || c.provider !== 'resend') throw new Error('PROVIDER_UNSUPPORTED');
  if (!c.from || !normalizedAddress(c.from)) throw new Error('VERIFIED_FROM_ADDRESS_REQUIRED');
  if (!c.apiKey || !/^re_[a-zA-Z0-9_-]{8,}$/.test(c.apiKey)) throw new Error('PROVIDER_API_KEY_REQUIRED');
  if (c.privacyReady !== true) throw new Error('PRIVACY_RELAY_NOT_READY');
}
function httpConnect({host=RESEND_API_HOST,port=443,timeoutMs=10000}) {
  if (host!==RESEND_API_HOST || port!==443) return Promise.reject(new Error('DESTINATION_DENIED'));
  return new Promise((resolve,reject)=>{
    const req=http.request({host:RELAY_HOST,port:RELAY_PORT,method:'CONNECT',
      path:host+':'+port,headers:{Host:host+':'+port},timeout:timeoutMs});
    req.once('connect',(res,socket,head)=>{
      if(res.statusCode!==200 || head.length!==0){socket.destroy();return reject(new Error('RELAY_CONNECT_DENIED'))}
      const secure=tls.connect({socket,servername:host,rejectUnauthorized:true},()=>resolve(secure));
      secure.once('error',reject);
      secure.setTimeout(timeoutMs,()=>secure.destroy(new Error('RELAY_TLS_TIMEOUT')));
    });
    req.once('timeout',()=>req.destroy(new Error('PRIVACY_RELAY_CONNECT_TIMEOUT')));
    req.once('error',reject);
    req.end();
  });
}
function payloadForRecipient(c,r) {
  const to=normalizedAddress(r.email);
  if(!to)throw new Error('RECIPIENT_INVALID');
  const unsubscribe=new URL(c.unsubscribeUrl);
  if(unsubscribe.protocol!=='https:')throw new Error('UNSUBSCRIBE_URL_INVALID');
  return {from:c.from,to:[to],subject:c.subject,text:c.content+'\n\nUnsubscribe: '+unsubscribe.href,
    headers:{'List-Unsubscribe':'<'+unsubscribe.href+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
}
async function sendOne({campaign,settings,from,recipient,apiKey,dryRun=true,privacyReady=false,approvedLive=false,idempotencyKey}){
  // Revalidate on trusted Node.js side even if a browser popup already previewed.
  const p=planCampaign({...campaign,settings:{...settings,operatorApproved:approvedLive && settings.operatorApproved}});
  if(!p.approved || p.eligibleCount!==1) return {status:'BLOCKED',reasons:p.blockingReasons,excluded:p.excluded};
  const address=normalizedAddress(recipient && recipient.email);
  if(!address || !p.recipientPreview.some(e=>e.email===address)) return {status:'BLOCKED',reasons:['RECIPIENT_NOT_APPROVED']};
  if(!idempotencyKey || !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey))return {status:'BLOCKED',reasons:['IDEMPOTENCY_KEY_REQUIRED']};
  const body=payloadForRecipient({...campaign,from},recipient);
  if(dryRun) return {status:'PREVIEW_ONLY',recipientCount:1,provider:'resend',relay:'127.0.0.1:18988',headersPresent:true};
  // Local CLI's consent/approval is insufficient as a secure high-volume gateway;
  // credentials remain in the local process, never in Chrome.
  assertConfig({provider:'resend',from,apiKey,privacyReady});
  const sock=await httpConnect({});
  const payload=Buffer.from(JSON.stringify(body));
  const lines=['POST /emails HTTP/1.1','Host: '+RESEND_API_HOST,'Authorization: Bearer '+apiKey,
   'Content-Type: application/json','Idempotency-Key: '+idempotencyKey,
   'Content-Length: '+payload.length,'Connection: close','',''];
  sock.write(lines.join('\r\n'));
  sock.end(payload);
  const chunks=[];
  for await(const chunk of sock) {chunks.push(chunk);if(Buffer.concat(chunks).length>65536)throw new Error('RESPONSE_TOO_LARGE')}
  const response=Buffer.concat(chunks).toString('utf8');
  const match=/^HTTP\/1\.1 (\d{3})/.exec(response);
  // HTTPS API acceptance is NOT recipient inbox delivery.
  return {status:match && Number(match[1])===200?'PROVIDER_ACCEPTED_NOT_DELIVERED':'PROVIDER_ERROR_OR_UNKNOWN',
     httpStatus:match?Number(match[1]):null};
}
module.exports={httpConnect,payloadForRecipient,sendOne,RELAY_HOST,RELAY_PORT,RESEND_API_HOST};

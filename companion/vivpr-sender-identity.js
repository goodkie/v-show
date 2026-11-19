/**
 * XPIDER sending identity for the owner-provided domain vivpr.pro.
 * Domain ownership, DNS, mailbox/SMTP and provider approval are not inferred.
 * A bare domain is NOT an SMTP hostname.
 */
'use strict';
const SENDER_DOMAIN='vivpr.pro';
const DEFAULT_SENDER_EMAIL=`noreply@${SENDER_DOMAIN}`;
const DEFAULT_SENDER_DISPLAY_NAME='vivpr.pro';
const PROVIDER='resend';
const RELAY_PROXY='http://127.0.0.1:18988';

function hasHeaderInjectionChars(raw) {
  return /[\r\n\x00]/.test(String(raw ?? ''));
}

function cleanDisplayNameCandidate(raw) {
  let s = String(raw ?? '');
  // Strip remaining non-printable control & bidi override characters (after CR/LF/NUL fail-closed check)
  s = s.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\u202a-\u202e\u2066-\u2069]/g, ' ');
  // Strip angle-bracketed addresses like "<noreply@vivpr.pro>" or "<spoof@evil.com>" to prevent duplication or spoofing
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/[<>]/g, ' ');
  // Strip bare email addresses embedded in display name
  s = s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ig, ' ');
  // Collapse whitespace & trim
  s = s.replace(/\s+/g, ' ').trim();
  // Unwrap redundant matching outer double quotes (e.g., `"STUDIOBERRY PLUS"` -> `STUDIOBERRY PLUS`)
  while (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }
  // Cap length to RFC-friendly 78 Unicode code points
  const chars = Array.from(s);
  if (chars.length > 78) s = chars.slice(0, 78).join('').trim();
  return s;
}

/**
 * Safely construct Resend/RFC-5322 `From` header using an editable business display name
 * while keeping the verified `vivpr.pro` sender email strictly unchanged.
 * Empty fallback is `vivpr.pro` (never `XPIDER`).
 */
function validateAndFormatSenderFrom({ displayName = '', fallbackBusinessName = '', fallbackBusinessNames = [], verifiedEmail = DEFAULT_SENDER_EMAIL } = {}) {
  const emailNorm = String(verifiedEmail || DEFAULT_SENDER_EMAIL).trim().toLowerCase();
  if (hasHeaderInjectionChars(emailNorm) || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vivpr\.pro$/.test(emailNorm)) {
    return { ok: false, reason: 'FROM_MUST_USE_VIVPR_PRO' };
  }
  const fallbacks = [
    fallbackBusinessName,
    ...(Array.isArray(fallbackBusinessNames) ? fallbackBusinessNames : [])
  ];
  if (hasHeaderInjectionChars(displayName)) {
    return { ok: false, reason: 'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED' };
  }
  for (const fbRaw of fallbacks) {
    if (hasHeaderInjectionChars(fbRaw)) {
      return { ok: false, reason: 'SENDER_DISPLAY_NAME_HEADER_INJECTION_BLOCKED' };
    }
  }

  let resolved = cleanDisplayNameCandidate(displayName);
  let usedFallback = false;
  if (!resolved) {
    for (const fbRaw of fallbacks) {
      const fb = cleanDisplayNameCandidate(fbRaw);
      if (fb && fb.toLowerCase() !== SENDER_DOMAIN) {
        resolved = fb;
        usedFallback = true;
        break;
      }
    }
  }
  if (!resolved) {
    resolved = DEFAULT_SENDER_DISPLAY_NAME;
    usedFallback = true;
  }

  // RFC 5322 quoting when specials are present (keep bare default domain fallback unquoted as `vivpr.pro <noreply@vivpr.pro>`)
  const needsQuotes = resolved !== DEFAULT_SENDER_DISPLAY_NAME && /["\\,;:.()[\]@?]/.test(resolved);
  const formattedName = needsQuotes
    ? `"${resolved.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : resolved;

  return {
    ok: true,
    displayName: resolved,
    formattedName,
    verifiedEmail: emailNorm,
    from: `${formattedName} <${emailNorm}>`,
    usedFallback
  };
}

function sanitizeReplyTo(rawReplyTo) {
  const raw = String(rawReplyTo ?? '').trim();
  if (!raw) return { ok: true, replyTo: null };
  if (hasHeaderInjectionChars(raw)) {
    return { ok: false, reason: 'REPLY_TO_HEADER_INJECTION_BLOCKED', replyTo: null };
  }
  const clean = raw.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean) || clean.length > 254) {
    return { ok: false, reason: 'INVALID_REPLY_TO_EMAIL', replyTo: null };
  }
  return { ok: true, replyTo: clean };
}

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
module.exports={
  SENDER_DOMAIN,
  DEFAULT_SENDER_EMAIL,
  DEFAULT_SENDER_DISPLAY_NAME,
  PROVIDER,
  RELAY_PROXY,
  validateSenderIdentity,
  validateAndFormatSenderFrom,
  sanitizeReplyTo
};

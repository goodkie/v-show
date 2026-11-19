'use strict';

// Only the verified Resend domain may be used for the actual sender mailbox.
// The display name comes from the campaign's business/company field, not XPIDER.
const FROM_EMAIL = 'noreply@vivpr.pro';
const FALLBACK_NAME = 'vivpr.pro';

function normalizeSenderDisplayName(input) {
  const raw = typeof input === 'string' ? input : '';
  const sanitized = raw
    .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(sanitized || FALLBACK_NAME).slice(0, 80).join('');
}

function formatResendSenderFrom(senderName) {
  const name = normalizeSenderDisplayName(senderName);
  // Quote display names containing RFC 5322 special characters.
  const display = /[",;:()\\]/.test(name)
    ? '"' + name.replace(/([\\"])/g, '\\$1') + '"'
    : name;
  return `${display} <${FROM_EMAIL}>`;
}

module.exports = { FROM_EMAIL, FALLBACK_NAME, normalizeSenderDisplayName, formatResendSenderFrom };

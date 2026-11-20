'use strict';

/**
 * XPIDER V7.1 Gmail transport foundation.
 * Gmail API ACCEPTED != delivered or inbox. Never retries uncertain sends.
 * No credential persistence here: OAuth tokens MUST be supplied by a trusted,
 * DPAPI-protected Windows Sidecar vault and MUST NOT be sent to the extension.
 * Caller must persist intent/idempotency, consent and suppression state BEFORE
 * calling send(), and must pause the entire campaign on a provider block.
 */
const crypto = require('node:crypto');

class GmailSendBlocked extends Error {
  constructor(code) {
    super(code);
    this.name = 'GmailSendBlocked';
    this.code = code;
    this.retryable = false;
  }
}

function textHeader(value, label) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\u0000-\u001f\u007f]/u.test(value)) {
    throw new GmailSendBlocked('INVALID_' + label);
  }
  return value.trim();
}

function address(value) {
  const v = textHeader(value, 'EMAIL');
  if (!/^[^\s<>,;:"()@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u.test(v) || v.length > 254) {
    throw new GmailSendBlocked('INVALID_EMAIL');
  }
  return v.toLowerCase();
}

function encodeWord(input) {
  const value = textHeader(input, 'HEADER');
  if (/^[\x20-\x7e]+$/u.test(value)) return value;
  return '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=';
}

function fromHeader(displayName, email) {
  const safe = encodeWord(displayName);
  return (/^[\x20-\x7e]+$/u.test(displayName)
    ? '"' + safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    : safe) + ' <' + address(email) + '>';
}

function base64Lines(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function rawGmailMime(options) {
  const from = address(options.from);
  const to = address(options.to);
  const allowed = (options.verifiedFromAddresses || []).map(address);
  if (!allowed.includes(from)) throw new GmailSendBlocked('UNVERIFIED_SEND_AS');
  if (options.campaignAuthorized !== true) throw new GmailSendBlocked('CAMPAIGN_NOT_AUTHORIZED');
  if (options.recipientEligible !== true || options.ledgerIntentPersisted !== true) {
    throw new GmailSendBlocked('RECIPIENT_OR_LEDGER_BLOCKED');
  }
  const unsub = new URL(textHeader(options.unsubscribeUrl, 'UNSUBSCRIBE_URL'));
  if (unsub.protocol !== 'https:' || unsub.username || unsub.password ||
      !['unsubscribe.vivpr.pro'].includes(unsub.hostname.toLowerCase())) {
    throw new GmailSendBlocked('UNSUBSCRIBE_URL_NOT_VERIFIED');
  }
  const subject = encodeWord(options.subject);
  const name = textHeader(options.displayName, 'DISPLAY_NAME');
  const html = typeof options.html === 'string' ? options.html : '';
  const plain = typeof options.text === 'string' ? options.text : '';
  if (!html.trim() || !plain.trim() || /[\r\n]/u.test(unsub.href)) {
    throw new GmailSendBlocked('MISSING_BODY_OR_UNSUBSCRIBE');
  }
  const boundary = 'xpider_' + crypto.randomBytes(14).toString('hex');
  const headers = [
    'From: ' + fromHeader(name, from),
    'To: <' + to + '>',
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'List-Unsubscribe: <' + unsub.href + '>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"'
  ];
  const body = [
    '--' + boundary,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(plain),
    '--' + boundary,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    '--' + boundary + '--',
    ''
  ];
  return Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body.join('\r\n'), 'utf8')
    .toString('base64url');
}

/**
 * Fixed allocation. If the assigned account reaches quota/loses authorization,
 * the whole campaign is PAUSED; other accounts are NEVER used as an escape path.
 * caller MUST provide authoritative rolling 24h ledgers; no missing-count default.
 */
function selectAccount({ accountIds, accounts, recipientHash, mode,
  accountId, domainSent24h, domainCap24h, recipientEligible,
  ledgerIntentPersisted, campaignAuthorized }) {
  if (campaignAuthorized !== true || recipientEligible !== true ||
      ledgerIntentPersisted !== true) throw new GmailSendBlocked('CAMPAIGN_OR_RECIPIENT_BLOCKED');
  if (!Number.isSafeInteger(domainSent24h) || domainSent24h < 0 ||
      !Number.isSafeInteger(domainCap24h) || domainCap24h <= 0) {
    throw new GmailSendBlocked('DOMAIN_LEDGER_UNKNOWN');
  }
  if (domainSent24h >= domainCap24h) throw new GmailSendBlocked('DOMAIN_CAP_REACHED');
  let selectedId;
  if (mode === 'SINGLE_ACCOUNT') {
    selectedId = textHeader(accountId, 'ACCOUNT_ID');
  } else if (mode === 'APPROVED_ACCOUNT_POOL') {
    if (!Array.isArray(accountIds) || accountIds.length < 2 ||
        new Set(accountIds).size !== accountIds.length) {
      throw new GmailSendBlocked('INVALID_ACCOUNT_POOL');
    }
    if (!/^[a-f0-9]{32,128}$/iu.test(recipientHash || '')) {
      throw new GmailSendBlocked('MISSING_RECIPIENT_HASH');
    }
    const idx = crypto.createHash('sha256').update(recipientHash, 'utf8').digest().readUInt32BE(0) % accountIds.length;
    selectedId = accountIds[idx];
  } else {
    throw new GmailSendBlocked('INVALID_SENDING_MODE');
  }
  const list = Array.isArray(accounts) ? accounts : [];
  const acct = list.find((a) => a && a.id === selectedId);
  if (!acct || acct.ownerAuthorized !== true || acct.connected !== true ||
      acct.verified === false || acct.disabled === true || acct.providerBlocked === true) {
    throw new GmailSendBlocked('ACCOUNT_NOT_AVAILABLE_PAUSE_CAMPAIGN');
  }
  const publishedCeiling = acct.type === 'workspace_paid' ? 2000 : 500;
  if (!Number.isSafeInteger(acct.sent24h) || acct.sent24h < 0 ||
      !Number.isSafeInteger(acct.cap24h) || acct.cap24h <= 0 ||
      acct.cap24h >= publishedCeiling) {
    throw new GmailSendBlocked('ACCOUNT_LEDGER_OR_CONSERVATIVE_CAP_UNKNOWN');
  }
  if (acct.sent24h >= acct.cap24h) throw new GmailSendBlocked('ACCOUNT_CAP_REACHED_PAUSE_CAMPAIGN');
  return { accountId: acct.id, from: address(acct.email), cap24h: acct.cap24h };
}

async function sendViaGmailApi({ fetchImpl, accessToken, raw, approved, signal }) {
  if (approved !== true || typeof fetchImpl !== 'function' ||
      typeof accessToken !== 'string' || !accessToken ||
      typeof raw !== 'string' || !raw) {
    throw new GmailSendBlocked('GMAIL_AUTH_OR_APPROVAL_MISSING');
  }
  let response;
  try {
    response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
      signal
    });
  } catch (_) {
    throw new GmailSendBlocked('GMAIL_UNKNOWN_RESULT_NO_AUTORETRY');
  }
  if (!response || response.status === 401) throw new GmailSendBlocked('GMAIL_AUTH_REVOKED');
  if (response.status === 403 || response.status === 429) {
    throw new GmailSendBlocked('GMAIL_PROVIDER_LIMIT_OR_POLICY_PAUSE_ALL');
  }
  if (response.status !== 200) throw new GmailSendBlocked('GMAIL_UNKNOWN_RESULT_NO_AUTORETRY');
  let payload;
  try { payload = await response.json(); } catch (_) {
    throw new GmailSendBlocked('GMAIL_UNKNOWN_RESULT_NO_AUTORETRY');
  }
  if (!payload || typeof payload.id !== 'string' || !payload.id) {
    throw new GmailSendBlocked('GMAIL_UNKNOWN_RESULT_NO_AUTORETRY');
  }
  return { status: 'GMAIL_API_ACCEPTED', providerMessageId: payload.id,
    threadId: payload.threadId || null, delivery: 'UNKNOWN', inbox: 'UNKNOWN' };
}

module.exports = { GmailSendBlocked, rawGmailMime, selectAccount, sendViaGmailApi };

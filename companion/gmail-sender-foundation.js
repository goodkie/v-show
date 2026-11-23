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

function foldAsciiHeader(value, maxLen = 76) {
  if (value.length <= maxLen) return value;
  const words = value.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxLen) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join('\r\n ');
}

function encodeWord(input, { foldAscii = false } = {}) {
  const value = textHeader(input, 'HEADER');
  if (/^[\x20-\x7e]+$/u.test(value)) {
    return foldAscii ? foldAsciiHeader(value, 76) : value;
  }
  // RFC 2047 compliant UTF-8 Base64 folding: each encoded-word <= 75 chars (<= 42 UTF-8 bytes payload)
  const chunks = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of value) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (cur && curBytes + chBytes > 42) {
      chunks.push('=?UTF-8?B?' + Buffer.from(cur, 'utf8').toString('base64') + '?=');
      cur = ch;
      curBytes = chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) {
    chunks.push('=?UTF-8?B?' + Buffer.from(cur, 'utf8').toString('base64') + '?=');
  }
  return chunks.join('\r\n ');
}

function fromHeader(displayName, email) {
  const trimmed = textHeader(displayName, 'DISPLAY_NAME');
  const safe = encodeWord(trimmed);
  return (/^[\x20-\x7e]+$/u.test(trimmed)
    ? '"' + safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    : safe) + ' <' + address(email) + '>';
}

function base64Lines(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function encodeQuotedPrintable(value) {
  const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  const outLines = [];
  for (const line of rawLines) {
    const bytes = Buffer.from(line, 'utf8');
    let cur = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const isLast = i === bytes.length - 1;
      let token;
      if ((b >= 33 && b <= 60) || (b >= 62 && b <= 126)) {
        token = String.fromCharCode(b);
      } else if ((b === 32 || b === 9) && !isLast) {
        token = String.fromCharCode(b);
      } else {
        token = '=' + b.toString(16).toUpperCase().padStart(2, '0');
      }
      if (cur.length + token.length > 75) {
        outLines.push(cur + '=');
        cur = token;
      } else {
        cur += token;
      }
    }
    outLines.push(cur);
  }
  return outLines.join('\r\n');
}

function formatRfc5322Date(dateObj = new Date()) {
  return dateObj.toUTCString().replace(/GMT$/, '+0000');
}

function validateInlineImages(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const out = [];
  let totalBytes = 0;
  for (const item of rawList) {
    if (!item || typeof item !== 'object') throw new GmailSendBlocked('INVALID_INLINE_IMAGE');
    const cid = textHeader(String(item.cid || ''), 'INLINE_IMAGE_CID');
    if (!/^[A-Za-z0-9._-]{3,64}$/u.test(cid)) throw new GmailSendBlocked('INVALID_INLINE_IMAGE_CID');
    const contentType = textHeader(String(item.contentType || ''), 'INLINE_IMAGE_TYPE').toLowerCase();
    if (!allowedMimes.has(contentType)) throw new GmailSendBlocked('INVALID_INLINE_IMAGE_TYPE');
    const filename = textHeader(String(item.filename || `${cid}.jpg`), 'INLINE_IMAGE_FILENAME')
      .replace(/["\\;]/g, '_')
      .slice(0, 64);
    const dataBase64 = String(item.dataBase64 || '').replace(/\s+/g, '');
    if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/u.test(dataBase64)) throw new GmailSendBlocked('INVALID_INLINE_IMAGE_DATA');
    const rawBuf = Buffer.from(dataBase64, 'base64');
    if (rawBuf.length === 0 || rawBuf.length > 2 * 1024 * 1024) throw new GmailSendBlocked('INLINE_IMAGE_TOO_LARGE');
    totalBytes += rawBuf.length;
    if (totalBytes > 4 * 1024 * 1024) throw new GmailSendBlocked('INLINE_IMAGES_TOTAL_TOO_LARGE');
    out.push({
      cid,
      contentType,
      filename,
      wrappedBase64: dataBase64.replace(/.{1,76}/g, '$&\r\n').trimEnd()
    });
  }
  return out;
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
  const subject = encodeWord(options.subject, { foldAscii: true });
  const name = textHeader(options.displayName, 'DISPLAY_NAME');
  const html = typeof options.html === 'string' ? options.html : '';
  const plain = typeof options.text === 'string' ? options.text : '';
  const mimeMode = String(options.mimeContentMode || 'MULTIPART_HTML').toUpperCase() === 'PLAIN_TEXT_ONLY'
    ? 'PLAIN_TEXT_ONLY'
    : 'MULTIPART_HTML';
  // RC11: Default to RFC 2045 quoted-printable for ALL text/plain and text/html parts (matching native Gmail Web
  // and eliminating MIME_BASE64_TEXT spam heuristics); base64 remains selectable explicitly and used for binary inline images.
  const transferEnc = String(options.transferEncoding || 'quoted-printable').toLowerCase() === 'base64'
    ? 'base64'
    : 'quoted-printable';
  const encodeBody = transferEnc === 'quoted-printable' ? encodeQuotedPrintable : base64Lines;
  const rfcDate = formatRfc5322Date();

  if (mimeMode === 'PLAIN_TEXT_ONLY') {
    if (!plain.trim() || /[\r\n]/u.test(unsub.href) || !plain.includes(unsub.href)) {
      throw new GmailSendBlocked('MISSING_BODY_OR_UNSUBSCRIBE');
    }
    const headers = [
      'Date: ' + rfcDate,
      'From: ' + fromHeader(name, from),
      'To: <' + to + '>',
      ...(options.replyTo ? ['Reply-To: <' + address(options.replyTo) + '>'] : []),
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'List-Unsubscribe: <' + unsub.href + '>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: ' + transferEnc
    ];
    return Buffer.from(headers.join('\r\n') + '\r\n\r\n' + encodeBody(plain) + '\r\n', 'utf8')
      .toString('base64url');
  }

  if (!html.trim() || !plain.trim() || /[\r\n]/u.test(unsub.href)) {
    throw new GmailSendBlocked('MISSING_BODY_OR_UNSUBSCRIBE');
  }
  const inlineImages = validateInlineImages(options.inlineImages);
  const altBoundary = 'b_' + crypto.randomBytes(16).toString('hex');
  const altParts = [
    '--' + altBoundary,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: ' + transferEnc,
    '',
    encodeBody(plain),
    '--' + altBoundary,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: ' + transferEnc,
    '',
    encodeBody(html),
    '--' + altBoundary + '--',
    ''
  ];

  if (inlineImages.length > 0) {
    const relBoundary = 'r_' + crypto.randomBytes(16).toString('hex');
    const headers = [
      'Date: ' + rfcDate,
      'From: ' + fromHeader(name, from),
      'To: <' + to + '>',
      ...(options.replyTo ? ['Reply-To: <' + address(options.replyTo) + '>'] : []),
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'List-Unsubscribe: <' + unsub.href + '>',
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      'Content-Type: multipart/related; boundary="' + relBoundary + '"'
    ];
    const relBody = [
      '--' + relBoundary,
      'Content-Type: multipart/alternative; boundary="' + altBoundary + '"',
      '',
      ...altParts
    ];
    for (const img of inlineImages) {
      relBody.push(
        '--' + relBoundary,
        `Content-Type: ${img.contentType}; name="${img.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${img.cid}>`,
        `Content-Disposition: inline; filename="${img.filename}"`,
        '',
        img.wrappedBase64
      );
    }
    relBody.push('--' + relBoundary + '--', '');
    return Buffer.from(headers.join('\r\n') + '\r\n\r\n' + relBody.join('\r\n'), 'utf8')
      .toString('base64url');
  }

  const headers = [
    'Date: ' + rfcDate,
    'From: ' + fromHeader(name, from),
    'To: <' + to + '>',
    ...(options.replyTo ? ['Reply-To: <' + address(options.replyTo) + '>'] : []),
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'List-Unsubscribe: <' + unsub.href + '>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'Content-Type: multipart/alternative; boundary="' + altBoundary + '"'
  ];
  return Buffer.from(headers.join('\r\n') + '\r\n\r\n' + altParts.join('\r\n'), 'utf8')
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
      acct.verified !== true || acct.disabled === true || acct.providerBlocked === true) {
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

module.exports = { GmailSendBlocked, rawGmailMime, selectAccount, sendViaGmailApi, encodeQuotedPrintable, foldAsciiHeader };

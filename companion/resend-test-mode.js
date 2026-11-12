/**
 * Resend test-mode address gate & simulator transport.
 * Test mode can only target official Resend event simulator recipients.
 * Production requires separately authenticated vivpr.pro sending identity.
 */
'use strict';
const https = require('node:https');

const TEST_FROM = 'onboarding@resend.dev';
const TEST_RECIPIENTS = Object.freeze([
  'delivered@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev'
]);
const TEST_TO = new Set(TEST_RECIPIENTS);

function check(input = {}) {
  const mode = String(input.mode || '').toUpperCase();
  const from = String(input.from || '').trim().toLowerCase();
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const recipients = to.map(v => String(v || '').trim().toLowerCase());
  const reasons = [];
  if (mode !== 'TEST' && mode !== 'PRODUCTION') reasons.push('MODE_REQUIRED');
  if (mode === 'TEST') {
    if (from !== TEST_FROM) reasons.push('TEST_FROM_MUST_BE_RESEND_DEV');
    if (recipients.length !== 1 || !TEST_TO.has(recipients[0])) reasons.push('TEST_RECIPIENT_NOT_ALLOWED');
    if (input.allowExternalRecipients === true) reasons.push('TEST_EXTERNAL_RECIPIENTS_DENIED');
  }
  if (mode === 'PRODUCTION') {
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@vivpr\.pro$/.test(from)) reasons.push('PRODUCTION_SENDER_NOT_VIVPR_PRO');
    if (recipients.length !== 1 || !recipients[0] || TEST_TO.has(recipients[0])) reasons.push('PRODUCTION_RECIPIENT_INVALID');
    if (input.providerDomainVerified !== true) reasons.push('PRODUCTION_PROVIDER_DOMAIN_NOT_VERIFIED');
    if (input.recipientAuthorizationVerified !== true) reasons.push('PRODUCTION_RECIPIENT_AUTHORIZATION_REQUIRED');
  }
  const isSendEnabled = Boolean(input.authorizedTestTransport === true && mode === 'TEST' && reasons.length === 0);
  return Object.freeze({
    mode,
    allowed: reasons.length === 0,
    reasons,
    from,
    recipientCount: recipients.length,
    testModeIsolated: mode === 'TEST',
    sendEnabled: isSendEnabled
  });
}

/**
 * Execute single test send to official Resend simulator recipient.
 * API key is provided exclusively on server side, never from browser / client bundle.
 */
async function executeSimulatorSend(options = {}) {
  const from = String(options.from || TEST_FROM).trim().toLowerCase();
  const to = options.to;
  const recipient = Array.isArray(to) ? to[0] : to;
  const gate = check({
    mode: 'TEST',
    from,
    to: [recipient],
    allowExternalRecipients: false,
    authorizedTestTransport: true
  });
  if (!gate.allowed) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reasons: gate.reasons,
      from,
      recipient: String(recipient || ''),
      testSimulatorEligible: false
    };
  }

  const subject = String(options.subject || '').trim();
  if (!subject) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reasons: ['SUBJECT_REQUIRED'],
      from,
      recipient,
      testSimulatorEligible: true
    };
  }

  const html = typeof options.html === 'string' ? options.html : '';
  const text = typeof options.text === 'string' ? options.text : '';
  if (!html && !text) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reasons: ['CONTENT_REQUIRED'],
      from,
      recipient,
      testSimulatorEligible: true
    };
  }

  const idempotencyKey = String(options.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length < 16) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reasons: ['IDEMPOTENCY_KEY_REQUIRED'],
      from,
      recipient,
      testSimulatorEligible: true
    };
  }

  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey || !/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
    return {
      status: 'BLOCKED',
      allowed: false,
      reason: 'RESEND_API_KEY_NOT_CONFIGURED',
      reasons: ['RESEND_API_KEY_NOT_CONFIGURED'],
      from,
      recipient,
      testSimulatorEligible: true,
      message: 'Resend API key is not configured on the companion backend. Set RESEND_API_KEY environment variable on the companion host.'
    };
  }

  // Transport to Resend API
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 10000;
  const bodyPayload = {
    from,
    to: [recipient],
    subject,
    headers: {
      'X-Xpider-Test-Mode': 'resend-simulator',
      'X-Xpider-Idempotency': idempotencyKey
    }
  };
  if (html) bodyPayload.html = html;
  if (text) bodyPayload.text = text;

  const payloadBuf = Buffer.from(JSON.stringify(bodyPayload), 'utf8');

  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = https.request({
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': payloadBuf.length,
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'XPIDER-Email-Studio/1.0.0 (Test-Simulator)'
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', c => {
        chunks.push(c);
        if (Buffer.concat(chunks).length > 65536) {
          req.destroy();
          done({
            status: 'PROVIDER_ERROR',
            provider: 'resend',
            mode: 'TEST_SIMULATOR',
            error: 'RESPONSE_TOO_LARGE',
            message: 'Resend response exceeded 64KB limit',
            recipient,
            from
          });
        }
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          done({
            status: 'SUCCESS',
            provider: 'resend',
            mode: 'TEST_SIMULATOR',
            providerMessageId: (parsed && parsed.id) || null,
            recipient,
            from,
            httpStatus: res.statusCode,
            timestamp: new Date().toISOString()
          });
        } else {
          done({
            status: 'PROVIDER_ERROR',
            provider: 'resend',
            mode: 'TEST_SIMULATOR',
            httpStatus: res.statusCode,
            error: (parsed && (parsed.name || parsed.error)) || 'PROVIDER_HTTP_ERROR',
            message: (parsed && parsed.message) || `Resend API returned HTTP ${res.statusCode}`,
            recipient,
            from
          });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      done({
        status: 'NETWORK_TIMEOUT',
        provider: 'resend',
        mode: 'TEST_SIMULATOR',
        error: 'RESEND_API_TIMEOUT',
        message: `Connection to api.resend.com timed out after ${timeoutMs}ms`,
        recipient,
        from
      });
    });

    req.on('error', (err) => {
      done({
        status: 'NETWORK_ERROR',
        provider: 'resend',
        mode: 'TEST_SIMULATOR',
        error: err.code || 'NETWORK_ERROR',
        message: err.message,
        recipient,
        from
      });
    });

    req.end(payloadBuf);
  });
}

module.exports = {
  TEST_FROM,
  TEST_RECIPIENTS,
  check,
  executeSimulatorSend
};

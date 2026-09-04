/**
 * Runtime Inspector — Universal Secret Redaction Engine
 * Module: core/redaction.js
 *
 * Privacy Modes:
 * - STRICT: Maximum redaction. All IDs, hashes, query params, emails, storage values redacted.
 * - STANDARD (Default): Redacts secrets, tokens, auth headers, cookies, passwords, API keys, emails, PII.
 *                       Allows technical IDs (project IDs, job IDs, slot labels, error codes).
 * - INTERNAL: Engineering mode. Allows internal diagnostic payload details, but STRICTLY redacts
 *             credentials, keys, tokens, and authorization data.
 */

var RedactionEngine = class RedactionEngine {
  constructor(options = {}) {
    this.privacyMode = options.privacyMode || 'STANDARD'; // STRICT | STANDARD | INTERNAL
    this.customRules = options.customRules || [];
    this.redactionCount = 0;

    // Hardcoded secret keywords that must NEVER leak in ANY privacy mode
    this.secretKeyPatterns = [
      /authorization/i,
      /bearer/i,
      /cookie/i,
      /set-cookie/i,
      /token/i,
      /secret/i,
      /password/i,
      /passcode/i,
      /otp/i,
      /passwd/i,
      /apikey/i,
      /api_key/i,
      /private_key/i,
      /credential/i,
      /session_token/i,
      /session_secret/i,
      /sessiontoken/i,
      /jwt/i,
      /stripe/i,
      /resend/i,
      /cloudflare/i,
      /aws_secret/i,
      /r2_token/i
    ];

    // Regex for values (tokens, hashes, emails)
    this.emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    this.jwtRegex = /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
    this.bearerRegex = /Bearer\s+[a-zA-Z0-9_\-\.~+/]+=*/gi;
    this.uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  }

  setPrivacyMode(mode) {
    if (['STRICT', 'STANDARD', 'INTERNAL'].includes(mode)) {
      this.privacyMode = mode;
    }
  }

  isSecretKey(key) {
    if (typeof key !== 'string') return false;
    // Do not redact diagnostic structural fields
    if (['session', 'sessionId', 'durationMs', 'startTime', 'captureTime', 'privacyMode'].includes(key)) {
      return false;
    }
    return this.secretKeyPatterns.some(pattern => pattern.test(key));
  }

  sanitizeString(str) {
    if (typeof str !== 'string') return str;
    let sanitized = str;

    // Always redact JWTs
    sanitized = sanitized.replace(this.jwtRegex, () => {
      this.redactionCount++;
      return '[REDACTED_JWT]';
    });

    // Always redact Bearer tokens
    sanitized = sanitized.replace(this.bearerRegex, () => {
      this.redactionCount++;
      return 'Bearer [REDACTED_TOKEN]';
    });

    // Redact Emails in STRICT and STANDARD
    if (this.privacyMode !== 'INTERNAL') {
      sanitized = sanitized.replace(this.emailRegex, () => {
        this.redactionCount++;
        return '[REDACTED_EMAIL]';
      });
    }

    // STRICT mode: redact UUIDs if not whitelisted
    if (this.privacyMode === 'STRICT') {
      sanitized = sanitized.replace(this.uuidRegex, () => {
        this.redactionCount++;
        return '[REDACTED_UUID]';
      });
    }

    return sanitized;
  }

  sanitizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    try {
      // Parse relative or absolute
      const dummyBase = 'https://runtime-inspector.internal';
      const parsed = new URL(rawUrl, dummyBase);

      const sensitiveParams = ['token', 'key', 'auth', 'signature', 'sig', 'secret', 'password', 'code', 'session'];
      parsed.searchParams.forEach((val, key) => {
        if (sensitiveParams.some(p => key.toLowerCase().includes(p)) || this.privacyMode === 'STRICT') {
          parsed.searchParams.set(key, '[REDACTED]');
          this.redactionCount++;
        }
      });

      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        return parsed.toString();
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) {
      return this.sanitizeString(rawUrl);
    }
  }

  sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') return {};
    const sanitized = {};
    for (const [k, v] of Object.entries(headers)) {
      if (this.isSecretKey(k)) {
        sanitized[k] = '[REDACTED_HEADER]';
        this.redactionCount++;
      } else {
        sanitized[k] = this.sanitizeString(String(v));
      }
    }
    return sanitized;
  }

  sanitizeObject(obj, depth = 0) {
    if (depth > 8) return '[MAX_DEPTH_REACHED]';
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }
    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSecretKey(key)) {
          result[key] = '[REDACTED_SECRET]';
          this.redactionCount++;
        } else {
          result[key] = this.sanitizeObject(value, depth + 1);
        }
      }
      return result;
    }
    return String(obj);
  }

  scanForLeaks(content) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const suspected = [];

    if (this.jwtRegex.test(text)) suspected.push('UNREDACTED_JWT');
    if (this.bearerRegex.test(text)) suspected.push('UNREDACTED_BEARER_TOKEN');
    
    // Check for raw keys like sk_live, r2_secret, etc.
    const keyPatterns = [
      /sk_live_[0-9a-zA-Z]{20,}/g,
      /rk_live_[0-9a-zA-Z]{20,}/g,
      /re_[0-9a-zA-Z]{20,}/g,
      /ghp_[0-9a-zA-Z]{20,}/g
    ];
    for (const pat of keyPatterns) {
      if (pat.test(text)) suspected.push('DETECTED_LIVE_API_KEY');
    }

    return {
      passed: suspected.length === 0,
      suspectedLeaks: suspected
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RedactionEngine };
} else {
  window.RedactionEngine = RedactionEngine;
}

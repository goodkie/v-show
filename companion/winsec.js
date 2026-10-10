/**
 * winsec.js
 * 
 * Windows Secure Secret Storage for XPIDER Companion Privacy Relay (Issue #6 R6.9G.10.3 Blocker 2).
 * 
 * Invariants (Strict Fail-Closed):
 * - Persistent JSON configs must NEVER contain plaintext proxy passwords.
 * - Windows DPAPI (CurrentUser scope) encrypts proxy credentials into "dpapi:<base64>".
 * - Opt-in environment variable reference "ENV:<name>" supported.
 * - ZERO weak machine-derived cipher fallbacks. DPAPI failure MUST fail closed.
 * - ZERO plaintext fallback in decrypt(): unknown/unprefixed credentialRef is rejected.
 * - sanitizeNodeForSave() strictly rejects/migrates insecure credentialRef values.
 * - In-memory cache prevents spawning PowerShell on every proxied request.
 */

const { execFileSync } = require('child_process');

const memoryCache = new Map();

/**
 * Encrypt plaintext string using Windows DPAPI (CurrentUser scope).
 * Returns string starting with 'dpapi:<base64>'.
 * Fails closed if DPAPI is unavailable or encounters an error.
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  if (memoryCache.has(`ENC:${plaintext}`)) {
    return memoryCache.get(`ENC:${plaintext}`);
  }

  // Support test hook for DPAPI failure injection
  if (process.env.XPIDER_FORCE_DPAPI_FAIL === '1') {
    throw new Error('[WINSEC_FATAL] DPAPI encryption failed (injected failure). Fail-closed: refusing insecure secret storage.');
  }

  if (process.platform === 'win32') {
    try {
      const script = `
        $ProgressPreference = 'SilentlyContinue'
        Add-Type -AssemblyName System.Security
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('${plaintext.replace(/'/g, "''")}')
        $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
        [Convert]::ToBase64String($enc)
      `;
      const b64 = Buffer.from(script, 'utf16le').toString('base64');
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8' });
      const rawCipher = out.trim().split(/\r?\n/).pop().trim();
      if (rawCipher && rawCipher.length > 10) {
        const result = `dpapi:${rawCipher}`;
        memoryCache.set(`ENC:${plaintext}`, result);
        memoryCache.set(result, plaintext);
        return result;
      }
      throw new Error('DPAPI returned empty or invalid ciphertext');
    } catch (err) {
      throw new Error(`[WINSEC_FATAL] DPAPI encryption failed: ${err.message}. Fail-closed: refusing insecure secret storage.`);
    }
  }

  // Non-Windows platform: fail closed unless ENV reference is used
  throw new Error('[WINSEC_FATAL] Windows DPAPI is required for secret encryption on this system. For non-Windows environments, use ENV:<VAR_NAME>.');
}

/**
 * Decrypt credential reference.
 * Strictly accepts ONLY explicit secure schemes:
 * - 'dpapi:<base64>'
 * - 'ENV:<variable_name>'
 * 
 * Rejects unknown or unprefixed credentialRef.
 * NEVER returns raw credentialRef as plaintext.
 */
function decrypt(cipherRef) {
  if (!cipherRef || typeof cipherRef !== 'string') return '';
  if (memoryCache.has(cipherRef)) {
    return memoryCache.get(cipherRef);
  }

  // Scheme 1: Environment variable reference (ENV:VAR_NAME)
  if (cipherRef.startsWith('ENV:')) {
    const envVar = cipherRef.slice(4).trim();
    return process.env[envVar] || '';
  }

  // Scheme 2: Windows DPAPI ciphertext (dpapi:BASE64)
  if (cipherRef.startsWith('dpapi:')) {
    const rawCipher = cipherRef.slice(6).trim();
    if (process.platform === 'win32') {
      try {
        const script = `
          $ProgressPreference = 'SilentlyContinue'
          Add-Type -AssemblyName System.Security
          $raw = [Convert]::FromBase64String('${rawCipher.replace(/'/g, "''")}')
          $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($raw, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
          [System.Text.Encoding]::UTF8.GetString($dec)
        `;
        const b64 = Buffer.from(script, 'utf16le').toString('base64');
        const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', b64], { encoding: 'utf8' });
        const plain = out.trim().split(/\r?\n/).pop().trim();
        memoryCache.set(cipherRef, plain);
        return plain;
      } catch (err) {
        console.warn('[WINSEC_WARN] DPAPI decryption failed:', err.message);
        return '';
      }
    }
    return '';
  }

  // Rejection of unknown/unprefixed schemes: NEVER return raw cipherRef as plaintext!
  console.warn('[WINSEC_REJECT] Insecure or unsupported credentialRef scheme. Only "dpapi:" and "ENV:" are accepted:', cipherRef);
  return '';
}

/**
 * Resolve node credentials safely.
 * If credentialRef is present, it is decrypted. Unprefixed credentialRef is strictly rejected.
 */
function resolveNodeCredentials(node) {
  if (!node) return { username: '', password: '' };
  const username = node.username || '';
  let password = '';

  if (node.credentialRef !== undefined && node.credentialRef !== null && node.credentialRef !== '') {
    password = decrypt(node.credentialRef);
  } else if (node.password) {
    // Only permitted for temporary in-memory node objects before persistence
    password = node.password;
  }

  return { username, password };
}

/**
 * Sanitize node before writing to persistent JSON configuration.
 * Plaintext passwords are NEVER permitted in persisted config.
 * 
 * Rules:
 * 1. Plaintext `password` is encrypted to `dpapi:<base64>` and then wiped from the object.
 * 2. Insecure / unprefixed `credentialRef` is migrated to DPAPI or rejected.
 * 3. If DPAPI is unavailable, fails closed (throws Error).
 * 4. Runtime ephemeral fields (observedEgressIp, observedFingerprint, lastVerifiedAt) are deleted.
 */
function sanitizeNodeForSave(node) {
  if (!node || typeof node !== 'object') {
    throw new Error('[WINSEC_FATAL] Invalid node object provided to sanitizeNodeForSave');
  }

  const sanitized = { ...node };

  // 1. If node has plaintext password, encrypt it immediately to DPAPI
  if (sanitized.password && typeof sanitized.password === 'string' && sanitized.password.trim().length > 0) {
    sanitized.credentialRef = encrypt(sanitized.password.trim());
  }
  sanitized.password = ''; // Always wipe plaintext

  // 2. Validate and migrate credentialRef
  if (sanitized.credentialRef && typeof sanitized.credentialRef === 'string') {
    const trimmed = sanitized.credentialRef.trim();
    if (trimmed.startsWith('dpapi:') || trimmed.startsWith('ENV:')) {
      sanitized.credentialRef = trimmed;
    } else {
      // Insecure / raw credentialRef value (e.g. "plain-secret")
      // Migrate to DPAPI or fail closed
      sanitized.credentialRef = encrypt(trimmed);
      if (!sanitized.credentialRef.startsWith('dpapi:') && !sanitized.credentialRef.startsWith('ENV:')) {
        throw new Error('[WINSEC_FATAL] Failed to securely encrypt credentialRef. Refusing to persist insecure secret.');
      }
    }
  } else {
    sanitized.credentialRef = '';
  }

  // Strict double check: ensure password property is strictly blank
  sanitized.password = '';

  // Never persist ephemeral test/runtime state
  delete sanitized.observedEgressIp;
  delete sanitized.observedFingerprint;
  delete sanitized.lastVerifiedAt;
  sanitized.lastHealth = 'UNKNOWN';

  return sanitized;
}

function clearMemoryCache() {
  memoryCache.clear();
}

module.exports = {
  encrypt,
  decrypt,
  protectSecret: encrypt,
  unprotectSecret: decrypt,
  resolveNodeCredentials,
  sanitizeNodeForSave,
  clearMemoryCache
};

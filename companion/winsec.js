/**
 * winsec.js
 * 
 * Windows Secure Secret Storage for XPIDER Companion Privacy Relay (Issue #6 R6.9G.10.2 Blocker 10).
 * 
 * Invariants:
 * - Persistent JSON configs must NEVER contain plaintext proxy passwords.
 * - Windows DPAPI (CurrentUser scope) encrypts proxy credentials into "dpapi:<base64>".
 * - Fallback to ENV:<name> or AES-256-GCM for cross-platform/headless environments.
 * - In-memory cache prevents spawning PowerShell on every proxied request.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

const memoryCache = new Map();

/**
 * Encrypt plaintext string using Windows DPAPI (CurrentUser scope).
 * Returns string starting with 'dpapi:<base64>'
 */
function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  if (memoryCache.has(`ENC:${plaintext}`)) {
    return memoryCache.get(`ENC:${plaintext}`);
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
    } catch (err) {
      console.warn('[WINSEC_WARN] DPAPI encryption failed, falling back to local machine cipher:', err.message);
    }
  }

  // Cross-platform fallback: machine-derived AES-256-GCM
  const machineKey = crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', machineKey, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  const result = `aesgcm:${iv.toString('hex')}:${tag}:${enc}`;
  memoryCache.set(`ENC:${plaintext}`, result);
  memoryCache.set(result, plaintext);
  return result;
}

/**
 * Decrypt credential reference.
 * Supports 'dpapi:<base64>', 'aesgcm:<iv>:<tag>:<data>', and 'ENV:<var>'.
 */
function decrypt(cipherRef) {
  if (!cipherRef || typeof cipherRef !== 'string') return '';
  if (memoryCache.has(cipherRef)) {
    return memoryCache.get(cipherRef);
  }

  // Environment variable reference
  if (cipherRef.startsWith('ENV:')) {
    const envVar = cipherRef.slice(4).trim();
    return process.env[envVar] || '';
  }

  // DPAPI ciphertext
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
  }

  // AES-GCM ciphertext
  if (cipherRef.startsWith('aesgcm:')) {
    try {
      const parts = cipherRef.split(':');
      if (parts.length === 4) {
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const enc = parts[3];
        const machineKey = crypto.createHash('sha256').update(os.hostname() + os.userInfo().username).digest();
        const decipher = crypto.createDecipheriv('aes-256-gcm', machineKey, iv);
        decipher.setAuthTag(tag);
        let plain = decipher.update(enc, 'hex', 'utf8');
        plain += decipher.final('utf8');
        memoryCache.set(cipherRef, plain);
        return plain;
      }
    } catch (err) {
      console.warn('[WINSEC_WARN] AES-GCM decryption failed:', err.message);
      return '';
    }
  }

  // Fallback: raw plaintext (with security notice)
  return cipherRef;
}

/**
 * Resolve node credentials safely.
 */
function resolveNodeCredentials(node) {
  if (!node) return { username: '', password: '' };
  const username = node.username || '';
  let password = '';

  if (node.credentialRef) {
    password = decrypt(node.credentialRef);
  } else if (node.password) {
    password = node.password;
  }

  return { username, password };
}

/**
 * Sanitize node before writing to persistent JSON configuration.
 * Plaintext passwords are NEVER permitted in persisted config.
 */
function sanitizeNodeForSave(node) {
  const sanitized = { ...node };

  // If node has plaintext password and no credentialRef, encrypt it immediately
  if (sanitized.password && typeof sanitized.password === 'string' && sanitized.password.trim().length > 0) {
    if (!sanitized.credentialRef) {
      sanitized.credentialRef = encrypt(sanitized.password);
    }
  }

  // Always delete or blank plaintext password in saved JSON
  sanitized.password = '';

  // Never persist test / runtime fingerprint and health state
  delete sanitized.observedEgressIp;
  delete sanitized.observedFingerprint;
  delete sanitized.lastVerifiedAt;
  sanitized.lastHealth = 'UNKNOWN';

  return sanitized;
}

module.exports = {
  encrypt,
  decrypt,
  resolveNodeCredentials,
  sanitizeNodeForSave
};

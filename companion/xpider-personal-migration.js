'use strict';
/**
 * XPIDER V7.1 Local-Only Personal Settings & Credentials Migration Tool.
 *
 * CRITICAL SECURITY SEPARATION:
 * - Used STRICTLY by the Owner's LOCAL-ONLY private installer builder (`scripts/build_local_private_installer.ps1`).
 * - NEVER invoked by the public GitHub release builder (`scripts/build_windows_installer.ps1`).
 * - Solves the cross-PC Windows DPAPI barrier:
 *   1. On pack (Owner's source PC): reads local Sidecar settings/keys AND unwraps this PC's
 *      Windows DPAPI Gmail OAuth client/account refresh tokens into a checksummed local seed file
 *      (`XPIDER_PERSONAL_SEED.bin`).
 *   2. On apply (Owner's new PC during local-only EXE install): verifies SHA-256 integrity,
 *      writes all keys/configs with strict NTFS user-only ACLs (`writeProtectedSecretFile`),
 *      RE-SEALS Gmail OAuth Client ID/Secret & Refresh Tokens using the NEW PC's Windows DPAPI,
 *      and immediately deletes the temporary extracted seed file.
 * - ZERO hardcoded secrets anywhere in this source file.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const winsec = require('./winsec');
const { writeProtectedSecretFile } = require('./email-test-sidecar-set-key');

const SEED_SCHEMA_VERSION = 'xpider-personal-local-seed-v1';

const PORTABLE_TEXT_FILES = Object.freeze([
  '.resend_api_key',
  '.resend_webhook_secret',
  '.ai_copy_api_key',
  '.image_host_config.json',
  '.unsubscribe_config.json',
  '.unsubscribe_sync_token',
  '.email_pipeline_hmac_secret',
  '.gmail_domain_config.json',
  '.gmail_domain_caps.json',
  '.gmail_web_compose_state.json',
  '.suppressed_recipient_hashes.json',
  '.email_saved_campaigns.json'
]);

const SENSITIVE_ACL_FILES = new Set([
  '.resend_api_key',
  '.resend_webhook_secret',
  '.ai_copy_api_key',
  '.image_host_config.json',
  '.unsubscribe_sync_token',
  '.email_pipeline_hmac_secret',
  '.gmail_oauth_client.dpapi.json',
  '.gmail_accounts_vault.dpapi.json'
]);

function defaultCryptoBox() {
  return {
    encrypt: (plain) => winsec.encrypt(plain),
    decrypt: (cipher) => winsec.decrypt(cipher)
  };
}

function tryDecryptField(val, cryptoBox) {
  const s = String(val || '');
  if (!s) return '';
  if (s.startsWith('dpapi:') || s.startsWith('testbox:')) {
    return String(cryptoBox.decrypt(s) || '');
  }
  return s;
}

function packPersonalSeed({
  sourceStateDir,
  outSeedPath,
  cryptoBox = null,
  includeWebComposeState = true
} = {}) {
  if (!sourceStateDir || !fs.existsSync(sourceStateDir)) {
    throw new Error(`SOURCE_STATE_DIR_NOT_FOUND: ${sourceStateDir}`);
  }
  const box = cryptoBox || defaultCryptoBox();
  const files = {};
  const includedNames = [];

  for (const fname of PORTABLE_TEXT_FILES) {
    if (!includeWebComposeState && fname === '.gmail_web_compose_state.json') continue;
    const fp = path.join(sourceStateDir, fname);
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf8');
    if (content && content.length > 0) {
      files[fname] = content;
      includedNames.push(fname);
    }
  }

  // Unwrap DPAPI Gmail OAuth Client (.gmail_oauth_client.dpapi.json -> clientId + clientSecretRef)
  let gmailOAuthClient = null;
  const oauthClientPath = path.join(sourceStateDir, '.gmail_oauth_client.dpapi.json');
  if (fs.existsSync(oauthClientPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(oauthClientPath, 'utf8'));
      const clientId = tryDecryptField(raw.clientId || raw.clientIdEnc, box);
      const clientSecret = tryDecryptField(raw.clientSecretRef || raw.clientSecretEnc || raw.clientSecret, box);
      if (clientId) {
        gmailOAuthClient = {
          version: raw.version || 1,
          clientId,
          clientSecret,
          updatedAt: raw.updatedAt || raw.savedAt || new Date().toISOString()
        };
        includedNames.push('.gmail_oauth_client.dpapi.json(re-sealable)');
      }
    } catch (err) {
      throw new Error(`FAILED_TO_UNWRAP_OAUTH_CLIENT_DPAPI: ${err.message}`);
    }
  }

  // Unwrap DPAPI Gmail Accounts Vault (.gmail_accounts_vault.dpapi.json -> accounts[].tokenRef)
  let gmailAccountsVault = null;
  const vaultPath = path.join(sourceStateDir, '.gmail_accounts_vault.dpapi.json');
  if (fs.existsSync(vaultPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
      const portableAccounts = accounts.map(acct => {
        const clone = { ...acct };
        if (clone.tokenRef) {
          clone._portableTokenJson = tryDecryptField(clone.tokenRef, box);
          delete clone.tokenRef;
        }
        if (clone.refreshTokenEnc) {
          clone._portableRefreshToken = tryDecryptField(clone.refreshTokenEnc, box);
          delete clone.refreshTokenEnc;
        }
        if (clone.accessTokenEnc) {
          clone._portableAccessToken = tryDecryptField(clone.accessTokenEnc, box);
          delete clone.accessTokenEnc;
        }
        return clone;
      });
      if (portableAccounts.length > 0) {
        gmailAccountsVault = {
          version: raw.version || 1,
          updatedAt: raw.updatedAt || new Date().toISOString(),
          accounts: portableAccounts
        };
        includedNames.push(`.gmail_accounts_vault.dpapi.json(${portableAccounts.length} accounts, re-sealable)`);
      }
    } catch (err) {
      throw new Error(`FAILED_TO_UNWRAP_GMAIL_VAULT_DPAPI: ${err.message}`);
    }
  }

  const payload = {
    schemaVersion: SEED_SCHEMA_VERSION,
    warning: 'LOCAL_PRIVATE_ONLY — CONTAINS OWNER CREDENTIALS — DO NOT COMMIT OR UPLOAD TO GITHUB',
    packedAtUtc: new Date().toISOString(),
    files,
    gmailOAuthClient,
    gmailAccountsVault
  };

  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const sha256 = crypto.createHash('sha256').update(jsonBuf).digest('hex');
  // Wrap in AES-256-GCM envelope (prevents accidental plain-text scanning / corruption, verifies integrity via GCM tag + SHA-256)
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(jsonBuf), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    magic: 'XPIDER_LOCAL_SEED_V1',
    warning: 'LOCAL_PRIVATE_ONLY_DO_NOT_UPLOAD_TO_GITHUB',
    alg: 'aes-256-gcm',
    sha256,
    k: key.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64')
  };

  if (outSeedPath) {
    fs.mkdirSync(path.dirname(outSeedPath), { recursive: true });
    fs.writeFileSync(outSeedPath, JSON.stringify(envelope), { mode: 0o600 });
  }

  return {
    ok: true,
    includedCount: includedNames.length,
    includedNames,
    sha256,
    outSeedPath: outSeedPath || null
  };
}

function applyPersonalSeed({
  seedPath,
  targetStateDir,
  overwriteExisting = false,
  deleteSeedAfterApply = false,
  trustedTestMode = false,
  cryptoBox = null
} = {}) {
  if (!seedPath || !fs.existsSync(seedPath)) {
    throw new Error(`SEED_FILE_NOT_FOUND: ${seedPath}`);
  }
  if (!targetStateDir) throw new Error('TARGET_STATE_DIR_REQUIRED');
  fs.mkdirSync(targetStateDir, { recursive: true });

  const box = cryptoBox || defaultCryptoBox();
  const envelope = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  if (!envelope || envelope.magic !== 'XPIDER_LOCAL_SEED_V1' || envelope.alg !== 'aes-256-gcm') {
    throw new Error('INVALID_PERSONAL_SEED_ENVELOPE');
  }

  const key = Buffer.from(envelope.k, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const enc = Buffer.from(envelope.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plainBuf = Buffer.concat([decipher.update(enc), decipher.final()]);
  const actualSha = crypto.createHash('sha256').update(plainBuf).digest('hex');
  if (actualSha !== envelope.sha256) {
    throw new Error('PERSONAL_SEED_SHA256_MISMATCH');
  }

  const payload = JSON.parse(plainBuf.toString('utf8'));
  if (payload.schemaVersion !== SEED_SCHEMA_VERSION) {
    throw new Error(`UNSUPPORTED_SEED_SCHEMA: ${payload.schemaVersion}`);
  }

  const writeFileSafe = (destPath, contentStr, sensitive) => {
    if (sensitive && !trustedTestMode) {
      writeProtectedSecretFile(destPath, contentStr);
    } else {
      fs.writeFileSync(destPath, contentStr, { mode: 0o600 });
    }
  };

  const applied = [];
  const skippedExisting = [];
  const files = payload.files && typeof payload.files === 'object' ? payload.files : {};

  for (const fname of PORTABLE_TEXT_FILES) {
    if (typeof files[fname] !== 'string' || !files[fname]) continue;
    const destPath = path.join(targetStateDir, fname);
    if (!overwriteExisting && fs.existsSync(destPath)) {
      skippedExisting.push(fname);
      continue;
    }
    writeFileSafe(destPath, files[fname], SENSITIVE_ACL_FILES.has(fname));
    applied.push(fname);
  }

  // Re-seal Gmail OAuth Client matching exact GmailAccountVault schema (clientId + clientSecretRef)
  if (payload.gmailOAuthClient && payload.gmailOAuthClient.clientId) {
    const destPath = path.join(targetStateDir, '.gmail_oauth_client.dpapi.json');
    if (!overwriteExisting && fs.existsSync(destPath)) {
      skippedExisting.push('.gmail_oauth_client.dpapi.json');
    } else {
      const c = payload.gmailOAuthClient;
      const secretRef = c.clientSecret ? box.encrypt(c.clientSecret) : null;
      const resealed = {
        version: c.version || 1,
        clientId: String(c.clientId),
        hasClientSecret: Boolean(secretRef),
        clientSecretRef: secretRef,
        updatedAt: c.updatedAt || new Date().toISOString(),
        migratedAt: new Date().toISOString()
      };
      writeFileSafe(destPath, JSON.stringify(resealed, null, 2) + '\n', true);
      applied.push('.gmail_oauth_client.dpapi.json(resealed)');
    }
  }

  // Re-seal Gmail Connected Accounts Vault matching exact GmailAccountVault schema (accounts[].tokenRef)
  if (payload.gmailAccountsVault && Array.isArray(payload.gmailAccountsVault.accounts) && payload.gmailAccountsVault.accounts.length > 0) {
    const destPath = path.join(targetStateDir, '.gmail_accounts_vault.dpapi.json');
    if (!overwriteExisting && fs.existsSync(destPath)) {
      skippedExisting.push('.gmail_accounts_vault.dpapi.json');
    } else {
      const resealedAccounts = payload.gmailAccountsVault.accounts.map(acct => {
        const out = { ...acct };
        if (out._portableTokenJson) {
          out.tokenRef = box.encrypt(out._portableTokenJson);
          delete out._portableTokenJson;
        }
        if (out._portableRefreshToken) {
          out.refreshTokenEnc = box.encrypt(out._portableRefreshToken);
          delete out._portableRefreshToken;
        }
        if (out._portableAccessToken) {
          out.accessTokenEnc = box.encrypt(out._portableAccessToken);
          delete out._portableAccessToken;
        }
        return out;
      });
      const resealedVault = {
        version: payload.gmailAccountsVault.version || 1,
        updatedAt: new Date().toISOString(),
        accounts: resealedAccounts
      };
      writeFileSafe(destPath, JSON.stringify(resealedVault, null, 2) + '\n', true);
      applied.push(`.gmail_accounts_vault.dpapi.json(${resealedAccounts.length} accounts resealed)`);
    }
  }

  if (deleteSeedAfterApply) {
    try { fs.unlinkSync(seedPath); } catch (_) {}
  }

  return {
    ok: true,
    appliedCount: applied.length,
    applied,
    skippedExistingCount: skippedExisting.length,
    skippedExisting
  };
}

// CLI entrypoint for local-only builder & XpiderSetup.cs installer
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return (idx >= 0 && idx + 1 < args.length) ? args[idx + 1] : '';
  };
  try {
    if (args.includes('--pack-seed')) {
      const srcDir = getArg('--source-state-dir') || path.join(process.env.LOCALAPPDATA || '', 'XPIDER', 'Sidecar');
      const outPath = getArg('--out');
      if (!outPath) throw new Error('MISSING_--out');
      const res = packPersonalSeed({ sourceStateDir: srcDir, outSeedPath: outPath });
      console.log(`PERSONAL_SEED_PACKED count=${res.includedCount} sha256=${res.sha256}`);
      console.log(`ITEMS=${res.includedNames.join(', ')}`);
      process.exit(0);
    }
    if (args.includes('--apply-seed')) {
      const seedPath = getArg('--seed');
      const targetDir = getArg('--target-state-dir') || path.join(process.env.LOCALAPPDATA || '', 'XPIDER', 'Sidecar');
      const overwrite = args.includes('--overwrite');
      const delAfter = args.includes('--delete-after');
      const res = applyPersonalSeed({
        seedPath,
        targetStateDir: targetDir,
        overwriteExisting: overwrite,
        deleteSeedAfterApply: delAfter
      });
      console.log(`PERSONAL_SEED_APPLIED applied=${res.appliedCount} skipped=${res.skippedExistingCount}`);
      if (res.applied.length) console.log(`APPLIED=${res.applied.join(', ')}`);
      if (res.skippedExisting.length) console.log(`SKIPPED=${res.skippedExisting.join(', ')}`);
      process.exit(0);
    }
    console.error('USAGE: node xpider-personal-migration.js --pack-seed --source-state-dir <dir> --out <file> | --apply-seed --seed <file> --target-state-dir <dir> [--overwrite] [--delete-after]');
    process.exit(1);
  } catch (err) {
    console.error(`[XPIDER_MIGRATION_ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  SEED_SCHEMA_VERSION,
  PORTABLE_TEXT_FILES,
  packPersonalSeed,
  applyPersonalSeed
};

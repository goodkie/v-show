/**
 * state-migrator.js
 * 
 * [Issue #6 Comment #6261136757 Directive DD3]
 * Preserves and migrates existing ACTIVE Private Egress state across package upgrades.
 * 
 * Guarantees that version-to-version upgrades (e.g. RC3.13 -> RC3.14 -> RC3.15)
 * never lose active cloud resources, proxy credentials, certificates, or transaction ownership:
 * 1. Discovers active egress state from prior installations (Registry native host pointer, sibling package directories, and %LOCALAPPDATA%).
 * 2. Copies egress_pool_config.json, .private_egress_transaction.json, and .control_token into current package companion directory.
 * 3. Mirrors state into persistent %LOCALAPPDATA%\XPIDER_Privacy_Relay for continuous cross-version safety.
 * 4. Strictly prevents Step B reruns and zero duplicate cloud resources.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGlobalAppDataDir() {
  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
  if (!localAppData) return null;
  const target = path.join(localAppData, 'XPIDER_Privacy_Relay');
  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
  } catch (_) {}
  return target;
}

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function isEgressPoolActive(poolData) {
  if (!poolData || !Array.isArray(poolData.nodes) || poolData.nodes.length === 0) {
    return false;
  }
  // At least one node with a valid host and credentials/ca, rejecting mock test CAs
  return poolData.nodes.some(n => {
    if (!n || !n.host) return false;
    if (n.ca && typeof n.ca === 'string' && (n.ca.includes('MOCK') || n.ca.length < 100)) {
      return false;
    }
    return Boolean(n.credentialRef || n.password || n.ca);
  });
}


function isTransactionActive(txData) {
  if (!txData) return false;
  return (txData.status === 'ACTIVE' || txData.status === 'RECOVERY_REQUIRED') &&
         (txData.dropletId || txData.publicIp || txData.transactionTag);
}

/**
 * Discovers candidate companion directories containing active state.
 */
function discoverPriorCompanionDirs(targetCompanionDir) {
  const candidates = [];
  const normalizedTarget = path.resolve(targetCompanionDir).toLowerCase();

  // 1. Check Windows Registry for Native Messaging Host
  try {
    if (process.platform === 'win32') {
      const regKeys = [
        'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.xpider.privacy_relay',
        'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.xpider.privacy_relay'
      ];
      for (const regKey of regKeys) {
        try {
          const out = execSync(`reg query "${regKey}" /ve`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          const match = out.match(/REG_SZ\s+(.+)/);
          if (match && match[1]) {
            const manifestPath = match[1].trim();
            if (fs.existsSync(manifestPath)) {
              const manifest = readJsonSafe(manifestPath);
              if (manifest && manifest.path) {
                const compDir = path.resolve(path.dirname(manifest.path), '..');
                if (path.resolve(compDir).toLowerCase() !== normalizedTarget && fs.existsSync(compDir)) {
                  candidates.push({ dir: compDir, source: 'registry' });
                }
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}

  // 2. Check Sibling directories in workspace root (or package parent)
  try {
    const parentDir = path.resolve(targetCompanionDir, '..', '..');
    if (fs.existsSync(parentDir)) {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && (ent.name.startsWith('XPIDER_') || ent.name.includes('PRIVATE_EGRESS'))) {
          const compDir = path.join(parentDir, ent.name, 'companion');
          if (path.resolve(compDir).toLowerCase() !== normalizedTarget && fs.existsSync(compDir)) {
            candidates.push({ dir: compDir, source: 'sibling' });
          }
        }
      }
    }
  } catch (_) {}

  // 3. Check Global AppData Backup
  try {
    const appDataDir = getGlobalAppDataDir();
    if (appDataDir && path.resolve(appDataDir).toLowerCase() !== normalizedTarget && fs.existsSync(appDataDir)) {
      candidates.push({ dir: appDataDir, source: 'appdata' });
    }
  } catch (_) {}

  // Deduplicate candidates
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const norm = path.resolve(c.dir).toLowerCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      unique.push(c);
    }
  }

  return unique;
}

/**
 * Evaluates candidate companion directories and selects the best active candidate.
 */
function findBestActiveCandidate(targetCompanionDir) {
  const candidates = discoverPriorCompanionDirs(targetCompanionDir);
  const scored = [];

  for (const c of candidates) {
    const poolPath = path.join(c.dir, 'egress_pool_config.json');
    const txPath = path.join(c.dir, '.private_egress_transaction.json');
    const tokenPath = path.join(c.dir, '.control_token');

    const pool = readJsonSafe(poolPath);
    const tx = readJsonSafe(txPath);

    const hasPool = isEgressPoolActive(pool);
    const hasTx = isTransactionActive(tx);

    if (hasPool || hasTx) {
      let mtime = 0;
      try {
        if (fs.existsSync(poolPath)) mtime = Math.max(mtime, fs.statSync(poolPath).mtimeMs);
        if (fs.existsSync(txPath)) mtime = Math.max(mtime, fs.statSync(txPath).mtimeMs);
      } catch (_) {}

      // Priority score: genuine CA cert > both pool and tx active > pool active > tx active
      let score = 0;
      const hasRealCa = pool && Array.isArray(pool.nodes) && pool.nodes.some(n => n && n.ca && typeof n.ca === 'string' && n.ca.length > 500 && !n.ca.includes('MOCK'));
      if (hasRealCa) score += 200;
      if (hasPool && hasTx) score += 100;
      else if (hasPool) score += 50;
      else if (hasTx) score += 30;


      scored.push({
        dir: c.dir,
        source: c.source,
        score,
        mtime,
        pool,
        tx,
        hasToken: fs.existsSync(tokenPath),
        poolPath,
        txPath,
        tokenPath
      });
    }
  }

  if (scored.length === 0) return null;

  // Sort by score descending, then mtime descending
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.mtime - a.mtime;
  });

  return scored[0];
}

/**
 * Mirrors active files to %LOCALAPPDATA%\XPIDER_Privacy_Relay
 */
function mirrorStateToGlobalBackup(companionDir) {
  try {
    const appDataDir = getGlobalAppDataDir();
    if (!appDataDir) return false;

    const filesToMirror = ['egress_pool_config.json', '.private_egress_transaction.json', '.local_credentials.json'];
    for (const f of filesToMirror) {
      const src = path.join(companionDir, f);
      if (fs.existsSync(src)) {
        const dest = path.join(appDataDir, f);
        if (f === 'egress_pool_config.json' && fs.existsSync(dest)) {
          const srcJson = readJsonSafe(src);
          const destJson = readJsonSafe(dest);
          if (srcJson && destJson && !srcJson.residentialProxyConfig && destJson.residentialProxyConfig && destJson.residentialProxyConfig.host) {
            const merged = {
              ...srcJson,
              residentialProxySelected: Boolean(destJson.residentialProxySelected),
              residentialProxyConfig: destJson.residentialProxyConfig
            };
            fs.writeFileSync(dest, JSON.stringify(merged, null, 2), 'utf8');
            continue;
          }
        }
        fs.copyFileSync(src, dest);
      }
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Main migration entry point:
 * Checks target directory. If it lacks active pool or active transaction, migrates from best prior candidate.
 */
function migrateActiveEgressState(targetCompanionDir = path.resolve(__dirname)) {
  const currentPoolPath = path.join(targetCompanionDir, 'egress_pool_config.json');
  const currentTxPath = path.join(targetCompanionDir, '.private_egress_transaction.json');
  const currentTokenPath = path.join(targetCompanionDir, '.control_token');

  const curPool = readJsonSafe(currentPoolPath);
  const curTx = readJsonSafe(currentTxPath);

  const curPoolActive = isEgressPoolActive(curPool);
  const curTxActive = isTransactionActive(curTx);

  // If target directory ALREADY has active pool AND active transaction, nothing to migrate
  if (curPoolActive && curTxActive) {
    mirrorStateToGlobalBackup(targetCompanionDir);
    return {
      migrated: false,
      alreadyActive: true,
      nodesCount: curPool.nodes.length,
      publicIp: curPool.nodes[0].host,
      transactionTag: curTx.transactionTag
    };
  }

  // Find best prior candidate with active state
  const best = findBestActiveCandidate(targetCompanionDir);
  if (!best) {
    return {
      migrated: false,
      alreadyActive: false,
      reason: 'NO_PRIOR_ACTIVE_STATE_FOUND'
    };
  }

  const results = {
    migrated: true,
    sourceDir: best.dir,
    source: best.source,
    nodesMigrated: 0,
    publicIp: null,
    transactionTag: null,
    dropletId: null,
    tokenMigrated: false
  };

  // 1. Migrate egress_pool_config.json if target has no active nodes
  if (!curPoolActive && best.pool && isEgressPoolActive(best.pool)) {
    fs.copyFileSync(best.poolPath, currentPoolPath);
    results.nodesMigrated = best.pool.nodes.length;
    results.publicIp = best.pool.nodes[0].host;
  }

  // 2. Migrate .private_egress_transaction.json if target has no active transaction
  if (!curTxActive && best.tx && isTransactionActive(best.tx)) {
    fs.copyFileSync(best.txPath, currentTxPath);
    results.transactionTag = best.tx.transactionTag;
    results.dropletId = best.tx.dropletId;
    if (!results.publicIp) results.publicIp = best.tx.publicIp;
  }

  // 3. Migrate .control_token if target has no token
  if (!fs.existsSync(currentTokenPath) && best.hasToken) {
    try {
      const token = fs.readFileSync(best.tokenPath, 'utf8').trim();
      if (token && token.length >= 32) {
        fs.writeFileSync(currentTokenPath, token, { encoding: 'utf8', mode: 0o600 });
        results.tokenMigrated = true;
      }
    } catch (_) {}
  }

  // 4. Migrate .local_credentials.json if target has none
  const currentCredsPath = path.join(targetCompanionDir, '.local_credentials.json');
  const candidateCredsPath = path.join(best.dir, '.local_credentials.json');
  if (!fs.existsSync(currentCredsPath) && fs.existsSync(candidateCredsPath)) {
    try {
      fs.copyFileSync(candidateCredsPath, currentCredsPath);
      results.credentialsMigrated = true;
    } catch (_) {}
  }

  // Mirror migrated state to global backup
  mirrorStateToGlobalBackup(targetCompanionDir);

  return results;
}

// CLI runner support
if (require.main === module) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname);
  console.log(`[STATE_MIGRATOR] Checking/Migrating active private egress state for: ${target}`);
  const res = migrateActiveEgressState(target);
  console.log(JSON.stringify(res, null, 2));
}

module.exports = {
  migrateActiveEgressState,
  mirrorStateToGlobalBackup,
  discoverPriorCompanionDirs,
  findBestActiveCandidate,
  isEgressPoolActive,
  isTransactionActive
};

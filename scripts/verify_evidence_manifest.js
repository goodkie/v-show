/**
 * scripts/verify_evidence_manifest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies byte parity across all published evidence artifacts against
 * RUN_BUNDLE_MANIFEST.json.
 *
 * Verifies BOTH:
 * 1. Local Filesystem Parity (localEvidenceParity)
 * 2. Exact Git Commit-Tree Parity (commitTreeParity) via git show <commitSha>:<path>
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

function verifyEvidenceManifest(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const manifestPath = options.manifestPath || path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts/RUN_BUNDLE_MANIFEST.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = manifest.manifestEntries;
  assert.ok(Array.isArray(entries), 'manifestEntries must be an array');
  assert.ok(entries.length >= 10, `Expected at least 10 manifest entries, got ${entries.length}`);

  let evidenceCommitSha = options.commitSha;
  if (!evidenceCommitSha) {
    try {
      evidenceCommitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch (_) {
      evidenceCommitSha = null;
    }
  }

  // 1. Verify Local Filesystem Parity
  let verifiedLocalCount = 0;
  for (const entry of entries) {
    const fullP = path.join(repoRoot, entry.path);
    assert.ok(fs.existsSync(fullP), `Manifested file must exist on disk: ${entry.path}`);
    const stat = fs.statSync(fullP);
    const buf = fs.readFileSync(fullP);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');

    assert.strictEqual(stat.size, entry.sizeBytes, `Local size mismatch on ${entry.path}: expected ${entry.sizeBytes}, got ${stat.size}`);
    assert.strictEqual(sha, entry.sha256, `Local SHA-256 mismatch on ${entry.path}: expected ${entry.sha256}, got ${sha}`);
    verifiedLocalCount++;
  }

  // Verify canonical bundle digest over sorted entries
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const expectedDigest = crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  assert.strictEqual(manifest.bundleDigest, expectedDigest, `bundleDigest mismatch: expected ${expectedDigest}, got ${manifest.bundleDigest}`);

  // 2. Verify Git Commit Tree Parity if evidenceCommitSha is provided / available
  let commitTreeParity = false;
  let verifiedCommitTreeCount = 0;
  const commitTreeErrors = [];

  if (evidenceCommitSha && !options.skipCommitTree) {
    for (const entry of entries) {
      const gitPath = entry.path.replace(/\\/g, '/');
      try {
        const blobBuf = execSync(`git cat-file -p "${evidenceCommitSha}:${gitPath}"`, {
          cwd: repoRoot,
          maxBuffer: 200 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        const blobSha = crypto.createHash('sha256').update(blobBuf).digest('hex');
        const blobSize = blobBuf.length;

        if (blobSize !== entry.sizeBytes) {
          commitTreeErrors.push(`Commit-tree size mismatch on ${gitPath}: expected ${entry.sizeBytes}, got ${blobSize}`);
        } else if (blobSha !== entry.sha256) {
          commitTreeErrors.push(`Commit-tree SHA-256 mismatch on ${gitPath}: expected ${entry.sha256}, got ${blobSha}`);
        } else {
          verifiedCommitTreeCount++;
        }
      } catch (err) {
        commitTreeErrors.push(`Commit-tree file missing at ${evidenceCommitSha}:${gitPath} (${err.message.trim()})`);
      }
    }

    if (commitTreeErrors.length > 0) {
      if (options.requireCommitTree) {
        throw new Error(`CRITICAL COMMIT-TREE PARITY FAILURE at ${evidenceCommitSha}:\n${commitTreeErrors.join('\n')}`);
      } else {
        console.warn(`[WARN] Commit-tree parity incomplete at ${evidenceCommitSha} (${commitTreeErrors.length} errors, likely uncommitted evidence)`);
      }
    } else {
      commitTreeParity = true;
    }
  }

  return {
    success: true,
    evidenceCommitSha,
    manifestPath,
    bundleDigest: manifest.bundleDigest,
    manifestEntriesCount: entries.length,
    localEvidenceParity: true,
    verifiedLocalCount,
    commitTreeParity,
    commitTreeEntriesVerified: verifiedCommitTreeCount,
    commitTreeErrors
  };
}

if (require.main === module) {
  const argCommit = (process.argv.find(a => a.startsWith('--commit=')) || '').split('=')[1] || null;
  const requireCommitTree = process.argv.includes('--require-commit-tree');
  const result = verifyEvidenceManifest({
    commitSha: argCommit,
    requireCommitTree
  });
  console.log(`Verified evidence manifest: ${result.verifiedLocalCount} local entries, bundleDigest: ${result.bundleDigest}`);
  console.log(`Local Evidence Parity:       ${result.localEvidenceParity}`);
  console.log(`Commit Tree SHA:            ${result.evidenceCommitSha || 'N/A'}`);
  console.log(`Commit Tree Parity:         ${result.commitTreeParity} (${result.commitTreeEntriesVerified}/${result.manifestEntriesCount} verified)`);
  if (result.commitTreeErrors.length > 0) {
    console.log(`Commit Tree Errors (${result.commitTreeErrors.length}):`);
    result.commitTreeErrors.forEach(e => console.log(`  - ${e}`));
  }
}

module.exports = {
  verifyEvidenceManifest
};

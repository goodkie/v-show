/**
 * scripts/verify_evidence_manifest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies byte parity across all published evidence artifacts against
 * RUN_BUNDLE_MANIFEST.json.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

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

  let verifiedCount = 0;
  for (const entry of entries) {
    const fullP = path.join(repoRoot, entry.path);
    assert.ok(fs.existsSync(fullP), `Manifested file must exist on disk: ${entry.path}`);
    const stat = fs.statSync(fullP);
    const buf = fs.readFileSync(fullP);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');

    assert.strictEqual(stat.size, entry.sizeBytes, `Byte size mismatch on ${entry.path}: expected ${entry.sizeBytes}, got ${stat.size}`);
    assert.strictEqual(sha, entry.sha256, `SHA-256 mismatch on ${entry.path}: expected ${entry.sha256}, got ${sha}`);
    verifiedCount++;
  }

  // Verify canonical bundle digest
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const expectedDigest = crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  assert.strictEqual(manifest.bundleDigest, expectedDigest, `bundleDigest mismatch: expected ${expectedDigest}, got ${manifest.bundleDigest}`);

  return {
    success: true,
    publishedEvidenceParity: true,
    verifiedEntriesCount: verifiedCount,
    bundleDigest: manifest.bundleDigest,
    manifestPath
  };
}

if (require.main === module) {
  const result = verifyEvidenceManifest();
  console.log(`Verified evidence manifest: ${result.verifiedEntriesCount} entries, bundleDigest: ${result.bundleDigest}`);
  console.log('publishedEvidenceParity: true');
}

module.exports = {
  verifyEvidenceManifest
};

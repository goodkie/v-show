/**
 * scripts/build_run_bundle_manifest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the canonical cryptographic run bundle manifest across all published
 * evidence artifacts, code engines, worker sources, receipts, and models.
 *
 * Excludes only the manifest file itself to eliminate cyclic dependencies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const CLAIMED_EVIDENCE_RELPATHS = [
  'virtual-tradeshow-commercial-v1/server/spatial_reconstruction_engine.py',
  'virtual-tradeshow-commercial-v1/server/spatial_reconstruction_worker.js',
  'virtual-tradeshow-commercial-v1/server/dataset_inventory.js',
  'virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py',
  'virtual-tradeshow-commercial-v1/server/evaluator_config.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/DATASET_GEOMETRY_CACHE.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT_V4_EMPIRICAL_GEOMETRY_EVALUATION.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/DATASET_INVENTORY_AUDIT.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT_V11_STANDARDIZED_DIGEST_AND_SUPPORT_POLICY.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECEIPT.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/R47_TEST_EXECUTION_RECEIPT.json',
  'virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_RECONSTRUCTED_SPATIAL_MODEL.ply',
  'virtual-tradeshow-commercial-v1/production_artifacts/AUTHLINEAGE_SPARSE_SFM_SEED.ply',
  'test/test_stage2_true3d_pipeline.js',
  'scripts/build_geometry_cache.js',
  'scripts/generate_round100_report.js',
  'docs/ROUND_100_REPORT.md'
];

function buildRunBundleManifest(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const outputPath = options.outputPath || path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts/RUN_BUNDLE_MANIFEST.json');

  let cutCommitSha = options.cutCommitSha;
  if (!cutCommitSha) {
    try {
      cutCommitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch (_) {
      cutCommitSha = 'UNBOUND';
    }
  }

  const manifestEntries = [];

  for (const relPath of CLAIMED_EVIDENCE_RELPATHS) {
    const fullP = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullP)) {
      throw new Error(`CRITICAL MANIFEST ERROR: Claimed evidence artifact does not exist: ${relPath}`);
    }
    const stat = fs.statSync(fullP);
    const buf = fs.readFileSync(fullP);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    manifestEntries.push({
      path: relPath.replace(/\\/g, '/'),
      sizeBytes: stat.size,
      sha256
    });
  }

  // Canonical sorting by path
  manifestEntries.sort((a, b) => a.path.localeCompare(b.path));

  // Compute non-cyclic bundle digest over sorted canonical entries
  const canonicalJson = JSON.stringify(manifestEntries);
  const bundleDigest = crypto.createHash('sha256').update(canonicalJson).digest('hex');

  const manifestRecord = {
    manifestSchemaVersion: 'RUN_BUNDLE_MANIFEST_V2_NON_CYCLIC',
    cutCommitSha,
    bundleDigest,
    createdAt: new Date().toISOString(),
    manifestEntriesCount: manifestEntries.length,
    manifestEntries
  };

  const manifestJsonString = JSON.stringify(manifestRecord, null, 2) + '\n';
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, manifestJsonString, 'utf8');

  return {
    success: true,
    outputPath,
    cutCommitSha,
    bundleDigest,
    manifestEntriesCount: manifestEntries.length,
    manifestRecord
  };
}

if (require.main === module) {
  const result = buildRunBundleManifest();
  console.log(`Run Bundle Manifest generated: ${result.outputPath}`);
  console.log(`  Entries:      ${result.manifestEntriesCount}`);
  console.log(`  Bundle Digest: ${result.bundleDigest}`);
}

module.exports = {
  buildRunBundleManifest,
  CLAIMED_EVIDENCE_RELPATHS
};

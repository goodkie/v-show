/**
 * scripts/publish_round101_evidence.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer B Evidence Publisher for Round 101.
 *
 * Full Staged & Committed Lifecycle:
 * 1. Copies scratch receipts/artifacts to production_artifacts.
 * 2. Generates docs/ROUND_101_REPORT.md (fail-closed, dynamic from manifest/receipts).
 * 3. Builds canonical RUN_BUNDLE_MANIFEST.json over all 17 claimed evidence artifacts.
 * 4. Verifies Local Evidence Parity.
 * 5. Stages files in Git index (git add).
 * 6. Creates the Evidence Commit (git commit).
 * 7. Obtains Evidence Commit SHA (git rev-parse HEAD).
 * 8. Verifies Git Commit Tree Parity via verifyEvidenceManifest against the commit SHA.
 * 9. Optionally pushes to remote and verifies Remote HEAD Parity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateRound101Report } = require('./generate_round101_report');
const { buildRunBundleManifest } = require('./build_run_bundle_manifest');
const { verifyEvidenceManifest } = require('./verify_evidence_manifest');

function publishRound101Evidence(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const scratchDir = options.scratchDir || path.join(repoRoot, 'scratch/clean_run_artifacts');
  const prodDir = path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts');

  let cutCommitSha = options.cutCommitSha;
  if (!cutCommitSha) {
    try {
      cutCommitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch (_) {
      cutCommitSha = 'UNBOUND';
    }
  }

  console.log(`[Layer B] Publishing Round 101 Evidence bound to CUT: ${cutCommitSha}`);

  // 1. Sync scratch receipts to production_artifacts if scratch files exist
  if (fs.existsSync(scratchDir)) {
    const files = fs.readdirSync(scratchDir);
    for (const f of files) {
      const src = path.join(scratchDir, f);
      const dst = path.join(prodDir, f);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
        console.log(`  - Synced from scratch: ${f}`);
      }
    }
  }

  // Ensure line endings are normalized to LF in production_artifacts
  fs.readdirSync(prodDir).forEach(f => {
    if (f.endsWith('.json') || f.endsWith('.txt')) {
      const p = path.join(prodDir, f);
      const c = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      fs.writeFileSync(p, c, 'utf8');
    }
  });

  // 2. Pre-generate report stub if needed for manifest indexing
  const reportPath = path.join(repoRoot, 'docs/ROUND_101_REPORT.md');
  if (!fs.existsSync(reportPath)) {
    fs.writeFileSync(reportPath, '# ROUND 101 REPORT TEMPORARY PRE-MANIFEST STUB\n', 'utf8');
  }

  // 3. Build Canonical Run Bundle Manifest
  console.log('  - Building canonical RUN_BUNDLE_MANIFEST.json...');
  const manifestRes = buildRunBundleManifest({ repoRoot, cutCommitSha });
  console.log(`  - Manifest entries: ${manifestRes.manifestEntriesCount}, bundleDigest: ${manifestRes.bundleDigest}`);

  // 4. Generate Round 101 Report fail-closed (dynamically indexing manifest)
  console.log('  - Generating docs/ROUND_101_REPORT.md fail-closed...');
  generateRound101Report({ repoRoot });

  // Re-run manifest builder so docs/ROUND_101_REPORT.md hash in manifest reflects the generated report
  const finalManifestRes = buildRunBundleManifest({ repoRoot, cutCommitSha });
  // Re-generate report to bind final bundleDigest
  generateRound101Report({ repoRoot });

  // 5. Verify Local Evidence Parity
  console.log('  - Verifying local evidence parity...');
  const localVerifyRes = verifyEvidenceManifest({ repoRoot, skipCommitTree: true });
  console.log(`  - Local evidence parity: ${localVerifyRes.localEvidenceParity} (${localVerifyRes.verifiedLocalCount} entries)`);

  let evidenceCommitSha = null;
  let commitTreeParity = false;
  let remoteHeadParity = false;

  if (options.commit) {
    console.log('  - Staging evidence artifacts into Git index...');
    execSync('git add virtual-tradeshow-commercial-v1/production_artifacts/ virtual-tradeshow-commercial-v1/.gitignore docs/ROUND_101_REPORT.md docs/ROUND_101_ACK.md scripts/ test/', {
      cwd: repoRoot,
      stdio: 'inherit'
    });

    const commitMsg = options.commitMessage || `chore(evidence): publish round 101 receipts, manifest, and report bound to CUT ${cutCommitSha.substring(0, 8)}`;
    console.log(`  - Creating evidence commit: "${commitMsg}"...`);
    execSync(`git commit -m "${commitMsg}"`, {
      cwd: repoRoot,
      stdio: 'inherit'
    });

    evidenceCommitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    console.log(`  - Evidence commit created: ${evidenceCommitSha}`);

    // 6. Verify Git Commit Tree Parity
    console.log('  - Verifying Git commit-tree parity at evidence commit...');
    const treeVerifyRes = verifyEvidenceManifest({
      repoRoot,
      commitSha: evidenceCommitSha,
      requireCommitTree: true
    });
    commitTreeParity = treeVerifyRes.commitTreeParity;
    console.log(`  - Git Commit Tree Parity: ${commitTreeParity} (${treeVerifyRes.commitTreeEntriesVerified}/${treeVerifyRes.manifestEntriesCount} entries verified)`);

    if (options.push) {
      const branch = options.branch || execSync('git branch --show-current', { cwd: repoRoot, encoding: 'utf8' }).trim();
      console.log(`  - Pushing to origin/${branch}...`);
      execSync(`git push origin ${branch}`, { cwd: repoRoot, stdio: 'inherit' });

      const remoteHead = execSync(`git rev-parse origin/${branch}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
      remoteHeadParity = (remoteHead === evidenceCommitSha);
      console.log(`  - Remote HEAD Parity: ${remoteHeadParity} (origin/${branch} matches ${evidenceCommitSha})`);
    }
  }

  return {
    success: true,
    cutCommitSha,
    evidenceCommitSha,
    bundleDigest: finalManifestRes.bundleDigest,
    manifestEntriesCount: finalManifestRes.manifestEntriesCount,
    localEvidenceParity: localVerifyRes.localEvidenceParity,
    commitTreeParity,
    remoteHeadParity
  };
}

if (require.main === module) {
  const shouldCommit = process.argv.includes('--commit');
  const shouldPush = process.argv.includes('--push');
  const result = publishRound101Evidence({
    commit: shouldCommit,
    push: shouldPush
  });
  console.log('\n========================================');
  console.log('Round 101 Evidence Publication Complete');
  console.log(`CUT Commit SHA:        ${result.cutCommitSha}`);
  console.log(`Evidence Commit SHA:   ${result.evidenceCommitSha || '(not committed yet - run with --commit)'}`);
  console.log(`Bundle Digest:         ${result.bundleDigest}`);
  console.log(`Local Parity:          ${result.localEvidenceParity}`);
  console.log(`Commit Tree Parity:    ${result.commitTreeParity}`);
  console.log(`Remote HEAD Parity:    ${result.remoteHeadParity}`);
  console.log('========================================\n');
}

module.exports = {
  publishRound101Evidence
};

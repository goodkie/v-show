#!/usr/bin/env node
/**
 * Automated URL Branch/Provenance Consistency and Remote URL Verification Test Suite
 * Directive #6735785250:
 * 1. Verifies machine-readable manifest (REV20 & REV14 compat) and guides contain zero stale candidate branch URLs.
 * 2. Verifies all URLs point to active branch fix/submit-nomessage-semiauto-20261109.
 * 3. Verifies remote URL HEAD/GET for published candidate archives (REV12 runtime, REV19 kit) matches exact bytes & SHA-256.
 * 4. Verifies negative control: stale candidate branch URL returns 404.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_BRANCH = 'fix/submit-nomessage-semiauto-20261109';
const STALE_BRANCH = 'candidate/p0-core-regressions-v7';

const results = [];
function record(name, pass, details = {}) {
  const symbol = pass ? 'PASS' : 'FAIL';
  console.log(`[${symbol}] ${name} ${pass ? '' : JSON.stringify(details)}`);
  results.push({ name, pass, details });
  if (!pass) {
    throw new Error(`ASSERTION_FAILED: ${name} -> ${JSON.stringify(details)}`);
  }
}

function fetchStreamAndHash(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('TOO_MANY_REDIRECTS'));
    const req = https.get(url, { headers: { 'User-Agent': 'XPIDER-Handoff-Verifier/1.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const location = res.headers.location;
        if (!location) return reject(new Error('Redirect without location header'));
        return resolve(fetchStreamAndHash(location, maxRedirects - 1));
      }
      if (res.statusCode === 404) {
        return resolve({ statusCode: 404, size: 0, sha256: null });
      }
      if (res.statusCode !== 200) {
        return resolve({ statusCode: res.statusCode, size: 0, sha256: null });
      }
      const hash = crypto.createHash('sha256');
      let size = 0;
      res.on('data', (d) => {
        hash.update(d);
        size += d.length;
      });
      res.on('end', () => {
        resolve({ statusCode: 200, size, sha256: hash.digest('hex') });
      });
    });
    req.on('error', reject);
  });
}

(async () => {
  console.log('================================================================================');
  console.log('🧪 RUNNING HANDOFF URL CONSISTENCY & REMOTE VERIFICATION SUITE (#6735785250)');
  console.log('================================================================================\n');

  // --- Group 1: Manifest Consistency Checks ---
  const manifestPath = path.join(ROOT, 'dist', 'OWNER_HANDOFF_MANIFEST_REV21.json');
  record('REV21_MANIFEST_EXISTS_ON_DISK', fs.existsSync(manifestPath), { manifestPath });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  record('MANIFEST_DECLARED_BRANCH_MATCHES_ACTIVE', manifest.branch === ACTIVE_BRANCH, {
    declared: manifest.branch,
    expected: ACTIVE_BRANCH
  });

  const archiveRawUrl = manifest.completeHandoffArchive.rawUrl;
  record('COMPLETE_HANDOFF_ARCHIVE_URL_USES_ACTIVE_BRANCH', archiveRawUrl.includes(`/raw/${ACTIVE_BRANCH}/`), {
    archiveRawUrl,
    activeBranch: ACTIVE_BRANCH
  });

  record('COMPLETE_HANDOFF_ARCHIVE_URL_NO_STALE_BRANCH', !archiveRawUrl.includes(STALE_BRANCH), {
    archiveRawUrl,
    staleBranch: STALE_BRANCH
  });

  const bundled = manifest.completeHandoffArchive.bundledEntries || [];
  let staleBundledCount = 0;
  let invalidBranchBundledCount = 0;
  for (const entry of bundled) {
    if (entry.rawUrl.includes(STALE_BRANCH)) staleBundledCount++;
    if (!entry.rawUrl.includes(`/raw/${ACTIVE_BRANCH}/`)) invalidBranchBundledCount++;
  }
  record('ZERO_BUNDLED_ENTRIES_CONTAIN_STALE_BRANCH', staleBundledCount === 0, { staleBundledCount });
  record('ALL_BUNDLED_ENTRIES_USE_ACTIVE_BRANCH', invalidBranchBundledCount === 0, {
    total: bundled.length,
    invalidBranchBundledCount
  });

  // --- Group 2: Guide & Checklist Provenance Checks ---
  const guidePath = path.join(ROOT, 'dist', 'OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md');
  const checklistPath = path.join(ROOT, 'dist', 'WINDOWS_10_OWNER_UAT_CHECKLIST.md');
  const guideContent = fs.readFileSync(guidePath, 'utf8');
  const checklistContent = fs.readFileSync(checklistPath, 'utf8');

  record('GUIDE_NO_ACTIVE_STALE_CANDIDATE_URL', !guideContent.includes(`/raw/${STALE_BRANCH}/`), { guidePath });
  record('GUIDE_HAS_ACTIVE_BRANCH_URL', guideContent.includes(`/raw/${ACTIVE_BRANCH}/`), { guidePath });
  record('CHECKLIST_NO_ACTIVE_STALE_CANDIDATE_URL', !checklistContent.includes(`/raw/${STALE_BRANCH}/`), { checklistPath });
  record('CHECKLIST_HAS_ACTIVE_BRANCH_URL', checklistContent.includes(`/raw/${ACTIVE_BRANCH}/`), { checklistPath });

  // --- Group 3: Remote Network Verification on fix/submit-nomessage-semiauto-20261109 ---
  console.log('\n--- Remote Network Verification on Active GitHub Ref ---');

  // Verify REV12 runtime zip on remote
  const remoteRev12Url = `https://github.com/goodkie/v-show/raw/${ACTIVE_BRANCH}/dist/XPIDER_V7.0.0_CANDIDATE_P0_REV12_OWNER_SAFE.zip`;
  console.log('Fetching remote REV12 runtime ZIP:', remoteRev12Url);
  const rev12Remote = await fetchStreamAndHash(remoteRev12Url);
  record('REMOTE_REV12_STATUS_200', rev12Remote.statusCode === 200, { statusCode: rev12Remote.statusCode });
  record('REMOTE_REV12_SIZE_MATCHES', rev12Remote.size === 4473919, { size: rev12Remote.size, expected: 4473919 });
  record('REMOTE_REV12_SHA256_MATCHES', rev12Remote.sha256 === '02624da91d7bc9bb4933c76245c4320433b3df4fc4d046d07ead3b6e43dfcd26', {
    sha256: rev12Remote.sha256
  });

  // Verify REV19 complete handoff kit on remote (frozen)
  const remoteRev19Url = `https://github.com/goodkie/v-show/raw/${ACTIVE_BRANCH}/dist/XPIDER_V7.0.0_CANDIDATE_REV19_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`;
  console.log('Fetching remote REV19 handoff kit (frozen):', remoteRev19Url);
  const rev19Remote = await fetchStreamAndHash(remoteRev19Url);
  record('REMOTE_REV19_STATUS_200', rev19Remote.statusCode === 200, { statusCode: rev19Remote.statusCode });
  record('REMOTE_REV19_SIZE_MATCHES', rev19Remote.size === 4603827, { size: rev19Remote.size, expected: 4603827 });
  record('REMOTE_REV19_SHA256_MATCHES', rev19Remote.sha256 === '4a80d66b69d03029565ba36e0bc12991381aefe5074aeabe5cc88202f1cd8180', {
    sha256: rev19Remote.sha256
  });

  // Verify negative control: stale candidate branch URL must return 404
  const staleUrl = `https://github.com/goodkie/v-show/raw/${STALE_BRANCH}/dist/XPIDER_V7.0.0_CANDIDATE_REV19_OWNER_COMPLETE_UAT_HANDOFF_KIT.zip`;
  console.log('Verifying negative control (stale branch URL must 404):', staleUrl);
  const staleRemote = await fetchStreamAndHash(staleUrl);
  record('NEGATIVE_STALE_BRANCH_URL_RETURNS_404', staleRemote.statusCode === 404, { statusCode: staleRemote.statusCode });

  // Verify key remote files exist and match git committed blobs
  const testFiles = ['scripts/xpider_safe_update.js', 'dist/PACKAGE_INVENTORY_SHA256.json'];
  for (const rel of testFiles) {
    const gitBlob = require('child_process').execSync(`git show origin/${ACTIVE_BRANCH}:${rel}`);
    const gitSha = crypto.createHash('sha256').update(gitBlob).digest('hex');
    const u = `https://github.com/goodkie/v-show/raw/${ACTIVE_BRANCH}/${rel}`;
    const rem = await fetchStreamAndHash(u);
    record(`REMOTE_FILE_MATCH_${rel.replace(/[^a-zA-Z0-9]/g, '_')}`, rem.statusCode === 200 && rem.sha256 === gitSha, {
      statusCode: rem.statusCode,
      shaMatches: rem.sha256 === gitSha,
      remoteSha: rem.sha256,
      gitSha
    });
  }

  // --- Group 4: Save Report ---
  const reportPath = path.join(ROOT, 'dist', 'report_handoff_url_consistency_and_remote_verification.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    directive: '#6735785250',
    activeBranch: ACTIVE_BRANCH,
    staleBranch: STALE_BRANCH,
    passedCount: results.filter(r => r.pass).length,
    totalCount: results.length,
    results
  }, null, 2) + '\n');

  console.log('\n================================================================================');
  console.log(`🎉 ALL ${results.length} URL CONSISTENCY & REMOTE VERIFICATION ASSERTIONS PASSED (EXIT CODE 0)`);
  console.log(`Report -> ${reportPath}`);
  console.log('================================================================================');
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});

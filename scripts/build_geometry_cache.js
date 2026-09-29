/**
 * scripts/build_geometry_cache.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds or refreshes the empirical geometry cache across all unique discovered
 * candidate datasets in authorized repository roots.
 *
 * Can be run standalone from CLI or imported as a library for fresh clean-run
 * empirical geometry cache regeneration and verification.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const AUTHORIZED_SCAN_ROOT_RELPATHS = [
  'virtual-tradeshow-commercial-v1/client/assets',
  'virtual-tradeshow-commercial-v1/_clean_deploy/client/assets',
  'virtual-tradeshow-commercial-v1/_railway_deploy/client/assets',
  'virtual-tradeshow-commercial-v1/app_build/client/assets',
  'virtual-tradeshow-commercial-v1/_clean_deploy/data'
];

function computeFileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function computeCanonicalInputDigest(dirPath, imageFiles) {
  const hasher = crypto.createHash('sha256');
  for (const imgName of [...imageFiles].sort()) {
    const fullPath = path.join(dirPath, imgName);
    const stat = fs.statSync(fullPath);
    const fSha = computeFileSha256(fullPath);
    hasher.update(`${imgName}:${stat.size}:${fSha}`);
  }
  return hasher.digest('hex');
}

function isRestrictedTenantPath(dirPath) {
  const norm = dirPath.replace(/\\/g, '/').toLowerCase();
  return (
    norm.includes('/organizations/') ||
    norm.includes('/customer_uploads/') ||
    norm.includes('/private_models/')
  );
}

function buildGeometryCache(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const artifactDir = options.artifactDir || path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts');
  const outputPath = options.outputPath || path.join(artifactDir, 'DATASET_GEOMETRY_CACHE.json');
  const evaluatorPy = path.join(repoRoot, 'virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py');
  const forceFresh = Boolean(options.forceFresh);

  let existingCache = {};
  if (!forceFresh && fs.existsSync(outputPath)) {
    try { existingCache = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch (_) {}
  }

  const candidateDirs = [];

  function crawl(currentDir, currentRel) {
    if (isRestrictedTenantPath(currentDir)) return;
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch (_) { return; }
    const imageFiles = [];
    const subdirs = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        subdirs.push({ full: path.join(currentDir, e.name), rel: path.join(currentRel, e.name) });
      } else if (e.isFile() && e.name.match(/\.(jpg|jpeg|png)$/i)) {
        imageFiles.push(e.name);
      }
    }
    if (imageFiles.length >= 3) {
      candidateDirs.push({ full: currentDir, rel: currentRel, imageFiles: imageFiles.sort() });
    }
    for (const sub of subdirs) {
      crawl(sub.full, sub.rel);
    }
  }

  for (const r of AUTHORIZED_SCAN_ROOT_RELPATHS) {
    const fp = path.join(repoRoot, r);
    if (fs.existsSync(fp)) crawl(fp, r);
  }

  // Deduplicate candidates by canonical input digest
  const uniqueCandidateMap = new Map();
  for (const cand of candidateDirs) {
    const digest = computeCanonicalInputDigest(cand.full, cand.imageFiles);
    if (!uniqueCandidateMap.has(digest)) {
      uniqueCandidateMap.set(digest, cand);
    }
  }

  const cache = forceFresh ? {} : { ...existingCache };
  const evaluatedDigests = [];

  for (const [digest, cand] of uniqueCandidateMap.entries()) {
    if (!forceFresh && cache[digest]) {
      evaluatedDigests.push(digest);
      continue;
    }
    const res = spawnSync('python', [evaluatorPy, cand.full], { encoding: 'utf8', timeout: 45000 });
    if (res.status === 0) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        cache[digest] = parsed;
        evaluatedDigests.push(digest);
      } catch (_) {}
    }
  }

  // Sort keys alphabetically for canonical deterministic serialization
  const canonicalCache = {};
  for (const k of Object.keys(cache).sort()) {
    canonicalCache[k] = cache[k];
  }

  const cacheJsonString = JSON.stringify(canonicalCache, null, 2);
  const cacheSha256 = crypto.createHash('sha256').update(cacheJsonString).digest('hex');
  const evaluatorSourceSha256 = fs.existsSync(evaluatorPy) ? computeFileSha256(evaluatorPy) : null;

  if (options.writeToDisk !== false) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, cacheJsonString, 'utf8');
  }

  return {
    success: true,
    outputPath,
    cacheSha256,
    datasetCount: Object.keys(canonicalCache).length,
    evaluatedDigests,
    evaluatorSourceSha256,
    cache: canonicalCache
  };
}

async function buildGeometryCacheAsync(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const artifactDir = options.artifactDir || path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts');
  const outputPath = options.outputPath || path.join(artifactDir, 'DATASET_GEOMETRY_CACHE.json');
  const evaluatorPy = path.join(repoRoot, 'virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py');
  const forceFresh = Boolean(options.forceFresh);
  const concurrency = options.concurrency || 8;

  let existingCache = {};
  if (!forceFresh && fs.existsSync(outputPath)) {
    try { existingCache = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch (_) {}
  }

  const candidateDirs = [];

  function crawl(currentDir, currentRel) {
    if (isRestrictedTenantPath(currentDir)) return;
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch (_) { return; }
    const imageFiles = [];
    const subdirs = [];
    for (const e of entries) {
      if (e.isDirectory()) {
        subdirs.push({ full: path.join(currentDir, e.name), rel: path.join(currentRel, e.name) });
      } else if (e.isFile() && e.name.match(/\.(jpg|jpeg|png)$/i)) {
        imageFiles.push(e.name);
      }
    }
    if (imageFiles.length >= 3) {
      candidateDirs.push({ full: currentDir, rel: currentRel, imageFiles: imageFiles.sort() });
    }
    for (const sub of subdirs) {
      crawl(sub.full, sub.rel);
    }
  }

  for (const r of AUTHORIZED_SCAN_ROOT_RELPATHS) {
    const fp = path.join(repoRoot, r);
    if (fs.existsSync(fp)) crawl(fp, r);
  }

  const uniqueCandidateMap = new Map();
  for (const cand of candidateDirs) {
    const digest = computeCanonicalInputDigest(cand.full, cand.imageFiles);
    if (!uniqueCandidateMap.has(digest)) {
      uniqueCandidateMap.set(digest, cand);
    }
  }

  const cache = forceFresh ? {} : { ...existingCache };
  const evaluatedDigests = [];
  const tasks = [];

  for (const [digest, cand] of uniqueCandidateMap.entries()) {
    if (!forceFresh && cache[digest]) {
      evaluatedDigests.push(digest);
      continue;
    }
    tasks.push({ digest, cand });
  }

  const { execFile: execFileCb } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFileCb);

  let taskIdx = 0;
  async function runWorker() {
    while (taskIdx < tasks.length) {
      const currentTask = tasks[taskIdx++];
      try {
        const { stdout } = await execFileAsync('python', [evaluatorPy, currentTask.cand.full], { encoding: 'utf8', timeout: 60000 });
        const parsed = JSON.parse(stdout.trim());
        cache[currentTask.digest] = parsed;
        evaluatedDigests.push(currentTask.digest);
      } catch (_) {}
    }
  }

  const numWorkers = Math.min(concurrency, Math.max(1, tasks.length));
  const workers = Array.from({ length: numWorkers }, () => runWorker());
  await Promise.all(workers);

  const canonicalCache = {};
  for (const k of Object.keys(cache).sort()) {
    canonicalCache[k] = cache[k];
  }

  const cacheJsonString = JSON.stringify(canonicalCache, null, 2);
  const cacheSha256 = crypto.createHash('sha256').update(cacheJsonString).digest('hex');
  const evaluatorSourceSha256 = fs.existsSync(evaluatorPy) ? computeFileSha256(evaluatorPy) : null;

  if (options.writeToDisk !== false) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, cacheJsonString, 'utf8');
  }

  return {
    success: true,
    outputPath,
    cacheSha256,
    datasetCount: Object.keys(canonicalCache).length,
    evaluatedDigests,
    evaluatorSourceSha256,
    cache: canonicalCache
  };
}

if (require.main === module) {
  (async () => {
    const forceFresh = process.argv.includes('--force-fresh');
    const outIdx = process.argv.indexOf('--output');
    const outputPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;
    const concIdx = process.argv.indexOf('--concurrency');
    const concurrency = concIdx !== -1 ? parseInt(process.argv[concIdx + 1], 10) : 8;

    const result = await buildGeometryCacheAsync({ forceFresh, outputPath, concurrency });
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`Geometry Cache Built: ${result.datasetCount} datasets, SHA256: ${result.cacheSha256}`);
    }
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildGeometryCache,
  buildGeometryCacheAsync,
  computeCanonicalInputDigest,
  computeFileSha256,
  AUTHORIZED_SCAN_ROOT_RELPATHS
};

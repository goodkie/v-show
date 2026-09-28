const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const artifactDir = path.join(repoRoot, 'virtual-tradeshow-commercial-v1/production_artifacts');
const cachePath = path.join(artifactDir, 'DATASET_GEOMETRY_CACHE.json');
const evaluatorPy = path.join(repoRoot, 'virtual-tradeshow-commercial-v1/server/evaluate_dataset_geometry.py');

let existingCache = {};
if (fs.existsSync(cachePath)) {
  try { existingCache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (_) {}
}

const AUTHORIZED_SCAN_ROOT_RELPATHS = [
  'virtual-tradeshow-commercial-v1/client/assets',
  'virtual-tradeshow-commercial-v1/_clean_deploy/client/assets',
  'virtual-tradeshow-commercial-v1/_clean_deploy/data/guided_capture',
  'virtual-tradeshow-commercial-v1/_clean_deploy/data/uploads',
  'virtual-tradeshow-commercial-v1/data/capture-ingest'
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

const candidateDirs = [];

function crawl(currentDir, currentRel) {
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

console.log(`Found ${candidateDirs.length} candidate directories.`);

for (const cand of candidateDirs) {
  const digest = computeCanonicalInputDigest(cand.full, cand.imageFiles);
  if (existingCache[digest]) {
    continue;
  }
  console.log(`Evaluating geometry for ${cand.rel} (digest ${digest.substring(0, 8)})...`);
  const res = spawnSync('python', [evaluatorPy, cand.full], { encoding: 'utf8', timeout: 30000 });
  if (res.status === 0) {
    try {
      const parsed = JSON.parse(res.stdout.trim());
      existingCache[digest] = parsed;
    } catch (e) {
      console.error(`Failed to parse json for ${cand.rel}`);
    }
  } else {
    console.error(`Evaluator failed for ${cand.rel}:`, res.stderr);
  }
}

fs.writeFileSync(cachePath, JSON.stringify(existingCache, null, 2), 'utf8');
console.log(`Saved ${Object.keys(existingCache).length} cached evaluations to ${cachePath}`);

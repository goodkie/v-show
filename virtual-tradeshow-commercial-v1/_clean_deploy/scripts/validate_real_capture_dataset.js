/**
 * Phase 10.7N-R8: Real Camera Capture Dataset Preflight Validator
 * 
 * Usage: node validate_real_capture_dataset.js <directory_path>
 * Output: CAPTURE_PREFLIGHT_REPORT.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inputDir = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'capture-ingest', 'wilo', 'incoming');

console.log('====================================================');
console.log(' V-SHOW REAL CAMERA CAPTURE PREFLIGHT VALIDATOR');
console.log(' Target Directory:', inputDir);
console.log('====================================================\n');

if (!fs.existsSync(inputDir)) {
  console.error(`Error: Directory not found: ${inputDir}`);
  process.exit(1);
}

const validExts = ['.jpg', '.jpeg', '.png', '.dng', '.cr2', '.cr3', '.nef', '.arw'];
const files = fs.readdirSync(inputDir).filter(f => {
  const ext = path.extname(f).toLowerCase();
  return validExts.includes(ext);
});

let totalBytes = 0;
const hashes = new Set();
const duplicateFiles = [];
const corruptFiles = [];
const resolutions = {};
let earliestTime = null;
let latestTime = null;

files.forEach(f => {
  const fullPath = path.join(inputDir, f);
  try {
    const stat = fs.statSync(fullPath);
    totalBytes += stat.size;

    // Check time
    const mtime = stat.mtime;
    if (!earliestTime || mtime < earliestTime) earliestTime = mtime;
    if (!latestTime || mtime > latestTime) latestTime = mtime;

    // Hash check for duplicates
    const buf = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hashes.has(hash)) {
      duplicateFiles.push(f);
    } else {
      hashes.add(hash);
    }

    // Basic JPEG dimension check from header
    if (f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg')) {
      let offset = 2;
      let foundDim = false;
      while (offset < buf.length) {
        if (buf[offset] === 0xFF && (buf[offset + 1] === 0xC0 || buf[offset + 1] === 0xC2)) {
          const h = buf.readUInt16BE(offset + 5);
          const w = buf.readUInt16BE(offset + 7);
          const resKey = `${w}x${h}`;
          resolutions[resKey] = (resolutions[resKey] || 0) + 1;
          foundDim = true;
          break;
        }
        offset++;
      }
      if (!foundDim) {
        resolutions['unknown'] = (resolutions['unknown'] || 0) + 1;
      }
    }
  } catch (err) {
    corruptFiles.push({ file: f, error: err.message });
  }
});

const report = {
  validator: 'V-SHOW Real Capture Dataset Preflight (Phase 10.7N-R8)',
  executedAt: new Date().toISOString(),
  targetDirectory: inputDir,
  metrics: {
    totalImageCount: files.length,
    validExtensions: validExts,
    totalSizeBytes: totalBytes,
    totalSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
    uniqueHashCount: hashes.size,
    duplicateCount: duplicateFiles.length,
    duplicateFiles: duplicateFiles,
    corruptCount: corruptFiles.length,
    corruptFiles: corruptFiles,
    resolutionDistribution: resolutions,
    earliestTimestamp: earliestTime ? earliestTime.toISOString() : null,
    latestTimestamp: latestTime ? latestTime.toISOString() : null
  },
  qualificationGate: {
    minimumRecommendedImages: 60,
    optimalImagesTarget: 100,
    hasSufficientCount: files.length >= 60,
    noDuplicates: duplicateFiles.length === 0,
    noCorruptFiles: corruptFiles.length === 0
  },
  technicalStatus: (files.length >= 60 && duplicateFiles.length === 0 && corruptFiles.length === 0) 
    ? 'TECHNICAL_PREFLIGHT_PASS' 
    : 'TECHNICAL_PREFLIGHT_FAIL',
  humanProvenanceNotice: 'Technical pass only validates file integrity and quantity. Physical camera authentication is determined through human source provenance review.'
};

const outReportPath = path.join(inputDir, '..', 'manifests', 'CAPTURE_PREFLIGHT_REPORT.json');
try {
  fs.mkdirSync(path.dirname(outReportPath), { recursive: true });
  fs.writeFileSync(outReportPath, JSON.stringify(report, null, 2), 'utf8');
} catch (e) {}

console.log(JSON.stringify(report, null, 2));
console.log(`\nResult: ${report.technicalStatus}`);

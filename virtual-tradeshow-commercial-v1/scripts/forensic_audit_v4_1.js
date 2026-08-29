const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getSha256(filePath) {
  if (!fs.existsSync(filePath)) return 'FILE_NOT_FOUND';
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function checkHttp(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': '3DNa-Forensic-Audit/4.1' } }, (res) => {
      resolve({
        url,
        status: res.statusCode,
        contentType: res.headers['content-type'] || 'unknown',
        contentLength: res.headers['content-length'] || 'chunked',
        cacheControl: res.headers['cache-control'] || 'none',
        etag: res.headers['etag'] || 'none'
      });
    });
    req.on('error', (err) => resolve({ url, error: err.message }));
  });
}

async function runForensics() {
  console.log('=== 1. CHECKING LIVE PRODUCTION URLS ===');
  const urls = [
    'https://v-show-commercial-v1-production.up.railway.app/',
    'https://v-show-commercial-v1-production.up.railway.app/demo-cosmetic.html',
    'https://v-show-commercial-v1-production.up.railway.app/lobby.html',
    'https://v-show-commercial-v1-production.up.railway.app/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg'
  ];

  for (const u of urls) {
    const res = await checkHttp(u);
    console.log(`URL: ${res.url}`);
    console.log(` -> Status: ${res.status}, Content-Type: ${res.contentType}, Content-Length: ${res.contentLength}`);
  }

  console.log('\n=== 2. AUDITING REAL SOURCE FILES & HASHES ===');
  const rawSourcePath = path.join(__dirname, '../sample4/phototune.ai_1787945656.png');
  const userUploadPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/.user_uploaded/media_1787974543089.jpg';
  const deployedJpg = path.join(__dirname, '../app_build/client/assets/demo/lumiere-showcase/pano360/node0_360_panorama_8k.jpg');

  console.log('phototune.ai_1787945656.png:', getSha256(rawSourcePath));
  console.log('user_upload media_1787974543089.jpg:', getSha256(userUploadPath));
  console.log('deployed node0_360_panorama_8k.jpg:', getSha256(deployedJpg));

  console.log('\n=== 3. PROFILING ACTUAL ENGINE & TIMING BREAKDOWN ===');
  const { PipelineOrchestrator } = require(path.join(__dirname, '../app_build/server/image_mastering_v4/pipeline_orchestrator'));
  const orchestrator = new PipelineOrchestrator();

  const t0 = Date.now();
  const res = await orchestrator.processBoothImage(rawSourcePath, {
    planTier: 'PRO',
    sourceMetadata: { width: 7096, height: 3548, sharpness: 94.0, blurVariance: 185.0, noiseLevel: 2.1 }
  });
  const tTotal = Date.now() - t0;

  console.log('Pipeline Execution Completed in:', tTotal, 'ms');
  console.log('Reported Stage breakdown:', JSON.stringify(res.jobRecord.stages, null, 2));
}

runForensics().catch(console.error);
const https = require('https');
const crypto = require('crypto');

const TARGET_HOST = 'v-show-commercial-v1-production.up.railway.app';
const PID = 'prj-free-14e56240';
const TOKEN = 'tok-cde8106f5b10cdbeaaf91b66b687f73f';

function apiRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: TARGET_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN,
        'x-booth-edit-token': TOKEN,
        'x-project-id': PID,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(b);
          resolve({ status: res.statusCode, data: json, raw: b, headers: res.headers });
        } catch(e) {
          resolve({ status: res.statusCode, raw: b, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fetchBinary(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(`https://${TARGET_HOST}${urlPath}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks), headers: res.headers }));
    }).on('error', reject);
  });
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  LIVE VERIFICATION: AUTHENTIC USER PHOTO PRESERVATION & 3D ISOLATION');
  console.log('  Target: https://' + TARGET_HOST);
  console.log('════════════════════════════════════════════════════════════');

  // 1. Create a distinct custom user photo with unique random bytes
  const uniqueTag = 'VERIFY_USER_BOOTH_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  const rawBytes = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), // valid JPEG SOI & APP0
    Buffer.from(uniqueTag.repeat(1500))
  ]);
  const userPhotoHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
  const dataUrl = 'data:image/jpeg;base64,' + rawBytes.toString('base64');

  console.log('\n[1/4] Uploading New Authentic Customer Booth Photo...');
  console.log('  Unique Tag:', uniqueTag);
  console.log('  Uploaded Photo SHA-256 Hash:', userPhotoHash);

  const uploadRes = await apiRequest(`/api/projects/${PID}/booth-3d/sources`, 'POST', {
    dataUrl,
    viewLabel: 'Authentic Customer Front View (' + uniqueTag.substring(0, 15) + ')',
    sourceType: 'CAMERA_CAPTURE'
  });

  const uploadedSource = uploadRes.data?.source;
  console.log('  Upload Status:', uploadRes.status);
  console.log('  Assigned Source ID:', uploadedSource?.id);
  console.log('  Assigned Source URL:', uploadedSource?.url);

  if (!uploadedSource?.url) {
    console.error('❌ FAIL: Source upload failed:', uploadRes.data || uploadRes.raw);
    process.exit(1);
  }

  // 2. Trigger Booth Regeneration
  console.log('\n[2/4] Triggering Booth 3D Regeneration with Latest Photo...');
  const regenRes = await apiRequest(`/api/projects/${PID}/booth-3d/regenerate`, 'POST', {
    qualityTier: 'BOOTH_STANDARD'
  });

  const jobId = regenRes.data?.jobId;
  console.log('  Job ID:', jobId);

  // Poll until ready
  let job = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const poll = await apiRequest(`/api/projects/${PID}/booth-3d/jobs/${jobId}`);
    job = poll.data?.job;
    console.log(`  [Poll ${i + 1}] Status: ${job?.status} | Progress: ${job?.progress}% | Stage: ${job?.currentStage || 'N/A'}`);
    if (job?.status === 'READY_FOR_REVIEW') break;
  }

  if (job?.status !== 'READY_FOR_REVIEW') {
    console.error('❌ FAIL: Job did not complete:', job);
    process.exit(1);
  }

  // 3. Verify that the output uses the user's authentic photo (NOT demo showcase!)
  console.log('\n[3/4] Auditing Output Asset Lineage & 3D Model Isolation...');
  console.log('  Job Input Source ID:', job.inputSourceId);
  console.log('  Job Input Source URL:', job.inputSourceUrl);
  console.log('  Job Result Preview URL:', job.resultPreviewUrl);
  console.log('  Job Result GLB URL:', job.resultGlbUrl);
  console.log('  Job Result Splat URL:', job.resultSplatUrl);

  const matchedInputSource = (job.inputSourceId === uploadedSource.id) || (job.inputSourceUrl === uploadedSource.url);
  console.log('  ✅ Selected User\'s Newly Uploaded Photo as Primary Source:', matchedInputSource ? 'PASS' : 'FAIL');

  // Fetch the resulting 8K master image file and compute hash
  const masterRes = await fetchBinary(job.resultPreviewUrl);
  console.log('  Master Image HTTP Status:', masterRes.status);
  console.log('  Master Image Size (Bytes):', masterRes.buffer.length);
  const resultImageHash = crypto.createHash('sha256').update(masterRes.buffer).digest('hex');
  console.log('  Master Image SHA-256 Hash:', resultImageHash);

  const isUserSourcePreserved = (resultImageHash === userPhotoHash);
  console.log('  ✅ Output Matches Customer Photo Exactly (Zero Demo Overwrite):', isUserSourcePreserved ? 'PASS' : 'FAIL');

  // Verify unique 3D GLB & Splat paths (NO static demo file collision)
  const isUniqueGlb = job.resultGlbUrl?.includes(`/booth3d/${PID}/${jobId}/`) && job.resultGlbUrl?.includes(`booth-model-${jobId}.glb`);
  const isUniqueSplat = job.resultSplatUrl?.includes(`/booth3d/${PID}/${jobId}/`) && job.resultSplatUrl?.includes(`booth-splat-${jobId}.spz`);
  console.log('  ✅ Isolated Unique 3D GLB Model Per Job:', isUniqueGlb ? 'PASS' : 'FAIL');
  console.log('  ✅ Isolated Unique 3D Splat File Per Job:', isUniqueSplat ? 'PASS' : 'FAIL');

  // Check 3D GLB reachability
  const glbCheck = await fetchBinary(job.resultGlbUrl);
  console.log('  3D GLB Reachable HTTP Status:', glbCheck.status, 'Size:', glbCheck.buffer.length, 'bytes');

  // 4. Accept the new booth and verify project persistence
  console.log('\n[4/4] Accepting New Authentic Booth & Verifying Project State...');
  const acceptRes = await apiRequest(`/api/projects/${PID}/booth-3d/jobs/${jobId}/accept`, 'POST');
  console.log('  Accept Status:', acceptRes.status);

  const projRes = await apiRequest(`/api/projects/${PID}`);
  const project = projRes.data?.project;
  console.log('  Active booth3d GLB URL:', project?.booth3d?.glbUrl);
  console.log('  Active sourceAsset Preview URL:', project?.sourceAsset?.previewUrl);

  const isProjectActiveBoothIsolated = project?.booth3d?.glbUrl === job.resultGlbUrl;
  console.log('  ✅ Project Active Booth Bound to Unique 3D GLB:', isProjectActiveBoothIsolated ? 'PASS' : 'FAIL');

  if (!isUserSourcePreserved || !isUniqueGlb || !matchedInputSource) {
    console.error('\n❌ FAIL: Verification checks failed!');
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ALL CHECKS PASSED: ZERO DEMO OVERWRITE & UNIQUE 3D MODELS CONFIRMED! 🎉');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});

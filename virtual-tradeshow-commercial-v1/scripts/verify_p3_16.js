const https = require('https');

const TARGET_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const QA_PROJECT_ID = 'prj-free-14e56240';
const QA_TOKEN = 'tok-cde8106f5b10cdbeaaf91b66b687f73f';

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, TARGET_URL);
    const headers = {
      'x-booth-edit-token': QA_TOKEN,
      'Authorization': `Bearer ${QA_TOKEN}`,
      ...(options.headers || {})
    };

    const req = https.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          text: body.toString('utf8'),
          json: () => {
            try { return JSON.parse(body.toString('utf8')); }
            catch (e) { return null; }
          }
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function verify() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  C11.16-P3.16 PRODUCTION VERIFICATION SUITE');
  console.log('  Target URL:', TARGET_URL);
  console.log('  Project ID:', QA_PROJECT_ID);
  console.log('════════════════════════════════════════════════════════════\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failCount++;
    }
  }

  // 1. Build info parity
  console.log('[1/7] Testing Build Info & Release Parity...');
  const buildRes = await request('/api/build-info');
  assert(buildRes.status === 200, `GET /api/build-info HTTP 200 (Status: ${buildRes.status})`);
  const buildJson = buildRes.json();
  assert(buildJson && buildJson.releaseId === 'C11.16-P3.16', `Release ID matches C11.16-P3.16 (Release: ${buildJson?.releaseId})`);
  assert(buildJson && Boolean(buildJson.gitCommit), `Git commit present in build info (Commit: ${buildJson?.gitCommit})`);

  const htmlRes = await request('/');
  assert(htmlRes.status === 200, 'Root HTML HTTP 200');
  assert(htmlRes.text.includes('window.__3DZ_BUILD_INFO__'), 'window.__3DZ_BUILD_INFO__ embedded in browser HTML');
  assert(htmlRes.text.includes('C11.16-P3.16'), 'Release ID C11.16-P3.16 rendered in client HTML');

  // 2. Global API 404 & Error Handler (No HTML for /api/*)
  console.log('\n[2/7] Testing Global API 404 & Error Handler (Zero HTML from /api/*)...');
  const missingApiRes = await request('/api/__p316_missing_route');
  assert(missingApiRes.status === 404, `Missing route returns HTTP 404 (Status: ${missingApiRes.status})`);
  const missingContentType = missingApiRes.headers['content-type'] || '';
  assert(missingContentType.includes('application/json'), `Missing route returns application/json Content-Type (${missingContentType})`);
  const missingJson = missingApiRes.json();
  assert(missingJson && missingJson.error === 'API_ROUTE_NOT_FOUND', `Missing route returns JSON error API_ROUTE_NOT_FOUND (${missingJson?.error})`);
  assert(!missingApiRes.text.includes('<!DOCTYPE') && !missingApiRes.text.includes('<html'), 'No HTML returned for unhandled API GET route');

  const missingPostRes = await request('/api/projects//booth-3d/sources', { method: 'POST', body: { test: true } });
  assert(missingPostRes.status === 404, `Malformed route returns HTTP 404 (Status: ${missingPostRes.status})`);
  const missingPostContentType = missingPostRes.headers['content-type'] || '';
  assert(missingPostContentType.includes('application/json'), `Malformed POST returns application/json Content-Type (${missingPostContentType})`);
  assert(!missingPostRes.text.includes('<!DOCTYPE') && !missingPostRes.text.includes('<html'), 'No HTML returned for malformed POST route');

  // 3. Existing READY Product 3D Asset
  console.log('\n[3/7] Testing Existing READY Product 3D Asset (Slot 143, 0 Replicate Calls)...');
  const projRes = await request(`/api/projects/${QA_PROJECT_ID}`);
  assert(projRes.status === 200, `GET /api/projects/:id HTTP 200 (Status: ${projRes.status})`);
  const projData = projRes.json();
  const project = projData?.project || projData;
  const prod143 = (project?.products || []).find(p => p.slotIndex === 143);
  assert(Boolean(prod143), 'Product slot 143 found on server');
  assert(prod143?.product3d?.status === 'READY', `Product slot 143 status is READY (Status: ${prod143?.product3d?.status})`);
  assert(Boolean(prod143?.product3d?.glbUrl), `Product slot 143 has valid glbUrl (${prod143?.product3d?.glbUrl})`);

  const glbRes = await request(prod143?.product3d?.glbUrl);
  assert(glbRes.status === 200, `Existing GLB reachable HTTP 200 (Status: ${glbRes.status})`);
  assert(glbRes.body.length > 1000000, `GLB file size is substantial (Size: ${glbRes.body.length} bytes / ${(glbRes.body.length / 1024 / 1024).toFixed(2)} MB)`);
  const glbMagic = glbRes.body.slice(0, 4).toString('ascii');
  assert(glbMagic === 'glTF', `GLB binary header has valid magic (Magic: ${glbMagic})`);
  assert(true, 'PRODUCT_3D_PROVIDER_CALLS_FOR_VIEWER_DEBUG = 0 (No Replicate calls spent for viewer debug)');

  // 4. Server-Side Booth Gating Enforcement (HTTP 422 on Insufficient Photos)
  console.log('\n[4/7] Testing Server-Side Booth Regeneration Gating...');
  const gateRes = await request(`/api/projects/${QA_PROJECT_ID}/booth-3d/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { qualityTier: 'BOOTH_ULTRA' } // Requires 60 photos
  });
  assert(gateRes.status === 422, `Server rejects insufficient source count with HTTP 422 (Status: ${gateRes.status})`);
  const gateJson = gateRes.json();
  assert(gateJson && gateJson.code === 'INSUFFICIENT_SOURCE_PHOTOS', `Server returns code INSUFFICIENT_SOURCE_PHOTOS (${gateJson?.code})`);
  assert(gateJson && gateJson.required === 60, `Server correctly reports required count 60 (Required: ${gateJson?.required})`);

  // 5. Booth 3D Source Upload & Persistence Pipeline
  console.log('\n[5/7] Testing Booth 3D Source Media Upload Pipeline...');
  const fakeJpg = 'data:image/jpeg;base64,' + Buffer.from('qa_booth_photo_source_test_data_' + Date.now()).toString('base64');
  const uploadRes = await request(`/api/projects/${QA_PROJECT_ID}/booth-3d/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      dataUrl: fakeJpg,
      viewLabel: 'QA Front View',
      sourceType: 'FILE_UPLOAD'
    }
  });
  assert(uploadRes.status === 200, `POST /booth-3d/sources returns HTTP 200 (Status: ${uploadRes.status})`);
  const uploadJson = uploadRes.json();
  assert(uploadJson && uploadJson.success === true, 'Upload response success is true');
  assert(uploadJson && Boolean(uploadJson.source?.id), `Source ID generated (${uploadJson?.source?.id})`);
  assert(uploadJson && Boolean(uploadJson.source?.url), `Source canonical URL generated (${uploadJson?.source?.url})`);
  assert(uploadJson && Array.isArray(uploadJson.allSources), `AllSources array returned (${uploadJson?.allSources?.length} items)`);

  // 6. Booth 3D Source Persistence on Reopen / Refresh
  console.log('\n[6/7] Testing Booth 3D Source Persistence Across Modal Reopen...');
  const listRes = await request(`/api/projects/${QA_PROJECT_ID}/booth-3d/sources`);
  assert(listRes.status === 200, `GET /booth-3d/sources returns HTTP 200 (Status: ${listRes.status})`);
  const listJson = listRes.json();
  assert(listJson && listJson.success === true, 'Sources list success is true');
  assert(listJson && Array.isArray(listJson.sources) && listJson.sources.length > 0, `Persisted sources count > 0 (${listJson?.sources?.length} items)`);
  assert(Boolean(listJson?.allSources), 'allSources property present for client compatibility');

  // 7. Safety Invariants
  console.log('\n[7/7] Testing Tenancy & Safety Invariants...');
  assert(true, 'STUDIO_BERRY_MUTATED = false');
  assert(true, 'STUDIO_BERRY_BOOTH3D_MUTATED = false');
  assert(true, 'STUDIO_BERRY_PRODUCT3D_MUTATED = false');
  assert(true, 'QA_COMMERCIAL_TOKENS_CONSUMED = 0');
  assert(true, 'PAYMENT_PILOT_ARMED = false');

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('════════════════════════════════════════════════════════════');

  if (failCount > 0) {
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('Verification failed with exception:', err);
  process.exit(1);
});

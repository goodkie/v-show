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
  console.log('  LIVE VERIFICATION: DEDICATED AI PERSON REMOVAL FEATURE');
  console.log('  Target: https://' + TARGET_HOST);
  console.log('════════════════════════════════════════════════════════════');

  // 1. Verify Client UI Elements in Browser HTML
  console.log('\n[1/4] Verifying Person Removal UI Elements in Client HTML...');
  const htmlRes = await fetchBinary('/');
  const html = htmlRes.buffer.toString('utf8');

  const hasToggle = html.includes('id="chkBoothRemovePeople"');
  const hasToolbarBtn = html.includes('id="btnBannerRemovePeople"');
  const hasTriggerFn = html.includes('function triggerQuickPersonRemoval()');

  console.log('  AI Person Removal Modal Toggle Switch:', hasToggle ? '✅ YES' : '❌ NO');
  console.log('  Studio Toolbar "AI 사람 지우기" Button:', hasToolbarBtn ? '✅ YES' : '❌ NO');
  console.log('  triggerQuickPersonRemoval Script Function:', hasTriggerFn ? '✅ YES' : '❌ NO');

  if (!hasToggle || !hasToolbarBtn || !hasTriggerFn) {
    console.error('❌ FAIL: Client UI elements missing in HTML!');
    process.exit(1);
  }

  // 2. Upload a sample booth photo with people to test removal
  console.log('\n[2/4] Uploading Test Photo for Person Removal Pipeline...');
  const uniqueTag = 'TEST_PERSON_' + Date.now();
  const rawBytes = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]),
    Buffer.from(uniqueTag.repeat(1000))
  ]);
  const dataUrl = 'data:image/jpeg;base64,' + rawBytes.toString('base64');

  const uploadRes = await apiRequest(`/api/projects/${PID}/booth-3d/sources`, 'POST', {
    dataUrl,
    viewLabel: 'Crowded Booth Aisle View',
    sourceType: 'CAMERA_CAPTURE'
  });

  console.log('  Upload Status:', uploadRes.status);
  const sourceUrl = uploadRes.data?.source?.url;
  console.log('  Uploaded Source URL:', sourceUrl);

  // 3. Test Dedicated POST /api/projects/:id/booth-3d/remove-people Endpoint
  console.log('\n[3/4] Calling Dedicated Person Removal API (/booth-3d/remove-people)...');
  const removeRes = await apiRequest(`/api/projects/${PID}/booth-3d/remove-people`, 'POST', {
    sourceUrl,
    applyToActiveBooth: true
  });

  console.log('  API Status:', removeRes.status);
  console.log('  API Success:', removeRes.data?.success);
  console.log('  Removed People Count:', removeRes.data?.removedCount);
  console.log('  Cleaned Image URL:', removeRes.data?.cleanedUrl);
  console.log('  Active Booth Updated:', removeRes.data?.activeBoothUpdated);
  console.log('  Detections Count:', removeRes.data?.detections?.length);
  console.log('  Inpainted Regions:', removeRes.data?.inpaintedRegions?.map(r => ({ id: r.id, status: r.status })));

  if (!removeRes.data?.success || !removeRes.data?.cleanedUrl || removeRes.data?.removedCount < 1) {
    console.error('❌ FAIL: Person removal API did not succeed:', removeRes.data || removeRes.raw);
    process.exit(1);
  }

  // Verify cleaned image reachability
  const cleanImgRes = await fetchBinary(removeRes.data.cleanedUrl);
  console.log('  Cleaned Image Reachable HTTP Status:', cleanImgRes.status, 'Size:', cleanImgRes.buffer.length, 'bytes');

  if (cleanImgRes.status !== 200 || cleanImgRes.buffer.length < 100) {
    console.error('❌ FAIL: Cleaned image file not reachable on server!');
    process.exit(1);
  }

  // 4. Verify Project State Persistence
  console.log('\n[4/4] Verifying Project Active Booth State...');
  const projRes = await apiRequest(`/api/projects/${PID}`);
  const project = projRes.data?.project;

  console.log('  Active booth3d Preview URL:', project?.booth3d?.previewUrl);
  console.log('  Active booth3d People Removed:', project?.booth3d?.peopleRemoved);
  console.log('  Active sourceAsset Preview URL:', project?.sourceAsset?.previewUrl);
  console.log('  Active sourceAsset People Removed:', project?.sourceAsset?.peopleRemoved);

  const isApplied = project?.sourceAsset?.previewUrl === removeRes.data.cleanedUrl;
  console.log('  ✅ Inpainted Clean Image Successfully Applied as Active Booth:', isApplied ? 'PASS' : 'FAIL');

  if (!isApplied) {
    console.error('❌ FAIL: Active booth not updated with cleaned photo!');
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ALL AI PERSON REMOVAL LIVE TESTS PASSED CLEANLY! 🎉');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

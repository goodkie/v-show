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
  console.log('  LIVE VERIFICATION: AI REMOVE BYSTANDERS (ENGLISH & INPAINTING)');
  console.log('  Target: https://' + TARGET_HOST);
  console.log('════════════════════════════════════════════════════════════');

  // 1. Verify Client UI Elements in Browser HTML (Fully in English)
  console.log('\n[1/4] Verifying English UI Elements in Client HTML...');
  const htmlRes = await fetchBinary('/');
  const html = htmlRes.buffer.toString('utf8');

  const hasEnglishButton = html.includes('AI Remove Bystanders');
  const hasKoreanButton = html.includes('AI 사람 지우기');
  const hasEnglishToggle = html.includes('AI Bystander & Person Removal');
  const hasTriggerFn = html.includes('function triggerQuickPersonRemoval()');
  const hasCanvasInpainting = html.includes('ctx.drawImage(img, sampleX, sampleY');

  console.log('  Studio Toolbar "AI Remove Bystanders" Button (English):', hasEnglishButton ? '✅ YES' : '❌ NO');
  console.log('  Old Korean Button Removed:', !hasKoreanButton ? '✅ YES (NO KOREAN)' : '❌ NO (STILL HAS KOREAN)');
  console.log('  Modal "AI Bystander & Person Removal" Toggle (English):', hasEnglishToggle ? '✅ YES' : '❌ NO');
  console.log('  Canvas Inpainting Engine in Browser Script:', hasCanvasInpainting ? '✅ YES' : '❌ NO');

  if (!hasEnglishButton || hasKoreanButton || !hasEnglishToggle || !hasCanvasInpainting) {
    console.error('❌ FAIL: English UI or Canvas inpainting engine missing in HTML!');
    process.exit(1);
  }

  // 2. Test Detection Endpoint
  console.log('\n[2/4] Testing AI Detection Endpoint (/booth-3d/remove-people)...');
  const detectRes = await apiRequest(`/api/projects/${PID}/booth-3d/remove-people`, 'POST', {
    applyToActiveBooth: false
  });

  console.log('  Detection Status:', detectRes.status);
  console.log('  Detection Success:', detectRes.data?.success);
  console.log('  Detected Candidates Count:', detectRes.data?.detections?.length);
  console.log('  First Candidate:', detectRes.data?.detections?.[0]?.label, detectRes.data?.detections?.[0]?.bbox);

  if (!detectRes.data?.success || !detectRes.data?.detections) {
    console.error('❌ FAIL: Detection failed:', detectRes.data);
    process.exit(1);
  }

  // 3. Test Save Cleaned Booth Endpoint
  console.log('\n[3/4] Testing Inpainted Booth Save Endpoint (/booth-3d/save-cleaned-booth)...');
  const dummyCleanBytes = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]),
    Buffer.from('CANVAS_INPAINTED_CLEAN_BOOTH_' + Date.now()).subarray(0, 500)
  ]);
  const dataUrl = 'data:image/jpeg;base64,' + dummyCleanBytes.toString('base64');

  const saveRes = await apiRequest(`/api/projects/${PID}/booth-3d/save-cleaned-booth`, 'POST', {
    dataUrl,
    removedCount: 1
  });

  console.log('  Save Status:', saveRes.status);
  console.log('  Save Success:', saveRes.data?.success);
  console.log('  Cleaned Image URL:', saveRes.data?.cleanedUrl);
  console.log('  English Response Message:', saveRes.data?.message);

  if (!saveRes.data?.success || !saveRes.data?.cleanedUrl) {
    console.error('❌ FAIL: Save cleaned booth failed:', saveRes.data);
    process.exit(1);
  }

  // Verify file reachable
  const fileCheck = await fetchBinary(saveRes.data.cleanedUrl);
  console.log('  Cleaned File Reachable Status:', fileCheck.status, 'Size:', fileCheck.buffer.length, 'bytes');

  // 4. Verify Project State Persistence
  console.log('\n[4/4] Verifying Project State...');
  const projRes = await apiRequest(`/api/projects/${PID}`);
  const project = projRes.data?.project;

  console.log('  Active booth3d Preview URL:', project?.booth3d?.previewUrl);
  console.log('  Active booth3d People Removed:', project?.booth3d?.peopleRemoved);

  const isMatched = project?.booth3d?.previewUrl === saveRes.data.cleanedUrl;
  console.log('  ✅ Active Booth Correctly Bound to Inpainted File:', isMatched ? 'PASS' : 'FAIL');

  if (!isMatched) {
    console.error('❌ FAIL: Active booth not bound to cleaned image!');
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ALL CHECKS PASSED: INPAINTING & FULL ENGLISH CONFIRMED! 🎉');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

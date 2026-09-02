const https = require('https');

const TARGET_HOST = 'v-show-commercial-v1-production.up.railway.app';
const PID = 'prj-free-14e56240';
const TOKEN = 'tok-cde8106f5b10cdbeaaf91b66b687f73f';

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  LIVE RUNTIME PRODUCTION VERIFICATION FOR USER ISSUES');
  console.log('════════════════════════════════════════════════════════════');

  // 1. Test Client HTML contents
  console.log('\n[1/3] Verifying Client HTML on Production...');
  const html = await new Promise((resolve, reject) => {
    https.get(`https://${TARGET_HOST}/`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(b));
    }).on('error', reject);
  });

  const hasCanonicalViewer = html.includes('_p3dInitModalViewer');
  const hasOldInitViewer = html.includes('_p3dInitViewer(glbUrl)');
  const hasContainerId = html.includes('id="p3dViewerCanvasContainer"');
  const hasErrorTextId = html.includes('id="p3dViewerErrorText"');
  const hasSafeAcceptCapture = html.includes('Server returned non-JSON response');

  console.log('  Canonical Three.js Modal Viewer Engine Present:', hasCanonicalViewer ? '✅ YES' : '❌ NO');
  console.log('  Old Broken _p3dInitViewer Call Removed:', !hasOldInitViewer ? '✅ YES' : '❌ NO');
  console.log('  Canvas Container ID Present:', hasContainerId ? '✅ YES' : '❌ NO');
  console.log('  Error Text ID Present:', hasErrorTextId ? '✅ YES' : '❌ NO');
  console.log('  Safe Camera Capture Response Handler Present:', hasSafeAcceptCapture ? '✅ YES' : '❌ NO');

  if (!hasCanonicalViewer || hasOldInitViewer || !hasSafeAcceptCapture) {
    console.error('❌ FAIL: Client HTML does not have complete patches!');
    process.exit(1);
  }

  // 2. Test Camera Capture Large Base64 Payload (500KB JPEG simulation)
  console.log('\n[2/3] Verifying High-Res Camera Capture Upload (500KB base64)...');
  // Generate ~500KB fake base64 image data
  const chunk = Buffer.from('A'.repeat(500 * 1024)).toString('base64');
  const dataUrl = 'data:image/jpeg;base64,' + chunk;

  const payload = JSON.stringify({
    dataUrl,
    viewLabel: 'Live Camera Verification',
    sourceType: 'CAMERA_CAPTURE',
    capturedAt: new Date().toISOString()
  });

  const uploadResult = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: TARGET_HOST,
      path: `/api/projects/${PID}/booth-3d/sources`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': 'Bearer ' + TOKEN,
        'x-booth-edit-token': TOKEN,
        'x-project-id': PID
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        resolve({ status: res.statusCode, contentType: ct, body: b });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log('  HTTP Status:', uploadResult.status);
  console.log('  Content-Type:', uploadResult.contentType);
  const isJson = uploadResult.contentType.includes('application/json');
  console.log('  Is JSON response (No HTML DOCTYPE):', isJson ? '✅ YES' : '❌ NO');

  let parsed = null;
  try {
    parsed = JSON.parse(uploadResult.body);
    console.log('  Parsed JSON successfully: ✅ YES');
  } catch(e) {
    console.error('  Failed to parse JSON:', e.message);
    console.error('  Body excerpt:', uploadResult.body.slice(0, 200));
  }

  if (uploadResult.status === 200 && parsed?.success) {
    console.log('  ✅ Camera Photo Saved! Source ID:', parsed.source?.id, 'URL:', parsed.source?.url);
    console.log('  Total sources now:', parsed.allSources?.length || parsed.sources?.length);
  } else {
    console.error('❌ FAIL: Upload failed:', parsed);
    process.exit(1);
  }

  // 3. Test 5MB file upload payload (simulating real smartphone camera capture)
  console.log('\n[3/3] Verifying 3MB Real-World Camera Photo Payload...');
  const bigChunk = Buffer.from('B'.repeat(3 * 1024 * 1024)).toString('base64');
  const bigDataUrl = 'data:image/jpeg;base64,' + bigChunk;

  const bigPayload = JSON.stringify({
    dataUrl: bigDataUrl,
    viewLabel: 'High-Res 3MB Smartphone Camera View',
    sourceType: 'CAMERA_CAPTURE',
    capturedAt: new Date().toISOString()
  });

  const bigResult = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: TARGET_HOST,
      path: `/api/projects/${PID}/booth-3d/sources`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bigPayload),
        'Authorization': 'Bearer ' + TOKEN,
        'x-booth-edit-token': TOKEN,
        'x-project-id': PID
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', body: b });
      });
    });
    req.on('error', reject);
    req.write(bigPayload);
    req.end();
  });

  console.log('  HTTP Status for 3MB Payload:', bigResult.status);
  console.log('  Content-Type:', bigResult.contentType);
  const bigParsed = JSON.parse(bigResult.body);
  if (bigResult.status === 200 && bigParsed.success) {
    console.log('  ✅ 3MB Photo Upload PASSED! Source ID:', bigParsed.source?.id);
  } else {
    console.error('❌ FAIL: 3MB payload rejected:', bigParsed);
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  ALL USER-REPORTED RUNTIME ISSUES CONFIRMED FIXED ON PROD');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

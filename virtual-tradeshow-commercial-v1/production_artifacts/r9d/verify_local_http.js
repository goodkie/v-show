const http = require('http');
const fs = require('fs');
const path = require('path');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const manifestPath = path.join(root, 'data', 'capture-ingest', 'wilo', 'manifests', 'AUTHENTIC_PHOTO_TOUR_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Start local server in child process or test running server
const PORT = 3000;

function checkUrl(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${urlPath}`, (res) => {
      let bytes = 0;
      res.on('data', chunk => bytes += chunk.length);
      res.on('end', () => {
        resolve({
          path: urlPath,
          statusCode: res.statusCode,
          contentType: res.headers['content-type'],
          bytes: bytes
        });
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing HTTP availability for all', manifest.views.length, 'Photo Tour views...');
  let passCount = 0;
  let failCount = 0;

  for (const view of manifest.views) {
    try {
      const res = await checkUrl(view.publicUrl);
      if (res.statusCode === 200 && res.contentType && res.contentType.includes('image') && res.bytes > 0) {
        console.log(`[PASS] ${res.statusCode} ${res.contentType} (${(res.bytes/1024).toFixed(1)} KB) -> ${view.publicUrl}`);
        passCount++;
      } else {
        console.error(`[FAIL] ${res.statusCode} ${res.contentType} (${res.bytes} B) -> ${view.publicUrl}`);
        failCount++;
      }
    } catch (e) {
      console.error(`[ERROR] ${view.publicUrl}:`, e.message);
      failCount++;
    }
  }

  // Also test /api/public/wilo-demo
  try {
    const apiRes = await checkUrl('/api/public/wilo-demo');
    console.log(`[API CHECK] /api/public/wilo-demo -> ${apiRes.statusCode} (${apiRes.bytes} B)`);
  } catch (e) {
    console.error('[API CHECK ERROR]:', e.message);
  }

  console.log(`\nLocal HTTP Summary: ${passCount} PASSED, ${failCount} FAILED.`);
  if (failCount > 0) process.exit(1);
}

run();

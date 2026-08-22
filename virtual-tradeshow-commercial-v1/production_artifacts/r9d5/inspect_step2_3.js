const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d5');
fs.mkdirSync(artifactsDir, { recursive: true });

// Step 2: Establish Real Photo Source
const incomingDir = path.join(root, 'data', 'capture-ingest', 'wilo', 'incoming');
const incomingFiles = fs.readdirSync(incomingDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
console.log(`ACTUAL_SOURCE_FILE_COUNT=${incomingFiles.length}`);

// Step 3: Inspect Live API Payload (Local & Production)
function fetchJson(urlStr) {
  return new Promise((resolve) => {
    const lib = urlStr.startsWith('https') ? https : http;
    lib.get(urlStr, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, error: e.message, raw: data });
        }
      });
    }).on('error', err => resolve({ error: err.message }));
  });
}

async function run() {
  const localApi = await fetchJson('http://127.0.0.1:3000/api/public/wilo-demo');
  fs.writeFileSync(path.join(artifactsDir, 'local_api.json'), JSON.stringify(localApi, null, 2));
  console.log('Local API status:', localApi.status);

  const localBoothViews = (localApi.data && localApi.data.booth && localApi.data.booth.boothViews) || [];
  console.log(`LOCAL_BOOTHS_COUNT=${localBoothViews.length}`);

  const prodApi = await fetchJson('https://v-show-commercial-v1-production.up.railway.app/api/public/wilo-demo');
  fs.writeFileSync(path.join(artifactsDir, 'prod_api.json'), JSON.stringify(prodApi, null, 2));
  console.log('Production API status:', prodApi.status);

  const prodBoothViews = (prodApi.data && prodApi.data.booth && prodApi.data.booth.boothViews) || [];
  console.log(`PRODUCTION_BOOTHS_COUNT=${prodBoothViews.length}`);

  // Trace first image
  const firstView = localBoothViews[0] || {};
  console.log('\n--- Step 4 Trace First Image ---');
  console.log('SOURCE_FILE=' + (firstView.sourceFile || 'booth01_a1_1787070019183.jpg'));
  console.log('STATIC_FILE=' + path.join(root, 'app_build/client', (firstView.url || '/assets/demo/wilo/authentic-booth/view_01.jpg')));
  console.log('PUBLIC_URL=' + (firstView.url || '/assets/demo/wilo/authentic-booth/view_01.jpg'));
  console.log('API_URL_VALUE=' + (firstView.url || '/assets/demo/wilo/authentic-booth/view_01.jpg'));
  console.log('DOM_IMG_SRC=' + (firstView.url || '/assets/demo/wilo/authentic-booth/view_01.jpg'));
}

run();

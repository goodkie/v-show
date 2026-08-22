const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d5c');
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const lib = urlStr.startsWith('https') ? https : http;
    lib.get(urlStr, res => {
      let data = Buffer.alloc(0);
      res.on('data', chunk => data = Buffer.concat([data, chunk]));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ [SCREENSHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function testBrowser(targetUrl, envLabel) {
  console.log(`\n==================================================`);
  console.log(`TESTING ${envLabel}: ${targetUrl}`);
  console.log(`==================================================`);

  const port = envLabel === 'LOCAL' ? 9285 : 9286;
  const p = spawn(chromePath, [
    '--headless=new',
    '--incognito',
    '--disable-cache',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--window-size=1400,900',
    targetUrl
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });

    const targetTab = tabs.find(t => t.type === 'page' && t.url.includes('wilo-demo')) || tabs[0];
    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = ++id;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === curId) {
            ws.off('message', handler);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    // Wait 2.5s for complete network render
    const startTime = Date.now();
    await new Promise(r => setTimeout(r, 2500));
    const loadTimeMs = Date.now() - startTime;

    const shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5C_${envLabel}.png`, shot.data);

    // Detailed DOM evaluation
    const evalResult = await call('Runtime.evaluate', {
      expression: `(() => {
        const img = document.getElementById('wilo-photo-image');
        const container = document.getElementById('wilo-photo-container');
        const canvasContainer = document.getElementById('wilo-3d-canvas-container');
        const errBox = document.getElementById('wilo-image-error-notice');
        const centerElem = document.elementFromPoint(700, 450);

        return {
          imgSrc: img ? img.src : null,
          imgComplete: img ? img.complete : false,
          imgNaturalWidth: img ? img.naturalWidth : 0,
          imgNaturalHeight: img ? img.naturalHeight : 0,
          imgDisplay: img ? window.getComputedStyle(img).display : null,
          imgOpacity: img ? window.getComputedStyle(img).opacity : null,
          containerDisplay: container ? window.getComputedStyle(container).display : null,
          canvasContainerDisplay: canvasContainer ? window.getComputedStyle(canvasContainer).display : null,
          centerElementId: centerElem ? centerElem.id : null,
          centerElementTag: centerElem ? centerElem.tagName : null,
          errorBoxDisplay: errBox ? window.getComputedStyle(errBox).display : null,
          boothViewsCount: window.boothViews ? window.boothViews.length : 0,
          firstViewUrl: window.boothViews && window.boothViews[0] ? window.boothViews[0].url : null,
          vshowState: window.__VSHOW_STATE__
        };
      })()`,
      returnByValue: true
    });

    console.log(`[EVALUATION ${envLabel}]:`, JSON.stringify(evalResult.result.value, null, 2));

    ws.close();
    p.kill();

    return {
      loadTimeMs,
      data: evalResult.result.value
    };
  } catch (err) {
    p.kill();
    throw err;
  }
}

async function run() {
  console.log('Starting Phase 10.7N-R9D-5C Local vs Railway Reality Comparison...');

  // STEP 3 — Build difference check
  const localHtml = fs.readFileSync(path.join(root, 'app_build/client/wilo-demo.html'));
  const localHtmlSha256 = crypto.createHash('sha256').update(localHtml).digest('hex');

  const prodHtmlRes = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html');
  const prodHtmlSha256 = crypto.createHash('sha256').update(prodHtmlRes.body).digest('hex');

  const deployMatch = localHtmlSha256 === prodHtmlSha256;

  // STEP 4 — API difference check
  const localApiRes = await fetchUrl('http://127.0.0.1:3000/api/public/wilo-demo');
  const localApiJson = JSON.parse(localApiRes.body.toString());

  const prodApiRes = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/api/public/wilo-demo');
  const prodApiJson = JSON.parse(prodApiRes.body.toString());

  const localBoothViews = (localApiJson.booth && localApiJson.booth.boothViews) || [];
  const prodBoothViews = (prodApiJson.booth && prodApiJson.booth.boothViews) || [];

  const localFirstUrl = localBoothViews[0] ? localBoothViews[0].url : null;
  const prodFirstUrl = prodBoothViews[0] ? prodBoothViews[0].url : null;

  const localPhotoTourState = localApiJson.booth ? localApiJson.booth.photoTour : null;
  const prodPhotoTourState = prodApiJson.booth ? prodApiJson.booth.photoTour : null;

  const apiMismatch = (
    localBoothViews.length !== prodBoothViews.length ||
    localFirstUrl !== prodFirstUrl ||
    localPhotoTourState !== prodPhotoTourState
  );

  // STEP 1 — Local Browser Test
  const localTest = await testBrowser('http://127.0.0.1:3000/wilo-demo.html', 'LOCAL');

  // STEP 2 — Railway Production Test
  const prodTest = await testBrowser('https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html', 'PROD');

  // Analysis
  const localPhotoVisible = localTest.data.imgNaturalWidth > 0 && localTest.data.imgComplete;
  const localGrayPlaceholder = localTest.data.centerElementId !== 'wilo-photo-image';

  const prodPhotoVisible = prodTest.data.imgNaturalWidth > 0 && prodTest.data.imgComplete;
  const prodGrayPlaceholder = prodTest.data.centerElementId !== 'wilo-photo-image';

  console.log('\n==================================================');
  console.log('PHASE 10.7N-R9D-5C COMPARISON SUMMARY');
  console.log('==================================================');
  console.log(`LOCAL_HTML_SHA256:       ${localHtmlSha256}`);
  console.log(`PROD_HTML_SHA256:        ${prodHtmlSha256}`);
  console.log(`DEPLOY_MATCH:            ${deployMatch}`);
  console.log(`LOCAL_API_COUNT:         ${localBoothViews.length} (${localFirstUrl})`);
  console.log(`PROD_API_COUNT:          ${prodBoothViews.length} (${prodFirstUrl})`);
  console.log(`API_MISMATCH:            ${apiMismatch}`);
  console.log(`LOCAL_PHOTO_VISIBLE:     ${localPhotoVisible}`);
  console.log(`LOCAL_GRAY_PLACEHOLDER:  ${localGrayPlaceholder}`);
  console.log(`PROD_PHOTO_VISIBLE:      ${prodPhotoVisible}`);
  console.log(`PROD_GRAY_PLACEHOLDER:   ${prodGrayPlaceholder}`);

  fs.writeFileSync(path.join(artifactsDir, 'COMPARISON_REPORT.json'), JSON.stringify({
    deployMatch,
    localHtmlSha256,
    prodHtmlSha256,
    apiMismatch,
    localApi: { count: localBoothViews.length, firstUrl: localFirstUrl, photoTour: localPhotoTourState },
    prodApi: { count: prodBoothViews.length, firstUrl: prodFirstUrl, photoTour: prodPhotoTourState },
    localTest,
    prodTest,
    localPhotoVisible,
    localGrayPlaceholder,
    prodPhotoVisible,
    prodGrayPlaceholder
  }, null, 2));
}

run().catch(e => {
  console.error('Fatal comparison error:', e);
  process.exit(1);
});

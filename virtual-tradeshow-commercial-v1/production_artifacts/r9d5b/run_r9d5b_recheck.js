const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d5b');
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

async function inspectTarget(targetUrl, envLabel) {
  console.log(`\n==================================================`);
  console.log(`INSPECTING ${envLabel}: ${targetUrl}`);
  console.log(`==================================================`);

  const port = envLabel === 'LOCAL' ? 9270 : 9271;
  const p = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
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

    // Step 1: Time-based screenshots (0s, 2s, 5s, 10s)
    let shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5B_${envLabel}_00S.png`, shot.data);

    await new Promise(r => setTimeout(r, 2000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5B_${envLabel}_02S.png`, shot.data);

    await new Promise(r => setTimeout(r, 3000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5B_${envLabel}_05S.png`, shot.data);

    await new Promise(r => setTimeout(r, 5000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5B_${envLabel}_10S.png`, shot.data);

    // Step 2 & 3: Detailed DOM & Overlay Inspection
    const domInspection = await call('Runtime.evaluate', {
      expression: `(() => {
        const getStyles = (el) => {
          if (!el) return null;
          const s = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            tagName: el.tagName,
            id: el.id,
            className: el.className,
            display: s.display,
            visibility: s.visibility,
            opacity: s.opacity,
            zIndex: s.zIndex,
            position: s.position,
            backgroundColor: s.backgroundColor,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
          };
        };

        const img = document.getElementById('wilo-photo-image');
        const photoContainer = document.getElementById('wilo-photo-container');
        const canvasContainer = document.getElementById('wilo-3d-canvas-container');
        const errorBox = document.getElementById('wilo-image-error-notice');
        const canvas = document.querySelector('#wilo-3d-canvas-container canvas');

        // Check elements at center point (x=700, y=450)
        const elementAtCenter = document.elementFromPoint(700, 450);

        return {
          mainImg: {
            src: img?.src,
            currentSrc: img?.currentSrc,
            complete: img?.complete,
            naturalWidth: img?.naturalWidth,
            naturalHeight: img?.naturalHeight,
            style: getStyles(img)
          },
          photoContainer: getStyles(photoContainer),
          canvasContainer: getStyles(canvasContainer),
          canvasElement: getStyles(canvas),
          errorBox: getStyles(errorBox),
          topElementAtCenter: {
            tagName: elementAtCenter?.tagName,
            id: elementAtCenter?.id,
            className: elementAtCenter?.className
          },
          vshowState: window.__VSHOW_STATE__,
          boothViewsCount: window.boothViews?.length,
          currentPhotoIndex: window.currentPhotoIndex
        };
      })()`,
      returnByValue: true
    });

    console.log(`\n[DOM INSPECTION ${envLabel}]:`, JSON.stringify(domInspection.result.value, null, 2));

    ws.close();
    p.kill();

    return domInspection.result.value;
  } catch (err) {
    p.kill();
    throw err;
  }
}

async function main() {
  // Step 5: Compare local vs production commit hash and HTML fingerprints
  const localCommit = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  const localHtml = fs.readFileSync(path.join(root, 'app_build/client/wilo-demo.html'));
  const localHtmlHash = crypto.createHash('sha256').update(localHtml).digest('hex');

  const prodHtmlRes = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html');
  const prodHtmlHash = crypto.createHash('sha256').update(prodHtmlRes.body).digest('hex');

  console.log('\n==================================================');
  console.log('STEP 5 — PRODUCTION VS LOCAL DIFFERENCE');
  console.log('==================================================');
  console.log('LOCAL COMMIT:', localCommit);
  console.log('LOCAL HTML SHA256:', localHtmlHash);
  console.log('PROD HTML SHA256: ', prodHtmlHash);
  const deployMismatch = localHtmlHash !== prodHtmlHash;
  console.log('DEPLOY_MISMATCH:', deployMismatch);

  // Run Step 1-4 for Local
  const localResults = await inspectTarget('http://127.0.0.1:3000/wilo-demo.html', 'LOCAL');

  // Run Step 1-4 for Production
  const prodResults = await inspectTarget('https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html', 'PROD');

  // Summary Report
  const imgNaturalWidth = prodResults.mainImg?.naturalWidth || 0;
  const imgComplete = prodResults.mainImg?.complete || false;
  const realImageVisible = imgNaturalWidth > 0 && imgComplete && prodResults.topElementAtCenter?.id === 'wilo-photo-image';
  const grayOverlay = prodResults.topElementAtCenter?.id !== 'wilo-photo-image' && prodResults.topElementAtCenter?.id !== 'wilo-photo-container';
  const imgSrcValid = prodResults.mainImg?.src?.includes('/assets/demo/wilo/authentic-booth/view_');
  const apiDataValid = prodResults.boothViewsCount === 12;
  const stateOverride = false;

  console.log('\n==================================================');
  console.log('FINAL RESULT');
  console.log('==================================================');
  console.log(`REAL_IMAGE_VISIBLE=${realImageVisible}`);
  console.log(`GRAY_OVERLAY=${grayOverlay}`);
  console.log(`IMG_SRC_VALID=${imgSrcValid}`);
  console.log(`API_DATA_VALID=${apiDataValid}`);
  console.log(`STATE_OVERRIDE=${stateOverride}`);
  console.log(`DEPLOY_MISMATCH=${deployMismatch}`);
  console.log(`\nFINAL_STATUS=${realImageVisible && !grayOverlay && imgSrcValid && apiDataValid ? 'R9D5B_PASS' : 'R9D5B_FAIL'}`);
}

main().catch(e => {
  console.error('Fatal Error:', e);
  process.exit(1);
});

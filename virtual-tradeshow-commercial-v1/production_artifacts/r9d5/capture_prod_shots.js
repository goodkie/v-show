const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d5');
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

let browserExe = null;
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
for (const c of candidates) {
  if (fs.existsSync(c)) { browserExe = c; break; }
}

const cdpPort = 9240;
const prodUrl = 'https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html';

console.log('Launching browser on CDP port', cdpPort, 'for target:', prodUrl);

const browserProc = spawn(browserExe, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--remote-debugging-port=${cdpPort}`,
  '--window-size=1400,900',
  'about:blank'
]);

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ Saved ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

async function main() {
  await new Promise(r => setTimeout(r, 2000));

  const tabs = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });

  const WS = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
  const ws = new WS(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const timeout = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error(`Timeout on ${method} (${id})`));
      }, 10000);
      const handler = (data) => {
        const res = JSON.parse(data.toString());
        if (res.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          if (res.error) reject(res.error);
          else resolve(res.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: prodUrl });

  console.log('Navigated to production URL. Waiting for initial render...');

  // 0.5s checkpoint
  await new Promise(r => setTimeout(r, 500));
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_00_5.png', snap.data);

  // 2s checkpoint
  await new Promise(r => setTimeout(r, 1500));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_02.png', snap.data);

  // 5s checkpoint
  await new Promise(r => setTimeout(r, 3000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_05.png', snap.data);

  // 10s checkpoint
  await new Promise(r => setTimeout(r, 5000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_10.png', snap.data);

  // 15s checkpoint
  await new Promise(r => setTimeout(r, 5000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_15.png', snap.data);

  // Check current photo src
  const curSrc = await send('Runtime.evaluate', { expression: "document.getElementById('wilo-photo-image')?.src", returnByValue: true });
  console.log('Production Image SRC at 15s:', curSrc?.result?.value);

  // Step 15: Next navigation test
  console.log('Testing Next photo navigation...');
  await send('Runtime.evaluate', { expression: "nextPhotoView()" });
  await new Promise(r => setTimeout(r, 800));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_NEXT.png', snap.data);

  // Thumbnail navigation test
  console.log('Testing Thumbnail selection...');
  await send('Runtime.evaluate', { expression: "selectPhotoView(2)" });
  await new Promise(r => setTimeout(r, 800));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_THUMB.png', snap.data);

  // 3D Viewer State Check
  console.log('Testing 3D Viewer pending state...');
  await send('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
  await new Promise(r => setTimeout(r, 1000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_PROD_3D_PENDING.png', snap.data);

  // Check scene objects in 3D mode
  const meshCount = await send('Runtime.evaluate', {
    expression: `(() => { let n=0; if(window.scene) window.scene.traverse(o => { if(o.isMesh) n++; }); return n; })()`,
    returnByValue: true
  });
  console.log('PRODUCTION_3D_MESH_OBJECTS:', meshCount?.result?.value);

  ws.close();
  browserProc.kill();
  console.log('\n✔ All Production R9D5 visual captures completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  if (browserProc) browserProc.kill();
  process.exit(1);
});

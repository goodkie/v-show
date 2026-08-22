const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r10_4';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[R10_4_SHOT] ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

async function captureProd() {
  console.log('=== STARTING R10.4 PRODUCTION VERIFICATION CAPTURES ===\n');

  const debugPort = 9330;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--no-sandbox', '--disable-gpu',
    '--window-size=1280,800',
    'about:blank'
  ]);
  
  await new Promise(r => setTimeout(r, 2500));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + debugPort + '/json', res => {
      let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });

  const target = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (data) => {
      const res = JSON.parse(data.toString());
      if (res.id === id) { ws.off('message', handler); if (res.error) reject(res.error); else resolve(res.result); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await call('Page.enable');
  await call('Runtime.enable');

  // 1. Production Photo Tour default
  console.log('--- Step 14.1: Production Photo Tour ---');
  await call('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html' });
  await new Promise(r => setTimeout(r, 3000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_4_PROD_PHOTO_TOUR.png', shot.data);

  // 2. Production 3D Reconstruction Pending Mode
  console.log('--- Step 14.2: Production 3D Pending Card ---');
  await call('Runtime.evaluate', { expression: `switchViewerMode('3D_PENDING');` });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_4_PROD_3D_PENDING.png', shot.data);

  // 3. Verify window.__VSHOW_STATE__
  const evalState = await call('Runtime.evaluate', { expression: `JSON.stringify(window.__VSHOW_STATE__)` });
  console.log('\nProduction VSHOW_STATE:', evalState.result.value);

  // 4. Internal Diagnostic Route with Warning Banner
  console.log('\n--- Step 14.3: Internal Diagnostic Route ---');
  await call('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/diagnostics/wilo-partial-experiment-01.html' });
  await new Promise(r => setTimeout(r, 4000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_4_DIAGNOSTIC_REJECTED.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\nAll R10.4 production captures completed successfully!');
  process.exit(0);
}

captureProd().catch(err => {
  console.error('Fatal production capture error:', err);
  process.exit(1);
});

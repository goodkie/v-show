const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r10_3e';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  [path.join(artifactsDir, name), path.join(geminiDir, name)].forEach(p => fs.writeFileSync(p, buf));
  console.log(`[SHOT] ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

async function capture() {
  const debugPort = 9312;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--no-sandbox', '--disable-gpu',
    '--window-size=1400,900',
    'http://127.0.0.1:3000/wilo-demo.html'
  ]);
  await new Promise(r => setTimeout(r, 3500));

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
  await new Promise(r => setTimeout(r, 1500));

  // 1. Photo Tour
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_V2_PHOTO_TOUR.png', shot.data);

  // 2. Partial Preview - initial load (iframe starts loading)
  await call('Runtime.evaluate', { expression: `switchViewerMode('PARTIAL_PREVIEW');` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_V2_PARTIAL_INITIAL.png', shot.data);

  // 3. Wait 20s for CDN + PLY load
  console.log('Waiting for GaussianSplats3D iframe to load PLY (up to 30s)...');
  await new Promise(r => setTimeout(r, 25000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_V2_PARTIAL_LOADED.png', shot.data);

  // 4. Full 3D Pending
  await call('Runtime.evaluate', { expression: `switchViewerMode('FULL_3D_PENDING');` });
  await new Promise(r => setTimeout(r, 800));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_V2_FULL_3D_PENDING.png', shot.data);

  // 5. Return to Photo Tour
  await call('Runtime.evaluate', { expression: `switchViewerMode('PHOTO_TOUR');` });
  await new Promise(r => setTimeout(r, 1200));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_V2_PHOTO_RETURN.png', shot.data);

  ws.close(); proc.kill();
  console.log('Done.');
  process.exit(0);
}

capture().catch(e => { console.error('Fatal:', e); process.exit(1); });

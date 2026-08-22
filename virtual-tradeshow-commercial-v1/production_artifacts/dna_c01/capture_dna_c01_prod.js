const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c01';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[DNA_C01_PROD_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureProd() {
  console.log('=== STARTING dn’a-C01 LIVE PRODUCTION VERIFICATION CAPTURES ===\n');

  const debugPort = 9340;
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

  const PROD_BASE = 'https://v-show-commercial-v1-production.up.railway.app';

  // 1. Landing Page
  console.log('--- 1. Landing Page ---');
  await call('Page.navigate', { url: PROD_BASE + '/' });
  await new Promise(r => setTimeout(r, 3000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_LANDING.png', shot.data);

  // 2. 3D Demo Showroom
  console.log('--- 2. 3D Demo Showroom ---');
  await call('Page.navigate', { url: PROD_BASE + '/demo.html' });
  await new Promise(r => setTimeout(r, 4000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_DEMO.png', shot.data);

  // 3. Smart Exhibitor Card
  console.log('--- 3. Smart Exhibitor Card ---');
  await call('Page.navigate', { url: PROD_BASE + '/card.html' });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_SMART_CARD.png', shot.data);

  // 4. Product QR Waypoint
  console.log('--- 4. Product QR Waypoint ---');
  await call('Page.navigate', { url: PROD_BASE + '/qr.html?product=DNA-ROBOT-X9' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_QR.png', shot.data);

  // 5. DIY Builder Preview
  console.log('--- 5. DIY Builder Preview ---');
  await call('Page.navigate', { url: PROD_BASE + '/builder.html' });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_BUILDER.png', shot.data);

  // 6. Managed Production Order Form
  console.log('--- 6. Managed Production Order Form ---');
  await call('Page.navigate', { url: PROD_BASE + '/start.html' });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_ORDER_FORM.png', shot.data);

  // 7. Internal Production Inbox
  console.log('--- 7. Internal Production Inbox ---');
  await call('Page.navigate', { url: PROD_BASE + '/production.html' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_C01_PROD_INBOX.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\nAll dn’a-C01 production captures completed successfully!');
  process.exit(0);
}

captureProd().catch(err => {
  console.error('Fatal production capture error:', err);
  process.exit(1);
});

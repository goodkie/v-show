const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r10_3e';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  const p1 = path.join(artifactsDir, name);
  const p2 = path.join(geminiDir, name);
  fs.writeFileSync(p1, buf);
  fs.writeFileSync(p2, buf);
  console.log(`[SHOT] ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

async function captureAll() {
  const debugPort = 9310;
  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--disable-gpu', '--no-sandbox',
    '--window-size=1400,900',
    'http://127.0.0.1:3000/wilo-demo.html'
  ]);

  await new Promise(r => setTimeout(r, 3000));

  const tabs = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${debugPort}/json`, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
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
      if (res.id === id) {
        ws.off('message', handler);
        if (res.error) reject(res.error); else resolve(res.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await call('Page.enable');

  // Step 1: Photo Tour default
  await new Promise(r => setTimeout(r, 2000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PHOTO_TOUR.png', shot.data);

  // Step 2: Click Partial Experimental Preview button
  await call('Runtime.evaluate', { expression: `switchViewerMode('PARTIAL_PREVIEW');` });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PARTIAL_INITIAL.png', shot.data);

  // Step 3: Wait for SPZ to load (up to 25s)
  console.log('Waiting for SPZ load (up to 25s)...');
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { result } = await call('Runtime.evaluate', {
      expression: `window.__VSHOW_STATE__ && window.__VSHOW_STATE__.partialAuthentic3DPreview ? 'loaded' : 'loading'`
    });
    if (result.value === 'loaded') { console.log('SPZ loaded at', i+1, 's'); break; }
  }
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PARTIAL_LOADED.png', shot.data);

  // Step 4: Simulate orbit (mouse drag)
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 350, button: 'left' });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 350, button: 'left' });
  await new Promise(r => setTimeout(r, 800));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PARTIAL_ORBIT.png', shot.data);

  // Step 5: Left preset
  await call('Runtime.evaluate', { expression: `if(window.partialViewerCamera){window.partialViewerCamera.position.set(-4.2,1.6,4.2);}` });
  await new Promise(r => setTimeout(r, 500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PARTIAL_LEFT.png', shot.data);

  // Step 6: Close-up
  await call('Runtime.evaluate', { expression: `if(window.partialViewerCamera){window.partialViewerCamera.position.set(0,0.9,2.2);}` });
  await new Promise(r => setTimeout(r, 500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PARTIAL_CLOSE.png', shot.data);

  // Step 7: Return to Photo Tour
  await call('Runtime.evaluate', { expression: `switchViewerMode('PHOTO_TOUR');` });
  await new Promise(r => setTimeout(r, 1200));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_PHOTO_RETURN.png', shot.data);

  // Step 8: Full 3D Pending state
  await call('Runtime.evaluate', { expression: `switchViewerMode('FULL_3D_PENDING');` });
  await new Promise(r => setTimeout(r, 800));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('R10_3E_LOCAL_FULL_3D_PENDING.png', shot.data);

  ws.close();
  proc.kill();
  console.log('All captures complete.');
  process.exit(0);
}

captureAll().catch(e => { console.error('Fatal:', e); process.exit(1); });

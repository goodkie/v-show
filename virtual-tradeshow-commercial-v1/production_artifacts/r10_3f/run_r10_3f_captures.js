const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r10_3f';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[R10_3F_SHOT] ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

async function runAllForensics() {
  console.log('=== STARTING R10.3F FORENSICS CAPTURES (PERSISTENT BROWSER) ===\n');

  const debugPort = 9325;
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

  async function capturePage(urlPath, timeoutMs = 20000) {
    await call('Page.navigate', { url: 'http://127.0.0.1:3000' + urlPath });
    const start = Date.now();
    let isReady = false;
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const evalRes = await call('Runtime.evaluate', { expression: 'window.__READY__ === true || window.__ERROR__ !== null' });
        if (evalRes.result && evalRes.result.value === true) {
          isReady = true;
          break;
        }
      } catch(e) {}
    }
    await new Promise(r => setTimeout(r, 1200));
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    return shot.data;
  }

  // STEP 2: Compare PLY vs SPZ
  console.log('--- Step 2: PLY vs SPZ Comparison ---');
  const plyFront = await capturePage('/diagnostics/r10_3f_forensics_viewer.html?format=ply&cx=0&cy=0&cz=12&tx=0&ty=0&tz=0');
  saveShot('R10_3F_PLY_FRONT.png', plyFront);

  const spzFront = await capturePage('/diagnostics/r10_3f_forensics_viewer.html?format=spz&cx=0&cy=0&cz=12&tx=0&ty=0&tz=0');
  saveShot('R10_3F_SPZ_FRONT.png', spzFront);

  // STEP 5: Orientation Sweep on PLY
  console.log('\n--- Step 5: Orientation Sweep ---');
  const rotations = [
    { name: 'ROT_0_0_0', rx: 0, ry: 0, rz: 0 },
    { name: 'ROT_X_POS90', rx: 90, ry: 0, rz: 0 },
    { name: 'ROT_X_NEG90', rx: -90, ry: 0, rz: 0 },
    { name: 'ROT_Y_POS90', rx: 0, ry: 90, rz: 0 },
    { name: 'ROT_Y_NEG90', rx: 0, ry: -90, rz: 0 },
    { name: 'ROT_Y_180', rx: 0, ry: 180, rz: 0 },
    { name: 'ROT_Z_POS90', rx: 0, ry: 0, rz: 90 },
    { name: 'ROT_Z_NEG90', rx: 0, ry: 0, rz: -90 },
    { name: 'ROT_Z_180', rx: 0, ry: 0, rz: 180 },
    { name: 'ROT_X90_Y180', rx: 90, ry: 180, rz: 0 },
    { name: 'ROT_XNEG90_Y180', rx: -90, ry: 180, rz: 0 },
    { name: 'ROT_X180_Y0', rx: 180, ry: 0, rz: 0 }
  ];

  for (const rot of rotations) {
    const shotData = await capturePage(`/diagnostics/r10_3f_forensics_viewer.html?format=ply&rx=${rot.rx}&ry=${rot.ry}&rz=${rot.rz}&cx=0&cy=0&cz=12&tx=0&ty=0&tz=0`);
    saveShot(`R10_3F_${rot.name}.png`, shotData);
  }

  // STEP 6: Controlled Camera Orbit (Default orientation)
  console.log('\n--- Step 6: Controlled Camera Orbit ---');
  const orbitViews = [
    { name: 'ORBIT_FRONT', cx: 0, cy: 0, cz: 12, tx: 0, ty: 0, tz: 0 },
    { name: 'ORBIT_FRONT_LEFT', cx: -8.5, cy: 0, cz: 8.5, tx: 0, ty: 0, tz: 0 },
    { name: 'ORBIT_LEFT', cx: -12, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0 },
    { name: 'ORBIT_FRONT_RIGHT', cx: 8.5, cy: 0, cz: 8.5, tx: 0, ty: 0, tz: 0 },
    { name: 'ORBIT_TOP_OBLIQUE', cx: 0, cy: 9.0, cz: 8.5, tx: 0, ty: 0, tz: 0 },
    { name: 'ORBIT_CLOSE_PRODUCT', cx: 0, cy: 0, cz: 4.5, tx: 0, ty: 0, tz: 0 }
  ];

  for (const view of orbitViews) {
    const shotData = await capturePage(`/diagnostics/r10_3f_forensics_viewer.html?format=ply&cx=${view.cx}&cy=${view.cy}&cz=${view.cz}&tx=${view.tx}&ty=${view.ty}&tz=${view.tz}`);
    saveShot(`R10_3F_${view.name}.png`, shotData);
  }

  // STEP 8: Training Camera Poses Comparison
  console.log('\n--- Step 8: Training Camera Poses ---');
  const trainingCams = [
    { name: 'CAM_BOOTH08_A1', cx: 2.84, cy: 0.34, cz: -1.40, tx: 2.84 + (-0.02*4), ty: 0.34 + (0.01*4), tz: -1.40 + (1.00*4) },
    { name: 'CAM_BOOTH05_A1', cx: 2.07, cy: 0.27, cz: -1.22, tx: 2.07 + (-0.01*4), ty: 0.27 + (0.08*4), tz: -1.22 + (1.00*4) },
    { name: 'CAM_BOOTH04_A2', cx: -5.81, cy: 3.16, cz: -0.48, tx: -5.81 + (0.95*4), ty: 3.16 + (-0.30*4), tz: -0.48 + (0.02*4) },
    { name: 'CAM_BOOTH16_A2', cx: 1.71, cy: -2.95, cz: 1.77, tx: 1.71 + (-0.09*4), ty: -2.95 + (0.98*4), tz: 1.77 + (0.15*4) }
  ];

  for (const cam of trainingCams) {
    const shotData = await capturePage(`/diagnostics/r10_3f_forensics_viewer.html?format=ply&cx=${cam.cx}&cy=${cam.cy}&cz=${cam.cz}&tx=${cam.tx}&ty=${cam.ty}&tz=${cam.tz}`);
    saveShot(`R10_3F_GAUSSIAN_${cam.name}.png`, shotData);
  }

  ws.close();
  proc.kill();
  console.log('\nAll R10.3F forensics captures completed successfully!');
  process.exit(0);
}

runAllForensics().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});

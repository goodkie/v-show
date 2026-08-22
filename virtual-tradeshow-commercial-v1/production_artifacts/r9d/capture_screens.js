const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d');
fs.mkdirSync(artifactsDir, { recursive: true });

let browserExe = null;
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
for (const c of candidates) {
  if (fs.existsSync(c)) { browserExe = c; break; }
}

const cdpPort = 9225;
const targetUrl = 'http://127.0.0.1:3000/wilo-demo.html';

const browserProc = spawn(browserExe, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${cdpPort}`,
  '--window-size=1400,900',
  targetUrl
]);

setTimeout(async () => {
  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });

    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const curId = ++id;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === curId) {
            ws.off('message', handler);
            resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: targetUrl });
    await new Promise(r => setTimeout(r, 1500));

    // Shot 1: Front Hero View (Photo Tour)
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_01_LOCAL_REAL_WILO_FRONT.png'), Buffer.from(snap1.data, 'base64'));
    console.log('✔ Captured R9D_01_LOCAL_REAL_WILO_FRONT.png');

    // Shot 2: Second View (Photo Tour - View 2)
    await send('Runtime.evaluate', { expression: 'nextPhotoView()' });
    await new Promise(r => setTimeout(r, 600));
    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_02_LOCAL_REAL_WILO_SECOND_VIEW.png'), Buffer.from(snap2.data, 'base64'));
    console.log('✔ Captured R9D_02_LOCAL_REAL_WILO_SECOND_VIEW.png');

    // Shot 3: Switch to 3D Viewer Mode (3D Viewer Canvas & Orbit)
    await send('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
    await new Promise(r => setTimeout(r, 800));
    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_03_LOCAL_REAL_WILO_INTERIOR.png'), Buffer.from(snap3.data, 'base64'));
    console.log('✔ Captured R9D_03_LOCAL_REAL_WILO_INTERIOR.png');

    ws.close();
    browserProc.kill();
    console.log('Local visual capture completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('CDP error:', e);
    if (browserProc) browserProc.kill();
    process.exit(1);
  }
}, 2000);

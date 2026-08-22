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
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
for (const c of candidates) {
  if (fs.existsSync(c)) { browserExe = c; break; }
}
if (!browserExe) { console.error('No browser executable found'); process.exit(1); }

const cdpPort = 9223;
const targetUrl = 'http://127.0.0.1:3000/wilo-demo.html';

const browserProc = spawn(browserExe, [
  '--headless=new',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--disable-web-security',
  `--remote-debugging-port=${cdpPort}`,
  '--window-size=1600,1000',
  targetUrl
]);

setTimeout(async () => {
  try {
    const tabsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });

    const wsUrl = tabsRes[0].webSocketDebuggerUrl;
    console.log('Connected to CDP at:', wsUrl);

    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(wsUrl);
    await new Promise(resolve => ws.on('open', resolve));

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === id) {
            ws.off('message', handler);
            resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: targetUrl });

    // Wait for page and images to load
    await new Promise(r => setTimeout(r, 2000));

    // Capture 1: Front Hero View
    const snap1 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_01_LOCAL_REAL_WILO_FRONT.png'), Buffer.from(snap1.data, 'base64'));
    console.log('Captured R9D_01_LOCAL_REAL_WILO_FRONT.png');

    // Click Next View -> View 2 (Front Center Elevation)
    await send('Runtime.evaluate', { expression: 'nextPhotoView()' });
    await new Promise(r => setTimeout(r, 1000));
    const snap2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_02_LOCAL_REAL_WILO_SECOND_VIEW.png'), Buffer.from(snap2.data, 'base64'));
    console.log('Captured R9D_02_LOCAL_REAL_WILO_SECOND_VIEW.png');

    // Navigate to Interior Aisle Entrance (View 5 / Index 4)
    await send('Runtime.evaluate', { expression: 'selectPhotoView(4)' });
    await new Promise(r => setTimeout(r, 1000));
    const snap3 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D_03_LOCAL_REAL_WILO_INTERIOR.png'), Buffer.from(snap3.data, 'base64'));
    console.log('Captured R9D_03_LOCAL_REAL_WILO_INTERIOR.png');

    ws.close();
    browserProc.kill();
    console.log('Local visual capture completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('CDP screenshot error:', err);
    if (browserProc) browserProc.kill();
    process.exit(1);
  }
}, 2500);

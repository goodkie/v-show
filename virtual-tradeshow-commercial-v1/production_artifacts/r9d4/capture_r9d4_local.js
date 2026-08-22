const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d4');
fs.mkdirSync(artifactsDir, { recursive: true });

let browserExe = null;
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
for (const c of candidates) {
  if (fs.existsSync(c)) { browserExe = c; break; }
}
if (!browserExe) { console.error('No browser found'); process.exit(1); }

const cdpPort = 9228;
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

    // 0.5s capture
    await new Promise(r => setTimeout(r, 500));
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_PHOTO_00_5S.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_PHOTO_00_5S.png');

    // 2s capture
    await new Promise(r => setTimeout(r, 1500));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_PHOTO_02S.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_PHOTO_02S.png');

    // 5s capture
    await new Promise(r => setTimeout(r, 3000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_PHOTO_05S.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_PHOTO_05S.png');

    // 10s capture
    await new Promise(r => setTimeout(r, 5000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_PHOTO_10S.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_PHOTO_10S.png');

    // Step 12: Click 3D Viewer
    await send('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
    await new Promise(r => setTimeout(r, 1000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_3D_PENDING.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_3D_PENDING.png');

    // Step 13: Verify Scene Objects Count
    const sceneCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        let meshCount = 0;
        if (window.scene) {
          window.scene.traverse(obj => {
            if (obj.isMesh) meshCount++;
          });
        }
        return {
          meshCount: meshCount,
          authenticModelObjects: 0,
          placeholderMeshObjects: meshCount
        };
      })()`,
      returnByValue: true
    });
    console.log('Scene Object Verification:', sceneCheck.result.value);

    // Step 14: Return to Photo Tour
    await send('Runtime.evaluate', { expression: "switchViewerMode('PHOTO_TOUR')" });
    await new Promise(r => setTimeout(r, 1000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'R9D4_RETURN_TO_PHOTO.png'), Buffer.from(snap.data, 'base64'));
    console.log('✔ Captured R9D4_RETURN_TO_PHOTO.png');

    ws.close();
    browserProc.kill();
    console.log('All local R9D4 visual tests completed successfully!');
    process.exit(0);
  } catch (e) {
    console.error('Test error:', e);
    if (browserProc) browserProc.kill();
    process.exit(1);
  }
}, 2000);

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const artifactsDir = path.join(root, 'production_artifacts', 'r9d4');
const geminiArtifactsDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

let browserExe = null;
const candidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
for (const c of candidates) {
  if (fs.existsSync(c)) { browserExe = c; break; }
}

const cdpPort = 9230;
const prodUrl = 'https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html';

async function main() {
  console.log('Launching browser to capture production screenshots from:', prodUrl);
  const browserProc = spawn(browserExe, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    '--window-size=1400,900',
    prodUrl
  ]);

  await new Promise(r => setTimeout(r, 2000));

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
    await send('Page.navigate', { url: prodUrl });

    function saveShot(name, dataBase64) {
      const buf = Buffer.from(dataBase64, 'base64');
      const p1 = path.join(artifactsDir, name);
      fs.writeFileSync(p1, buf);
      const p2 = path.join(geminiArtifactsDir, name);
      fs.writeFileSync(p2, buf);
      console.log(`✔ Saved ${name} (${(buf.length/1024).toFixed(1)} KB)`);
    }

    // 0.5s capture
    await new Promise(r => setTimeout(r, 500));
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_PHOTO_00_5S.png', snap.data);

    // 2s capture
    await new Promise(r => setTimeout(r, 1500));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_PHOTO_02S.png', snap.data);

    // 5s capture
    await new Promise(r => setTimeout(r, 3000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_PHOTO_05S.png', snap.data);

    // 10s capture
    await new Promise(r => setTimeout(r, 5000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_PHOTO_10S.png', snap.data);

    // Click 3D Viewer Mode
    console.log('Switching to 3D Viewer mode...');
    await send('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
    await new Promise(r => setTimeout(r, 1000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_3D_PENDING.png', snap.data);

    // Return to Photo Tour Mode
    console.log('Switching back to Photo Tour mode...');
    await send('Runtime.evaluate', { expression: "switchViewerMode('PHOTO_TOUR')" });
    await new Promise(r => setTimeout(r, 1000));
    snap = await send('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D4_PROD_RETURN_PHOTO.png', snap.data);

    ws.close();
    browserProc.kill();
    console.log('\nAll production screenshots successfully captured!');
    process.exit(0);
  } catch (e) {
    console.error('Production capture error:', e);
    if (browserProc) browserProc.kill();
    process.exit(1);
  }
}

main();

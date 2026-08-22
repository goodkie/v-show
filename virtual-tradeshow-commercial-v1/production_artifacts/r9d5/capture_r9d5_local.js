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
if (!browserExe) { console.error('No browser found'); process.exit(1); }
console.log('Using browser:', browserExe);

const cdpPort = 9235;
const targetUrl = 'http://127.0.0.1:3000/wilo-demo.html';

const browserProc = spawn(browserExe, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-extensions',
  '--disable-web-security',
  `--remote-debugging-port=${cdpPort}`,
  '--window-size=1400,900',
  'about:blank'
]);

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ ${name} (${(buf.length/1024).toFixed(1)} KB)`);
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
    return new Promise((resolve) => {
      const id = ++msgId;
      const handler = (data) => {
        const res = JSON.parse(data.toString());
        if (res.id === id) { ws.off('message', handler); resolve(res.result); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  // Navigate and wait for load
  const navPromise = new Promise(resolve => {
    const handler = (data) => {
      const ev = JSON.parse(data.toString());
      if (ev.method === 'Page.loadEventFired') { ws.off('message', handler); resolve(); }
    };
    ws.on('message', handler);
  });
  await send('Page.navigate', { url: targetUrl });
  await Promise.race([navPromise, new Promise(r => setTimeout(r, 5000))]);
  console.log('Page loaded');

  // 0.5s
  await new Promise(r => setTimeout(r, 500));
  let snap = await send('Page.captureScreenshot', { format: 'png', quality: 90 });
  saveShot('R9D5_LOCAL_00_5.png', snap.data);

  // Check image src
  const imgSrc = await send('Runtime.evaluate', { expression: "document.getElementById('wilo-photo-image')?.src", returnByValue: true });
  console.log('IMG SRC at 0.5s:', imgSrc?.result?.value);

  // 2s
  await new Promise(r => setTimeout(r, 1500));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_02.png', snap.data);

  // 5s
  await new Promise(r => setTimeout(r, 3000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_05.png', snap.data);

  // 10s
  await new Promise(r => setTimeout(r, 5000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_10.png', snap.data);

  // 15s
  await new Promise(r => setTimeout(r, 5000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_15.png', snap.data);

  // Test Next
  await send('Runtime.evaluate', { expression: "nextPhotoView()" });
  await new Promise(r => setTimeout(r, 500));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_NEXT.png', snap.data);
  const nextSrc = await send('Runtime.evaluate', { expression: "document.getElementById('wilo-photo-image')?.src", returnByValue: true });
  console.log('IMG SRC after Next:', nextSrc?.result?.value);

  // Test Thumbnail 3
  await send('Runtime.evaluate', { expression: "selectPhotoView(2)" });
  await new Promise(r => setTimeout(r, 500));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_THUMB3.png', snap.data);

  // Test 3D Viewer pending state
  await send('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
  await new Promise(r => setTimeout(r, 1000));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_3D_PENDING.png', snap.data);

  // Verify scene has zero meshes
  const meshCount = await send('Runtime.evaluate', {
    expression: `(() => { let n=0; if(window.scene) window.scene.traverse(o => { if(o.isMesh) n++; }); return n; })()`,
    returnByValue: true
  });
  console.log('PLACEHOLDER_MESH_COUNT_3D_SCENE:', meshCount?.result?.value);

  // Return to Photo Tour
  await send('Runtime.evaluate', { expression: "switchViewerMode('PHOTO_TOUR')" });
  await new Promise(r => setTimeout(r, 500));
  snap = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('R9D5_LOCAL_RETURN_PHOTO.png', snap.data);

  ws.close();
  browserProc.kill();
  console.log('\n✔ All R9D5 local screenshots captured.');
  process.exit(0);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  if (browserProc) browserProc.kill();
  process.exit(1);
});

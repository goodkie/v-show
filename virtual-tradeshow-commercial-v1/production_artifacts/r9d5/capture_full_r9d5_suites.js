const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r9d5';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ [SCREENSHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureUrlSuite(targetUrl, prefix) {
  const port = 9260 + (prefix === 'LOCAL' ? 0 : 1);
  console.log(`\n========================================`);
  console.log(`Capturing ${prefix} Suite from: ${targetUrl}`);
  console.log(`========================================`);

  const p = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1400,900',
    targetUrl
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });

    const targetTab = tabs.find(t => t.type === 'page' && t.url.includes('wilo-demo')) || tabs[0];
    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = ++id;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === curId) {
            ws.off('message', handler);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    // 0.5s
    let shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_00_5.png`, shot.data);

    // 2s
    await new Promise(r => setTimeout(r, 1500));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_02.png`, shot.data);

    // 5s
    await new Promise(r => setTimeout(r, 3000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_05.png`, shot.data);

    // 10s
    await new Promise(r => setTimeout(r, 5000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_10.png`, shot.data);

    // 15s
    await new Promise(r => setTimeout(r, 5000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_15.png`, shot.data);

    // Next
    await call('Runtime.evaluate', { expression: "nextPhotoView()" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_NEXT.png`, shot.data);

    // Thumbnail 3
    await call('Runtime.evaluate', { expression: "selectPhotoView(2)" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_${prefix === 'LOCAL' ? 'THUMB3' : 'THUMB'}.png`, shot.data);

    // 3D Pending
    await call('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
    await new Promise(r => setTimeout(r, 800));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_3D_PENDING.png`, shot.data);

    // Check mesh count
    const meshCheck = await call('Runtime.evaluate', {
      expression: `(() => {
        let count = 0;
        if (window.scene) { window.scene.traverse(o => { if (o.isMesh) count++; }); }
        return count;
      })()`,
      returnByValue: true
    });
    console.log(`${prefix} 3D Meshes in Scene:`, meshCheck.result.value);

    // Return to Photo
    await call('Runtime.evaluate', { expression: "switchViewerMode('PHOTO_TOUR')" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(`R9D5_${prefix}_RETURN_PHOTO.png`, shot.data);

    ws.close();
    p.kill();
  } catch (err) {
    console.error(`Error in ${prefix} capture:`, err);
    p.kill();
    throw err;
  }
}

async function runAll() {
  await captureUrlSuite('http://127.0.0.1:3000/wilo-demo.html', 'LOCAL');
  await captureUrlSuite('https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html', 'PROD');
  console.log('\n✔ All LOCAL and PRODUCTION captures completed successfully!');
  process.exit(0);
}

runAll().catch(e => {
  console.error('Fatal Error:', e);
  process.exit(1);
});

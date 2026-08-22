const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = 9255;
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r9d5';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ Saved ${name} (${(buf.length/1024).toFixed(1)} KB)`);
}

const p = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=' + cdpPort,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1400,900',
  'https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html'
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

    console.log('--- Phase 1: 15-Second Time Progression Captures ---');
    
    // 0.5s
    let shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_00_5.png', shot.data);

    // 2s
    await new Promise(r => setTimeout(r, 1500));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_02.png', shot.data);

    // 5s
    await new Promise(r => setTimeout(r, 3000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_05.png', shot.data);

    // 10s
    await new Promise(r => setTimeout(r, 5000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_10.png', shot.data);

    // 15s
    await new Promise(r => setTimeout(r, 5000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_15.png', shot.data);

    console.log('\n--- Phase 2: Navigation Interaction Captures ---');

    // Click Next
    await call('Runtime.evaluate', { expression: "nextPhotoView()" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_NEXT.png', shot.data);

    // Click Thumbnail 3 (Left Perspective Angle)
    await call('Runtime.evaluate', { expression: "selectPhotoView(2)" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_THUMB.png', shot.data);

    console.log('\n--- Phase 3: 3D Viewer Pending Mode Verification ---');

    // Switch to 3D Viewer mode
    await call('Runtime.evaluate', { expression: "switchViewerMode('3D_VIEWER')" });
    await new Promise(r => setTimeout(r, 1000));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_3D_PENDING.png', shot.data);

    // Verify scene mesh count is 0
    const meshCheck = await call('Runtime.evaluate', {
      expression: `(() => {
        let count = 0;
        if (window.scene) {
          window.scene.traverse(o => { if (o.isMesh) count++; });
        }
        return {
          meshCount: count,
          hasScene: !!window.scene,
          viewMode: window.__VIEW_MODE__,
          statusBanner: document.getElementById('wilo-view-name')?.textContent
        };
      })()`,
      returnByValue: true
    });
    console.log('3D Mode Inspection:', JSON.stringify(meshCheck.result.value, null, 2));

    // Return to Photo Tour
    console.log('\n--- Phase 4: Return to Photo Tour Mode ---');
    await call('Runtime.evaluate', { expression: "switchViewerMode('PHOTO_TOUR')" });
    await new Promise(r => setTimeout(r, 600));
    shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot('R9D5_PROD_RETURN_PHOTO.png', shot.data);

    ws.close();
    p.kill();
    console.log('\n==================================================');
    console.log('ALL PHASE 10.7N-R9D-5 VERIFICATIONS COMPLETE!');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    p.kill();
    process.exit(1);
  }
}, 3000);

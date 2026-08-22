const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c03';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[DNA_C03_PROD_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureAll() {
  console.log('=== STARTING dn’a-C03 MANDATORY PRODUCTION CAPTURES ===\n');

  const debugPort = 9346;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--no-sandbox', '--disable-gpu',
    '--window-size=1280,850',
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

  // 1. DNA_DIY_WELCOME.png
  console.log('--- 1. Welcome / Builder Overview ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-diy-haven-01` });
  await new Promise(r => setTimeout(r, 3000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_WELCOME.png', shot.data);

  // 2. DNA_DIY_COMPANY.png
  console.log('--- 2. Step 1: Company Profile ---');
  await call('Runtime.evaluate', { expression: 'goToStep(1)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_COMPANY.png', shot.data);

  // 3. DNA_DIY_SHOW.png
  console.log('--- 3. Step 2: Trade Show ---');
  await call('Runtime.evaluate', { expression: 'goToStep(2)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_SHOW.png', shot.data);

  // 4. DNA_DIY_PRODUCTS.png
  console.log('--- 4. Step 3: Products ---');
  await call('Runtime.evaluate', { expression: 'goToStep(3)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_PRODUCTS.png', shot.data);

  // 5. DNA_DIY_ASSETS.png
  console.log('--- 5. Step 4: Assets ---');
  await call('Runtime.evaluate', { expression: 'goToStep(4)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_ASSETS.png', shot.data);

  // 6. DNA_DIY_EXPERIENCE.png
  console.log('--- 6. Step 5: Experience Selection ---');
  await call('Runtime.evaluate', { expression: 'goToStep(5)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_EXPERIENCE.png', shot.data);

  // 7. DNA_DIY_TEMPLATE.png
  console.log('--- 7. Step 6: Template Selection & Hotspots ---');
  await call('Runtime.evaluate', { expression: 'goToStep(6)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_TEMPLATE.png', shot.data);

  // 8. DNA_DIY_PREVIEW.png
  console.log('--- 8. Step 7: Live Preview ---');
  await call('Runtime.evaluate', { expression: 'goToStep(7)' });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_PREVIEW.png', shot.data);

  // 9. DNA_DIY_PUBLISHED.png
  console.log('--- 9. Step 8: Published State & Live Links ---');
  await call('Runtime.evaluate', { expression: 'goToStep(8)' });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_PUBLISHED.png', shot.data);

  // 10. DNA_DIY_ANALYTICS.png
  console.log('--- 10. Realtime Exhibition Analytics ---');
  await call('Runtime.evaluate', { expression: 'document.getElementById("readiness-card").scrollIntoView()' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_ANALYTICS.png', shot.data);

  // 11. DNA_DIY_MANAGED_HANDOFF.png
  console.log('--- 11. DIY to Managed Handoff Modal ---');
  await call('Runtime.evaluate', { expression: 'openHandoffModal()' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_DIY_MANAGED_HANDOFF.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\n=== ALL 11 dn’a-C03 PRODUCTION SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

captureAll().catch(e => {
  console.error('Fatal capture error:', e);
  process.exit(1);
});

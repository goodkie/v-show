const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c03_1';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[DNA_C03_1_PROD_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureAll() {
  console.log('=== STARTING dn’a-C03.1 SALES-GRADE SHOWCASE CAPTURES ===\n');

  const debugPort = 9348;
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

  // 1. DNA_PREMIUM_LANDING.png
  console.log('--- 1. Premium Landing Page ---');
  await call('Page.navigate', { url: `${PROD_BASE}/index.html` });
  await new Promise(r => setTimeout(r, 2500));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PREMIUM_LANDING.png', shot.data);

  // 2. DNA_SHOWROOM_HERO.png
  console.log('--- 2. Showroom Hero View ---');
  await call('Page.navigate', { url: `${PROD_BASE}/demo.html` });
  await new Promise(r => setTimeout(r, 3500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_SHOWROOM_HERO.png', shot.data);

  // 3. DNA_SHOWROOM_OVERVIEW.png
  console.log('--- 3. Showroom Overview ---');
  await call('Runtime.evaluate', { expression: 'setPreset("OVERVIEW")' });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_SHOWROOM_OVERVIEW.png', shot.data);

  // 4. DNA_PRODUCT_ISLAND.png
  console.log('--- 4. Product Island Preset ---');
  await call('Runtime.evaluate', { expression: 'setPreset("ISLAND")' });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PRODUCT_ISLAND.png', shot.data);

  // 5. DNA_ROBOT_PRODUCT_CLOSEUP.png
  console.log('--- 5. Robot Product Close-up ---');
  await call('Runtime.evaluate', { expression: 'setPreset("ROBOT")' });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_ROBOT_PRODUCT_CLOSEUP.png', shot.data);

  // 6. DNA_PRODUCT_DETAIL_PREMIUM.png
  console.log('--- 6. Product Detail Drawer ---');
  await call('Runtime.evaluate', { expression: 'openProductDetail(PRODUCTS[0])' });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PRODUCT_DETAIL_PREMIUM.png', shot.data);

  // 7. DNA_CATALOG_PREMIUM.png
  console.log('--- 7. Premium 8-Product Catalog ---');
  await call('Runtime.evaluate', { expression: 'openPanel("catalog")' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_CATALOG_PREMIUM.png', shot.data);

  // 8. DNA_BRIEFCASE.png
  console.log('--- 8. Buyer Briefcase Drawer ---');
  await call('Runtime.evaluate', { expression: 'addToBriefcase("PROD-01-COBOT"); addToBriefcase("PROD-02-AMR"); openPanel("briefcase");' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_BRIEFCASE.png', shot.data);

  // 9. DNA_SMART_CARD_PREMIUM.png
  console.log('--- 9. Smart Exhibitor Card ---');
  await call('Page.navigate', { url: `${PROD_BASE}/card.html` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_SMART_CARD_PREMIUM.png', shot.data);

  // 10. DNA_PRODUCT_QR_MOBILE.png
  console.log('--- 10. Product QR Kit ---');
  await call('Page.navigate', { url: `${PROD_BASE}/qr.html` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PRODUCT_QR_MOBILE.png', shot.data);

  // 11. DNA_RFQ_PREMIUM.png
  console.log('--- 11. B2B Wholesale RFQ Experience ---');
  await call('Page.navigate', { url: `${PROD_BASE}/demo.html` });
  await new Promise(r => setTimeout(r, 3000));
  await call('Runtime.evaluate', { expression: 'openPanel("rfq")' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_RFQ_PREMIUM.png', shot.data);

  // 12. DNA_ANALYTICS_PREMIUM.png
  console.log('--- 12. Demo Exhibitor Analytics ---');
  await call('Runtime.evaluate', { expression: 'openPanel("analytics")' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_ANALYTICS_PREMIUM.png', shot.data);

  // 13. DNA_AFTER_SHOW.png
  console.log('--- 13. Post-Show ROI Section ---');
  await call('Page.navigate', { url: `${PROD_BASE}/index.html` });
  await new Promise(r => setTimeout(r, 2000));
  await call('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight * 0.7)' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_AFTER_SHOW.png', shot.data);

  // 14. DNA_MOBILE_LANDING.png
  console.log('--- 14. Mobile Viewport Landing ---');
  await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await call('Page.navigate', { url: `${PROD_BASE}/index.html` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_MOBILE_LANDING.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\n=== ALL 14 dn’a-C03.1 PRODUCTION SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

captureAll().catch(e => {
  console.error('Fatal capture error:', e);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c04';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[DNA_C04_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function run() {
  console.log('=== STARTING dn’a-C04 16 PRODUCTION SCREENSHOT CAPTURES ===\n');

  const debugPort = 9366;
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + debugPort,
    '--no-sandbox', '--disable-gpu',
    '--window-size=1440,900',
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

  let id = 1;
  const callbacks = {};

  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && callbacks[msg.id]) {
      callbacks[msg.id](msg.result);
      delete callbacks[msg.id];
    }
  });

  function send(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      callbacks[msgId] = resolve;
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');

  async function navigate(url, waitMs = 3500) {
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs));
  }

  async function evalJs(expr) {
    return await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  }

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    saveShot(filename, res.data);
  }

  async function setViewport(width, height, isMobile = false, scale = 1) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile: isMobile
    });
  }

  const BASE = 'https://v-show-commercial-v1-production.up.railway.app';

  // 1. DNA_C04_LANDING_DESKTOP.png
  console.log('--- 1. DNA_C04_LANDING_DESKTOP ---');
  await setViewport(1440, 900);
  await navigate(BASE + '/', 4000);
  await snap('DNA_C04_LANDING_DESKTOP.png');

  // 2. DNA_C04_LANDING_MOBILE.png
  console.log('--- 2. DNA_C04_LANDING_MOBILE ---');
  await setViewport(390, 844, true, 2);
  await navigate(BASE + '/', 3500);
  await snap('DNA_C04_LANDING_MOBILE.png');

  // Restore Desktop Viewport
  await setViewport(1440, 900, false, 1);

  // 3. DNA_C04_SHOWCASE_ENTRY.png
  console.log('--- 3. DNA_C04_SHOWCASE_ENTRY ---');
  await navigate(BASE + '/', 3000);
  await evalJs("window.scrollTo(0, 150)");
  await new Promise(r => setTimeout(r, 800));
  await snap('DNA_C04_SHOWCASE_ENTRY.png');

  // 4. DNA_C04_PREMIUM_3D_OVERVIEW.png
  console.log('--- 4. DNA_C04_PREMIUM_3D_OVERVIEW ---');
  await navigate(BASE + '/demo.html?preset=overview', 5500);
  await snap('DNA_C04_PREMIUM_3D_OVERVIEW.png');

  // 5. DNA_C04_PREMIUM_3D_PRODUCT_AREA.png
  console.log('--- 5. DNA_C04_PREMIUM_3D_PRODUCT_AREA ---');
  await evalJs("setPreset('ISLAND')");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_C04_PREMIUM_3D_PRODUCT_AREA.png');

  // 6. DNA_C04_PREMIUM_3D_MEETING_AREA.png
  console.log('--- 6. DNA_C04_PREMIUM_3D_MEETING_AREA ---');
  await evalJs("setPreset('LOUNGE')");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_C04_PREMIUM_3D_MEETING_AREA.png');

  // 7. DNA_C04_PRODUCT_HOTSPOT.png
  console.log('--- 7. DNA_C04_PRODUCT_HOTSPOT ---');
  await evalJs("setPreset('OVERVIEW')");
  await new Promise(r => setTimeout(r, 1800));
  await snap('DNA_C04_PRODUCT_HOTSPOT.png');

  // 8. DNA_C04_PRODUCT_DETAIL.png
  console.log('--- 8. DNA_C04_PRODUCT_DETAIL ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-01-COBOT'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_C04_PRODUCT_DETAIL.png');

  // 9. DNA_C04_DIGITAL_CATALOG.png
  console.log('--- 9. DNA_C04_DIGITAL_CATALOG ---');
  await evalJs("openPanel('catalog')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_C04_DIGITAL_CATALOG.png');

  // 10. DNA_C04_SMART_CARD.png
  console.log('--- 10. DNA_C04_SMART_CARD ---');
  await navigate(BASE + '/card.html', 3000);
  await snap('DNA_C04_SMART_CARD.png');

  // 11. DNA_C04_PRODUCT_QR.png
  console.log('--- 11. DNA_C04_PRODUCT_QR ---');
  await navigate(BASE + '/qr.html', 3000);
  await snap('DNA_C04_PRODUCT_QR.png');

  // 12. DNA_C04_BRIEFCASE.png
  console.log('--- 12. DNA_C04_BRIEFCASE ---');
  await navigate(BASE + '/demo.html', 4000);
  await evalJs("addToBriefcase('PROD-01-COBOT'); addToBriefcase('PROD-02-AMR'); openPanel('briefcase');");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_C04_BRIEFCASE.png');

  // 13. DNA_C04_RFQ.png
  console.log('--- 13. DNA_C04_RFQ ---');
  await evalJs("openPanel('rfq')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_C04_RFQ.png');

  // 14. DNA_C04_SAMPLE_REQUEST.png
  console.log('--- 14. DNA_C04_SAMPLE_REQUEST ---');
  await evalJs("openPanel('sample')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_C04_SAMPLE_REQUEST.png');

  // 15. DNA_C04_APPOINTMENT.png
  console.log('--- 15. DNA_C04_APPOINTMENT ---');
  await evalJs("openPanel('meeting')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_C04_APPOINTMENT.png');

  // 16. DNA_C04_MANAGED_ORDER.png
  console.log('--- 16. DNA_C04_MANAGED_ORDER ---');
  await navigate(BASE + '/start.html', 3500);
  await snap('DNA_C04_MANAGED_ORDER.png');

  ws.close();
  proc.kill();
  console.log('\n=== ALL 16 dn’a-C04 PRODUCTION SCREENSHOTS CAPTURED SUCCESSFULLY ===');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });

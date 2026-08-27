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
  console.log(`[DNA_C03_1_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function run() {
  console.log('=== STARTING dn’a-C03.1 PHOTOREALISTIC COMMERCIAL SHOWCASE 17 CAPTURES ===\n');

  const debugPort = 9355;
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

  // 1. DNA_LANDING_PHOTOREAL_HERO.png
  console.log('--- 1. DNA_LANDING_PHOTOREAL_HERO ---');
  await setViewport(1440, 900);
  await navigate(BASE + '/', 4000);
  await snap('DNA_LANDING_PHOTOREAL_HERO.png');

  // 2. DNA_LANDING_HERO_DESKTOP.png
  console.log('--- 2. DNA_LANDING_HERO_DESKTOP ---');
  await evalJs("window.scrollTo(0, 100)");
  await new Promise(r => setTimeout(r, 800));
  await snap('DNA_LANDING_HERO_DESKTOP.png');

  // 3. DNA_LANDING_HERO_MOBILE.png
  console.log('--- 3. DNA_LANDING_HERO_MOBILE ---');
  await setViewport(390, 844, true, 2);
  await navigate(BASE + '/', 3500);
  await snap('DNA_LANDING_HERO_MOBILE.png');

  // Restore Desktop Viewport
  await setViewport(1440, 900, false, 1);

  // 4. DNA_PHOTOREAL_SHOWROOM_OVERVIEW.png
  console.log('--- 4. DNA_PHOTOREAL_SHOWROOM_OVERVIEW ---');
  await navigate(BASE + '/demo.html?preset=overview', 5500);
  await snap('DNA_PHOTOREAL_SHOWROOM_OVERVIEW.png');

  // 5. DNA_PRODUCT_ISLAND_REALISTIC.png
  console.log('--- 5. DNA_PRODUCT_ISLAND_REALISTIC ---');
  await evalJs("setPreset('ISLAND')");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_PRODUCT_ISLAND_REALISTIC.png');

  // 6. DNA_AUTOMATION_WALL_REALISTIC.png
  console.log('--- 6. DNA_AUTOMATION_WALL_REALISTIC ---');
  await evalJs("setPreset('AUTOMATION')");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_AUTOMATION_WALL_REALISTIC.png');

  // 7. DNA_ROBOT_CELL_REALISTIC.png
  console.log('--- 7. DNA_ROBOT_CELL_REALISTIC ---');
  await evalJs("setPreset('ROBOT')");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_ROBOT_CELL_REALISTIC.png');

  // 8. DNA_COBOT_CLOSEUP.png
  console.log('--- 8. DNA_COBOT_CLOSEUP ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-01-COBOT'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_COBOT_CLOSEUP.png');

  // 9. DNA_AMR_CLOSEUP.png
  console.log('--- 9. DNA_AMR_CLOSEUP ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-02-AMR'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_AMR_CLOSEUP.png');

  // 10. DNA_FLOWDRIVE_CLOSEUP.png
  console.log('--- 10. DNA_FLOWDRIVE_CLOSEUP ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-05-FLOWDRIVE'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_FLOWDRIVE_CLOSEUP.png');

  // 11. DNA_LASERCELL_CLOSEUP.png
  console.log('--- 11. DNA_LASERCELL_CLOSEUP ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-08-LASERCELL'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 2200));
  await snap('DNA_LASERCELL_CLOSEUP.png');

  // 12. DNA_PRODUCT_DETAIL_LIVE.png
  console.log('--- 12. DNA_PRODUCT_DETAIL_LIVE ---');
  await evalJs("const p = PRODUCTS.find(x => x.id === 'PROD-01-COBOT'); openProductDetail(p);");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_PRODUCT_DETAIL_LIVE.png');

  // 13. DNA_DIGITAL_CATALOG_LIVE.png
  console.log('--- 13. DNA_DIGITAL_CATALOG_LIVE ---');
  await evalJs("openPanel('catalog')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_DIGITAL_CATALOG_LIVE.png');

  // 14. DNA_BRIEFCASE_LIVE.png
  console.log('--- 14. DNA_BRIEFCASE_LIVE ---');
  await evalJs("addToBriefcase('PROD-01-COBOT'); addToBriefcase('PROD-02-AMR'); openPanel('briefcase');");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_BRIEFCASE_LIVE.png');

  // 15. DNA_SMART_CARD_LIVE.png
  console.log('--- 15. DNA_SMART_CARD_LIVE ---');
  await navigate(BASE + '/card.html', 3000);
  await snap('DNA_SMART_CARD_LIVE.png');

  // 16. DNA_RFQ_LIVE.png
  console.log('--- 16. DNA_RFQ_LIVE ---');
  await navigate(BASE + '/demo.html#rfq', 4000);
  await evalJs("openPanel('rfq')");
  await new Promise(r => setTimeout(r, 1500));
  await snap('DNA_RFQ_LIVE.png');

  // 17. DNA_MOBILE_SHOWROOM.png
  console.log('--- 17. DNA_MOBILE_SHOWROOM ---');
  await setViewport(390, 844, true, 2);
  await navigate(BASE + '/demo.html', 4500);
  await snap('DNA_MOBILE_SHOWROOM.png');

  ws.close();
  proc.kill();
  console.log('\n=== ALL 17 PRODUCTION SCREENSHOTS CAPTURED SUCCESSFULLY ===');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });

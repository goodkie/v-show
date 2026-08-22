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
  console.log(`[DNA_C04_PROD_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureAll() {
  console.log('=== STARTING dn’a-C04 MANDATORY PRODUCTION CAPTURES ===\n');

  const debugPort = 9347;
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

  // 1. Pilot 1: Haven & Oak Booth
  console.log('--- 1. Pilot #1 Haven & Oak Furniture ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-pilot-01-haven` });
  await new Promise(r => setTimeout(r, 3000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_01_HAVEN_BOOTH.png', shot.data);

  // 2. Pilot 2: Maison Nova Managed Handoff
  console.log('--- 2. Pilot #2 Maison Nova (Managed Handoff) ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-pilot-02-nova` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_02_NOVA_HANDOFF.png', shot.data);

  // 3. Pilot 3: Lumina Craft ASD
  console.log('--- 3. Pilot #3 Lumina Craft (ASD Market Week) ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-pilot-03-lumina` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_03_LUMINA_ASD.png', shot.data);

  // 4. Pilot 4: Atlantica Living
  console.log('--- 4. Pilot #4 Atlantica Living Home Decor ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-pilot-04-atlantica` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_04_ATLANTICA_CRM.png', shot.data);

  // 5. Pilot 5: Textura Mill Works
  console.log('--- 5. Pilot #5 Textura Mill Works ---');
  await call('Page.navigate', { url: `${PROD_BASE}/builder.html?id=proj-pilot-05-textura` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_05_TEXTURA_FABRIC.png', shot.data);

  // 6. Lead Inbox: All Leads
  console.log('--- 6. Exhibitor Lead Inbox (All Leads) ---');
  await call('Page.navigate', { url: `${PROD_BASE}/leads.html?id=proj-pilot-01-haven` });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_LEAD_INBOX_ALL.png', shot.data);

  // 7. Lead Detail Drawer Modal
  console.log('--- 7. Lead Detail Drawer Modal ---');
  await call('Runtime.evaluate', { expression: 'openLeadModal("lead-p1-01")' });
  await new Promise(r => setTimeout(r, 1000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_LEAD_DETAIL_DRAWER.png', shot.data);

  // 8. Exhibitor Analytics & Funnel
  console.log('--- 8. Exhibitor Analytics & Funnel ---');
  await call('Runtime.evaluate', { expression: 'closeModal()' });
  await new Promise(r => setTimeout(r, 500));
  await call('Page.navigate', { url: `${PROD_BASE}/leads.html?id=proj-pilot-03-lumina` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_EXHIBITOR_ANALYTICS.png', shot.data);

  // 9. Post-Show Report
  console.log('--- 9. Post-Show Summary Report ---');
  await call('Page.navigate', { url: `${PROD_BASE}/leads.html?id=proj-pilot-05-textura` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_POST_SHOW_REPORT.png', shot.data);

  // 10. Pilot Feedback Summary
  console.log('--- 10. Pilot Feedback & UX Blocker Summary ---');
  await call('Page.navigate', { url: `${PROD_BASE}/leads.html?id=proj-pilot-02-nova` });
  await new Promise(r => setTimeout(r, 2000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PILOT_FEEDBACK_SUMMARY.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\n=== ALL 10 dn’a-C04 PRODUCTION SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

captureAll().catch(e => {
  console.error('Fatal capture error:', e);
  process.exit(1);
});

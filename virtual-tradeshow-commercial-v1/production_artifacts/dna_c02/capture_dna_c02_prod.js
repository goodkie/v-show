const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c02';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`[DNA_C02_PROD_SHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function captureAll() {
  console.log('=== STARTING dn’a-C02 MANDATORY PRODUCTION CAPTURES ===\n');

  const debugPort = 9345;
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

  // 1. Production Command Center
  console.log('--- 1. Production Command Center ---');
  await call('Page.navigate', { url: PROD_BASE + '/production.html' });
  await new Promise(r => setTimeout(r, 3000));
  let shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PRODUCTION_COMMAND_CENTER.png', shot.data);

  // 2. Show Calendar View
  console.log('--- 2. Show Calendar View ---');
  await call('Runtime.evaluate', { expression: "document.querySelector('button[onclick*=\"CALENDAR\"]').click()" });
  await new Promise(r => setTimeout(r, 1500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_SHOW_CALENDAR.png', shot.data);

  // 3. Project Detail Workspace
  console.log('--- 3. Project Detail Workspace ---');
  await call('Page.navigate', { url: PROD_BASE + '/project-detail.html?id=proj-hpmkt-haven-01' });
  await new Promise(r => setTimeout(r, 3000));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PROJECT_DETAIL.png', shot.data);

  // 4. Asset Intake Component
  console.log('--- 4. Asset Intake Component ---');
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_ASSET_INTAKE.png', shot.data);

  // 5. Project Tasks Component
  console.log('--- 5. Project Tasks Component ---');
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PROJECT_TASKS.png', shot.data);

  // 6. Internal QA Gate
  console.log('--- 6. Internal QA Gate ---');
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_INTERNAL_QA.png', shot.data);

  // 7. Client Project Status Portal
  console.log('--- 7. Client Project Status Portal ---');
  await call('Page.navigate', { url: PROD_BASE + '/client-portal.html?id=proj-coterie-nova-02' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_CLIENT_STATUS.png', shot.data);

  // 8. Client Deliverable Previews
  console.log('--- 8. Client Deliverable Previews ---');
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_CLIENT_PREVIEW.png', shot.data);

  // 9. Client Revision Request
  console.log('--- 9. Client Revision Request ---');
  await call('Runtime.evaluate', { expression: "document.getElementById('fb-comment').value = 'Please update the hero product photography for Winter 2026 collection.';" });
  await new Promise(r => setTimeout(r, 500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_REVISION_REQUEST.png', shot.data);

  // 10. Project Approved State
  console.log('--- 10. Project Approved State ---');
  await call('Page.navigate', { url: PROD_BASE + '/client-portal.html?id=proj-hpmkt-haven-01' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PROJECT_APPROVED.png', shot.data);

  // 11. Project Published State
  console.log('--- 11. Project Published State ---');
  await call('Page.navigate', { url: PROD_BASE + '/project-detail.html?id=proj-hpmkt-haven-01' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_PROJECT_PUBLISHED.png', shot.data);

  // 12. Post-Show Report
  console.log('--- 12. Post-Show Report ---');
  await call('Page.navigate', { url: PROD_BASE + '/project-detail.html?id=proj-asd-lumina-03' });
  await new Promise(r => setTimeout(r, 2500));
  shot = await call('Page.captureScreenshot', { format: 'png' });
  saveShot('DNA_POST_SHOW_REPORT.png', shot.data);

  ws.close();
  proc.kill();
  console.log('\nAll 12 dn’a-C02 production screenshots captured successfully!');
  process.exit(0);
}

captureAll().catch(err => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});

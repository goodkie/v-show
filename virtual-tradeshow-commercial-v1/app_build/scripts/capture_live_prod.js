const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c04';

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(geminiDir, name), buf);
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  console.log(`[SAVED] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

async function run() {
  console.log('=== CAPTURING LIVE PRODUCTION URLS ===');
  const debugPort = 9377;
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
    const msg = JSON.parse(data.toString());
    if (msg.id && callbacks[msg.id]) callbacks[msg.id](msg);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = id++;
    callbacks[msgId] = res => {
      if (res.error) reject(res.error);
      else resolve(res.result);
    };
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  // 1. Landing Page Live
  console.log('1. Capturing Live Landing Page...');
  await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/' });
  await new Promise(r => setTimeout(r, 4000));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('04_PRODUCTION_LIVE_LANDING_VERIFIED.png', shot.data);

  // 2. Demo Showroom Live
  console.log('2. Capturing Live 3D Showroom Demo...');
  await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/demo.html' });
  await new Promise(r => setTimeout(r, 5000));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  saveShot('05_PRODUCTION_LIVE_DEMO_VERIFIED.png', shot.data);

  ws.close();
  proc.kill();
  console.log('=== ALL LIVE PRODUCTION SCREENSHOTS CAPTURED ===');
}

run().catch(console.error);

const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
const { spawn } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9401;
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

const proc = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=' + debugPort,
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-software-rasterizer',
  '--window-size=1440,900',
  'about:blank'
]);

setTimeout(async () => {
  let tabs;
  for (let i = 0; i < 5; i++) {
    try {
      tabs = await new Promise((r, j) => http.get('http://127.0.0.1:' + debugPort + '/json', res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b)));
      }).on('error', j));
      break;
    } catch(e) { await new Promise(r => setTimeout(r, 500)); }
  }

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const send = (m, p={}) => new Promise((res, rej) => {
    const i = id++;
    const handler = d => {
      const msg = JSON.parse(d.toString());
      if (msg.id === i) { ws.off('message', handler); if (msg.error) rej(msg.error); else res(msg.result); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });

  ws.on('open', async () => {
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // === 1. Landing Page ===
    console.log('1. Landing Page...');
    await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 7000));
    
    let e = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ THREE: typeof THREE, THREE_ver: typeof THREE !== "undefined" ? THREE.REVISION : null, hasCanvas: !!document.getElementById("hero-3d-canvas"), canvasW: document.getElementById("hero-3d-canvas")?.clientWidth })',
      returnByValue: true
    });
    console.log('Landing EVAL:', e.result.value);

    let shot = await send('Page.captureScreenshot', { format: 'png' });
    let buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png', buf);
    console.log('  -> 04_PRODUCTION_LIVE_LANDING_VERIFIED.png saved (' + buf.length + ' bytes)');

    // === 2. Demo 3D Showroom ===
    console.log('2. Demo 3D Showroom...');
    await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/demo.html?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 7000));

    e = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ THREE: typeof THREE, THREE_ver: typeof THREE !== "undefined" ? THREE.REVISION : null, hasCanvas: !!document.querySelector("canvas"), hotspots: document.querySelectorAll(".hotspot-tag").length })',
      returnByValue: true
    });
    console.log('Demo EVAL:', e.result.value);

    shot = await send('Page.captureScreenshot', { format: 'png' });
    buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png', buf);
    console.log('  -> 05_PRODUCTION_LIVE_DEMO_VERIFIED.png saved (' + buf.length + ' bytes)');

    ws.close();
    proc.kill();
    console.log('Done.');
  });
}, 2000);

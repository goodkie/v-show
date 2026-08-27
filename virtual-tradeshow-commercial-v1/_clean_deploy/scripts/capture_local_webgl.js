const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
const { spawn } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9402;
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

// Launch Chrome with GPU support (non-headless or headless=new with gpu)
const proc = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=' + debugPort,
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-features=Vulkan',
  '--window-size=1440,900',
  'about:blank'
]);

proc.stderr.on('data', d => {
  const t = d.toString();
  if (t.includes('ERROR') || t.includes('WebGL') || t.includes('GPU')) {
    console.log('[chrome-err]', t.trim().slice(0, 120));
  }
});

setTimeout(async () => {
  let tabs;
  for (let i = 0; i < 8; i++) {
    try {
      tabs = await new Promise((r, j) => http.get('http://127.0.0.1:' + debugPort + '/json', res => {
        let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b)));
      }).on('error', j));
      if (tabs && tabs.length) break;
    } catch(e) {}
    await new Promise(r => setTimeout(r, 700));
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
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // === LOCAL: Landing Page (uses local vendor three.min.js) ===
    console.log('1. LOCAL Landing Page...');
    await send('Page.navigate', { url: 'http://localhost:3000/?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 8000));

    let e = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ THREE: typeof THREE, rev: typeof THREE !== "undefined" ? THREE.REVISION : null, canvas: !!document.getElementById("hero-3d-canvas"), w: document.getElementById("hero-3d-canvas")?.clientWidth })',
      returnByValue: true
    });
    console.log('LOCAL Landing EVAL:', e.result.value);

    let shot = await send('Page.captureScreenshot', { format: 'png' });
    let buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png', buf);
    console.log('Saved landing screenshot:', buf.length, 'bytes');

    // === LOCAL: Demo Showroom ===
    console.log('2. LOCAL Demo 3D Showroom...');
    await send('Page.navigate', { url: 'http://localhost:3000/demo.html?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 8000));

    e = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ THREE: typeof THREE, rev: typeof THREE !== "undefined" ? THREE.REVISION : null, canvas: !!document.querySelector("canvas"), hotspots: document.querySelectorAll(".hotspot-tag").length, loader_gone: !document.getElementById("intro-loader") })',
      returnByValue: true
    });
    console.log('LOCAL Demo EVAL:', e.result.value);

    shot = await send('Page.captureScreenshot', { format: 'png' });
    buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png', buf);
    console.log('Saved demo screenshot:', buf.length, 'bytes');

    ws.close();
    proc.kill();
    console.log('Done.');
  });
}, 3000);

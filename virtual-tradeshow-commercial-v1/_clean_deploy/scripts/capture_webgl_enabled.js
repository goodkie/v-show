const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
const { spawn } = require('child_process');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9395;
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/dna_c04';

// Enable WebGL in headless Chrome
const proc = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=' + debugPort,
  '--no-sandbox',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--use-gl=angle',
  '--use-angle=d3d11',
  '--window-size=1440,900',
  'about:blank'
]);

setTimeout(async () => {
  const tabs = await new Promise(r => http.get('http://127.0.0.1:' + debugPort + '/json', res => {
    let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b)));
  }));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const send = (m, p={}) => new Promise((res, rej) => {
    const i = id++;
    const handler = d => {
      const msg = JSON.parse(d.toString());
      if (msg.id === i) {
        ws.off('message', handler);
        if (msg.error) rej(msg.error);
        else res(msg.result);
      }
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

    // 1. Landing Page
    console.log('1. Navigating to landing page...');
    await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 6000));

    let evalRes = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ hasThree: typeof THREE !== "undefined", hasOrbit: typeof THREE !== "undefined" && typeof THREE.OrbitControls !== "undefined", canvasW: document.getElementById("hero-3d-canvas")?.clientWidth })',
      returnByValue: true
    });
    console.log('Landing EVAL:', evalRes.result.value);

    let shot = await send('Page.captureScreenshot', { format: 'png' });
    let buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png', buf);
    fs.writeFileSync(artifactsDir + '/04_PRODUCTION_LIVE_LANDING_VERIFIED.png', buf);
    console.log('Saved 04_PRODUCTION_LIVE_LANDING_VERIFIED.png (', buf.length, 'bytes )');

    // 2. Demo Showroom
    console.log('2. Navigating to 3D showroom demo...');
    await send('Page.navigate', { url: 'https://v-show-commercial-v1-production.up.railway.app/demo.html?_t=' + Date.now() });
    await new Promise(r => setTimeout(r, 6000));

    evalRes = await send('Runtime.evaluate', {
      expression: 'JSON.stringify({ hasThree: typeof THREE !== "undefined", hasCanvas: !!document.querySelector("canvas"), numHotspots: document.querySelectorAll(".hotspot-tag").length })',
      returnByValue: true
    });
    console.log('Demo EVAL:', evalRes.result.value);

    shot = await send('Page.captureScreenshot', { format: 'png' });
    buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(geminiDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png', buf);
    fs.writeFileSync(artifactsDir + '/05_PRODUCTION_LIVE_DEMO_VERIFIED.png', buf);
    console.log('Saved 05_PRODUCTION_LIVE_DEMO_VERIFIED.png (', buf.length, 'bytes )');

    ws.close();
    proc.kill();
  });
}, 2000);

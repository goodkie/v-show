const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r10_2e';
const expQaDir = 'C:/Users/vivPR/vshow-reconstruction/wilo-authentic-experiment-01/qa';
const geminiDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
fs.mkdirSync(artifactsDir, { recursive: true });
fs.mkdirSync(expQaDir, { recursive: true });

function saveShot(name, dataBase64) {
  const buf = Buffer.from(dataBase64, 'base64');
  fs.writeFileSync(path.join(artifactsDir, name), buf);
  fs.writeFileSync(path.join(expQaDir, name), buf);
  fs.writeFileSync(path.join(geminiDir, name), buf);
  console.log(`✔ [SCREENSHOT] ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
}

const presets = [
  { name: 'R10_2E_FRONT.png', preset: 'front' },
  { name: 'R10_2E_LEFT.png', preset: 'left' },
  { name: 'R10_2E_RIGHT.png', preset: 'right' },
  { name: 'R10_2E_CLOSE.png', preset: 'close' }
];

async function capturePreset(presetObj, port) {
  const targetUrl = `http://127.0.0.1:3000/diagnostics/wilo-spz-only.html?preset=${presetObj.preset}&model=/assets/demo/wilo/diagnostics/WILO_AUTHENTIC_PARTIAL_EXPERIMENT_01.spz`;
  console.log(`Capturing ${presetObj.name} from: ${targetUrl}`);

  const p = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1400,900',
    targetUrl
  ]);

  await new Promise(r => setTimeout(r, 2500));

  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });

    const targetTab = tabs.find(t => t.type === 'page') || tabs[0];
    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = ++id;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === curId) {
            ws.off('message', handler);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    // Wait 2.5s for SPZ decode & render
    await new Promise(r => setTimeout(r, 2500));

    const shot = await call('Page.captureScreenshot', { format: 'png' });
    saveShot(presetObj.name, shot.data);

    ws.close();
    p.kill();
  } catch (err) {
    console.error(`Error in ${presetObj.name}:`, err);
    p.kill();
    throw err;
  }
}

async function run() {
  for (let i = 0; i < presets.length; i++) {
    await capturePreset(presets[i], 9290 + i);
  }
  console.log('✔ All 4 diagnostic viewer camera presets captured successfully.');
  process.exit(0);
}

run().catch(e => {
  console.error('Fatal capture error:', e);
  process.exit(1);
});

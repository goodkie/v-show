const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
  const server = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0].replace(/^\/+/, '');
    let filePath = path.join(root, cleanUrl || 'index.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found: ' + filePath);
      return;
    }
    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.ksplat': 'application/octet-stream',
      '.splat': 'application/octet-stream',
      '.ply': 'application/octet-stream'
    };
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  }).listen(3947);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('[PAGE CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.toString()));

  const testHtml = `<!DOCTYPE html>
<html>
<head>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js",
    "@mkkellogg/gaussian-splats-3d": "https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.3/build/gaussian-splats-3d.module.js"
  }
}
</script>
</head>
<body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#000;">
<div id="splat-root" style="width:100%;height:100%;"></div>
<script type="module">
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

async function main() {
  console.log('Init viewer...');
  const viewer = new GaussianSplats3D.Viewer({
    rootElement: document.getElementById('splat-root'),
    showLoadingUI: false,
    sharedMemoryForWorkers: false,
    dynamicScene: false,
    webXRMode: GaussianSplats3D.WebXRMode.None,
    renderMode: GaussianSplats3D.RenderMode.Always,
    sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
    cameraUp: [0, 1, 0],
    initialCameraPosition: [0, 2, 5],
    initialCameraLookAt: [0, 1, 0]
  });

  viewer.start();
  console.log('Viewer started. Adding splat scene...');
  try {
    await viewer.addSplatScene('/assets/splat/demo_booth.ksplat', {
      progressiveLoad: true
    });
    console.log('Splat scene added successfully!');
  } catch (e) {
    console.error('Failed to add splat scene:', e);
  }
}
main();
</script>
</body>
</html>`;

  fs.writeFileSync('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/test-splat-simple.html', testHtml);

  await page.goto('http://localhost:3947/test-splat-simple.html', { waitUntil: 'networkidle2' });
  await sleep(6000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/169_TEST_GAUSSIAN_SPLAT.png' });
  console.log('Screenshot saved: 169_TEST_GAUSSIAN_SPLAT.png');

  await browser.close();
  server.close();
})();

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const root = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client';
  const server = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0].replace(/^\/+/, '');
    let filePath = path.join(root, cleanUrl || 'demo.html');
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
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(3946);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();

  // 1. 3DGS Viewer Desktop
  await page.setViewport({ width: 1440, height: 900 });
  console.log('Testing 3DGS Desktop demo-splat.html ...');
  await page.goto('http://localhost:3946/demo-splat.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/164_3DGS_REAL3D_DESKTOP.png' });
  console.log('Saved 164_3DGS_REAL3D_DESKTOP.png');

  // 2. Mobile Portrait (Overlay should appear)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  console.log('Testing Mobile Portrait Rotate Overlay ...');
  await page.goto('http://localhost:3946/demo-splat.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/165_MOBILE_PORTRAIT_OVERLAY.png' });
  console.log('Saved 165_MOBILE_PORTRAIT_OVERLAY.png');

  // 3. Mobile Landscape (3DGS - Left vertical tray + right 3D viewport)
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true });
  console.log('Testing 3DGS Mobile Landscape Left Tray ...');
  await page.goto('http://localhost:3946/demo-splat.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/166_3DGS_MOBILE_LANDSCAPE_LEFT_TRAY.png' });
  console.log('Saved 166_3DGS_MOBILE_LANDSCAPE_LEFT_TRAY.png');

  // 4. Matterport Mobile Landscape
  console.log('Testing Matterport Mobile Landscape Left Tray ...');
  await page.goto('http://localhost:3946/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/167_MATTERPORT_MOBILE_LANDSCAPE_LEFT_TRAY.png' });
  console.log('Saved 167_MATTERPORT_MOBILE_LANDSCAPE_LEFT_TRAY.png');

  // 5. 3D Showroom Mobile Landscape
  console.log('Testing Showroom Mobile Landscape Left Tray ...');
  await page.goto('http://localhost:3946/demo.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/168_SHOWROOM_MOBILE_LANDSCAPE_LEFT_TRAY.png' });
  console.log('Saved 168_SHOWROOM_MOBILE_LANDSCAPE_LEFT_TRAY.png');

  await browser.close();
  server.close();
  console.log('ALL 5 MOBILE & 3DGS VERIFICATION SCREENSHOTS CAPTURED!');
})();

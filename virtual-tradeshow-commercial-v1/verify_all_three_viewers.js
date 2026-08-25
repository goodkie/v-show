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
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(3945);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Matterport 64K Viewer
  console.log('Testing demo-matterport.html ...');
  await page.goto('http://localhost:3945/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/160_MATTERPORT_ENLARGED_CAPSULES.png' });
  console.log('Captured 160_MATTERPORT_ENLARGED_CAPSULES.png');

  // 2. 3D Showroom
  console.log('Testing demo.html ...');
  await page.goto('http://localhost:3945/demo.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/161_SHOWROOM_ENLARGED_CAPSULES.png' });
  console.log('Captured 161_SHOWROOM_ENLARGED_CAPSULES.png');

  // 3. 3DGS Radiance Field Viewer (3dgs.mp4)
  console.log('Testing demo-splat.html ...');
  await page.goto('http://localhost:3945/demo-splat.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/162_3DGS_SPLAT_VIEWER_MAIN.png' });
  console.log('Captured 162_3DGS_SPLAT_VIEWER_MAIN.png');

  // Click on Vector AMR in 3DGS
  console.log('Clicking AMR card in 3DGS viewer...');
  await page.click('#pcard-1');
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/163_3DGS_AMR_DRAWER.png' });
  console.log('Captured 163_3DGS_AMR_DRAWER.png');

  await browser.close();
  server.close();
  console.log('All 4 test screenshots captured successfully!');
})();

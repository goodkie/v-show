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
  }).listen(3948);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();

  // 1. 3DGS Clean Desktop
  await page.setViewport({ width: 1440, height: 900 });
  console.log('1. Capturing 3DGS demo-splat.html clean 50% capsules...');
  await page.goto('http://localhost:3948/demo-splat.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/170_SPLAT_DESKTOP_CLEAN_50PCT.png' });
  console.log('Saved 170_SPLAT_DESKTOP_CLEAN_50PCT.png');

  // 2. Matterport 64K
  console.log('2. Capturing Matterport demo-matterport.html 50% capsules...');
  await page.goto('http://localhost:3948/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/171_MATTERPORT_DESKTOP_50PCT.png' });
  console.log('Saved 171_MATTERPORT_DESKTOP_50PCT.png');

  // 3. 3D Showroom
  console.log('3. Capturing Showroom demo.html 50% capsules...');
  await page.goto('http://localhost:3948/demo.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/172_SHOWROOM_DESKTOP_50PCT.png' });
  console.log('Saved 172_SHOWROOM_DESKTOP_50PCT.png');

  // 4. Mobile Landscape Drawer Open (Verifying full uncropped image)
  await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true });
  console.log('4. Capturing Mobile Landscape Drawer Open...');
  await page.goto('http://localhost:3948/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.click('#pcard-1'); // Open Vector AMR
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/173_DRAWER_CONTAIN_IMAGE_MOBILE.png' });
  console.log('Saved 173_DRAWER_CONTAIN_IMAGE_MOBILE.png');

  await browser.close();
  server.close();
  console.log('ALL VERIFICATION SCREENSHOTS CAPTURED!');
})();

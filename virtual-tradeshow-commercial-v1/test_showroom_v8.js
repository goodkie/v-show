const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // Start simple static file server on 3939
  const server = http.createServer((req, res) => {
    let filePath = path.join('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client', req.url.split('?')[0]);
    if (filePath.endsWith('/') || filePath.endsWith('\\')) filePath += 'demo.html';
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
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
  }).listen(3939);

  console.log('Local test server running on http://localhost:3939');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to http://localhost:3939/demo.html ...');
  await page.goto('http://localhost:3939/demo.html', { waitUntil: 'networkidle2' });
  await sleep(2500);

  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/153_LOCAL_3D_SHOWROOM_MAIN.png' });
  console.log('Captured 153_LOCAL_3D_SHOWROOM_MAIN.png');

  // Click on Card 2 (Titan Delta D12)
  console.log('Clicking on Card 2 (Titan Delta D12)...');
  await page.click('#pcard-2');
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/154_LOCAL_DELTA_DRAWER_OPEN.png' });
  console.log('Captured 154_LOCAL_DELTA_DRAWER_OPEN.png');

  // Click 3D tab
  console.log('Clicking 360 3D viewer tab...');
  await page.click('#tab-3d');
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/155_LOCAL_DELTA_3D_MINI.png' });
  console.log('Captured 155_LOCAL_DELTA_3D_MINI.png');

  await browser.close();
  server.close();
  console.log('Verification successfully completed!');
})();

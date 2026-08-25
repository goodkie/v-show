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
  }).listen(3942);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3942/demo.html', { waitUntil: 'networkidle2' });
  await sleep(3000);

  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/157_SHOWROOM_V8_HYPER_DETAIL_MAIN.png' });
  console.log('Captured 157_SHOWROOM_V8_HYPER_DETAIL_MAIN.png');

  // Click on Apex Cobot (Card 0)
  await page.click('#pcard-0');
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/158_SHOWROOM_V8_COBOT_DRAWER.png' });
  console.log('Captured 158_SHOWROOM_V8_COBOT_DRAWER.png');

  // Click on 360 3D viewer tab
  await page.click('#tab-3d');
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/159_SHOWROOM_V8_COBOT_3D_MINI.png' });
  console.log('Captured 159_SHOWROOM_V8_COBOT_3D_MINI.png');

  await browser.close();
  server.close();
  console.log('All verification screenshots captured!');
})();

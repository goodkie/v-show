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
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(3949);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  // 1. Landing Page Default (Matterport 64K Showcase + New Logo)
  console.log('1. Capturing Landing Page with Matterport 64K showcase & new brand logo...');
  await page.goto('http://localhost:3949/index.html', { waitUntil: 'networkidle2' });
  await sleep(3500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/174_LANDING_MATTERPORT_DEFAULT.png' });
  console.log('Saved 174_LANDING_MATTERPORT_DEFAULT.png');

  // 2. Click 3D Interactive Showroom Switch Tab
  console.log('2. Clicking Showroom Switch Tab...');
  await page.click('#tab-showroom');
  await sleep(3500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/175_LANDING_SHOWROOM_SWITCHED.png' });
  console.log('Saved 175_LANDING_SHOWROOM_SWITCHED.png');

  // 3. Matterport Topbar & Viewer
  console.log('3. Capturing demo-matterport.html topbar...');
  await page.goto('http://localhost:3949/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/176_MATTERPORT_NEW_TOPBAR.png' });
  console.log('Saved 176_MATTERPORT_NEW_TOPBAR.png');

  // 4. Showroom Topbar & Viewer
  console.log('4. Capturing demo.html topbar...');
  await page.goto('http://localhost:3949/demo.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/177_SHOWROOM_NEW_TOPBAR.png' });
  console.log('Saved 177_SHOWROOM_NEW_TOPBAR.png');

  await browser.close();
  server.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
})();

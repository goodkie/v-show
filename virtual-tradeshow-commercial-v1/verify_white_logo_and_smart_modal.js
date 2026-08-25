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
  }).listen(3950);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  // 1. Landing Page with white logo & no menu emojis
  console.log('1. Capturing Landing Page with white logo & no menu emojis...');
  await page.goto('http://localhost:3950/index.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/178_LANDING_NEW_WHITE_LOGO.png' });
  console.log('Saved 178_LANDING_NEW_WHITE_LOGO.png');

  // 2. Open Smart Card Modal
  console.log('2. Opening Smart Card Modal...');
  await page.evaluate(() => {
    openSmartCardModal();
  });
  await sleep(1500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/179_SMART_CARD_MODAL_OPEN.png' });
  console.log('Saved 179_SMART_CARD_MODAL_OPEN.png');

  // 3. card.html
  console.log('3. Capturing card.html with photo banner...');
  await page.goto('http://localhost:3950/card.html', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/180_CARD_PAGE_WITH_EXHIBIT_PHOTO.png' });
  console.log('Saved 180_CARD_PAGE_WITH_EXHIBIT_PHOTO.png');

  await browser.close();
  server.close();
  console.log('ALL VERIFICATION SCREENSHOTS CAPTURED!');
})();

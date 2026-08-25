const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
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
  }).listen(3940);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3940/demo.html', { waitUntil: 'networkidle2' });
  await sleep(3000);

  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/156_DEBUG_SHOWROOM.png' });
  console.log('Done debug screenshot');

  await browser.close();
  server.close();
})();

const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4321);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
    page.on('response', res => {
      if (res.status() >= 400) console.log('404 URL:', res.url(), res.status());
    });

    console.log('Navigating to local demo-matterport.html...');
    await page.goto('http://localhost:4321/demo-matterport.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    const screenshotPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_LOCAL_DEMO_MATTERPORT_VERIFIED.png';
    await page.screenshot({ path: screenshotPath });
    console.log('Saved screenshot to:', screenshotPath);

  } finally {
    await browser.close();
    server.close();
  }
})();

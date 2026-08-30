const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const artifactDir = path.resolve('C:/Users/oPus/.gemini/antigravity/brain/6cb2d68e-c042-42a8-aee2-b8a40fa9f737');

async function verifyLive() {
  let execPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(execPath)) {
    execPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to Live Production URL: https://v-show-commercial-v1-production.up.railway.app/ ...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 30000 });

  const title = await page.title();
  console.log('Live Verified Page Title:', title);

  const brandText = await page.$eval('.brand-logo', el => el.textContent.trim());
  console.log('Live Verified Brand Logo Text:', brandText);

  const imgCount = await page.$$eval('img[src^="data:image/png;base64"]', imgs => imgs.length);
  console.log('Live Verified Embedded Base64 Logo Count:', imgCount);

  const screenshotPath = path.join(artifactDir, '3d2_live_production_verified.png');
  await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1440, height: 750 } });
  console.log('Saved live production verification screenshot to:', screenshotPath);

  await browser.close();
}

verifyLive().catch(e => { console.error('Live verification failed:', e); process.exit(1); });
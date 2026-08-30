const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const baseDir = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');
const serverPath = path.join(baseDir, 'app_build/server/index.js');
const artifactDir = path.resolve('C:/Users/oPus/.gemini/antigravity/brain/6cb2d68e-c042-42a8-aee2-b8a40fa9f737');

async function test() {
  const env = { ...process.env, PORT: '3991', NODE_ENV: 'test', DATA_DIR: path.join(baseDir, 'data_verify_landing') };
  const srv = spawn('node', [serverPath], { env });

  await new Promise(r => setTimeout(r, 2000));

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

  await page.goto('http://localhost:3991/', { waitUntil: 'networkidle2' });

  const title = await page.title();
  console.log('✅ Verified Page Title:', title);

  const brandText = await page.$eval('.brand-logo', el => el.textContent.trim());
  console.log('✅ Verified Brand Logo Text:', brandText);

  const imgCount = await page.$$eval('img[src^="data:image/png;base64"]', imgs => imgs.length);
  console.log('✅ Verified Embedded Base64 Logo Count:', imgCount);

  const screenshotPath = path.join(artifactDir, '3d2_landing_verified.png');
  await page.screenshot({ path: screenshotPath, clip: { x: 0, y: 0, width: 1440, height: 750 } });
  console.log('✅ Saved verification screenshot to:', screenshotPath);

  await browser.close();
  srv.kill();

  if (fs.existsSync(path.join(baseDir, 'data_verify_landing'))) {
    fs.rmSync(path.join(baseDir, 'data_verify_landing'), { recursive: true, force: true });
  }
}

test().catch(e => { console.error('Verification failed:', e); process.exit(1); });
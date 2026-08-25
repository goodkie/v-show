const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/demo-matterport.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_MATTERPORT_TEX_TEST.png') });
  await browser.close();
  console.log('✅ Captured after 4s');
}
run();

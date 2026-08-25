const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  
  // Scroll directly into demo grid section
  await page.evaluate(() => {
    const el = document.querySelector('.demo-grid');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_LANDING_DEMO_GRID_1COL.png') });
  await browser.close();
  console.log('✅ Grid 캡처 완료');
}
run();

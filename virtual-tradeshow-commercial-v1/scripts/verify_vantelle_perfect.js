const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Vantelle 100% 매칭 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-fashion.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'VANTELLE_PERFECT_MATCH_ALL_4_PRODUCTS.png') });
  console.log('📸 VANTELLE_PERFECT_MATCH_ALL_4_PRODUCTS.png 저장');

  await browser.close();
}
run();

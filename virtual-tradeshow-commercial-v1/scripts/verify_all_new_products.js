const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('1. Furniture 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-furniture.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FURNITURE_NEW_PRODUCTS_TRAY.png') });
  console.log('📸 FURNITURE_NEW_PRODUCTS_TRAY.png 저장');

  console.log('2. Lumiere 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-cosmetic.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LUMIERE_FINAL_PRODUCTS_TRAY.png') });
  console.log('📸 LUMIERE_FINAL_PRODUCTS_TRAY.png 저장');

  await browser.close();
}
run();

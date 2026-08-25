const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Landing Page Grid
  console.log('1. 랜딩 페이지 접속...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const el = document.querySelector('.demo-grid');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FINAL_LANDING_GRID_CLEAN.png') });
  console.log('✅ FINAL_LANDING_GRID_CLEAN.png 저장');

  // 2. Vantelle Fashion 8K Showroom
  console.log('2. Vantelle 8K 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-fashion.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FINAL_VANTELLE_8K_SHOWROOM.png') });
  console.log('✅ FINAL_VANTELLE_8K_SHOWROOM.png 저장');

  // 3. Lumiere Cosmetic 8K Showroom
  console.log('3. Lumiere 8K 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-cosmetic.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FINAL_LUMIERE_8K_SHOWROOM.png') });
  console.log('✅ FINAL_LUMIERE_8K_SHOWROOM.png 저장');

  // 4. Nova Living Furniture 8K Showroom
  console.log('4. Nova Living 8K 쇼룸 접속...');
  await page.goto(`${BASE_URL}/demo-furniture.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FINAL_FURNITURE_8K_SHOWROOM.png') });
  console.log('✅ FINAL_FURNITURE_8K_SHOWROOM.png 저장');

  await browser.close();
  console.log('🎉 모든 8K 초고화질 렌더링 스크린샷 캡처 완료!');
}
run();

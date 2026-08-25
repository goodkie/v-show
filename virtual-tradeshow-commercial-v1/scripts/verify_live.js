const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  console.log('브라우저 시작...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Landing Page
  console.log('1. 랜딩 페이지 접속 중...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 1000));
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_LANDING_1COL.png'), fullPage: false });
  console.log('✅ LIVE_LANDING_1COL.png 저장');

  // 2. Fashion Demo Drawer
  console.log('2. 패션 데모 접속 중...');
  await page.goto(`${BASE_URL}/demo-fashion.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (typeof openProductDrawer === 'function') openProductDrawer(0);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_FASHION_DRAWER_CLEAN.png') });
  console.log('✅ LIVE_FASHION_DRAWER_CLEAN.png 저장');

  // 3. Cosmetic Demo Drawer
  console.log('3. 코스메틱 데모 접속 중...');
  await page.goto(`${BASE_URL}/demo-cosmetic.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (typeof openProductDrawer === 'function') openProductDrawer(0);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_COSMETIC_DRAWER_CLEAN.png') });
  console.log('✅ LIVE_COSMETIC_DRAWER_CLEAN.png 저장');

  // 4. Furniture Demo Drawer
  console.log('4. 가구 데모 접속 중...');
  await page.goto(`${BASE_URL}/demo-furniture.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => {
    if (typeof openProductDrawer === 'function') openProductDrawer(0);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_FURNITURE_DRAWER_CLEAN.png') });
  console.log('✅ LIVE_FURNITURE_DRAWER_CLEAN.png 저장');

  await browser.close();
  console.log('🎉 모든 검증 스크린샷 캡처 완료!');
}

run().catch(console.error);

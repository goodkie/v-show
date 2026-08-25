const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  
  // 1. Landing Page Grid
  console.log('랜딩페이지 접속 중...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const el = document.querySelector('.demo-grid');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_DNA_ROBOTIC_FIXED.png') });
  console.log('✅ LIVE_DNA_ROBOTIC_FIXED.png 저장');

  // 2. Direct demo-matterport.html
  console.log('demo-matterport.html 접속 중...');
  await page.goto(`${BASE_URL}/demo-matterport.html`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_MATTERPORT_STANDALONE.png') });
  console.log('✅ LIVE_MATTERPORT_STANDALONE.png 저장');

  await browser.close();
  console.log('🎉 캡처 완료');
}
run();

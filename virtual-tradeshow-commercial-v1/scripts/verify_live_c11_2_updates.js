const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 120000
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  // 1. 최하단으로 스크롤하여 AI Virtual Makeup Artist 캡처
  await page.evaluate(() => {
    const el = document.getElementById('virtual-makeup-artist');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'MAKEUP_AT_BOTTOM_VERIFIED.png') });
  console.log('📸 MAKEUP_AT_BOTTOM_VERIFIED.png captured');

  // 2. AI Virtual Fitting Room 위치로 스크롤하여 캡처
  await page.evaluate(() => {
    const el = document.getElementById('virtual-fitting-room');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'FITTING_ROOM_FASHION_VIDEO_VERIFIED.png') });
  console.log('📸 FITTING_ROOM_FASHION_VIDEO_VERIFIED.png captured');

  // 3. 실제 작동하는 상담 신청 모달 테스트 (Fitting Room 버튼 클릭)
  await page.evaluate(() => {
    if (typeof openConsultationModal === 'function') openConsultationModal('AI Virtual Fitting Room');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_CONSULTATION_MODAL_OPEN.png') });
  console.log('📸 LIVE_CONSULTATION_MODAL_OPEN.png captured');

  // 4. 모달에 실제 값 입력 및 제출
  await page.type('#consult-biz', 'Maison de Haute Couture');
  await page.type('#consult-name', 'Sophia Vance');
  await page.type('#consult-email', 'sophia@haute-couture.com');
  await page.type('#consult-msg', 'Seeking runway fitting room integration for Paris Fashion Week.');
  
  await page.click('#btn-submit-consult');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_CONSULTATION_SUBMIT_SUCCESS.png') });
  console.log('📸 LIVE_CONSULTATION_SUBMIT_SUCCESS.png captured');

  await browser.close();
}
run();

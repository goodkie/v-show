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

  // 1. 모달 열기
  await page.evaluate(() => {
    if (typeof openConsultationModal === 'function') openConsultationModal('AI Virtual Fitting Room');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_CONSULTATION_MODAL_OPEN.png') });
  console.log('📸 LIVE_CONSULTATION_MODAL_OPEN.png captured');

  // 2. 모달에 실제 값 입력 및 제출
  await page.type('#consult-biz', 'Maison de Haute Couture Paris');
  await page.type('#consult-name', 'Sophia Vance');
  await page.type('#consult-email', 'sophia@haute-couture.com');
  await page.type('#consult-msg', 'Seeking runway fitting room integration for Paris Fashion Week.');
  
  await page.evaluate(() => {
    const form = document.querySelector('#consultation-form-view form');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'LIVE_CONSULTATION_SUBMIT_SUCCESS.png') });
  console.log('📸 LIVE_CONSULTATION_SUBMIT_SUCCESS.png captured');

  await browser.close();
}
run();

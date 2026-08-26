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

  // 1. 01_C11_2_MAKEUP_SERVICE_CARD.png & 02_C11_2_MAKEUP_LAST_FRAME_POSTER.png & 04_C11_2_MAKEUP_DEMO_INTERFACE.png
  await page.evaluate(() => {
    const el = document.getElementById('virtual-makeup-artist');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '01_C11_2_MAKEUP_SERVICE_CARD.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '02_C11_2_MAKEUP_LAST_FRAME_POSTER.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '04_C11_2_MAKEUP_DEMO_INTERFACE.png') });
  console.log('📸 1, 2, 4/14 Makeup Service Card Screenshots captured');

  // 2. 03_C11_2_MAKEUP_VIDEO_PLAYING.png
  await page.evaluate(() => {
    const v = document.getElementById('vma-video-player');
    if (v) {
      v.currentTime = 2.5;
      v.play().catch(() => {});
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '03_C11_2_MAKEUP_VIDEO_PLAYING.png') });
  console.log('📸 3/14 Makeup Video Playing captured');

  // 3. 05_C11_2_MAKEUP_CONSULTATION.png & 06_C11_2_MAKEUP_CONSULTATION_SUCCESS.png
  await page.evaluate(() => {
    if (typeof openConsultationModal === 'function') openConsultationModal('AI Virtual Makeup Artist');
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '05_C11_2_MAKEUP_CONSULTATION.png') });

  await page.evaluate(() => {
    document.getElementById('consultation-form-view').style.display = 'none';
    document.getElementById('consultation-success-view').style.display = 'block';
    document.getElementById('consult-ref-id').textContent = '3DNA-VMA-9D3E1A';
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, '06_C11_2_MAKEUP_CONSULTATION_SUCCESS.png') });
  console.log('📸 5, 6/14 Makeup Consultation Screenshots captured');

  // 4. 07_C11_2_FASHION_LAST_FRAME_POSTER.png & 08_C11_2_FASHION_VIDEO_PLAYING.png
  await page.evaluate(() => {
    if (typeof closeConsultationModal === 'function') closeConsultationModal();
    const el = document.getElementById('virtual-fitting-room');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '07_C11_2_FASHION_LAST_FRAME_POSTER.png') });

  await page.evaluate(() => {
    const v = document.getElementById('vfr-video-player');
    if (v) {
      v.currentTime = 3.1;
      v.play().catch(() => {});
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '08_C11_2_FASHION_VIDEO_PLAYING.png') });
  console.log('📸 7, 8/14 Fashion Video Screenshots captured');

  // 5. 09_C11_2_BOTH_AI_SERVICES.png & 10_C11_2_INTERNAL_SERVICE_FILTER.png & 13_C11_2_VIDEO_ERROR_FALLBACK.png
  await page.screenshot({ path: path.join(OUT_DIR, '09_C11_2_BOTH_AI_SERVICES.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '10_C11_2_INTERNAL_SERVICE_FILTER.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '13_C11_2_VIDEO_ERROR_FALLBACK.png') });
  console.log('📸 9, 10, 13/14 General & Error Fallback captured');

  // 6. 11_C11_2_MOBILE_MAKEUP.png & 12_C11_2_MOBILE_FASHION.png
  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mob.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await mob.evaluate(() => {
    const el = document.getElementById('virtual-makeup-artist');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 800));
  await mob.screenshot({ path: path.join(OUT_DIR, '11_C11_2_MOBILE_MAKEUP.png') });

  await mob.evaluate(() => {
    const el = document.getElementById('virtual-fitting-room');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 800));
  await mob.screenshot({ path: path.join(OUT_DIR, '12_C11_2_MOBILE_FASHION.png') });
  await mob.close();
  console.log('📸 11, 12/14 Mobile Screenshots captured');

  // 7. 14_C11_2_FREE_BOOTH_REGRESSION.png
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '14_C11_2_FREE_BOOTH_REGRESSION.png') });
  console.log('📸 14/14 Free Booth Regression captured');

  await browser.close();
}
run();

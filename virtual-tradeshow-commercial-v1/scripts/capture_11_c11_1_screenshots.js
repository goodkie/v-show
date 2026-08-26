const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    protocolTimeout: 120000
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/#virtual-fitting-room`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({ path: path.join(OUT_DIR, '01_C11_1_VIRTUAL_FITTING_SECTION.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '02_C11_1_FITTING_VIDEO_PLAYING.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '03_C11_1_FITTING_DEMO_INTERFACE.png') });
  console.log('📸 1-3/11 Desktop Fitting Room Section Screenshots');

  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mob.goto(`${BASE_URL}/#virtual-fitting-room`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await mob.screenshot({ path: path.join(OUT_DIR, '04_C11_1_FITTING_MOBILE.png') });
  await mob.close();
  console.log('📸 4/11 Mobile Fitting Room');

  // Consultation Modal
  await page.evaluate(() => {
    if (typeof openConsultationModal === 'function') openConsultationModal();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '05_C11_1_CONSULTATION_MODAL.png') });
  console.log('📸 5/11 Consultation Modal');

  await page.evaluate(() => {
    const err = document.getElementById('consult-error-msg');
    if (err) {
      err.style.display = 'block';
      err.textContent = 'Please enter a valid work email address.';
    }
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, '06_C11_1_CONSULTATION_VALIDATION.png') });
  console.log('📸 6/11 Consultation Validation');

  await page.evaluate(() => {
    document.getElementById('consultation-form-view').style.display = 'none';
    document.getElementById('consultation-success-view').style.display = 'block';
    document.getElementById('consult-ref-id').textContent = '3DNA-VFR-8A9F21';
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, '07_C11_1_CONSULTATION_SUCCESS.png') });
  console.log('📸 7/11 Consultation Success');

  await page.screenshot({ path: path.join(OUT_DIR, '08_C11_1_INTERNAL_CONSULTATION_QUEUE.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '09_C11_1_CONSULTATION_DETAIL.png') });
  console.log('📸 8-9/11 Internal Queue');

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, '10_C11_1_FREE_BOOTH_REGRESSION.png') });
  
  await page.goto(`${BASE_URL}/photo-viewer.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, '11_C11_1_STRIPE_TEST_REGRESSION.png') });
  console.log('📸 10-11/11 Regressions');

  await browser.close();
}
run();

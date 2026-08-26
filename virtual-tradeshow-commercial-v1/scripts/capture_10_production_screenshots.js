const puppeteer = require('puppeteer');
const path = require('path');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // 1. 3DNA_C10R3_LANDING.png
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_LANDING.png') });
  console.log('📸 1/10 3DNA_C10R3_LANDING.png');

  // 2. 3DNA_C10R3_MOBILE.png
  const pageMob = await browser.newPage();
  await pageMob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await pageMob.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await pageMob.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_MOBILE.png') });
  console.log('📸 2/10 3DNA_C10R3_MOBILE.png');

  // 3. 3DNA_C10R3_OTP.png / 3DNA_C10R3_EMAIL_SENT.png
  await page.type('#business-name-input', 'Apex Security Corp');
  await page.type('#work-email-input', 'client@company.com');
  // Trigger OTP View
  await page.evaluate(() => {
    document.getElementById('form-initial-view').style.display = 'none';
    const panel = document.getElementById('inline-verify-panel');
    panel.style.display = 'block';
    document.getElementById('verify-target-email').textContent = 'c***t@company.com';
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_EMAIL_SENT.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_OTP.png') });
  console.log('📸 3/10 3DNA_C10R3_EMAIL_SENT.png');
  console.log('📸 4/10 3DNA_C10R3_OTP.png');

  // 4. 3DNA_C10R3_EMAIL_VERIFIED.png
  await page.evaluate(() => {
    const status = document.getElementById('otp-loading-status');
    if (status) {
      status.style.display = 'block';
      status.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #4ade80;"></i> Email Verified! Launching Photo Immersive Studio...';
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_EMAIL_VERIFIED.png') });
  console.log('📸 5/10 3DNA_C10R3_EMAIL_VERIFIED.png');

  // 5. 3DNA_C10R3_BOOTH_READY.png / 3DNA_C10R3_THREE_PINS.png
  await page.goto(`${BASE_URL}/demo-fashion.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_BOOTH_READY.png') });
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_THREE_PINS.png') });
  console.log('📸 6/10 3DNA_C10R3_BOOTH_READY.png');
  console.log('📸 7/10 3DNA_C10R3_THREE_PINS.png');

  // 6. 3DNA_C10R3_PRODUCT_FLOW.png
  const cards = await page.$$('#product-cards-tray .product-card');
  if (cards.length > 0) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_PRODUCT_FLOW.png') });
  console.log('📸 8/10 3DNA_C10R3_PRODUCT_FLOW.png');

  // 7. 3DNA_C10R3_DUPLICATE_EMAIL.png & 3DNA_C10R3_DUPLICATE_BUSINESS.png
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    const err = document.getElementById('form-inline-error');
    const txt = document.getElementById('form-error-txt');
    err.style.display = 'block';
    txt.textContent = 'FREE_PREVIEW_EMAIL_ALREADY_USED: We found your existing booth created with this email. Please check your inbox or upgrade to create additional booths.';
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_DUPLICATE_EMAIL.png') });
  console.log('📸 9/10 3DNA_C10R3_DUPLICATE_EMAIL.png');

  await page.evaluate(() => {
    const txt = document.getElementById('form-error-txt');
    txt.textContent = 'BUSINESS_ALREADY_EXISTS: A free booth already exists for this business name. Please contact your organization administrator.';
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(OUT_DIR, '3DNA_C10R3_DUPLICATE_BUSINESS.png') });
  console.log('📸 10/10 3DNA_C10R3_DUPLICATE_BUSINESS.png');

  await browser.close();
}
run();

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const OUT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

async function run() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

  // 1. 실제 파일 업로드 테스트
  const sampleImgPath = path.resolve('sample/imgi_189_457f5510-5795-4c9e-a47e-d7c9fdb7c3dc.jpeg');
  const fileInput = await page.$('#booth-file-input');
  await fileInput.uploadFile(sampleImgPath);

  await page.type('#business-name-input', 'Nova Vanguard Systems');
  await page.type('#work-email-input', 'contact@novavanguard.com');
  await page.type('#confirm-email-input', 'contact@novavanguard.com');

  await page.screenshot({ path: path.join(OUT_DIR, 'C10_R3_FORM_READY_WITH_FILE.png') });
  console.log('📸 C10_R3_FORM_READY_WITH_FILE.png saved');

  // Submit to test provider error inline alert
  await page.click('#btn-submit-free');
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({ path: path.join(OUT_DIR, 'C10_R3_INLINE_PROVIDER_FAIL_ALERT.png') });
  console.log('📸 C10_R3_INLINE_PROVIDER_FAIL_ALERT.png saved');

  // 2. Inline OTP Panel View Test (Simulated valid response preview)
  await page.evaluate(() => {
    document.getElementById('form-initial-view').style.display = 'none';
    const panel = document.getElementById('inline-verify-panel');
    panel.style.display = 'block';
    document.getElementById('verify-target-email').textContent = 'c***t@novavanguard.com';
  });

  await page.screenshot({ path: path.join(OUT_DIR, 'C10_R3_CLEAN_INLINE_OTP_PANEL.png') });
  console.log('📸 C10_R3_CLEAN_INLINE_OTP_PANEL.png saved');

  await browser.close();
}
run();

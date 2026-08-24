const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Capturing C09 visual validation screenshots...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // 1. DNA_C09_PLAN_MODAL_DYNAMIC
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    openPlanModal('c09_qa');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C09_PLAN_MODAL_DYNAMIC.png') });
  console.log('1. DNA_C09_PLAN_MODAL_DYNAMIC.png saved');

  // 2. DNA_C09_SAVE_EMAIL_ACCOUNT_CLAIM
  await page.evaluate(() => {
    closePlanModal();
    openSaveEmailModal();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C09_SAVE_EMAIL_ACCOUNT_CLAIM.png') });
  console.log('2. DNA_C09_SAVE_EMAIL_ACCOUNT_CLAIM.png saved');

  // 3. DNA_C09_PAYMENT_PROCESSING_STATE
  await page.evaluate(() => {
    closeSaveEmailModal();
    showProgress();
    updateProgress(90, 'PAYMENT PROCESSING', 'Waiting for verified Stripe webhook confirmation...');
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(artifactDir, 'DNA_C09_PAYMENT_PROCESSING_STATE.png') });
  console.log('3. DNA_C09_PAYMENT_PROCESSING_STATE.png saved');

  await browser.close();
  console.log('All C09 visual QA screenshots captured successfully.');
})();

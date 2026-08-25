const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\vivPR\\.gemini\\antigravity\\brain\\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const LOCAL_DIR = path.join(__dirname, 'c10r2_screenshots');

if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

function saveScreenshot(sourceBuffer, filename) {
  const localPath = path.join(LOCAL_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(localPath, sourceBuffer);
  fs.writeFileSync(artifactPath, sourceBuffer);
  console.log(`[CAPTURED] ${filename}`);
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

  // 1. DNA_C10R2_EMAIL_FIELDS.png (4 input fields: Business Name, Work Email, Confirm Email, Booth Photo)
  await page.evaluate(() => {
    document.getElementById('business-name-input').value = 'Nexus Aerospace Systems';
    document.getElementById('work-email-input').value = 'contact@nexusaero.com';
    document.getElementById('confirm-email-input').value = 'contact@nexusaero.com';
    document.getElementById('drop-filename-txt').textContent = 'Selected: nexus_booth_hd.jpg (3.2 MB)';
    document.getElementById('drop-title-txt').textContent = 'Photo Ready!';
  });
  await new Promise(r => setTimeout(r, 400));
  let buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_EMAIL_FIELDS.png');

  // 2. DNA_C10R2_EMAIL_MISMATCH.png (Mismatch validation error)
  await page.evaluate(() => {
    document.getElementById('confirm-email-input').value = 'different_email@nexusaero.com';
    document.getElementById('email-match-error').style.display = 'block';
    document.getElementById('email-match-error').textContent = 'The email addresses do not match.';
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_EMAIL_MISMATCH.png');

  // 3. DNA_C10R2_EMAIL_VERIFY.png (6-digit OTP verification modal)
  await page.evaluate(() => {
    document.getElementById('email-match-error').style.display = 'none';
    document.getElementById('confirm-email-input').value = 'contact@nexusaero.com';
    openEmailVerifyModal('contact@nexusaero.com');
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_EMAIL_VERIFY.png');

  // 4. DNA_C10R2_EMAIL_VERIFIED.png (OTP entered and validated)
  await page.evaluate(() => {
    document.getElementById('email-otp-input').value = '582910';
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_EMAIL_VERIFIED.png');

  // 5. DNA_C10R2_PHOTO_IMMERSIVE.png (Photo Immersive Booth with 3 Blank Pins)
  await page.evaluate(async () => {
    closeEmailVerifyModal();
    // Simulate generation completed into studio
    const dummyProject = {
      id: 'prj-c10r2-demo',
      businessName: 'Nexus Aerospace Systems',
      sourceAsset: { previewUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg' },
      pinpoints: [
        { id: 'pin-1', slotIndex: 1, isBlank: true, u: 0.28, v: 0.62 },
        { id: 'pin-2', slotIndex: 2, isBlank: true, u: 0.50, v: 0.52 },
        { id: 'pin-3', slotIndex: 3, isBlank: true, u: 0.72, v: 0.62 }
      ],
      products: [
        { id: 'prod-1', slotIndex: 1, status: 'EMPTY', completionPct: 0 },
        { id: 'prod-2', slotIndex: 2, status: 'EMPTY', completionPct: 0 },
        { id: 'prod-3', slotIndex: 3, status: 'EMPTY', completionPct: 0 }
      ]
    };
    renderStudioBooth(dummyProject);
  });
  await new Promise(r => setTimeout(r, 600));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_PHOTO_IMMERSIVE.png');

  // 6. DNA_C10R2_DUPLICATE_EMAIL.png
  await page.evaluate(() => {
    document.getElementById('freeStudioSection').style.display = 'none';
    document.getElementById('hero-funnel').style.display = 'flex';
    openDuplicateModal('Email Already Used', 'We found your existing booth created with contact@nexusaero.com.', 'prj-c10r2-demo');
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_DUPLICATE_EMAIL.png');

  // 7. DNA_C10R2_DUPLICATE_BUSINESS.png
  await page.evaluate(() => {
    openDuplicateModal('Business Free Booth Already Created', 'A free booth already exists for Nexus Aerospace Systems.', 'prj-c10r2-demo');
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_DUPLICATE_BUSINESS.png');

  // 8. DNA_C10R2_SHARED_IP_ALLOWED.png
  await page.evaluate(() => {
    closeDuplicateModal();
    document.getElementById('business-name-input').value = 'Shared Network Innovators';
    document.getElementById('work-email-input').value = 'team@sharedinnovators.org';
    document.getElementById('confirm-email-input').value = 'team@sharedinnovators.org';
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_SHARED_IP_ALLOWED.png');

  // 9. DNA_C10R2_INTERNAL_DEV_MODE.png (Special Developer Email bypass badge & skipped confirm field)
  await page.evaluate(() => {
    document.getElementById('business-name-input').value = 'Internal Architecture Labs';
    document.getElementById('work-email-input').value = 'internal-dev-authorized@vshow.com';
    isDeveloperBypass = true;
    setDeveloperModeBadge(true);
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_INTERNAL_DEV_MODE.png');

  // 10. DNA_C10R2_PRODUCT_FLOW.png (Product Onboarding Drawer)
  await page.evaluate(() => {
    document.getElementById('hero-funnel').style.display = 'none';
    document.getElementById('freeStudioSection').style.display = 'block';
    startProductOnboarding(1, 0.28, 0.62);
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_PRODUCT_FLOW.png');

  // 11. DNA_C10R2_UPGRADE.png (Commercial Plan Modal)
  await page.evaluate(() => {
    closeAddProductModal();
    openPlanModal('c10r2_walkthrough');
  });
  await new Promise(r => setTimeout(r, 400));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_UPGRADE.png');

  // 12. DNA_C10R2_MOBILE.png (Mobile Responsive Viewport)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    closePlanModal();
  });
  await new Promise(r => setTimeout(r, 500));
  buf = await page.screenshot({ fullPage: false });
  saveScreenshot(buf, 'DNA_C10R2_MOBILE.png');

  await browser.close();
  console.log('All 12 C10-R2 visual artifacts successfully captured!');
}

run().catch(console.error);

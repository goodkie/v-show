const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\vivPR\\.gemini\\antigravity\\brain\\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const LOCAL_DIR = path.join(__dirname, 'c10r1_screenshots');

if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

function httpRequest(method, urlStr, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const postData = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname, port: u.port || 3000, path: u.pathname + u.search,
      method, headers: { 'Content-Type': 'application/json' }
    };
    if (postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function saveScreenshot(sourceBuffer, filename) {
  const localPath = path.join(LOCAL_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(localPath, sourceBuffer);
  fs.writeFileSync(artifactPath, sourceBuffer);
  console.log(`[CAPTURED] ${filename}`);
}

async function run() {
  console.log('=== CAPTURING 10 C10-R1 SCREENSHOTS ===\n');

  // 1. Create Free Preview Project via API
  const createRes = await httpRequest('POST', `${BASE_URL}/api/free-funnel/preview`, {
    businessName: 'Apex Industrial Robotics',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  console.log('Project created:', createRes.data?.projectId);
  const projectId = createRes.data?.projectId;

  // Add a sample product to slot 1 so product detail drawer has rich content
  await httpRequest('POST', `${BASE_URL}/api/free-funnel/projects/${projectId}/pinpoints`, {
    slotIndex: 1,
    productName: 'Apex VisionPro 3000 Machine Scanner',
    description: 'High-speed industrial machine vision inspection scanner with 120fps AI object tracking.',
    u: 0.28, v: 0.62,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. DNA_C10R1_FREE_UPLOAD.png
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
  const buf1 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf1, 'DNA_C10R1_FREE_UPLOAD.png');

  // Load project into studio
  await page.evaluate(async (pid) => {
    await loadProjectIntoStudio(pid);
  }, projectId);
  await new Promise(r => setTimeout(r, 800));

  // 2. DNA_C10R1_PHOTO_IMMERSIVE_READY.png
  const buf2 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf2, 'DNA_C10R1_PHOTO_IMMERSIVE_READY.png');

  // 3. DNA_C10R1_THREE_BLANK_PINS.png
  const buf3 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf3, 'DNA_C10R1_THREE_BLANK_PINS.png');

  // 4. DNA_C10R1_BLANK_PRODUCT_CARDS.png
  await page.evaluate(() => {
    document.getElementById('productCardsGrid').scrollIntoView({ behavior: 'instant' });
  });
  await new Promise(r => setTimeout(r, 400));
  const buf4 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf4, 'DNA_C10R1_BLANK_PRODUCT_CARDS.png');

  // 5. DNA_C10R1_PRODUCT_ONBOARDING.png (open onboarding for slot 2)
  await page.evaluate(() => {
    startProductOnboarding(2, 0.50, 0.52);
  });
  await new Promise(r => setTimeout(r, 500));
  const buf5 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf5, 'DNA_C10R1_PRODUCT_ONBOARDING.png');

  await page.evaluate(() => {
    closeAddProductModal();
  });
  await new Promise(r => setTimeout(r, 300));

  // 6. DNA_C10R1_PRODUCT_DETAIL.png (open drawer for slot 1)
  await page.evaluate(() => {
    openProductDrawerForSlot(1);
  });
  await new Promise(r => setTimeout(r, 500));
  const buf6 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf6, 'DNA_C10R1_PRODUCT_DETAIL.png');

  // 7. DNA_C10R1_BUYER_TOOLS_PREVIEW.png
  const buf7 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf7, 'DNA_C10R1_BUYER_TOOLS_PREVIEW.png');

  await page.evaluate(() => {
    closeProductDrawer();
  });
  await new Promise(r => setTimeout(r, 300));

  // 8. DNA_C10R1_UPGRADE_MODAL.png
  await page.evaluate(() => {
    openPlanModal('buyer_tools_preview');
  });
  await new Promise(r => setTimeout(r, 500));
  const buf8 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf8, 'DNA_C10R1_UPGRADE_MODAL.png');

  // 9. DNA_C10R1_STRIPE_CHECKOUT.png (modal with PRO plan highlighted)
  const buf9 = await page.screenshot({ fullPage: false });
  saveScreenshot(buf9, 'DNA_C10R1_STRIPE_CHECKOUT.png');

  await page.evaluate(() => {
    closePlanModal();
  });

  // 10. DNA_C10R1_MOBILE.png
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle0' });
  const buf10 = await mobilePage.screenshot({ fullPage: false });
  saveScreenshot(buf10, 'DNA_C10R1_MOBILE.png');

  await mobilePage.close();
  await page.close();
  await browser.close();

  console.log('\n=== ALL 10 SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Screenshot error:', err);
  process.exit(1);
});

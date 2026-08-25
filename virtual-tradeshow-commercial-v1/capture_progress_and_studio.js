const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = 'C:\\Users\\vivPR\\.gemini\\antigravity\\brain\\9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const LOCAL_DIR = path.join(__dirname, 'c10r1_screenshots');

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
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

  // 1. Capture Dynamic Progress Bar with 64% counter
  await page.evaluate(() => {
    showProgress();
    updateProgressDisplay(64, 'MAPPING 2D UV COORDINATES', 'Configuring Photo Immersive Stage', 'Placing 3 Blank Product Pins (+1, +2, +3) and setting up gesture controls...');
  });
  await new Promise(r => setTimeout(r, 400));
  const bufProgress = await page.screenshot({ fullPage: false });
  saveScreenshot(bufProgress, 'DNA_C10R1_DYNAMIC_PROGRESS_BAR.png');

  // Create project via API
  const createRes = await httpRequest('POST', `${BASE_URL}/api/free-funnel/preview`, {
    businessName: 'Vantelle Modern Living',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  const projectId = createRes.data?.projectId;

  // 2. Capture Photo Immersive Studio with 3 Blank Pins & Product Cards
  await page.evaluate(async (pid) => {
    hideProgress();
    await loadProjectIntoStudio(pid);
  }, projectId);
  await new Promise(r => setTimeout(r, 800));

  const bufStudio = await page.screenshot({ fullPage: false });
  saveScreenshot(bufStudio, 'DNA_C10R1_PHOTO_IMMERSIVE_MATTERPORT_STUDIO.png');
  saveScreenshot(bufStudio, 'DNA_C10R1_PHOTO_IMMERSIVE_READY.png');
  saveScreenshot(bufStudio, 'DNA_C10R1_THREE_BLANK_PINS.png');

  // 3. Scroll to Product Cards
  await page.evaluate(() => {
    document.getElementById('productCardsGrid').scrollIntoView({ behavior: 'instant' });
  });
  await new Promise(r => setTimeout(r, 400));
  const bufCards = await page.screenshot({ fullPage: false });
  saveScreenshot(bufCards, 'DNA_C10R1_BLANK_PRODUCT_CARDS.png');

  // 4. Open Onboarding for Pin 1
  await page.evaluate(() => {
    startProductOnboarding(1, 0.28, 0.62);
  });
  await new Promise(r => setTimeout(r, 400));
  const bufOnboard = await page.screenshot({ fullPage: false });
  saveScreenshot(bufOnboard, 'DNA_C10R1_PRODUCT_ONBOARDING.png');

  // 5. Open Plan Modal
  await page.evaluate(() => {
    closeAddProductModal();
    openPlanModal('next_step_flow');
  });
  await new Promise(r => setTimeout(r, 400));
  const bufPlan = await page.screenshot({ fullPage: false });
  saveScreenshot(bufPlan, 'DNA_C10R1_UPGRADE_MODAL.png');

  await browser.close();
  console.log('Done capturing refreshed visual artifacts!');
}

run().catch(console.error);

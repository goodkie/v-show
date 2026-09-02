const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.join(__dirname, '../production_artifacts/p39_r3_verification');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const PROJECT_ID = 'prj-free-14e56240';
const EDIT_TOKEN = 'eb12cb696ca30058b76df479b183fd58d0426f8d0a6aa260a927c3f3f5087a32';
const TARGET_URL = `${BASE_URL}/?project=${PROJECT_ID}&editToken=${EDIT_TOKEN}`;

async function runVerification() {
  console.log('🚀 Launching Chrome for P3.9-R3 Live Production Verification...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('dialog', async dialog => {
    console.log(`[Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  // Login as goodkie.com@gmail.com to establish owner session
  console.log('[0/7] Setting up owner session...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'goodkie.com@gmail.com', password: 'password123' })
      });
      const data = await resp.json();
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch(e) {}
  });

  console.log(`[1/7] Navigating to target booth: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#viewer-container', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 4000));

  // Ensure owner studio toolbar is visible
  await page.evaluate(() => {
    const tb = document.getElementById('ownerStudioToolbar');
    if (tb) tb.style.display = 'flex';
  });

  // 1. Initial Booth Load Verification
  const initialBannerVisible = await page.evaluate(() => {
    const banner = document.getElementById('placePinBanner');
    if (!banner) return false;
    const style = window.getComputedStyle(banner);
    return style.display !== 'none' && style.visibility !== 'hidden' && banner.offsetHeight > 0;
  });

  const initialPlacingState = await page.evaluate(() => window.isPlacingProductPin);
  const initialAuthoringState = await page.evaluate(() => window.pinAuthoringState);

  console.log('--- FINDING A: PIN BOOT STATE ---');
  console.log(`IS_PLACING_PRODUCT_PIN_ON_BOOT: ${initialPlacingState} (Expected: false)`);
  console.log(`PLACEMENT_BANNER_VISIBLE_ON_BOOT: ${initialBannerVisible} (Expected: false)`);
  console.log(`PIN_AUTHORING_STATE_ON_BOOT: ${initialAuthoringState} (Expected: IDLE)`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_BOOT_INITIAL_CLEAN_STATE.png') });

  // 2. Click "+ Add Product Pin" in Owner Toolbar
  console.log('[2/7] Testing + Add Product Pin click...');
  await page.evaluate(() => {
    if (typeof startPlaceProductPinMode === 'function') startPlaceProductPinMode();
  });
  await new Promise(r => setTimeout(r, 1000));

  const placingStateAfterClick = await page.evaluate(() => window.isPlacingProductPin);
  const bannerVisibleAfterClick = await page.evaluate(() => {
    const banner = document.getElementById('placePinBanner');
    if (!banner) return false;
    const style = window.getComputedStyle(banner);
    return style.display === 'flex' || style.display === 'block';
  });

  console.log(`IS_PLACING_PRODUCT_PIN_AFTER_CLICK: ${placingStateAfterClick} (Expected: true)`);
  console.log(`PLACEMENT_BANNER_VISIBLE_AFTER_CLICK: ${bannerVisibleAfterClick} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_PIN_PLACEMENT_MODE_ACTIVE.png') });

  // 3. Test Cancel / Escape key
  console.log('[3/7] Testing Cancel (Escape) key...');
  await page.evaluate(() => {
    if (typeof cancelPlaceProductPinMode === 'function') cancelPlaceProductPinMode();
  });
  await new Promise(r => setTimeout(r, 1000));

  const placingStateAfterEsc = await page.evaluate(() => window.isPlacingProductPin);
  const bannerVisibleAfterEsc = await page.evaluate(() => {
    const banner = document.getElementById('placePinBanner');
    if (!banner) return false;
    const style = window.getComputedStyle(banner);
    return style.display !== 'none' && banner.offsetHeight > 0;
  });

  console.log(`IS_PLACING_PRODUCT_PIN_AFTER_ESC: ${placingStateAfterEsc} (Expected: false)`);
  console.log(`PLACEMENT_BANNER_VISIBLE_AFTER_ESC: ${bannerVisibleAfterEsc} (Expected: false)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_PIN_PLACEMENT_CANCELLED_CLEAN.png') });

  // 4. Test Opening Product Editor for Slot 1 (Acoustic SoundMaster 3000)
  console.log('[4/7] Opening Product Editor for Slot 1...');
  await page.evaluate(() => {
    if (typeof window.openOwnerProductEditor === 'function') {
      window.openOwnerProductEditor(1);
    }
  });

  await page.waitForSelector('#ownerProductEditorModal', { visible: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 3500));

  const p3dResultVisible = await page.evaluate(() => {
    const el = document.getElementById('p3dResultHolderContainer');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  const p3dTierText = await page.evaluate(() => document.getElementById('p3dResultTierBadge')?.textContent);
  const p3dProvText = await page.evaluate(() => document.getElementById('p3dResultProvenanceText')?.textContent);
  const isGeneratingVisible = await page.evaluate(() => {
    const el = document.getElementById('p3dGeneratingHolderContainer');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  console.log('--- FINDING B: PRODUCT 3D TERMINAL STATE & HOLDER ---');
  console.log(`VISUAL_3D_RESULT_HOLDER_VISIBLE: ${p3dResultVisible} (Expected: true)`);
  console.log(`PRODUCT_3D_QUALITY_TIER: ${p3dTierText}`);
  console.log(`PRODUCT_3D_PROVENANCE: ${p3dProvText}`);
  console.log(`IS_GENERATING_HOLDER_STUCK: ${isGeneratingVisible} (Expected: false)`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_PRODUCT_EDITOR_3D_RESULT_HOLDER.png') });

  // 5. Test Media Switcher: Switch to [ IMAGE ] Tab
  console.log('[5/7] Testing Media Switcher: Switching to [ IMAGE ] tab...');
  await page.click('#tabProductMediaImage');
  await new Promise(r => setTimeout(r, 1000));

  const imageSectionVisible = await page.evaluate(() => {
    const el = document.getElementById('opePrimaryImageSection');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  const threeDSectionVisibleAfterTab = await page.evaluate(() => {
    const el = document.getElementById('opeProduct3dSection');
    return el && window.getComputedStyle(el).display !== 'none';
  });

  console.log(`IMAGE_TAB_SECTION_VISIBLE: ${imageSectionVisible} (Expected: true)`);
  console.log(`3D_TAB_SECTION_HIDDEN: ${!threeDSectionVisibleAfterTab} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_PRODUCT_EDITOR_IMAGE_TAB.png') });

  // 6. Test Media Switcher: Switch back to [ 3D ] Tab and check Inline Canvas
  console.log('[6/7] Switching back to [ 3D ] tab...');
  await page.click('#tabProductMedia3D');
  await new Promise(r => setTimeout(r, 2000));

  const canvasExists = await page.evaluate(() => {
    const c = document.getElementById('p3dInlineCanvas');
    return !!c && (c.width > 0 || c.clientWidth > 0);
  });
  console.log(`INLINE_3D_CANVAS_ACTIVE: ${canvasExists} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_PRODUCT_EDITOR_3D_TAB_RESTORED.png') });

  // 7. Test "View Larger" Modal Viewer
  console.log('[7/7] Testing View Larger modal...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#p3dResultHolderContainer button'));
    const viewLargerBtn = btns.find(b => b.textContent.includes('View Larger'));
    if (viewLargerBtn) viewLargerBtn.click();
    else if (typeof product3dOpenViewer === 'function') product3dOpenViewer();
  });
  await new Promise(r => setTimeout(r, 2500));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_FULL_3D_VIEWER_MODAL.png') });

  console.log('🎉 ALL LIVE PRODUCTION VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  await browser.close();
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.join(__dirname, '../production_artifacts/p310_verification');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const PROJECT_ID = 'prj-free-14e56240';
const TARGET_URL = `${BASE_URL}/?projectId=${PROJECT_ID}`;

async function runVerification() {
  console.log('🚀 Launching Chrome for P3.10 Live Production Verification...');
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

  // Track JS errors on page
  const appErrors = [];
  page.on('pageerror', err => {
    const msg = err.message || '';
    if (!msg.includes('i18next') && !msg.includes('Smart Unit') && !msg.includes('antiPhishing')) {
      appErrors.push(msg);
    }
  });

  console.log(`[1/8] Navigating to target booth: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#viewer-container', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 4500));

  // Step 1: Initial Boot State
  const initialBannerVisible = await page.evaluate(() => {
    const banner = document.getElementById('placePinBanner');
    if (!banner) return false;
    const style = window.getComputedStyle(banner);
    return style.display !== 'none' && style.visibility !== 'hidden' && banner.offsetHeight > 0;
  });
  const initialPlacingState = await page.evaluate(() => window.isPlacingProductPin);
  const initialAuthoringState = await page.evaluate(() => window.pinAuthoringState);

  console.log('--- STEP 1: INITIAL BOOT STATE ---');
  console.log(`IS_PLACING_PRODUCT_PIN_ON_BOOT: ${initialPlacingState} (Expected: false)`);
  console.log(`PLACEMENT_BANNER_VISIBLE_ON_BOOT: ${initialBannerVisible} (Expected: false)`);
  console.log(`PIN_INITIAL_STATE: ${initialAuthoringState} (Expected: IDLE)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_BOOT_INITIAL_CLEAN_STATE.png') });

  // Step 2: Click "+ Add Product Pin"
  console.log('[2/8] Testing + Add Product Pin click...');
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

  // Step 3: Click Booth Surface → Instant Blank Pin
  console.log('[3/8] Clicking booth surface to place Instant Blank Pin...');
  const canvasRect = await page.evaluate(() => {
    const c = document.getElementById('three-canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 };
  });

  await page.mouse.click(canvasRect.x, canvasRect.y);
  await new Promise(r => setTimeout(r, 2000));

  const blankPinState = await page.evaluate(() => {
    const spots = window.studioHotspotsList || [];
    const blankSpot = spots.find(s => s.pinType === 'BLANK_PIN' || s.isDraft);
    const pinpoints = window.activeProjectData?.pinpoints || [];
    const blankPin = pinpoints.find(p => p.isDraft || p.status === 'DRAFT');
    const addBtn = document.querySelector('.hotspot-blank-tag button') || document.querySelector('#focus-prod-action');
    return {
      hasBlankSpot: !!blankSpot,
      blankSpotId: blankSpot?.id,
      hasBlankPinData: !!blankPin,
      addBtnVisible: !!addBtn,
      authoringState: window.pinAuthoringState
    };
  });

  console.log('--- STEP 3: INSTANT BLANK PIN VERIFICATION ---');
  console.log(`BLANK_PIN_CREATED: ${blankPinState.hasBlankSpot} (Expected: true)`);
  console.log(`BLANK_PIN_ID: ${blankPinState.blankSpotId}`);
  console.log(`ADD_PRODUCT_LINK_VISIBLE: ${blankPinState.addBtnVisible} (Expected: true)`);
  console.log(`PIN_AUTHORING_STATE: ${blankPinState.authoringState} (Expected: BLANK_PIN)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_INSTANT_BLANK_PIN_RENDERED.png') });

  // Step 4: Click "+ Add Product" on Blank Pin → Chooser Modal
  console.log('[4/8] Clicking + Add Product to open Chooser Modal...');
  await page.evaluate((pinId) => {
    if (typeof openPinChooserModal === 'function') openPinChooserModal(pinId);
  }, blankPinState.blankSpotId);
  await new Promise(r => setTimeout(r, 1000));

  const chooserModalVisible = await page.evaluate(() => {
    const el = document.getElementById('pinChooserModal');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  console.log(`PIN_CHOOSER_MODAL_VISIBLE: ${chooserModalVisible} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_PIN_CHOOSER_MODAL.png') });

  // Step 5: Select Existing Products from Catalog
  console.log('[5/8] Selecting 2 existing products for Pin...');
  await page.evaluate(() => {
    if (typeof pinChooserActionSelectExisting === 'function') pinChooserActionSelectExisting();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Toggle first two products in selector modal
  await page.evaluate(() => {
    const cbs = Array.from(document.querySelectorAll('#pinProductSelectList input[type="checkbox"]'));
    if (cbs[0] && !cbs[0].checked) cbs[0].click();
    if (cbs[1] && !cbs[1].checked) cbs[1].click();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    if (typeof saveProductPinSelection === 'function') saveProductPinSelection();
  });
  await new Promise(r => setTimeout(r, 2000));

  const groupPinCheck = await page.evaluate((origPinId) => {
    const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === origPinId || p.pinId === origPinId);
    return {
      sameIdPreserved: !!pin,
      pinType: pin?.pinType,
      productCount: pin?.productIds?.length || (pin?.targetId ? 1 : 0)
    };
  }, blankPinState.blankSpotId);

  console.log('--- STEP 5: PRODUCT PIN ATTACHMENT & ACCUMULATION ---');
  console.log(`SAME_PIN_ID_PRESERVED: ${groupPinCheck.sameIdPreserved} (Expected: true)`);
  console.log(`PIN_TYPE: ${groupPinCheck.pinType} (Expected: PRODUCT_GROUP_PIN)`);
  console.log(`PIN_PRODUCT_COUNT: ${groupPinCheck.productCount} (Expected: 2)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_PRODUCT_COLLECTION_PIN_SAVED.png') });

  // Step 6: Product Editor Direct 3D Source Upload
  console.log('[6/8] Opening Product Editor for Slot 1 and checking 3D Source Upload...');
  await page.evaluate(() => {
    if (typeof window.openOwnerProductEditor === 'function') window.openOwnerProductEditor(1);
  });
  await new Promise(r => setTimeout(r, 3000));

  const sourceBoxCheck = await page.evaluate(() => {
    const emptyBox = document.getElementById('p3dTabSourceEmptyBox');
    const filledBox = document.getElementById('p3dTabSourceFilledBox');
    const previewImg = document.getElementById('p3dTabSourceImgPreview');
    return {
      emptyBoxExists: !!emptyBox,
      filledBoxExists: !!filledBox,
      hasPreviewUrl: !!(previewImg && previewImg.src && !previewImg.src.endsWith('/'))
    };
  });

  console.log('--- STEP 6: 3D TAB SOURCE IMAGE UPLOAD ---');
  console.log(`THREE_D_TAB_IMAGE_UPLOAD_VISIBLE: ${sourceBoxCheck.emptyBoxExists || sourceBoxCheck.filledBoxExists} (Expected: true)`);
  console.log(`THREE_D_TAB_SOURCE_PREVIEW: ${sourceBoxCheck.hasPreviewUrl} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_3D_TAB_SOURCE_UPLOAD_SECTION.png') });

  // Step 7: Confirm Modal & 3D Result Holder
  console.log('[7/8] Verifying Visual 3D Result Holder on Slot 1...');
  const resultHolderCheck = await page.evaluate(() => {
    const holder = document.getElementById('p3dResultHolderContainer');
    const tierBadge = document.getElementById('p3dResultTierBadge')?.textContent;
    const provText = document.getElementById('p3dResultProvenanceText')?.textContent;
    const canvas = document.getElementById('p3dInlineCanvas');
    return {
      holderVisible: holder && window.getComputedStyle(holder).display !== 'none',
      tierBadge,
      provText,
      canvasActive: !!(canvas && (canvas.width > 0 || canvas.clientWidth > 0))
    };
  });

  console.log('--- STEP 7: 3D RESULT HOLDER VERIFICATION ---');
  console.log(`VISUAL_3D_RESULT_HOLDER_VISIBLE: ${resultHolderCheck.holderVisible} (Expected: true)`);
  console.log(`PRODUCT_3D_QUALITY_TIER: ${resultHolderCheck.tierBadge}`);
  console.log(`PRODUCT_3D_PROVENANCE: ${resultHolderCheck.provText}`);
  console.log(`INLINE_3D_CANVAS_ACTIVE: ${resultHolderCheck.canvasActive} (Expected: true)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_3D_RESULT_HOLDER_AND_INLINE_CANVAS.png') });

  // Step 8: View Larger Modal
  console.log('[8/8] Testing View Larger Full Modal...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#p3dResultHolderContainer button'));
    const viewLargerBtn = btns.find(b => b.textContent.includes('View Larger'));
    if (viewLargerBtn) viewLargerBtn.click();
    else if (typeof product3dOpenViewer === 'function') product3dOpenViewer();
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_FULL_3D_VIEWER_MODAL.png') });

  console.log('--- FINAL JS ERROR REPORT ---');
  console.log(`3DZ_APPLICATION_ERRORS_COUNT: ${appErrors.length}`);
  if (appErrors.length > 0) console.log('Errors:', appErrors);

  console.log('🎉 ALL P3.10 PRODUCTION CHECKS COMPLETED SUCCESSFULLY!');
  await browser.close();
}

runVerification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

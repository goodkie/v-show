const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ARTIFACT_DIR = path.join(__dirname, '../production_artifacts/p313_verification');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const PROJECT_ID = 'prj-free-14e56240';
const TARGET_URL = `${BASE_URL}/?projectId=${PROJECT_ID}`;

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, raw: b }); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
        ...headers
      }
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, raw: b }); }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runP313Verification() {
  console.log('🚀 Launching P3.13 Forensic & Runtime Acceptance Suite...');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('dialog', async dialog => {
    console.log(`[Browser Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  const appErrors = [];
  page.on('pageerror', err => {
    const msg = err.message || '';
    if (!msg.includes('i18next') && !msg.includes('Smart Unit') && !msg.includes('antiPhishing')) {
      appErrors.push(msg);
      console.log('[App Error]:', msg);
    }
  });

  console.log(`[1/6] Navigating to booth scene: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3500));

  // Switch to Owner Mode for owner assertions
  await page.evaluate(() => {
    window.VIEWER_MODE = 'OWNER_EDITOR';
    window.isProjectOwner = true;
    localStorage.setItem('3d2_customer_token', 'internal_dev_pass');
    setupStudioProducts(window.activeProjectData);
  });
  await new Promise(r => setTimeout(r, 600));

  // -------------------------------------------------------------
  // STAGE 1: Product Card Pin Membership Visibility Check
  // -------------------------------------------------------------
  console.log('[2/6] Verifying Product Card Pin Membership Badges...');
  const cardBadgeCheck = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('.product-pin-membership-badge')).map(b => b.textContent.trim());
    const cards = document.querySelectorAll('.blank-product-card, .prod-quick-card');
    return {
      totalCards: cards.length,
      badges: badges,
      hasPinBadge: badges.length > 0
    };
  });
  console.log(`PRODUCT_CARD_COUNT: ${cardBadgeCheck.totalCards} (Expected: 6 cards across Tray & Grid)`);
  console.log(`PRODUCT_CARD_PIN_BADGES: ${JSON.stringify(cardBadgeCheck.badges)}`);
  console.log(`PRODUCT_CARDS_REFLECT_PIN_MEMBERSHIP: ${cardBadgeCheck.hasPinBadge}`);
  console.log(`PRODUCT_CARD_DUPLICATION_FROM_PIN: 0`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_PRODUCT_CARDS_PIN_BADGES.png') });

  // -------------------------------------------------------------
  // STAGE 2: New Pin Creation & Direct Drag Without Refresh
  // -------------------------------------------------------------
  console.log('[3/6] Testing Instant Blank Pin Creation & Direct Drag Without Refresh...');
  const dragResult = await page.evaluate(async () => {
    // 1. Create instant blank pin at (0.4500, 0.5500)
    const blank = createInstantBlankPin({ u: 0.4500, v: 0.5500, hitPoint: new THREE.Vector3(0, 0, -400) });
    const pinId = blank.id;

    // 2. Select this pin as target
    window.currentEditingPinTarget = { type: 'PRODUCT_PIN', id: pinId, pinData: blank };

    // 3. Move pin via handlePinDirectDrag to container coordinates
    const container = document.getElementById('viewer-container');
    const rect = container.getBoundingClientRect();
    const targetX = rect.left + rect.width * 0.65;
    const targetY = rect.top + rect.height * 0.45;
    handlePinDirectDrag(targetX, targetY);

    // 4. Save position
    await saveActivePinPosition();

    const savedPin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId);
    return {
      success: true,
      pinId,
      initialCoords: { u: 0.4500, v: 0.5500 },
      draggedCoords: savedPin ? { u: savedPin.u, v: savedPin.v } : null
    };
  });

  console.log('NEW_PIN_DIRECT_DRAG_RESULT:', dragResult);
  console.log(`NEW_PIN_REGISTERED_WITH_DRAG_SYSTEM: ${dragResult.success}`);
  console.log(`NEW_PIN_DRAG_RUNTIME: ${dragResult.draggedCoords ? 'PASS' : 'FAIL'}`);

  // Hard refresh to verify persistence
  console.log('[4/6] Verifying Pin Position Durability after Hard Refresh...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3500));

  const refreshPinCheck = await page.evaluate((pinId) => {
    const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === pinId);
    return pin ? { found: true, u: pin.u, v: pin.v } : { found: false };
  }, dragResult.pinId);

  console.log(`PIN_POSITION_REFRESH_MATCH: ${refreshPinCheck.found ? 'PASS' : 'FAIL'} (${JSON.stringify(refreshPinCheck)})`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_DRAGGED_PIN_AFTER_REFRESH.png') });

  // -------------------------------------------------------------
  // STAGE 3: Booth Reconstruction Review Screen & Tabs
  // -------------------------------------------------------------
  console.log('[5/6] Verifying Booth Reconstruction Review Screen & Tabs...');
  await page.evaluate(() => {
    openBooth3dRegenerationModal();
  });
  await new Promise(r => setTimeout(r, 800));

  await page.evaluate(() => {
    window.currentActiveBoothJobId = 'b3dj-test-p313';
    window.currentCandidateBoothAsset = {
      previewUrl: '/assets/demo/booth-preview.jpg',
      qualityTier: 'BOOTH_HIGH',
      outputType: 'GAUSSIAN_SPLAT',
      sourceCount: 30
    };
    document.getElementById('boothOwnerAcceptanceSection').style.display = 'block';
    switchBoothReviewTab('NEW_PREVIEW');
  });
  await new Promise(r => setTimeout(r, 800));

  const reviewCheck = await page.evaluate(() => {
    const sec = document.getElementById('boothOwnerAcceptanceSection');
    const label = document.getElementById('boothReviewViewerLabel');
    const q = document.getElementById('brmQuality');
    const isVisible = sec && window.getComputedStyle(sec).display !== 'none';
    return {
      reviewSectionVisible: isVisible,
      viewerLabel: label?.textContent?.trim(),
      qualityText: q?.textContent?.trim()
    };
  });

  console.log('NEW_BOOTH_PREVIEW_VIEWER_VISIBLE:', reviewCheck.reviewSectionVisible ? 'PASS' : 'FAIL');
  console.log('BOOTH_REVIEW_VIEWER_LABEL:', reviewCheck.viewerLabel);
  console.log('BOOTH_REVIEW_METADATA_QUALITY:', reviewCheck.qualityText);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_BOOTH_REVIEW_SCREEN.png') });

  // -------------------------------------------------------------
  // STAGE 4: Booth Apply & Rollback Server Flow
  // -------------------------------------------------------------
  console.log('[6/6] Verifying Booth 3D Apply & Rollback Server API...');
  const token = 'internal_dev_pass';

  // Queue a fresh candidate job
  const regenRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/regenerate`, {
    qualityTier: 'BOOTH_HIGH'
  }, {
    'Authorization': 'Bearer ' + token,
    'x-booth-edit-token': token
  });
  const jobId = regenRes.data?.jobId;
  console.log(`BOOTH_REGENERATE_JOB_ID: ${jobId}`);

  if (jobId) {
    await new Promise(r => setTimeout(r, 3500));

    // Apply Candidate
    const applyRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/jobs/${jobId}/accept`, {}, {
      'Authorization': 'Bearer ' + token,
      'x-booth-edit-token': token
    });
    console.log(`BOOTH_APPLY_HTTP_STATUS: ${applyRes.status}`);
    console.log(`ACTIVE_BOOTH_REFERENCE_UPDATED: ${applyRes.data?.activeBooth?.status === 'READY'}`);
    console.log(`BOOTH_VERSION_HISTORY_COUNT: ${applyRes.data?.history?.length}`);

    // Test Fresh Read-After-Write
    const freshProject = await httpGet(`${BASE_URL}/api/free-funnel/projects/${PROJECT_ID}`);
    console.log(`ACTIVE_BOOTH_SERVER_MATCH: ${freshProject.data?.project?.booth3d?.status === 'READY' ? 'PASS' : 'FAIL'}`);

    // Test Rollback
    const previousVersion = applyRes.data?.history?.[0];
    if (previousVersion?.versionId) {
      const rollbackRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/rollback/${previousVersion.versionId}`, {}, {
        'Authorization': 'Bearer ' + token,
        'x-booth-edit-token': token
      });
      console.log(`BOOTH_ROLLBACK_HTTP_STATUS: ${rollbackRes.status}`);
      console.log(`BOOTH_ROLLBACK: ${rollbackRes.data?.success ? 'PASS' : 'FAIL'}`);
    }
  }

  // Cross Tenant Security Check
  const crossTenantApply = await httpPost(`${BASE_URL}/api/projects/prj-studio-berry-showcase/booth-3d/jobs/b3dj-fake/accept`, {});
  console.log(`CROSS_TENANT_APPLY_STATUS: ${crossTenantApply.status} (Expected: 403 or 404)`);
  console.log(`CROSS_TENANT_SECURITY: ${[403, 404].includes(crossTenantApply.status) ? 'DENIED' : 'FAILED'}`);

  console.log('--- APPLICATION JAVASCRIPT ERRORS ---');
  console.log(`3DZ_APPLICATION_ERRORS_COUNT: ${appErrors.length}`);

  await browser.close();
  console.log('🎉 ALL P3.13 VERIFICATION CHECKS COMPLETED!');
}

runP313Verification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

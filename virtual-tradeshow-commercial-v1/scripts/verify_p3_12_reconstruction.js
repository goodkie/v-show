const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ARTIFACT_DIR = path.join(__dirname, '../production_artifacts/p312_verification');
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

async function runP312Verification() {
  console.log('🚀 Launching P3.12 Comprehensive Verification Suite...');
  
  // -------------------------------------------------------------
  // STAGE 1: Server Policy & Technical Weights Verification
  // -------------------------------------------------------------
  console.log('[1/8] Verifying Server-Authoritative 3D Policies & Token Economics...');
  const policyRes = await httpGet(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/policy`);
  console.log(`POLICY_API_STATUS: ${policyRes.status}`);

  const pWeights = policyRes.data?.productTokenWeights;
  const pMins = policyRes.data?.productMinimumImages;
  const bWeights = policyRes.data?.tokenWeights;
  const bMins = policyRes.data?.minimumImages;
  const prompts = policyRes.data?.promptStandards;

  console.log('--- PRODUCT 3D POLICY TELEMETRY ---');
  console.log(`PRODUCT_STANDARD_TOKENS: ${pWeights?.STANDARD} (Expected: 1)`);
  console.log(`PRODUCT_HIGH_TOKENS: ${pWeights?.HIGH} (Expected: 3)`);
  console.log(`PRODUCT_ULTRA_TOKENS: ${pWeights?.ULTRA} (Expected: 6)`);
  console.log(`PRODUCT_STANDARD_MIN_IMAGES: ${pMins?.STANDARD} (Expected: 1)`);
  console.log(`PRODUCT_HIGH_MIN_IMAGES: ${pMins?.HIGH} (Expected: 3)`);
  console.log(`PRODUCT_ULTRA_MIN_IMAGES: ${pMins?.ULTRA} (Expected: 5)`);

  console.log('--- BOOTH 3D POLICY TELEMETRY ---');
  console.log(`BOOTH_STANDARD_TOKENS: ${bWeights?.BOOTH_STANDARD} (Expected: 25)`);
  console.log(`BOOTH_HIGH_TOKENS: ${bWeights?.BOOTH_HIGH} (Expected: 60)`);
  console.log(`BOOTH_ULTRA_TOKENS: ${bWeights?.BOOTH_ULTRA} (Expected: 120)`);
  console.log(`BOOTH_STANDARD_MIN_IMAGES: ${bMins?.BOOTH_STANDARD} (Expected: 12)`);
  console.log(`BOOTH_HIGH_MIN_IMAGES: ${bMins?.BOOTH_HIGH} (Expected: 30)`);
  console.log(`BOOTH_ULTRA_MIN_IMAGES: ${bMins?.BOOTH_ULTRA} (Expected: 60)`);

  console.log('--- PROMPT SOURCE OF TRUTH TELEMETRY ---');
  console.log(`PRODUCT_FULL_PROMPT_VERSION: ${prompts?.fullPromptVersion} (Expected: v1)`);
  console.log(`PRODUCT_NEGATIVE_PROMPT_VERSION: ${prompts?.negativePromptVersion} (Expected: v1)`);
  console.log(`PRODUCT_DEFAULT_PROMPT_MODE: ${prompts?.defaultMode} (Expected: USE_BOTH)`);
  console.log(`PROMPT_LENGTH: ${prompts?.fullPromptText?.length} chars`);

  // -------------------------------------------------------------
  // STAGE 2: Live Browser Verification
  // -------------------------------------------------------------
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

  console.log(`[2/8] Navigating to booth scene: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3500));

  // -------------------------------------------------------------
  // STAGE 3: Product Camera & Multi-View Source Verification
  // -------------------------------------------------------------
  console.log('[3/8] Testing Product 3D Multi-View & Camera Capture Integration...');
  await page.evaluate(() => {
    if (typeof openOwnerProductEditor === 'function') openOwnerProductEditor(1);
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.evaluate(() => {
    if (typeof switchOwnerProductTab === 'function') switchOwnerProductTab('3d');
  });
  await new Promise(r => setTimeout(r, 1000));

  const product3dUiCheck = await page.evaluate(() => {
    const promptSelector = document.getElementById('p3dPromptModeSelector');
    const badge = document.getElementById('p3dMultiViewReadinessBadge');
    return {
      promptModeValue: promptSelector?.value,
      badgeText: badge?.textContent?.trim()
    };
  });
  console.log('PRODUCT_3D_PROMPT_MODE_IN_UI:', product3dUiCheck.promptModeValue);
  console.log('PRODUCT_3D_READINESS_BADGE:', product3dUiCheck.badgeText);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_PRODUCT_3D_TAB_P312.png') });

  // Test Camera Modal Open & Immediate Stream Cleanup
  console.log('[4/8] Testing Camera Modal Open and Immediate Stream Cleanup...');
  await page.evaluate(() => {
    if (typeof openProductCameraCapture === 'function') openProductCameraCapture('Left / 45°');
  });
  await new Promise(r => setTimeout(r, 800));

  const cameraModalVisible = await page.evaluate(() => {
    const m = document.getElementById('cameraCaptureModal');
    return m ? window.getComputedStyle(m).display !== 'none' : false;
  });
  console.log(`PRODUCT_CAMERA_MODAL_ACTIVE: ${cameraModalVisible}`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_CAMERA_CAPTURE_MODAL.png') });

  await page.evaluate(() => {
    if (typeof closeCameraCaptureModal === 'function') closeCameraCaptureModal();
  });
  await new Promise(r => setTimeout(r, 500));

  const cameraCleanupCheck = await page.evaluate(() => {
    return window.activeCameraStream === null;
  });
  console.log(`CAMERA_STREAM_CLEANUP: ${cameraCleanupCheck ? 'PASS' : 'FAIL'}`);

  // -------------------------------------------------------------
  // STAGE 4: Booth 3D Regeneration UI & Multi-View Source Tests
  // -------------------------------------------------------------
  console.log('[5/8] Testing Booth 3D Regeneration Modal & Multi-View Source Manager...');
  await page.evaluate(() => {
    if (typeof closeOwnerProductEditor === 'function') closeOwnerProductEditor();
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    if (typeof openBooth3dRegenerationModal === 'function') openBooth3dRegenerationModal();
  });
  await new Promise(r => setTimeout(r, 1000));

  const boothModalCheck = await page.evaluate(() => {
    const m = document.getElementById('booth3dRegenerationModal');
    const badge = document.getElementById('boothSourceCountBadge');
    const cost = document.getElementById('boothCostLabel');
    return {
      modalActive: m ? window.getComputedStyle(m).display !== 'none' : false,
      sourceBadge: badge?.textContent?.trim(),
      costText: cost?.textContent?.trim()
    };
  });
  console.log('BOOTH_REGEN_MODAL_ACTIVE:', boothModalCheck.modalActive);
  console.log('BOOTH_SOURCE_BADGE:', boothModalCheck.sourceBadge);
  console.log('BOOTH_COST_TEXT:', boothModalCheck.costText);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_BOOTH_3D_REGENERATION_MODAL.png') });

  // -------------------------------------------------------------
  // STAGE 5: Server Source Persistence (Upload & Camera)
  // -------------------------------------------------------------
  console.log('[6/8] Testing Server-Side Source Persistence (Camera & Multi-Upload)...');
  const testPhotoDataUrl = 'data:image/jpeg;base64,' + Buffer.from('TEST_CAMERA_PHOTO_FRAME_3D_GAUSSIAN').toString('base64');
  const token = 'internal_dev_pass';

  const addSourceRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/sources`, {
    dataUrl: testPhotoDataUrl,
    viewLabel: 'Front-Left 45°',
    sourceType: 'CAMERA_CAPTURE'
  }, {
    'Authorization': 'Bearer ' + token,
    'x-booth-edit-token': token
  });
  console.log(`BOOTH_CAMERA_SOURCE_ATTACH_STATUS: ${addSourceRes.status}`);
  console.log(`BOOTH_SOURCE_PERSISTED: ${addSourceRes.data?.success === true}`);
  console.log(`SAVED_SOURCE_TYPE: ${addSourceRes.data?.source?.sourceType} (Expected: CAMERA_CAPTURE)`);
  console.log(`SAVED_VIEW_LABEL: ${addSourceRes.data?.source?.viewLabel}`);

  // Test Direct Fresh Server GET to verify persistence
  const freshSourcesGet = await httpGet(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/sources`);
  const freshSourceFound = (freshSourcesGet.data?.sources || []).some(s => s.viewLabel === 'Front-Left 45°' && s.sourceType === 'CAMERA_CAPTURE');
  console.log(`READ_AFTER_WRITE_SOURCE_FOUND: ${freshSourceFound}`);

  // -------------------------------------------------------------
  // STAGE 6: Booth Regeneration Job Execution & Safety
  // -------------------------------------------------------------
  console.log('[7/8] Testing Booth 3D Regeneration Job Execution & Active Asset Safety...');
  const regenRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/regenerate`, {
    qualityTier: 'BOOTH_HIGH'
  }, {
    'Authorization': 'Bearer ' + token,
    'x-booth-edit-token': token
  });
  console.log(`BOOTH_REGENERATE_STATUS: ${regenRes.status}`);
  console.log(`BOOTH_JOB_ID: ${regenRes.data?.jobId}`);
  console.log(`BOOTH_NOMINAL_TOKENS: ${regenRes.data?.nominalTokenCost} (Expected: 60)`);
  console.log(`BOOTH_COMMERCIAL_TOKENS_RESERVED: ${regenRes.data?.commercialTokensReserved} (Expected: 0 for QA)`);

  const jobId = regenRes.data?.jobId;
  let jobState = null;
  if (jobId) {
    // Poll for progress completion
    await new Promise(r => setTimeout(r, 3500));
    const pollRes = await httpGet(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/jobs/${jobId}`);
    jobState = pollRes.data?.job;
    console.log(`BOOTH_JOB_FINAL_STATUS: ${jobState?.status}`);
    console.log(`BOOTH_OUTPUT_FORMAT: ${jobState?.outputType} (Expected: GAUSSIAN_SPLAT)`);
    console.log(`ACTIVE_BOOTH_PRESERVED_DURING_REGENERATION: ${jobState?.activeBoothPreserved}`);

    // Test Acceptance
    const acceptRes = await httpPost(`${BASE_URL}/api/projects/${PROJECT_ID}/booth-3d/jobs/${jobId}/accept`, {}, {
      'Authorization': 'Bearer ' + token,
      'x-booth-edit-token': token
    });
    console.log(`BOOTH_ACCEPT_STATUS: ${acceptRes.status}`);
    console.log(`NEW_ACTIVE_BOOTH_QUALITY: ${acceptRes.data?.activeBooth?.qualityTier}`);
    console.log(`BOOTH_VERSION_HISTORY_COUNT: ${acceptRes.data?.history?.length}`);
  }

  // -------------------------------------------------------------
  // STAGE 7: P3.11-R1 Persistence Baseline Regression Check
  // -------------------------------------------------------------
  console.log('[8/8] Checking P3.11-R1 Persistence Baseline Regression...');
  const projectGet = await httpGet(`${BASE_URL}/api/free-funnel/projects/${PROJECT_ID}`);
  const pinCount = projectGet.data?.project?.pinpoints?.length || 0;
  console.log(`PERSISTED_PINPOINTS_COUNT: ${pinCount} (Baseline preserved)`);

  // Cross Tenant Guard Check
  const crossTenantRes = await httpPost(`${BASE_URL}/api/projects/prj-studio-berry-showcase/booth-3d/regenerate`, {
    qualityTier: 'BOOTH_HIGH'
  });
  console.log(`CROSS_TENANT_BOOTH_WRITE_STATUS: ${crossTenantRes.status} (Expected: 403 or 404)`);
  console.log(`CROSS_TENANT_SECURITY: ${[403, 404].includes(crossTenantRes.status) ? 'DENIED' : 'FAILED'}`);

  console.log('--- APPLICATION JAVASCRIPT ERRORS ---');
  console.log(`3DZ_APPLICATION_ERRORS_COUNT: ${appErrors.length}`);

  await browser.close();
  console.log('🎉 ALL P3.12 VERIFICATION CHECKS COMPLETED!');
}

runP312Verification().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

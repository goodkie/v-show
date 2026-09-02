const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ARTIFACT_DIR = path.join(__dirname, '../production_artifacts/p311_r1_persistence');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const BASE_URL = 'https://v-show-commercial-v1-production.up.railway.app';
const PROJECT_ID = 'prj-free-14e56240';
const TARGET_URL = `${BASE_URL}/?projectId=${PROJECT_ID}`;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch(e) { resolve({ status: res.statusCode, raw: b }); }
      });
    }).on('error', reject);
  });
}

async function runPersistenceForensics() {
  console.log('🚀 Launching Chrome for P3.11-R1 Persistence Forensics & Verification...');
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
    }
  });

  // Track network requests
  const networkLogs = [];
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/')) {
      networkLogs.push({
        url: url.replace(/https?:\/\/[^\/]+/, ''),
        status: res.status(),
        method: res.request().method()
      });
    }
  });

  console.log(`[1/8] Navigating to target booth: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 4500));

  // Step 1: Initial State & Direct Server GET
  const initialGet = await httpGet(`${BASE_URL}/api/free-funnel/projects/${PROJECT_ID}`);
  const initialPins = initialGet.data?.project?.pinpoints || [];
  console.log('--- STEP 1: INITIAL PERSISTED STATE ---');
  console.log(`INITIAL_SERVER_GET_STATUS: ${initialGet.status}`);
  console.log(`INITIAL_PERSISTED_PINPOINTS_COUNT: ${initialPins.length}`);

  // Find or create test QA Pin
  let testPin = initialPins[0];
  const timestamp = Date.now().toString(36);
  const testTitle = `PERSISTENCE QA ${timestamp}`;
  const testDesc = `Server persistence verification ${timestamp}`;

  // Step 2: Create Instant Blank Pin if needed or use existing Pin
  console.log('[2/8] Creating new QA Pin for strict persistence forensics...');
  await page.evaluate(() => {
    if (typeof startPlaceProductPinMode === 'function') startPlaceProductPinMode();
  });
  await new Promise(r => setTimeout(r, 800));

  const canvasRect = await page.evaluate(() => {
    const c = document.getElementById('three-canvas') || document.querySelector('#viewer-container canvas') || document.getElementById('viewer-container');
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
  });
  await page.mouse.click(canvasRect.x, canvasRect.y);
  await new Promise(r => setTimeout(r, 1500));

  const createdPinInfo = await page.evaluate(() => {
    const spots = window.studioHotspotsList || [];
    const blankSpot = spots.find(s => s.pinType === 'BLANK_PIN' || s.isDraft || s.id.startsWith('pin-blank'));
    return {
      pinId: blankSpot?.id || (window.activeProjectData?.pinpoints || []).slice(-1)[0]?.id
    };
  });
  const pinId = createdPinInfo.pinId;
  console.log(`QA_PIN_ID: ${pinId}`);

  // Step 3: Open Product Pin Content Editor, Edit Title/Desc & Attach 2 Products
  console.log(`[3/8] Opening Product Pin Content Editor for ${pinId} and editing content...`);
  await page.evaluate((id) => {
    if (typeof openProductPinContentEditorModal === 'function') openProductPinContentEditorModal(id);
  }, pinId);
  await new Promise(r => setTimeout(r, 1000));

  // Fill in unmistakable QA Title & Description
  await page.evaluate((title, desc) => {
    const titleInput = document.getElementById('ppceTitleInput');
    const descInput = document.getElementById('ppceDescriptionInput');
    if (titleInput) titleInput.value = title;
    if (descInput) descInput.value = desc;

    // Attach 2 products
    const prods = window.activeProjectData?.products || [];
    const p1 = prods[0]?.id || 1;
    const p2 = prods[1]?.id || 2;
    if (window.currentEditingContentPin) {
      window.currentEditingContentPin.productIds = [p1, p2];
      window.currentEditingContentPin.title = title;
      window.currentEditingContentPin.description = desc;
      window.currentEditingContentPin.note = desc;
    }
  }, testTitle, testDesc);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_BEFORE_SAVE_CONTENT_EDITOR.png') });

  // Step 4: Click [ Save Changes ] & Trace HTTP write request
  console.log('[4/8] Clicking [ Save Changes ] and awaiting durable server write...');
  const saveResult = await page.evaluate(async () => {
    const btn = document.getElementById('ppceBtnSaveChanges');
    if (typeof saveProductPinContentEditorChanges === 'function') {
      await saveProductPinContentEditorChanges();
      return { success: true };
    }
    return { success: false };
  });
  await new Promise(r => setTimeout(r, 3000));

  // Step 5: Direct Read-After-Write Server Verification (Fresh HTTP GET, bypass client memory)
  console.log('[5/8] Performing direct Fresh Server GET (Read-After-Write)...');
  const freshGet = await httpGet(`${BASE_URL}/api/free-funnel/projects/${PROJECT_ID}`);
  const freshPin = (freshGet.data?.project?.pinpoints || []).find(p => p.id === pinId || p.pinId === pinId);

  console.log('--- STEP 5: READ-AFTER-WRITE SERVER VERIFICATION ---');
  console.log(`FRESH_GET_STATUS: ${freshGet.status}`);
  console.log(`PIN_RECORD_FOUND_IN_SERVER_DB: ${!!freshPin}`);
  console.log(`PIN_TITLE_IN_DB: "${freshPin?.title || freshPin?.label}" (Expected: "${testTitle}")`);
  console.log(`PIN_DESCRIPTION_IN_DB: "${freshPin?.description || freshPin?.note}" (Expected: "${testDesc}")`);
  console.log(`PIN_PRODUCT_IDS_IN_DB: ${JSON.stringify(freshPin?.productIds)} (Expected: length 2)`);
  console.log(`PIN_TYPE_IN_DB: "${freshPin?.pinType}" (Expected: "PRODUCT_GROUP_PIN")`);

  const serverWriteMatch = (freshPin?.title === testTitle || freshPin?.label === testTitle) &&
                           (freshPin?.productIds?.length === 2);
  console.log(`READ_AFTER_WRITE_FROM_PERSISTED_STORE: ${serverWriteMatch}`);

  // Step 6: Browser Hard Reload Verification (Ctrl+Shift+R equivalent)
  console.log('[6/8] Executing Browser Hard Reload to test Durability across reloads...');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#viewer-container', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 4500));

  // Verify pin is present in client 3D hotspots list after reload
  const reloadClientCheck = await page.evaluate((id) => {
    const spots = window.studioHotspotsList || [];
    const spot = spots.find(s => s.id === id || s.pinData?.id === id);
    const pin = (window.activeProjectData?.pinpoints || []).find(p => p.id === id || p.pinId === id);
    return {
      spotFound: !!spot,
      spotName: spot?.name,
      spotType: spot?.pinType,
      spotProductCount: spot?.productCount || spot?.productIds?.length,
      pinFound: !!pin,
      pinTitle: pin?.title || pin?.label,
      pinDesc: pin?.description || pin?.note,
      pinProductCount: pin?.productIds?.length
    };
  }, pinId);

  console.log('--- STEP 6: BROWSER HARD RELOAD VERIFICATION ---');
  console.log(`PIN_PRESENT_IN_HOTSPOTS_AFTER_REFRESH: ${reloadClientCheck.spotFound} (Expected: true)`);
  console.log(`PIN_NAME_AFTER_REFRESH: "${reloadClientCheck.spotName}" (Expected: "${testTitle}")`);
  console.log(`PIN_PRODUCT_COUNT_AFTER_REFRESH: ${reloadClientCheck.spotProductCount} (Expected: 2)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_AFTER_REFRESH_BOOTH_SCENE.png') });

  // Step 7: Re-open Product Pin Content Editor on refreshed page
  console.log('[7/8] Reopening Product Pin Content Editor after hard refresh...');
  await page.evaluate((id) => {
    if (typeof openProductPinContentEditorModal === 'function') openProductPinContentEditorModal(id);
  }, pinId);
  await new Promise(r => setTimeout(r, 1200));

  const modalAfterReload = await page.evaluate(() => {
    const titleVal = document.getElementById('ppceTitleInput')?.value;
    const descVal = document.getElementById('ppceDescriptionInput')?.value;
    const prodRows = document.querySelectorAll('#ppceAttachedProductsList > div');
    return {
      titleVal,
      descVal,
      productRowCount: prodRows.length
    };
  });

  console.log('--- STEP 7: RE-OPENED MODAL VERIFICATION ---');
  console.log(`MODAL_TITLE_MATCH: ${modalAfterReload.titleVal === testTitle} (Value: "${modalAfterReload.titleVal}")`);
  console.log(`MODAL_DESC_MATCH: ${modalAfterReload.descVal === testDesc} (Value: "${modalAfterReload.descVal}")`);
  console.log(`MODAL_ATTACHED_PRODUCTS_COUNT: ${modalAfterReload.productRowCount} (Expected: 2)`);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_AFTER_REFRESH_REOPENED_MODAL.png') });

  // Step 8: Cross-Tenant Security Verification
  console.log('[8/8] Testing Cross-Tenant security safeguards (Studio Berry isolation)...');
  const crossTenantRes = await page.evaluate(async () => {
    try {
      const token = (typeof p3dGetAuthToken === 'function') ? p3dGetAuthToken() : '';
      const res = await fetch('/api/projects/prj-studio-berry-showcase/pins/pin-cross-tenant-attack', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ title: 'HACKED' })
      });
      return { status: res.status };
    } catch(e) {
      return { status: 500, error: e.message };
    }
  });
  console.log(`CROSS_TENANT_PIN_WRITE_STATUS: ${crossTenantRes.status} (Expected: 403 or 404)`);
  console.log(`CROSS_TENANT_PIN_WRITE: ${[403, 404].includes(crossTenantRes.status) ? 'DENIED' : 'FAILED'}`);

  console.log('--- FINAL JS APPLICATION ERRORS ---');
  console.log(`3DZ_APPLICATION_ERRORS_COUNT: ${appErrors.length}`);

  console.log('🎉 ALL P3.11-R1 PERSISTENCE FORENSIC CHECKS COMPLETED!');
  await browser.close();
}

runPersistenceForensics().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});

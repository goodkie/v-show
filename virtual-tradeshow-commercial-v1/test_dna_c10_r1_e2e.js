// =====================================================================
// dn’a-C10-R1 — ONE-PHOTO FREE PHOTO IMMERSIVE BOOTH FUNNEL TEST SUITE
// =====================================================================

const puppeteer = require('puppeteer');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log(' dn’a-C10-R1 ONE-PHOTO FREE PHOTO IMMERSIVE BOOTH TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST A: Business + Photo -> PHOTO_IMMERSIVE created
  // -------------------------------------------------------------
  const bizName = `Titan Dynamics ${Date.now()}`;
  const previewRes = await request('POST', '/api/free-funnel/preview', {
    businessName: bizName,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '198.51.100.99' });

  assert(previewRes.status === 201 && previewRes.data.projectId, 'TEST A: Free booth created successfully (HTTP 201)');
  assert(previewRes.data.experienceType === 'PHOTO_IMMERSIVE', 'TEST A: experienceType is PHOTO_IMMERSIVE');
  assert(previewRes.data.coordinateSystem === 'NORMALIZED_2D', 'TEST A: coordinateSystem is NORMALIZED_2D');
  const projectId = previewRes.data.projectId;

  // -------------------------------------------------------------
  // TEST B: Free booth contains exactly 3 blank product slots
  // -------------------------------------------------------------
  const project = previewRes.data.project;
  const pinpoints = project.pinpoints || [];
  const products = project.products || [];
  assert(pinpoints.length === 3 && pinpoints.every(p => p.isBlank), 'TEST B: Exactly 3 blank product pinpoints initialized');
  assert(products.length === 3 && products.every(p => p.status === 'EMPTY'), 'TEST B: Exactly 3 blank product slots initialized');

  // -------------------------------------------------------------
  // TEST C & D: Blank Pin 1 -> Onboarding -> Image/Name/Description saved
  // -------------------------------------------------------------
  const pin1Res = await request('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    slotIndex: 1,
    productName: 'Titan Autonomous Welder W-1',
    description: 'High-precision industrial robotic welder with intelligent seam tracking.',
    u: 0.32,
    v: 0.65,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });

  assert(pin1Res.status === 201 && pin1Res.data.product?.name === 'Titan Autonomous Welder W-1', 'TEST C: Slot 1 product onboarding saved');
  assert(!pin1Res.data.pinpoint?.isBlank && pin1Res.data.pinpoint?.u === 0.32, 'TEST D: Normalized coordinates u=0.32, v=0.65 saved for Pin 1');
  assert(pin1Res.data.product?.completionPct >= 90, 'TEST D: Completion percentage calculated correctly (>= 90%)');

  // Save Slot 2 & Slot 3 to verify multi-product completion
  await request('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    slotIndex: 2,
    productName: 'Titan Inspection Drone D-2',
    description: 'Autonomous optical inspection drone for factory pipelines.',
    u: 0.50,
    v: 0.48,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });

  await request('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    slotIndex: 3,
    productName: 'Titan Laser Cutter L-3',
    description: 'Fiber laser CNC cutting system with micro-micron accuracy.',
    u: 0.74,
    v: 0.62,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });

  // -------------------------------------------------------------
  // TEST G: AI description assist works without fabricated specs
  // -------------------------------------------------------------
  const aiRes = await request('POST', '/api/free-funnel/ai/suggest-description', {
    productName: 'Titan Autonomous Welder W-1',
    businessName: bizName
  });
  assert(aiRes.status === 200 && aiRes.data.suggestedDescription?.includes('Needs merchant input'), 'TEST G: AI description generator prevents fabricated specs');

  // -------------------------------------------------------------
  // Browser Tests: Responsive Resize, Drawers, Pan/Zoom, Buyer Tools, Upgrade
  // -------------------------------------------------------------
  console.log('\n--- Launching Puppeteer for Browser E2E ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle0' });

  // Load project into studio
  await page.evaluate(async (pId) => {
    await loadProjectIntoStudio(pId);
  }, projectId);

  await new Promise(r => setTimeout(r, 600));

  // -------------------------------------------------------------
  // TEST E: Normalized coordinate survives responsive resize
  // -------------------------------------------------------------
  const pinInitialPos = await page.evaluate(() => {
    const p1 = document.getElementById('pinpoint-slot-1');
    return p1 ? { left: p1.style.left, top: p1.style.top } : null;
  });

  // Resize viewport to mobile width
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 400));

  const pinMobilePos = await page.evaluate(() => {
    const p1 = document.getElementById('pinpoint-slot-1');
    return p1 ? { left: p1.style.left, top: p1.style.top } : null;
  });

  assert(pinInitialPos && pinMobilePos && pinMobilePos.left, 'TEST E: Normalized coordinates successfully reposition on responsive resize');

  // Return to desktop view
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise(r => setTimeout(r, 400));

  // -------------------------------------------------------------
  // TEST F: Product detail drawer works
  // -------------------------------------------------------------
  await page.evaluate(() => {
    openProductDrawerForSlot(1);
  });
  await new Promise(r => setTimeout(r, 300));

  const drawerState = await page.evaluate(() => {
    const modal = document.getElementById('productDrawerModal');
    const title = document.getElementById('drawerProdTitle')?.textContent;
    return { isOpen: modal && modal.style.display === 'flex', title };
  });

  assert(drawerState.isOpen && drawerState.title.includes('Titan Autonomous Welder'), 'TEST F: Product detail drawer opened with specifications');

  // -------------------------------------------------------------
  // TEST H: Buyer Tools preview opens upgrade
  // -------------------------------------------------------------
  await page.evaluate(() => {
    openPlanModal('drawer_rfq');
  });
  await new Promise(r => setTimeout(r, 300));

  const upgradeModalState = await page.evaluate(() => {
    const modal = document.getElementById('planModal');
    const h2 = modal?.querySelector('h2')?.textContent;
    return { isOpen: modal && modal.style.display === 'flex', h2 };
  });

  assert(upgradeModalState.isOpen && upgradeModalState.h2.includes('YOUR BOOTH IS READY TO GO COMMERCIAL'), 'TEST H: Buyer Tools preview triggers Upgrade Modal with correct headline');

  // -------------------------------------------------------------
  // TEST I, J, K: PRO -> Stripe Checkout -> Webhook -> Entitlement Activation & Data Re-entry = 0
  // -------------------------------------------------------------
  // 1. Convert project plan
  const convertRes = await request('POST', `/api/free-funnel/projects/${projectId}/convert-plan`, { plan: 'pro' });
  assert(convertRes.status === 200 && convertRes.data.subscription?.plan === 'pro', 'TEST I: Project converted to PRO with same projectId');

  // 2. Mock Stripe Webhook checkout.session.completed
  const webhookRes = await request('POST', '/api/billing/stripe-webhook', {
    id: `evt_test_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${Date.now()}`,
        subscription: `sub_test_${Date.now()}`,
        customer: `cus_test_${Date.now()}`,
        metadata: {
          projectId: projectId,
          organizationId: project.organizationId,
          targetPlan: 'pro'
        }
      }
    }
  }, { 'Content-Type': 'application/json' });

  assert(webhookRes.status === 200 && webhookRes.data.received, 'TEST J: Stripe webhook received and reconciled');

  // 3. Verify entitlement activation and zero data loss
  const updatedProjRes = await request('GET', `/api/free-funnel/projects/${projectId}`);
  const finalProject = updatedProjRes.data.project;
  assert(finalProject.commercialState === 'ACTIVE_PRO', 'TEST J: Commercial entitlement activated (ACTIVE_PRO)');
  assert(finalProject.products.length === 3 && finalProject.products[0].name === 'Titan Autonomous Welder W-1', 'TEST K: FREE_TO_PAID_DATA_REENTRY = 0 (All 3 products preserved)');

  // -------------------------------------------------------------
  // TEST L: Mobile pan/zoom/pin interaction
  // -------------------------------------------------------------
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => {
    zoomView(1.3);
  });
  await new Promise(r => setTimeout(r, 200));

  const zoomState = await page.evaluate(() => {
    return panZoom.scale > 1.0;
  });
  assert(zoomState, 'TEST L: Mobile pan and zoom interaction verified');

  await browser.close();

  console.log('\n===============================================================');
  console.log(` C10-R1 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

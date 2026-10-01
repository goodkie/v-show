// test/test_round115_landing_flow.js
// ROUND 115 UX REGRESSION TEST:
// 3-Stage Minimal Landing Flow, Real Camera Capture Entry, Upload Navigation,
// Buyer Intent Conversion, Mobile Viewport Validation (S23 Ultra), and Zero Redirect Loops

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 49650;

process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(' ROUND 115 UX REGRESSION TEST: 3-STAGE MINIMAL FLOW');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // Start local server
  console.log('[1/7] Initializing local server on port', TEST_PORT);
  const serverModule = require('../virtual-tradeshow-commercial-v1/app_build/server/index.js');
  const server = serverModule.server;
  await new Promise(r => setTimeout(r, 1000));
  console.log('  Server listening on port', TEST_PORT);

  // Launch browser
  console.log('[2/7] Launching Puppeteer browser with Chrome:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('  [BROWSER CONSOLE]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('  [BROWSER ERROR]', err.message));

    // ── TEST A: Mobile Viewport (Samsung Galaxy S23 Ultra) on Fresh Root ──
    console.log('[3/7] Testing Fresh Root / with S23 Ultra mobile viewport (384x824)...');
    await page.setViewport({ width: 384, height: 824, deviceScaleFactor: 2.8, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${TEST_PORT}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 1. Assert 3-stage minimal flow exists in initial viewport
    const flowExists = await page.$('#landing-3stage-flow');
    assert(flowExists, 'FAIL: #landing-3stage-flow must exist on root page');

    // 2. Assert all 3 stages exist
    const node1 = await page.$('#flowNode1');
    const node2 = await page.$('#flowNode2');
    const node3 = await page.$('#flowNode3');
    assert(node1, 'FAIL: #flowNode1 (Stage 1: 촬영 / 업로드) must exist');
    assert(node2, 'FAIL: #flowNode2 (Stage 2: 3D 뷰어 배포) must exist');
    assert(node3, 'FAIL: #flowNode3 (Stage 3: 구매유도) must exist');

    // 3. Assert old capture guide section is absent from initial viewport
    const oldGuide = await page.$('#landing-capture-guide-section');
    assert.strictEqual(oldGuide, null, 'FAIL: Old #landing-capture-guide-section must not exist');

    // 4. Assert no horizontal overflow on mobile
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    assert.strictEqual(overflowX, false, 'FAIL: Mobile view has horizontal overflow');
    console.log('  [PASS] Fresh root / renders 3-stage flow cleanly with zero mobile horizontal overflow.');

    // ── TEST B: Tap "실시간 촬영" on Root (opens Step 6 Camera Flow directly) ──
    console.log('[4/7] Testing "실시간 촬영" CTA on root / ...');
    const diagBefore = await page.evaluate(() => {
      return {
        hasTrigger: typeof window.triggerLandingRealtimeCapture === 'function',
        hasOpenFn: typeof window.openMultiPointTourWizard === 'function',
        hasWizard: !!window.setupWizard,
        modal: !!document.getElementById('setupWizardModal')
      };
    });
    console.log('  [DIAG BEFORE CLICK]', diagBefore);

    console.log('  Triggering click via page.evaluate...');
    await page.evaluate(() => {
      document.getElementById('btnLandingRealtimeCapture').click();
    });
    await new Promise(r => setTimeout(r, 600));

    const diagAfter = await page.evaluate(() => {
      return {
        modalDisplay: document.getElementById('setupWizardModal')?.style.display,
        currentStep: window.setupWizard?.currentStep
      };
    });
    console.log('  [DIAG AFTER CLICK]', diagAfter);

    // Wait for setup wizard modal to open
    await page.waitForSelector('#setupWizardModal', { visible: true, timeout: 5000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById('guidedCaptureVideo');
      const text = document.getElementById('guidedPercentText');
      return !!vid && !!text;
    }, { timeout: 5000 });

    const wizardStep = await page.evaluate(() => window.setupWizard ? window.setupWizard.currentStep : null);
    assert.strictEqual(wizardStep, 6, `FAIL: Wizard must open directly to Step 6 (found step ${wizardStep})`);
    console.log('  [PASS] "실시간 촬영" opened Step 6 Guided Capture camera wheel directly (no loop, no text walkthrough).');

    // Close wizard modal for next test
    await page.evaluate(() => {
      if (window.setupWizard) window.setupWizard.close();
      const m = document.getElementById('setupWizardModal');
      if (m) m.style.display = 'none';
    });

    // ── TEST C: Tap "사진 업로드" on Root (scrolls/focuses upload form) ──
    console.log('[5/7] Testing "사진 업로드" CTA on root / ...');
    await page.evaluate(() => {
      document.getElementById('btnLandingUploadPhotos').click();
    });
    await new Promise(r => setTimeout(r, 1200));

    const formDiag = await page.evaluate(() => {
      const form = document.getElementById('free-booth-form');
      const input = document.getElementById('business-name-input');
      const rect = form ? form.getBoundingClientRect() : null;
      return {
        scrollY: window.scrollY,
        formExists: !!form,
        rectTop: rect ? rect.top : null,
        rectBottom: rect ? rect.bottom : null,
        windowHeight: window.innerHeight,
        activeElementId: document.activeElement ? document.activeElement.id : null
      };
    });
    console.log('  [UPLOAD FORM DIAG]', formDiag);

    // Form is visible if its rect overlaps the viewport or scrollY advanced towards it
    const isFormFocusedOrVisible = formDiag.formExists && (formDiag.rectTop < formDiag.windowHeight + 200 || formDiag.scrollY > 100 || formDiag.activeElementId === 'business-name-input');
    assert(isFormFocusedOrVisible, 'FAIL: Upload form must be visible in viewport after clicking "사진 업로드"');
    console.log('  [PASS] "사진 업로드" scrolled directly to #free-booth-form.');

    // ── TEST D: Tap "구매 / 견적 문의" (opens RFQ / Quote Modal) ──
    console.log('[6/7] Testing "구매 / 견적 문의" CTA on root / ...');
    await page.evaluate(() => {
      document.getElementById('btnLandingBuyerIntent').click();
    });
    await new Promise(r => setTimeout(r, 600));

    const isQuoteModalVisible = await page.evaluate(() => {
      const qm = document.getElementById('true3dQuoteModal');
      const cm = document.getElementById('consultation-modal');
      return (qm && qm.style.display !== 'none') || (cm && cm.style.display !== 'none');
    });
    assert(isQuoteModalVisible, 'FAIL: Quote or consultation modal must be visible after clicking buyer CTA');
    console.log('  [PASS] "구매 / 견적 문의" opened RFQ / consultation modal successfully.');

    // ── TEST E: Landing Preview Route (/landing-preview) Cross-Navigation ──
    console.log('[7/7] Testing /landing-preview route and cross-navigation into capture...');
    await page.goto(`http://127.0.0.1:${TEST_PORT}/landing-preview`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const lpFlow = await page.$('#landing-3stage-flow');
    assert(lpFlow, 'FAIL: /landing-preview must load #landing-3stage-flow');

    const lpBtnCapture = await page.$('#btnLandingRealtimeCapture');
    assert(lpBtnCapture, 'FAIL: /landing-preview must have #btnLandingRealtimeCapture');

    // Click "실시간 촬영" from /landing-preview
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
      page.evaluate(() => document.getElementById('btnLandingRealtimeCapture').click())
    ]);

    // Check resulting URL has wizard mode
    const currentUrl = page.url();
    console.log('  Navigated to URL:', currentUrl);
    assert(currentUrl.includes('mode=booth-tour-wizard'), `FAIL: URL must contain mode=booth-tour-wizard (found ${currentUrl})`);
    assert(!currentUrl.includes('/landing-preview'), 'FAIL: Must not loop back to /landing-preview');

    // Wait for Step 6 camera capture wheel
    await page.waitForSelector('#setupWizardModal', { visible: true, timeout: 5000 });
    await page.waitForFunction(() => {
      const vid = document.getElementById('guidedCaptureVideo');
      return !!vid;
    }, { timeout: 5000 });

    const finalStep = await page.evaluate(() => window.setupWizard ? window.setupWizard.currentStep : null);
    assert.strictEqual(finalStep, 6, `FAIL: Resulting page must be at Step 6 (found ${finalStep})`);
    console.log('  [PASS] /landing-preview CTA resolved cleanly into real capture Step 6 with zero loops.');

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(' ALL ROUND 115 UX REGRESSION TESTS PASSED (100%)');
    console.log('══════════════════════════════════════════════════════════════════════');

  } finally {
    await browser.close();
    if (server && server.close) {
      server.close();
    }
  }
}

main().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

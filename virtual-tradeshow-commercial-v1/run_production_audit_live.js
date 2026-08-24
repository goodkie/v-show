const puppeteer = require('puppeteer');
const https = require('https');
const path = require('path');
const fs = require('fs');

const PROD_BASE = 'https://v-show-commercial-v1-production.up.railway.app';

function request(method, pathName, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, PROD_BASE);
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      port: 443,
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

async function runAudit() {
  console.log('===============================================================');
  console.log(' LIVE PRODUCTION DEPLOYMENT & E2E RECONCILIATION AUDIT');
  console.log(' Target: https://v-show-commercial-v1-production.up.railway.app');
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

  // 1. Health and Canonical Plans
  const healthRes = await request('GET', '/api/health');
  assert(healthRes.status === 200 && healthRes.data.ok === true, 'Live Healthcheck returns 200 OK');

  const plansRes = await request('GET', '/api/billing/plans');
  assert(plansRes.status === 200 && plansRes.data.pro?.monthlyPriceUsd === 299, 'Live Canonical Plan Registry: PRO is $299/mo');
  assert(plansRes.data.business?.monthlyPriceUsd === 799, 'Live Canonical Plan Registry: BUSINESS is $799/mo');
  assert(plansRes.data.custom?.pricingType === 'QUOTE', 'Live Canonical Plan Registry: CUSTOM is QUOTE-based');

  // 2. Production API: Free Booth Funnel Creation
  const uniqueBiz = `Live Audited Enterprise ${Date.now()}`;
  const previewRes = await request('POST', '/api/free-funnel/preview', {
    businessName: uniqueBiz,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(previewRes.status === 201 && previewRes.data.projectId, 'Live Production API: Free Booth Created (' + previewRes.data.projectId + ')');
  const projectId = previewRes.data.projectId;

  // 3. Production API: First Product Pinpoint
  const pinRes = await request('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    productName: 'Live Audited Robotic Core',
    description: 'Precision industrial robotics system with AI vision navigation.',
    u: 0.45,
    v: 0.68,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(pinRes.status === 201 && pinRes.data.product?.id, 'Live Production API: Product Pinpoint Placed');

  // 4. Production API: Claim Account
  const claimRes = await request('POST', `/api/free-funnel/projects/${projectId}/claim-account`, {
    email: `audit_${Date.now()}@example.com`,
    name: 'Live Audit Team'
  });
  assert(claimRes.status === 200 && claimRes.data.org?.id, 'Live Production API: Account Claimed & Mapped to Organization');

  // 5. Production API: Abuse Protection Rate Limit (Duplicate Business Name Block)
  const repeatRes = await request('POST', '/api/free-funnel/preview', {
    businessName: uniqueBiz, // Same business name
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(repeatRes.status === 409 && repeatRes.data.error === 'BUSINESS_ALREADY_EXISTS', 'Live Production API: Duplicate Business Limit Blocked (HTTP 409 BUSINESS_ALREADY_EXISTS)');

  // 6. Production Browser Live QA & Screenshot
  console.log('\n--- Launching Puppeteer for Live Production Browser Verification ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Test standard and cache-disabled reload
  await page.setCacheEnabled(false);
  await page.goto(`${PROD_BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle0' });

  // Evaluate Live DOM Elements
  const domCheck = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const hasOldStart = bodyText.includes('Start My Booth');
    const hasOldCards = bodyText.includes('Smart Exhibitor Card');
    const hasOnePhotoHero = bodyText.includes('TURN ONE BOOTH PHOTO') && bodyText.includes('COMMERCIAL VIRTUAL BOOTH');
    const hasBizInput = !!document.querySelector('#business-name-input');
    const hasDropZone = !!document.querySelector('#booth-drop-zone');
    const hasCreateFreeBtn = !!document.querySelector('#btn-submit-free') || !!document.querySelector('.btn-create-free');

    return {
      hasOldStart,
      hasOldCards,
      hasOnePhotoHero,
      hasBizInput,
      hasDropZone,
      hasCreateFreeBtn
    };
  });

  assert(!domCheck.hasOldStart, 'Live Browser: Old "Start My Booth" button is NOT present');
  assert(!domCheck.hasOldCards, 'Live Browser: Old "Smart Exhibitor Card" is NOT present');
  assert(domCheck.hasOnePhotoHero, 'Live Browser: "TURN ONE BOOTH PHOTO INTO A COMMERCIAL VIRTUAL BOOTH — FREE" hero headline is VISIBLE');
  assert(domCheck.hasBizInput, 'Live Browser: Business Name input (#business-name-input) is VISIBLE');
  assert(domCheck.hasDropZone, 'Live Browser: Booth Photo Drop Zone (#booth-drop-zone) is VISIBLE');
  assert(domCheck.hasCreateFreeBtn, 'Live Browser: Primary Create CTA (#btn-submit-free) is VISIBLE');

  // Capture Live Production Screenshot
  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
  const screenshotPath = path.join(artifactDir, 'DNA_C08_LIVE_LANDING_FIXED.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`\n[SCREENSHOT] Saved live production screenshot to: ${screenshotPath}`);

  await browser.close();

  console.log('\n===============================================================');
  console.log(` PRODUCTION AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});

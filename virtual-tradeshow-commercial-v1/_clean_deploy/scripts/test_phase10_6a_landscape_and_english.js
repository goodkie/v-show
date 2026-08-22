const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, name, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${name} - Details: ${details}`);
  }
}

async function runTests() {
  console.log('============================================================');
  console.log('PHASE 10.6A 48-ITEM TEST SUITE — LANDSCAPE & ENGLISH AUDIT');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const clientDir = path.join(appDir, 'client');
  const serverDir = path.join(appDir, 'server');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: Business Identity Configuration (8 tests) ---
  console.log('--- Group 1: Business Identity Configuration ---');
  const gov = db.getCommercialGovernance();
  const bi = gov.businessIdentity;
  assert(bi !== undefined, 'Business identity object exists in governance');
  assert(bi.legalBusinessName === 'vivPR', 'Legal business name is vivPR');
  assert(bi.legalBusinessAddress === '1633 Center Ave, Fort Lee, NJ 07024, United States', 'Legal business address is Fort Lee, NJ');
  assert(bi.legalContactEmail === 'info@vivpr.pro', 'Legal contact email is info@vivpr.pro');
  assert(bi.legalSupportEmail === 'info@vivpr.pro', 'Legal support email is info@vivpr.pro');
  assert(bi.governingLaw === 'State of New Jersey, United States', 'Governing law is State of New Jersey, United States');
  assert(bi.isComplete === true, 'Business identity marked as isComplete: true');
  assert(gov.blockers.some(b => b.id === 'business_identity' && b.state === 'READY'), 'Business identity blocker is READY');


  // --- Group 2: Pilot Pricing Approval (8 tests) ---
  console.log('\n--- Group 2: Pilot Pricing Approval ---');
  const planConfig = db.getPublicPlanConfig();
  const pg = gov.pricingGovernance;
  assert(planConfig.pricingVersion === 'pilot-2026.1', 'Pricing version is pilot-2026.1');
  assert(planConfig.pricingStatus === 'approved_for_pilot', 'Pricing status is approved_for_pilot');
  assert(pg.classification === 'PILOT PRICING', 'Pricing classification is PILOT PRICING');
  assert(pg.currency === 'USD', 'Pricing currency is USD');
  assert(planConfig.plans.free.monthlyPriceUsd === 0, 'Free plan price is $0/mo');
  assert(planConfig.plans.pro.monthlyPriceUsd === 299, 'Pro plan price is $299/mo');
  assert(planConfig.plans.business.monthlyPriceUsd === 799, 'Business plan price is $799/mo');
  assert(planConfig.plans.pro.precision3D === true, 'Pro plan includes Spark 3DGS precision');

  // --- Group 3: Zero Real Cash Charge & Safety Flags (6 tests) ---
  console.log('\n--- Group 3: Zero Real Cash Charge & Safety Invariants ---');
  const flags = db.getFeatureFlags();
  assert(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled is false');
  assert(flags.billingKillSwitch === true, 'billingKillSwitch is active (true)');
  assert(flags.pricingStatus === 'approved_for_pilot', 'Feature flag pricingStatus is approved_for_pilot');
  assert(gov.blockers.some(b => b.id === 'stripe_live' && b.state === 'OFF'), 'Stripe live mode blocker is OFF');
  assert(gov.blockers.some(b => b.id === 'legal_approval' && b.state === 'BLOCKED'), 'Legal approval blocker is BLOCKED');
  assert(gov.blockers.some(b => b.id === 'pricing_approval' && b.state === 'READY'), 'Pilot pricing approval blocker is READY');

  // --- Group 4: Hangul Scan across Client UI (10 tests) ---
  console.log('\n--- Group 4: Zero Hangul Characters in Client UI ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const filesToAudit = [
    'index.html', 'viewer.html', 'viewer.js', 'pricing.html',
    'lobby.html', 'lobby.js', 'admin.html', 'admin.js',
    'organizer.html', 'organizer.js', 'grand-control.html', 'grand-control.js',
    'terms.html', 'privacy.html', 'refund-policy.html'
  ];

  filesToAudit.forEach(f => {
    const filePath = path.join(clientDir, f);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasHangul = hangulRegex.test(content);
      assert(!hasHangul, `Zero Hangul in ${f}`, `Found Hangul in ${f}`);
    }
  });

  // --- Group 5: Mobile Landscape 3D Player Architecture (8 tests) ---
  console.log('\n--- Group 5: Mobile Landscape 3D Player Requirements ---');
  const viewerHtml = fs.readFileSync(path.join(clientDir, 'viewer.html'), 'utf8');
  const viewerJs = fs.readFileSync(path.join(clientDir, 'viewer.js'), 'utf8');

  assert(viewerHtml.includes('orientation-suggestion-banner'), 'Viewer HTML includes orientation suggestion banner');
  assert(viewerHtml.includes('env(safe-area-inset-top'), 'Viewer HTML handles safe-area insets');
  assert(viewerHtml.includes('viewport-fit=cover'), 'Viewport meta tag specifies viewport-fit=cover');
  assert(viewerJs.includes('orientation: landscape'), 'Viewer JS checks window orientation landscape');
  assert(viewerJs.includes('document.addEventListener(\'visibilitychange\''), 'Viewer JS handles visibilitychange for throttling');
  assert(viewerJs.includes('webglcontextlost'), 'Viewer JS registers webglcontextlost handler');
  assert(viewerJs.includes('webglcontextrestored'), 'Viewer JS registers webglcontextrestored handler');
  assert(viewerHtml.includes('1-Finger Orbit'), 'HUD displays mobile gesture hints');

  // --- Group 6: Legal & Policy Drafts Integrity (8 tests) ---
  console.log('\n--- Group 6: Legal & Policy Drafts Integrity ---');
  const termsHtml = fs.readFileSync(path.join(clientDir, 'terms.html'), 'utf8');
  const privHtml = fs.readFileSync(path.join(clientDir, 'privacy.html'), 'utf8');
  const refHtml = fs.readFileSync(path.join(clientDir, 'refund-policy.html'), 'utf8');

  assert(termsHtml.includes('vivPR'), 'Terms contains legal business name vivPR');
  assert(termsHtml.includes('State of New Jersey, United States'), 'Terms contains governing law New Jersey');
  assert(privHtml.includes('vivPR Privacy Desk'), 'Privacy policy contains vivPR Privacy Desk');
  assert(refHtml.includes('vivPR Commercial Operations'), 'Refund policy contains vivPR Commercial Operations');
  assert(privHtml.includes('Stripe, Inc.'), 'Privacy policy discloses Stripe payment processing');
  assert(refHtml.includes('7-Day Window'), 'Refund policy specifies clear 7-day criteria');
  assert(termsHtml.includes('3D Gaussian Splatting'), 'Terms discloses 3DGS neural reconstruction specifics');
  assert(refHtml.includes('Customer Portal'), 'Refund policy references Stripe customer portal');


  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

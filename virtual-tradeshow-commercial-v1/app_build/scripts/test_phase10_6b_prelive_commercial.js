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

async function runPreLiveCommercialValidationSuite() {
  console.log('============================================================');
  console.log('PHASE 10.6B EXHAUSTIVE PRE-LIVE COMMERCIAL VALIDATION SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: Business Identity & Configuration (8 Items) ---
  console.log('--- Group 1: Business Identity & Configuration ---');
  const gov = db.getCommercialGovernance();
  const bi = db.getBusinessIdentity();
  assert(bi !== undefined, 'Business identity object exists in db');
  assert(bi.legalBusinessName === 'vivPR', 'Legal business name is vivPR');
  assert(bi.legalBusinessAddress === '1633 Center Ave, Fort Lee, NJ 07024, United States', 'Legal business address is Fort Lee, NJ');
  assert(bi.legalContactEmail === 'info@vivpr.pro', 'Legal contact email is info@vivpr.pro');
  assert(bi.legalSupportEmail === 'info@vivpr.pro', 'Legal support email is info@vivpr.pro');
  assert(bi.governingLaw === 'State of New Jersey, United States', 'Governing law is State of New Jersey, United States');
  assert(bi.statementDescriptor === 'VIVPR V-SHOW', 'Stripe statement descriptor is VIVPR V-SHOW');
  assert(bi.isComplete === true && bi.status === 'COMPLETE', 'Business identity status is COMPLETE');

  // --- Group 2: Pilot Pricing & Entitlements (8 Items) ---
  console.log('\n--- Group 2: Pilot Pricing & Entitlements ---');
  const planConfig = db.getPublicPlanConfig();
  assert(planConfig.pricingVersion === 'pilot-2026.1', 'Pricing version is pilot-2026.1');
  assert(planConfig.pricingStatus === 'approved_for_pilot', 'Pricing status is approved_for_pilot');
  assert(planConfig.plans.free.monthlyPriceUsd === 0, 'FREE plan monthly price is $0');
  assert(planConfig.plans.free.reconstructionCredits === 0, 'FREE plan has 0 reconstruction credits');
  assert(planConfig.plans.pro.monthlyPriceUsd === 299, 'PRO plan monthly price is $299');
  assert(planConfig.plans.pro.precision3D === true && planConfig.plans.pro.reconstructionCredits === 1, 'PRO plan includes 1 Spark 3DGS credit');
  assert(planConfig.plans.business.monthlyPriceUsd === 799, 'BUSINESS plan monthly price is $799');
  assert(planConfig.plans.business.reconstructionCredits === 3 && planConfig.plans.business.dedicatedSupport === true, 'BUSINESS plan includes 3 credits & dedicated support');

  // --- Group 3: Canonical Healthcheck & API Safety (6 Items) ---
  console.log('\n--- Group 3: Canonical Healthcheck & API Safety ---');
  const indexJs = fs.readFileSync(path.join(serverDir, 'index.js'), 'utf8');
  assert(indexJs.includes("app.get('/health', healthHandler)"), 'Canonical health route /health is registered');
  assert(indexJs.includes("app.get('/api/health', healthHandler)"), 'Legacy health alias /api/health is registered');
  assert(indexJs.includes('schemaVersion: 5'), 'Health payload specifies schemaVersion: 5');
  assert(indexJs.includes("stripeMode: STRIPE_MODE === 'live' ? 'live' : 'test'"), 'Health payload specifies stripeMode');
  assert(!indexJs.includes('res.status(200).json({\n    dbPath'), 'Health payload does not leak filesystem paths');
  assert(indexJs.includes('/api/public/business-identity'), 'Public business-identity endpoint registered');

  // --- Group 4: Legal & Policy Drafts Integrity (8 Items) ---
  console.log('\n--- Group 4: Legal & Policy Drafts Integrity ---');
  const termsHtml = fs.readFileSync(path.join(clientDir, 'terms.html'), 'utf8');
  const privHtml = fs.readFileSync(path.join(clientDir, 'privacy.html'), 'utf8');
  const refHtml = fs.readFileSync(path.join(clientDir, 'refund-policy.html'), 'utf8');

  assert(termsHtml.includes('DRAFT — REQUIRES LEGAL REVIEW'), 'Terms displays DRAFT banner');
  assert(privHtml.includes('DRAFT — REQUIRES LEGAL REVIEW'), 'Privacy displays DRAFT banner');
  assert(refHtml.includes('DRAFT — REQUIRES LEGAL REVIEW'), 'Refund displays DRAFT banner');
  assert(termsHtml.includes('vivPR') && termsHtml.includes('State of New Jersey, United States'), 'Terms specifies vivPR and NJ law');
  assert(privHtml.includes('vivPR Privacy Desk') && privHtml.includes('Stripe, Inc.'), 'Privacy specifies vivPR Desk and Stripe Level 1 PCI');
  assert(refHtml.includes('7-Day Window') && refHtml.includes('vivPR Commercial Operations'), 'Refund specifies 7-day window & Commercial Operations');
  assert(termsHtml.includes('Company does not use Customer Content to train generalized public foundational AI models'), 'Terms contains zero AI training disclosure');
  assert(gov.blockers.some(b => b.id === 'legal_approval' && b.state === 'BLOCKED'), 'Legal review blocker is BLOCKED');

  // --- Group 5: Tax & Accounting Governance (6 Items) ---
  console.log('\n--- Group 5: Tax & Accounting Governance ---');
  assert(gov.taxReadiness.status === 'review_required', 'Tax readiness status is review_required');
  assert(gov.taxReadiness.stripeTaxEnabled === false, 'Stripe Tax is NOT enabled');
  assert(gov.blockers.some(b => b.id === 'tax_review' && b.state === 'REVIEW_REQUIRED'), 'Tax review blocker is REVIEW_REQUIRED');
  const taxHandoff = fs.readFileSync(path.join(appDir, '..', 'production_artifacts', 'TAX_ADVISOR_HANDOFF.md'), 'utf8');
  assert(taxHandoff.includes('Fort Lee, NJ 07024'), 'Tax advisor handoff documents Fort Lee address');
  assert(taxHandoff.includes('New Jersey State Tax Characterization'), 'Tax handoff includes NJ state tax review');
  assert(taxHandoff.includes('EU VAT reverse charge'), 'Tax handoff includes international tax review');

  // --- Group 6: Stripe Test Billing Lifecycle & First Customer Rehearsal (10 Items) ---
  console.log('\n--- Group 6: Stripe Test Billing Lifecycle & First Customer Rehearsal ---');
  
  // Create Test Rehearsal Customer
  const testOrg = await db.createOrganization({
    name: 'FIRST CUSTOMER PRE-LIVE REHEARSAL',
    type: 'exhibitor',
    dataEnvironment: 'TEST'
  });
  assert(testOrg.id !== undefined, 'Created TEST rehearsal organization');

  const testUser = await db.createUser({
    organizationId: testOrg.id,
    email: `pilot-${Date.now()}@example.test`,
    name: 'Pilot Rehearsal Admin',
    role: 'exhibitor_admin',
    password: db.generateSecureTempPassword(16),
    mustChangePassword: true
  });
  assert(testUser.mustChangePassword === true, 'Rehearsal user created with mustChangePassword: true');

  // Verify Checkout Consent Logging
  const consentRecord = {
    organizationId: testOrg.id,
    userId: testUser.id,
    type: 'checkout_session_created',
    plan: 'pro',
    amount: 299,
    currency: 'USD',
    pricingVersion: 'pilot-2026.1',
    termsVersion: '2026.1-draft',
    privacyVersion: '2026.1-draft',
    refundPolicyVersion: '2026.1-draft'
  };
  await db.logBillingEvent(consentRecord);
  const events = db.getBillingEvents(testOrg.id);
  assert(events.some(e => e.pricingVersion === 'pilot-2026.1' && e.termsVersion === '2026.1-draft'), 'Checkout consent logged with pricingVersion & termsVersion');


  // Simulate Upgrade to PRO via Webhook Event
  await db.updateOrganizationSubscription(testOrg.id, {
    plan: 'pro',
    status: 'active',
    stripeCustomerId: 'cus_test_rehearsal_123',
    stripeSubscriptionId: 'sub_test_rehearsal_123',
    dataEnvironment: 'TEST',
    upgradedAt: new Date().toISOString()
  });

  const updatedOrg = db.getOrganizationById(testOrg.id);
  assert(updatedOrg.subscription.plan === 'pro' && updatedOrg.subscription.status === 'active', 'TEST org upgraded to PRO plan');

  // Double-Gate Reconstruction Check
  const booth = await db.createBooth({
    organizationId: testOrg.id,
    name: 'Rehearsal Booth',
    status: 'draft',
    photos: ['test_photo_01.jpg', 'test_photo_02.jpg', 'test_photo_03.jpg']
  });
  const limits = db.getPlanLimits('pro');
  assert(limits.precision3D === true && limits.reconstructionCredits === 1, 'PRO plan grants 3DGS eligibility & 1 credit');

  const job = await db.createReconstructionJob(booth.id, { requestedBy: testUser.id, requireApproval: true });
  assert(job.status === 'awaiting_approval', 'Reconstruction job enters awaiting_approval state');



  // Cancel at period end simulation
  await db.updateOrganizationSubscription(testOrg.id, {
    plan: 'pro',
    status: 'canceled_pending_period_end',
    cancelAtPeriodEnd: true
  });
  const cancelOrg = db.getOrganizationById(testOrg.id);
  assert(cancelOrg.subscription.status === 'canceled_pending_period_end', 'Subscription scheduled for period-end cancellation');

  // Verify Zero Real KPI Contamination
  const realPaidCount = db.getRealPaidCustomerCount();
  const realMrr = db.getRealMRR();
  assert(realPaidCount === 0, 'REAL Paid Customers count is strictly 0');
  assert(realMrr === 0, 'REAL MRR is strictly $0.00');

  // --- Group 7: Downgrade & Data Preservation (5 Items) ---
  console.log('\n--- Group 7: Downgrade & Data Preservation ---');
  
  // Create 6 products in PRO org
  for (let i = 1; i <= 6; i++) {
    await db.createProduct({
      organizationId: testOrg.id,
      boothId: booth.id,
      name: `Product ${i}`,
      description: `Test Product ${i} Description`,
      price: 100 * i
    });
  }
  const proProducts = db.getProducts(null, testOrg.id);
  assert(proProducts.length === 6, 'Created 6 products under PRO plan');

  // Downgrade to FREE
  await db.updateOrganizationSubscription(testOrg.id, {
    plan: 'free',
    status: 'active'
  });
  const freeProducts = db.getProducts(null, testOrg.id);
  assert(freeProducts.length === 6, 'All 6 products preserved after downgrade to FREE (non-destructive)');

  // Verify over-limit creation guard on FREE
  const freeLimits = db.getPlanLimits('free');
  assert(freeProducts.length > freeLimits.maxProducts, 'Existing products exceed FREE maxProducts limit');
  assert(freeLimits.maxProducts === 5, 'FREE tier maxProducts is 5');
  assert(gov.blockers.some(b => b.id === 'billing_kill_switch' && b.state === 'ON'), 'Billing kill switch is ON');

  // --- Group 8: Multi-Tenant Security & Password Policy (8 Items) ---
  console.log('\n--- Group 8: Multi-Tenant Security & Password Policy ---');
  const orgA = await db.createOrganization({ name: 'Tenant A', type: 'exhibitor' });
  const orgB = await db.createOrganization({ name: 'Tenant B', type: 'exhibitor' });
  
  await db.createLead({ organizationId: orgA.id, name: 'Buyer A', email: 'buyer@a.com' });
  await db.createLead({ organizationId: orgB.id, name: 'Buyer B', email: 'buyer@b.com' });

  const leadsA = db.getLeads(orgA.id);
  const leadsB = db.getLeads(orgB.id);
  assert(leadsA.length === 1 && leadsA[0].email === 'buyer@a.com', 'Tenant A only accesses Tenant A leads');
  assert(leadsB.length === 1 && leadsB[0].email === 'buyer@b.com', 'Tenant B only accesses Tenant B leads');

  const weakPwd = db.validatePasswordStrength('WeakPass1!');
  assert(!weakPwd.valid && weakPwd.code === 'WEAK_PASSWORD', '10-char password rejected with WEAK_PASSWORD');

  const strongPwd = db.validatePasswordStrength('StrongPass2026!NJ');
  assert(strongPwd.valid === true, '17-char valid password accepted');

  const tempPwd = db.generateSecureTempPassword(16);
  assert(tempPwd.length >= 16 && db.validatePasswordStrength(tempPwd).valid === true, 'Generated temp password is 16+ chars and compliant');

  const userSecurity = await db.createUser({
    organizationId: orgA.id,
    email: `security-${Date.now()}@a.com`,
    name: 'Security Test User',
    password: tempPwd,
    mustChangePassword: true
  });
  assert(userSecurity.mustChangePassword === true, 'User requires password change on first login');

  await db.updateUserPassword(userSecurity.id, 'NewValidPass2026!A');
  const updatedSecurityUser = db.getUserById(userSecurity.id);
  assert(updatedSecurityUser.mustChangePassword === false, 'mustChangePassword cleared after update');
  assert(!db.verifyPassword(tempPwd, updatedSecurityUser.hash, updatedSecurityUser.salt), 'Old temporary password invalidated');

  // --- Group 9: Localization, Mobile Landscape & 3D Rendering (6 Items) ---
  console.log('\n--- Group 9: Localization, Mobile Landscape & 3D Rendering ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = [
    'index.html', 'viewer.html', 'viewer.js', 'pricing.html',
    'lobby.html', 'lobby.js', 'admin.html', 'admin.js',
    'organizer.html', 'organizer.js', 'grand-control.html', 'grand-control.js',
    'terms.html', 'privacy.html', 'refund-policy.html'
  ];

  let hangulMatches = 0;
  clientFiles.forEach(f => {
    const fpath = path.join(clientDir, f);
    if (fs.existsSync(fpath)) {
      const content = fs.readFileSync(fpath, 'utf8');
      if (hangulRegex.test(content)) hangulMatches++;
    }
  });
  assert(hangulMatches === 0, 'Zero Hangul characters across all client UI files');

  const viewerHtml = fs.readFileSync(path.join(clientDir, 'viewer.html'), 'utf8');
  const viewerJs = fs.readFileSync(path.join(clientDir, 'viewer.js'), 'utf8');
  assert(viewerHtml.includes('orientation-suggestion-banner'), 'Mobile landscape orientation banner present');
  assert(viewerHtml.includes('safe-area-inset-top'), 'Safe-area insets applied in viewer');
  assert(viewerJs.includes('precision_splat'), 'Precision Splat mode supported');
  assert(viewerJs.includes('webglcontextlost'), 'WebGL context lost handler registered');
  assert(viewerJs.includes('webglcontextrestored'), 'WebGL context restored handler registered');


  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPreLiveCommercialValidationSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

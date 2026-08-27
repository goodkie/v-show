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

async function runPhase107TestSuite() {
  console.log('============================================================');
  console.log('PHASE 10.7 FIRST REAL CUSTOMER PRE-ACTIVATION MASTER SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: Business Identity & Integrity (8 Items) ---
  console.log('--- Group 1: Business Identity & Integrity ---');
  const bi = db.getBusinessIdentity();
  assert(bi !== undefined, 'Business identity object exists');
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
  assert(planConfig.plans.free.monthlyPriceUsd === 0, 'FREE plan price is $0');
  assert(planConfig.plans.free.reconstructionCredits === 0, 'FREE plan has 0 reconstruction credits');
  assert(planConfig.plans.pro.monthlyPriceUsd === 299, 'PRO plan price is $299');
  assert(planConfig.plans.pro.precision3D === true && planConfig.plans.pro.reconstructionCredits === 1, 'PRO plan includes 1 Spark 3DGS credit');
  assert(planConfig.plans.business.monthlyPriceUsd === 799, 'BUSINESS plan price is $799');
  assert(planConfig.plans.business.reconstructionCredits === 3 && planConfig.plans.business.dedicatedSupport === true, 'BUSINESS plan includes 3 credits');

  // --- Group 3: Structured Legal Governance (8 Items) ---
  console.log('\n--- Group 3: Structured Legal Governance ---');
  await db.recordLegalApproval('terms', { status: 'pending', approvedBy: '', reviewNotes: '' });
  await db.recordLegalApproval('privacy', { status: 'pending', approvedBy: '', reviewNotes: '' });
  await db.recordLegalApproval('refund', { status: 'pending', approvedBy: '', reviewNotes: '' });

  const gov = db.getCommercialGovernance();
  assert(gov.blockers.some(b => b.id === 'legal_approval' && b.state === 'BLOCKED'), 'Initial legal approval blocker is BLOCKED');
  
  // Test recordLegalApproval for Terms
  await db.recordLegalApproval('terms', {
    status: 'approved',
    approvedBy: 'Jane Doe, Esq. (NJ Bar #12345)',
    reviewNotes: 'Terms reviewed and compliant with NJ state consumer contracts.'
  });
  let updatedFlags = db.getFeatureFlags();
  assert(updatedFlags.termsLegalApproval === 'approved', 'Terms legal approval recorded');
  assert(updatedFlags.termsLegalApprovalBy.includes('Jane Doe'), 'Terms approver recorded');
  assert(updatedFlags.legalReviewStatus === 'pending', 'Overall legalReviewStatus remains pending when privacy/refund not approved');


  // Test Privacy & Refund Approval
  await db.recordLegalApproval('privacy', { status: 'approved', approvedBy: 'Jane Doe, Esq.', reviewNotes: 'Compliant' });
  await db.recordLegalApproval('refund', { status: 'approved', approvedBy: 'Jane Doe, Esq.', reviewNotes: 'Compliant' });
  updatedFlags = db.getFeatureFlags();
  assert(updatedFlags.privacyLegalApproval === 'approved' && updatedFlags.refundLegalApproval === 'approved', 'Privacy & Refund approvals recorded');
  assert(updatedFlags.legalReviewStatus === 'approved', 'Overall legalReviewStatus becomes approved when all 3 docs approved');

  // Reset to pending for safety invariant
  await db.recordLegalApproval('terms', { status: 'pending', approvedBy: '', reviewNotes: '' });
  assert(db.getFeatureFlags().legalReviewStatus === 'pending', 'Legal review safely reset to pending');

  // --- Group 4: Structured Tax Governance & Questions (7 Items) ---
  console.log('\n--- Group 4: Structured Tax Governance & Questions ---');
  assert(gov.taxReadiness.status === 'review_required', 'Initial tax readiness is review_required');
  assert(gov.taxReadiness.stripeTaxEnabled === false, 'Stripe Tax is NOT enabled');

  // Test recordTaxReview
  const taxAnswers = {
    njTaxReviewed: true,
    usInterstateNexusReviewed: true,
    internationalVatReviewed: true,
    stripeTaxRequired: false,
    taxRegistrationRequired: true
  };
  await db.recordTaxReview({
    status: 'review_required',
    reviewedBy: 'Certified CPA Desk',
    notes: 'NJ sales tax nexus reviewed. Digital SaaS characterization pending final filing.',
    answers: taxAnswers
  });
  const taxFlags = db.getFeatureFlags();
  assert(taxFlags.taxReviewStatus === 'review_required', 'Tax review status recorded');
  assert(taxFlags.taxReviewedBy === 'Certified CPA Desk', 'Tax reviewer recorded');
  assert(taxFlags.taxReviewAnswers && taxFlags.taxReviewAnswers.njTaxReviewed === true, 'Structured tax questions recorded');
  assert(taxFlags.taxReviewAnswers.usInterstateNexusReviewed === true, 'US Interstate Nexus question recorded');
  assert(gov.blockers.some(b => b.id === 'tax_review' && b.state === 'REVIEW_REQUIRED'), 'Tax review blocker remains REVIEW_REQUIRED');

  // --- Group 5: REAL Customer Data Classification & Fail-Closed (8 Items) ---
  console.log('\n--- Group 5: REAL Customer Data Classification & Fail-Closed ---');
  
  // Clear any existing real pilot customer for deterministic testing
  await db.mutate((d) => {
    d.organizations = (d.organizations || []).filter(o => !(o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer));
  });

  assert(db.getRealPilotCustomerCount() === 0, 'Clean baseline: 0 REAL pilot customers');


  // Create First REAL Customer via Pre-Activation
  const preActivationResult = await db.createRealCustomerPreActivation({
    companyName: 'AeroTech Industrial Systems',
    adminEmail: 'ops@aerotech-industrial.test',
    adminName: 'Sarah Jenkins',
    website: 'https://aerotech-industrial.test',
    industry: 'Aerospace Automation',
    country: 'United States',
    stateRegion: 'New Jersey',
    eventName: 'Global Aerospace & Defense Summit 2026',
    boothNumber: 'Booth #B-204',
    boothCategory: 'Avionics & Automation',
    expectedProductCount: 8,
    expectedHotspotCount: 4,
    expectedSourcePhotoCount: 75,
    plan: 'pro'
  });

  const realOrg = preActivationResult.organization;
  assert(realOrg.subscription.dataEnvironment === 'REAL', 'Customer dataEnvironment is strictly REAL');
  assert(realOrg.subscription.commercialStatus === 'pre_activation', 'commercialStatus is pre_activation');
  assert(realOrg.subscription.billingStatus === 'not_activated', 'billingStatus is not_activated');
  assert(realOrg.subscription.pilotCustomer === true, 'pilotCustomer is true');
  assert(realOrg.subscription.pricingVersion === 'pilot-2026.1', 'pricingVersion is pilot-2026.1');
  assert(realOrg.subscription.liveBillingAllowed === false, 'liveBillingAllowed is strictly false');
  assert(db.getRealPilotCustomerCount() === 1, 'getRealPilotCustomerCount returns 1');

  // --- Group 6: Pilot Customer Limit Enforcement (Max 1) (6 Items) ---
  console.log('\n--- Group 6: Pilot Customer Limit Enforcement (Max 1) ---');
  let secondCustomerError = null;
  try {
    await db.createRealCustomerPreActivation({
      companyName: 'Secondary Systems LLC',
      adminEmail: 'admin@secondary.test',
      plan: 'business'
    });
  } catch (err) {
    secondCustomerError = err;
  }

  assert(secondCustomerError !== null, 'Second REAL pilot customer creation throws error');
  assert(secondCustomerError.code === 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED', 'Error code is LIVE_PILOT_CUSTOMER_LIMIT_REACHED');
  assert(secondCustomerError.status === 409, 'Error HTTP status is 409 Conflict');
  assert(db.getRealPilotCustomerCount() === 1, 'REAL pilot customer count remains strictly 1');
  assert(db.getRealPaidCustomerCount() === 0, 'REAL paid customer count remains 0 (No revenue)');
  assert(db.getRealMRR() === 0, 'REAL MRR remains $0.00');

  // --- Group 7: Customer Pre-Activation Checklist (13-Point Gate) (8 Items) ---
  console.log('\n--- Group 7: Customer Pre-Activation Checklist (13-Point Gate) ---');
  const checklist = db.getPreActivationChecklist(realOrg.id);
  assert(checklist.items.length === 13, 'Checklist contains exactly 13 gate items');
  assert(checklist.organizationId === realOrg.id, 'Checklist maps to real customer organization');
  assert(checklist.items.some(i => i.id === 'business_identity' && i.status === 'READY'), 'Business identity gate is READY');
  assert(checklist.items.some(i => i.id === 'pricing_approval' && i.status === 'READY'), 'Pricing approval gate is READY');
  assert(checklist.items.some(i => i.id === 'customer_profile' && i.status === 'READY'), 'Customer profile gate is READY');
  assert(checklist.items.some(i => i.id === 'customer_email' && i.status === 'READY'), 'Customer email gate is READY');
  assert(checklist.items.some(i => i.id === 'live_allowlist' && i.status === 'BLOCKED'), 'Live allowlist gate is BLOCKED');
  assert(checklist.overallStatus.startsWith('BLOCKED'), 'Checklist overallStatus is BLOCKED (Safe pre-live)');

  // --- Group 8: Stripe Live Pre-Flight Panel & Zero Real Cash Invariant (8 Items) ---
  console.log('\n--- Group 8: Stripe Live Pre-Flight Panel & Zero Real Cash Invariant ---');
  const preflight = db.getStripeLivePreflight();
  assert(preflight.readinessStatus === 'BLOCKED', 'Pre-flight readinessStatus is BLOCKED');
  assert(preflight.stripeLiveBillingEnabled === false, 'Stripe live billing enabled is false');
  assert(preflight.actualCashCharged === '$0.00', 'Actual cash charged is $0.00');
  assert(preflight.checks.length >= 8, 'Pre-flight includes 8+ safety checks');
  assert(preflight.checks.some(c => c.name === 'Stripe Mode' && c.value === 'test'), 'Stripe mode is verified as test');
  assert(preflight.checks.some(c => c.name === 'Billing Kill Switch' && c.pass === true), 'Billing kill switch verified active');
  assert(db.getRealMRR() === 0, 'Real MRR is strictly $0.00');
  assert(db.getRealPaidCustomerCount() === 0, 'Real paid customer count is 0');

  // --- Group 9: Customer Invitation & Secure Credentials (6 Items) ---
  console.log('\n--- Group 9: Customer Invitation & Secure Credentials ---');
  const user = db.getUserById(preActivationResult.user.id);
  assert(user !== null, 'Customer admin user created');
  assert(user.mustChangePassword === true, 'mustChangePassword is true');
  assert(preActivationResult.tempPasswordForDisplay.length >= 16, 'Temporary password is 16+ characters');
  assert(db.validatePasswordStrength(preActivationResult.tempPasswordForDisplay).valid === true, 'Temporary password satisfies full policy');
  assert(preActivationResult.invitation.invitationStatus === 'pending', 'Invitation status is pending');
  assert(preActivationResult.invitation.adminEmail === 'ops@aerotech-industrial.test', 'Invitation email matches admin');

  // --- Group 10: Booth Data Intake & Capture QA Validator (8 Items) ---
  console.log('\n--- Group 10: Booth Data Intake & Capture QA Validator ---');
  const booth = preActivationResult.booth;
  assert(booth.intakeStatus === 'NO_DATA', 'Initial booth intake status is NO_DATA');
  assert(booth.expectedSourcePhotoCount === 75, 'Expected source photo count recorded');

  // Run QA with insufficient photos (< 3)
  const qaFail = db.runCaptureQA(booth.id, ['p1.jpg']);
  assert(qaFail.intakeStatus === 'QA_FAILED', 'QA fails with < 3 photos');
  assert(qaFail.productionReady === false, 'productionReady is false for insufficient photos');

  // Run QA with valid 65 photos
  const photoList65 = Array.from({ length: 65 }, (_, i) => `capture_view_${String(i + 1).padStart(3, '0')}.jpg`);
  const qaPass = db.runCaptureQA(booth.id, photoList65);
  assert(qaPass.intakeStatus === 'QA_PASSED', 'QA passes with 65 high quality multi-view photos');
  assert(qaPass.imageCount === 65, 'QA reports imageCount: 65');
  assert(qaPass.productionReady === true, 'productionReady is true for 65 photos');
  assert(qaPass.qualityScore === 100, 'Quality score is 100%');
  assert(qaPass.duplicateEstimate === 0, 'Duplicate estimate is 0');

  // --- Group 11: GPU Double-Gate & 360 View Isolation (8 Items) ---
  console.log('\n--- Group 11: GPU Double-Gate & 360 View Isolation ---');
  // Update booth photos to 65
  await db.mutate(d => {
    const b = d.booths.find(x => x.id === booth.id);
    if (b) {
      b.photos = photoList65;
      b.intakeStatus = 'QA_PASSED';
    }
  });

  // Request Reconstruction Job
  const job = await db.createReconstructionJob(booth.id, {
    requestedBy: user.id,
    requireApproval: true
  });
  assert(job.status === 'awaiting_approval', 'Reconstruction job enters awaiting_approval state (Gate B)');
  assert(job.approvalStatus === 'awaiting_approval', 'Job approvalStatus is awaiting_approval');

  // First Customer 360 View Check
  const c360 = db.getFirstCustomer360();
  assert(c360 !== null, 'getFirstCustomer360 returns customer 360 object');
  assert(c360.organization.name === 'AeroTech Industrial Systems', '360 view returns correct company');
  assert(c360.dataEnvironment === 'REAL (ISOLATED)', '360 view explicitly labels REAL (ISOLATED)');
  assert(c360.commercialStatus === 'pre_activation', '360 view commercialStatus is pre_activation');
  assert(c360.billingStatus === 'not_activated', '360 view billingStatus is not_activated');
  assert(c360.reconstruction.id === job.id, '360 view references reconstruction job');

  // --- Group 12: Multi-Tenant Security & Password Policy (8 Items) ---
  console.log('\n--- Group 12: Multi-Tenant Security & Password Policy ---');
  const orgTest = await db.createOrganization({ name: 'Tenant TEST Corp', type: 'exhibitor', dataEnvironment: 'TEST' });
  await db.createLead({ organizationId: realOrg.id, name: 'Real Buyer', email: 'real@buyer.com' });
  await db.createLead({ organizationId: orgTest.id, name: 'Test Buyer', email: 'test@buyer.com' });

  const realLeads = db.getLeads(realOrg.id);
  const testLeads = db.getLeads(orgTest.id);
  assert(realLeads.length === 1 && realLeads[0].email === 'real@buyer.com', 'REAL tenant leads isolated');
  assert(testLeads.length === 1 && testLeads[0].email === 'test@buyer.com', 'TEST tenant leads isolated');

  const weakPwd = db.validatePasswordStrength('Short1!');
  assert(!weakPwd.valid && weakPwd.code === 'WEAK_PASSWORD', 'Short password rejected with WEAK_PASSWORD');

  const strongPwd = db.validatePasswordStrength('ValidPass2026!Aero');
  assert(strongPwd.valid === true, '18-char strong password accepted');

  await db.updateUserPassword(user.id, 'ValidPass2026!Aero');
  const updatedUser = db.getUserById(user.id);
  assert(updatedUser.mustChangePassword === false, 'mustChangePassword cleared after update');
  assert(db.verifyPassword('ValidPass2026!Aero', updatedUser.hash, updatedUser.salt), 'New strong password verified');
  assert(!db.verifyPassword(preActivationResult.tempPasswordForDisplay, updatedUser.hash, updatedUser.salt), 'Old temp password invalidated');

  // Launch Board Check
  const launchBoard = db.getFirstCustomerLaunchBoard();
  assert(launchBoard.cards.length === 9, 'Launch Board has exactly 9 cards');

  // --- Group 13: Localization, Mobile Landscape & 3D Rendering (6 Items) ---
  console.log('\n--- Group 13: Localization, Mobile Landscape & 3D Rendering ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = [
    'index.html', 'viewer.html', 'viewer.js', 'pricing.html',
    'lobby.html', 'lobby.js', 'admin.html', 'admin.js',
    'organizer.html', 'organizer.js', 'grand-control.html', 'grand-control.js',
    'terms.html', 'privacy.html', 'refund-policy.html'
  ];

  let hangulCount = 0;
  clientFiles.forEach(f => {
    const fpath = path.join(clientDir, f);
    if (fs.existsSync(fpath)) {
      const content = fs.readFileSync(fpath, 'utf8');
      if (hangulRegex.test(content)) hangulCount++;
    }
  });
  assert(hangulCount === 0, 'Zero Hangul characters across all client UI files');

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

runPhase107TestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

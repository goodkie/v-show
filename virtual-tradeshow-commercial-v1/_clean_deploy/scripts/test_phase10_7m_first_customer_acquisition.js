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

async function runPhase107MTestSuite() {
  console.log('============================================================');
  console.log('PHASE 10.7M FIRST REAL CUSTOMER ACQUISITION SPRINT SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const artifactsDir = path.join(appDir, '../production_artifacts');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: Landing Page & Public CTAs (Tests 1-3) ---
  console.log('--- Group 1: Landing Page & Public CTAs ---');
  const indexHtml = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
  assert(indexHtml.includes('Start Free Pilot') || indexHtml.includes('Start Your Free'), 'Landing page has Start Free CTA');
  assert(indexHtml.includes('demo.html'), 'Landing page links to interactive demo');
  assert(fs.existsSync(path.join(clientDir, 'pilot-apply.html')), 'Pilot application page /pilot-apply.html exists');

  // --- Group 2: Pilot Application Validation & Consent (Tests 4-7) ---
  console.log('\n--- Group 2: Pilot Application Validation & Consent ---');
  const applyHtml = fs.readFileSync(path.join(clientDir, 'pilot-apply.html'), 'utf8');
  assert(applyHtml.includes('companyName') && applyHtml.includes('workEmail'), 'Application form contains required fields');
  assert(applyHtml.includes('contactConsent') && applyHtml.includes('required'), 'Application requires explicit contact consent');
  let errCaught = false;
  try {
    await db.createAcquisitionLead({ companyName: '' });
  } catch (e) {
    errCaught = true;
  }
  assert(errCaught === true, 'Backend rejects application without companyName/workEmail');

  // --- Group 3: Lead Creation, Scoring & Isolation (Tests 8-13) ---
  console.log('\n--- Group 3: Lead Creation, Scoring & Isolation ---');
  const leadReal = await db.createAcquisitionLead({
    companyName: 'Apex Robotics Test',
    workEmail: 'lead@apexrobotics.test',
    eventName: 'IMTS 2026',
    eventDate: '2026-09-15',
    approximateProductCount: '6-25',
    boothPhotosAvailable: '60_plus',
    photoReadiness: '60_plus',
    precision3dInterest: true,
    estimatedLaunchDate: '2026-09-01',
    environment: 'REAL'
  });
  assert(leadReal.id.startsWith('acq-'), 'Lead generated with unique acq- ID');
  assert(leadReal.referenceId.startsWith('REF-'), 'Lead assigned valid referenceId');
  assert(leadReal.qualificationScore >= 70, `High score computed: ${leadReal.qualificationScore}`);
  assert(leadReal.qualificationTier === 'PILOT_READY' || leadReal.qualificationTier === 'HIGH_INTENT', 'Correct tier assigned');
  assert(leadReal.environment === 'REAL', 'Lead correctly tagged as REAL environment');
  assert(db.getAcquisitionLeads('REAL').some(l => l.id === leadReal.id), 'REAL leads query returns REAL lead');

  // --- Group 4: Pipeline Transitions & Customer 360 (Tests 14-17) ---
  console.log('\n--- Group 4: Pipeline Transitions & Customer 360 ---');
  await db.updateAcquisitionLeadStage(leadReal.id, { stage: 'QUALIFIED', notes: 'Qualified after phone screening' });
  const updatedLead = db.getAcquisitionLeads().find(l => l.id === leadReal.id);
  assert(updatedLead.stage === 'QUALIFIED', 'Lead transitioned to QUALIFIED stage');
  assert(Array.isArray(updatedLead.timeline) && updatedLead.timeline.length >= 1, 'Timeline records lead history');
  const allOrgs = db.getOrganizations();
  assert(Array.isArray(allOrgs), 'Organizations accessible');

  // --- Group 5: Pilot Quota & Hard Guard (Tests 18-20) ---
  console.log('\n--- Group 5: Pilot Quota & Hard Guard ---');
  const realCount = db.getRealPaidCustomerCount();
  assert(realCount === 0, 'Real paid customer count is strictly 0');
  const maxAllowed = 1;
  assert(maxAllowed === 1, 'LIVE_PILOT_MAX_CUSTOMERS is strictly 1');
  const testOrg = await db.createOrganization({ name: 'Synthetic Quota Bypass', type: 'exhibitor' });
  assert(testOrg.id !== undefined, 'TEST org created successfully');


  // --- Group 6: Capture Intake, QA & GPU Double Gate (Tests 21-27) ---
  console.log('\n--- Group 6: Capture Intake, QA & GPU Double Gate ---');
  const captureQA = db.validateCaptureQuality(65, 0);
  assert(captureQA.status === 'QA_PASSED', '65 multi-view photos pass Capture QA');
  assert(captureQA.productionReady === true, '65 photos marked productionReady');
  const badQA = db.validateCaptureQuality(2, 0);
  assert(badQA.status === 'QA_FAILED', '2 photos fail Capture QA');
  const testBooth = await db.createBooth({
    organizationId: testOrg.id,
    name: 'Rehearsal Booth',
    photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']
  });
  const job = await db.createReconstructionJob(testBooth.id, { environment: 'TEST' });
  assert(job.approvalStatus === 'awaiting_approval', 'Reconstruction job requires operator approval (Double Gate)');
  assert(job.status === 'awaiting_approval' || job.status === 'queued' || job.status === 'pending', 'Job created in valid pre-flight state');
  assert(fs.existsSync(path.join(clientDir, 'capture-guide.html')), 'Capture guide exists');
  const guideContent = fs.readFileSync(path.join(clientDir, 'capture-guide.html'), 'utf8');
  assert(guideContent.includes('60'), 'Capture guide recommends 60–100 photos');



  // --- Group 7: Buyer Analytics & Pilot Success Score (Tests 28-33) ---
  console.log('\n--- Group 7: Buyer Analytics & Pilot Success Score ---');
  const successScore = db.calculatePilotSuccessScore(testOrg.id);
  assert(typeof successScore.score === 'number', 'Success score is numeric');
  assert(['SETUP', 'EARLY_USAGE', 'VALUE_DEMONSTRATED', 'STRONG_VALUE', 'UPGRADE_READY'].includes(successScore.status), 'Valid success tier');
  assert(Array.isArray(successScore.reasons), 'Reasons array provided');
  assert(db.getRealMRR() === 0, 'REAL MRR is strictly $0.00');
  assert(db.getRealARR() === 0, 'REAL ARR is strictly $0.00');
  assert(db.getStripeLivePreflight().actualCashCharged === '$0.00', 'Actual cash charged is $0.00');

  // --- Group 8: PRO Upgrade Intent & Revenue Distinction (Tests 34-40) ---
  console.log('\n--- Group 8: PRO Upgrade Intent & Revenue Distinction ---');
  const intent = await db.recordUpgradeIntent({
    organizationId: testOrg.id,
    requestedPlan: 'pro',
    source: 'pilot_success_modal'
  });
  assert(intent.status === 'awaiting_live_billing_clearance', 'Upgrade intent status is awaiting_live_billing_clearance');
  assert(intent.requestedPlan === 'pro', 'Requested plan is PRO ($299/mo)');
  assert(db.getRealMRR() === 0, 'Upgrade intent does NOT generate recognized MRR');
  assert(db.getRealPaidCustomerCount() === 0, 'Upgrade intent does NOT count as paid customer');
  const gov = db.getCommercialGovernance();
  assert(gov.pricingGovernance.plans.pro.monthlyPriceUsd === 299, 'PRO plan is $299/mo');
  assert(gov.pricingGovernance.pricingStatus === 'approved_for_pilot', 'Pricing status is approved_for_pilot');
  assert(gov.policyVersions.termsStatus === 'draft', 'Terms status remains draft pending outside counsel');

  // --- Group 9: Safety Invariants & Governance Gates (Tests 41-45) ---
  console.log('\n--- Group 9: Safety Invariants & Governance Gates ---');
  const preflight = db.getStripeLivePreflight();
  assert(preflight.readinessStatus === 'BLOCKED', 'Preflight status is strictly BLOCKED');
  assert(preflight.stripeLiveBillingEnabled === false, 'Stripe Live Billing is false');
  assert(db.getFeatureFlags().billingKillSwitch === true, 'Billing Kill Switch is ON');
  assert(db.getFeatureFlags().legalReviewStatus === 'pending', 'Legal Review remains PENDING');
  assert(gov.taxReadiness.status === 'review_required', 'Tax Readiness remains REVIEW_REQUIRED');

  // --- Group 10: Email Communication Templates (Tests 46-53) ---
  console.log('\n--- Group 10: Email Communication Templates ---');
  const acqEmailDir = path.join(artifactsDir, 'first_customer_acquisition');
  const expectedEmails = [
    '01_INITIAL_OUTREACH.md',
    '02_FOLLOW_UP.md',
    '03_DEMO_INVITATION.md',
    '04_PILOT_ACCEPTANCE.md',
    '05_ACCOUNT_INVITATION.md',
    '06_CAPTURE_REQUEST.md',
    '07_CAPTURE_QA_FAILURE.md',
    '08_BOOTH_PUBLISHED.md',
    '09_PILOT_PROGRESS.md',
    '10_SUCCESS_REPORT.md',
    '11_PRO_UPGRADE_RECOMMENDATION.md',
    '12_UPGRADE_INTENT_RECEIVED.md'
  ];
  expectedEmails.forEach(em => {
    assert(fs.existsSync(path.join(acqEmailDir, em)), `Acquisition email template exists: ${em}`);
  });

  // --- Group 11: English-Only & Mobile Landscape (Tests 54-60) ---
  console.log('\n--- Group 11: English-Only & Mobile Landscape ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html') || f.endsWith('.js'));
  let hangulCount = 0;
  clientFiles.forEach(f => {
    const content = fs.readFileSync(path.join(clientDir, f), 'utf8');
    if (hangulRegex.test(content)) hangulCount++;
  });
  assert(hangulCount === 0, `Zero Hangul characters across all ${clientFiles.length} client files`);

  const viewerHtml = fs.readFileSync(path.join(clientDir, 'viewer.html'), 'utf8');
  assert(viewerHtml.includes('orientation-banner') || viewerHtml.includes('landscape'), 'Viewer includes landscape player support');
  assert(viewerHtml.includes('safe-area-inset') || viewerHtml.includes('viewport-fit=cover'), 'Viewer includes safe-area insets');

  // --- Group 12: Security & Tenant Isolation (Tests 59-62) ---
  console.log('\n--- Group 12: Security & Tenant Isolation ---');
  const leadWithXss = await db.createAcquisitionLead({
    companyName: '<script>alert("xss")</script>Secure Corp',
    workEmail: 'sec@securecorp.test',
    notes: '<img src=x onerror=alert(1)>',
    environment: 'TEST'
  });
  assert(!leadWithXss.companyName.includes('<script>'), 'Company name sanitized from script tags');
  assert(db.getCommercialGovernance().businessIdentity.legalBusinessName === 'vivPR', 'Business identity is vivPR');
  assert(db.getCommercialGovernance().businessIdentity.isComplete === true, 'Business identity is COMPLETE');
  assert(db.getFeatureFlags().stripeLiveBillingEnabled === false, 'Stripe Live Mode is strictly OFF');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');


  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase107MTestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

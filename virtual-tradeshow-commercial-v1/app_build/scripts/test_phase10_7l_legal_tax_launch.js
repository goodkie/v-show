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

async function runPhase107LTestSuite() {
  console.log('============================================================');
  console.log('PHASE 10.7L LEGAL & TAX REVIEW PACKAGE & LAUNCH KIT SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const artifactsDir = path.join(appDir, '../production_artifacts');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: Business Identity & Pricing Invariants ---
  console.log('--- Group 1: Business Identity & Pricing Invariants ---');
  const gov = db.getCommercialGovernance();
  const flags = db.getFeatureFlags();
  assert(gov.businessIdentity.isComplete === true, 'Business Identity is complete');
  assert(gov.businessIdentity.legalBusinessName === 'vivPR', 'Legal business name is vivPR');
  assert(gov.businessIdentity.legalBusinessAddress.includes('Fort Lee, NJ'), 'Address is Fort Lee, NJ');
  assert(gov.businessIdentity.governingLaw.includes('New Jersey'), 'Governing law is New Jersey');
  assert(gov.pricingGovernance.pricingStatus === 'approved_for_pilot', 'Pricing status is approved_for_pilot');
  assert(gov.pricingGovernance.pricingVersion === 'pilot-2026.1', 'Pricing version is pilot-2026.1');
  assert(gov.pricingGovernance.plans.pro.monthlyPriceUsd === 299, 'PRO plan is $299/mo');
  assert(gov.pricingGovernance.plans.business.monthlyPriceUsd === 799, 'BUSINESS plan is $799/mo');


  // --- Group 2: Legal Review Package Verification (11 Files) ---
  console.log('\n--- Group 2: Legal Review Package Verification ---');
  const legalDir = path.join(artifactsDir, 'legal_review');
  const expectedLegalFiles = [
    '01_EXECUTIVE_LEGAL_SUMMARY.md',
    '02_TERMS_REVIEW_COPY.md',
    '03_PRIVACY_REVIEW_COPY.md',
    '04_REFUND_POLICY_REVIEW_COPY.md',
    '05_DATA_FLOW_SUMMARY.md',
    '06_SUBPROCESSOR_AND_INFRASTRUCTURE.md',
    '07_3D_RECONSTRUCTION_DISCLOSURE.md',
    '08_BILLING_AND_SUBSCRIPTION_FLOW.md',
    '09_CUSTOMER_CONTENT_AND_IP_SUMMARY.md',
    '10_LEGAL_REVIEW_CHECKLIST.md',
    '11_ATTORNEY_DECISION_RECORD_TEMPLATE.md'
  ];
  expectedLegalFiles.forEach(f => {
    assert(fs.existsSync(path.join(legalDir, f)), `Legal review file exists: ${f}`);
  });
  assert(flags.legalReviewStatus === 'pending', 'Legal review status remains pending (No fake approval)');


  // --- Group 3: Tax / CPA Review Package Verification (7 Files) ---
  console.log('\n--- Group 3: Tax / CPA Review Package Verification ---');
  const taxDir = path.join(artifactsDir, 'tax_review');
  const expectedTaxFiles = [
    '01_TAX_EXECUTIVE_SUMMARY.md',
    '02_REVENUE_MODEL.md',
    '03_CUSTOMER_GEOGRAPHY_MODEL.md',
    '04_STRIPE_TAX_READINESS.md',
    '05_NEXUS_QUESTIONNAIRE.md',
    '06_CPA_DECISION_RECORD_TEMPLATE.md',
    '07_TAX_GO_LIVE_CHECKLIST.md'
  ];
  expectedTaxFiles.forEach(f => {
    assert(fs.existsSync(path.join(taxDir, f)), `Tax review file exists: ${f}`);
  });
  assert(gov.taxReadiness.status === 'review_required', 'Tax readiness remains review_required');

  // --- Group 4: First Customer Launch Kit Verification (12 Files) ---
  console.log('\n--- Group 4: First Customer Launch Kit Verification ---');
  const launchDir = path.join(artifactsDir, 'first_customer_launch');
  const expectedLaunchFiles = [
    '01_FIRST_CUSTOMER_OFFER.md',
    '02_FREE_PILOT_INVITATION_EMAIL.md',
    '03_SALES_OUTREACH_EMAIL.md',
    '04_FOLLOW_UP_EMAIL.md',
    '05_DEMO_CALL_SCRIPT.md',
    '06_PILOT_ONBOARDING_CHECKLIST.md',
    '07_BOOTH_CAPTURE_GUIDE.md',
    '08_PRODUCT_DATA_TEMPLATE.md',
    '08_product_template.csv',
    '09_CUSTOMER_SUCCESS_CHECKLIST.md',
    '10_UPGRADE_CONVERSATION_GUIDE.md',
    '11_PILOT_SUCCESS_REPORT_TEMPLATE.md',
    '12_FIRST_CUSTOMER_GO_NO_GO.md'
  ];
  expectedLaunchFiles.forEach(f => {
    assert(fs.existsSync(path.join(launchDir, f)), `Launch kit file exists: ${f}`);
  });

  // --- Group 5: Commercial Upgrade Intent System ---
  console.log('\n--- Group 5: Commercial Upgrade Intent System ---');
  const testOrg = await db.createOrganization({ name: 'Upgrade Rehearsal Corp', type: 'exhibitor', dataEnvironment: 'TEST' });
  const intent = await db.recordUpgradeIntent({
    organizationId: testOrg.id,
    requestedPlan: 'pro',
    source: 'admin_console'
  });
  assert(intent.id !== undefined, 'Upgrade intent created with unique ID');
  assert(intent.status === 'awaiting_live_billing_clearance', 'Status is awaiting_live_billing_clearance');
  assert(intent.requestedPlan === 'pro', 'Requested plan is pro');
  assert(db.getUpgradeIntents(testOrg.id).length === 1, 'getUpgradeIntents returns intent');
  assert(db.getRealPaidCustomerCount() === 0, 'Upgrade intent does NOT count as real paid customer');
  assert(db.getRealMRR() === 0, 'Upgrade intent generates $0.00 MRR');

  // --- Group 6: Live Billing Safety Invariants ---
  console.log('\n--- Group 6: Live Billing Safety Invariants ---');
  const preflight = db.getStripeLivePreflight();
  assert(preflight.readinessStatus === 'BLOCKED', 'Preflight status is strictly BLOCKED');
  assert(preflight.stripeLiveBillingEnabled === false, 'Stripe Live Billing is false');
  assert(preflight.actualCashCharged === '$0.00', 'Actual cash charged is $0.00');
  assert(gov.blockers.some(b => b.id === 'billing_kill_switch' && b.state === 'ON'), 'Billing kill switch is ON');
  assert(gov.blockers.some(b => b.id === 'stripe_live' && b.state === 'OFF'), 'Stripe Live blocker is OFF');

  // --- Group 7: English-Only Verification Across All Client Files ---
  console.log('\n--- Group 7: English-Only Verification ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html') || f.endsWith('.js'));
  let hangulCount = 0;
  clientFiles.forEach(f => {
    const content = fs.readFileSync(path.join(clientDir, f), 'utf8');
    if (hangulRegex.test(content)) hangulCount++;
  });
  assert(hangulCount === 0, `Zero Hangul across all ${clientFiles.length} client files`);

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase107LTestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

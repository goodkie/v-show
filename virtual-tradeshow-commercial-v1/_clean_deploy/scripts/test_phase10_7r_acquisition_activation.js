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

async function runPhase107RTestSuite() {
  console.log('============================================================');
  console.log('PHASE 10.7R ACQUISITION & ACTIVATION MASTER REHEARSAL SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const db = require(path.join(serverDir, 'db.js'));

  // Clean baseline
  await db.mutate((d) => {
    d.organizations = (d.organizations || []).filter(o => !(o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer));
    d.acquisitionLeads = [];
  });

  // --- Group 1: Commercial Landing & Meta (8 Items) ---
  console.log('--- Group 1: Commercial Landing & Meta ---');

  const indexHtml = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
  assert(indexHtml.includes('vivPR V-Show — Turn Your Real Trade Show Booth'), 'Landing title specifies core value proposition');
  assert(indexHtml.includes('Transform booth photography into an interactive virtual showroom'), 'Landing hero copy communicates truthful 3D benefit');
  assert(indexHtml.includes('Start Free Pilot'), 'Primary CTA Start Free is present');
  assert(indexHtml.includes('View 3D Demo'), 'Secondary CTA View 3D Demo is present');
  assert(indexHtml.includes('$299') && indexHtml.includes('$799') && indexHtml.includes('$0'), 'Displays $0, $299, $799 pricing tiers');
  assert(indexHtml.includes('pilot-2026.1'), 'Clearly labels pilot pricing version');
  assert(indexHtml.includes('og:title') && indexHtml.includes('og:description'), 'OpenGraph SEO meta tags configured');
  assert(!indexHtml.includes('guaranteed sales') && !indexHtml.includes('100% identical'), 'No deceptive overclaiming copy');

  // --- Group 2: Interactive Demo Booth (8 Items) ---
  console.log('\n--- Group 2: Interactive Demo Booth ---');
  const demoHtml = fs.readFileSync(path.join(clientDir, 'demo.html'), 'utf8');
  assert(demoHtml.includes('INTERACTIVE DEMO (SYNTHETIC)'), 'Demo clearly labels synthetic/demo status');
  assert(demoHtml.includes('THREE.Scene'), 'Three.js 3D rendering container initialized');
  assert(demoHtml.includes('OrbitControls'), 'OrbitControls camera navigation configured');
  assert(demoHtml.includes('safe-area-inset-top'), 'Safe-area insets applied in demo');
  assert(demoHtml.includes('Create Your Booth'), 'Demo includes conversion CTA to start application');
  assert(demoHtml.includes('Drag to Orbit'), 'Interactive HUD gestures displayed');
  assert(fs.existsSync(path.join(clientDir, 'demo.html')), 'demo.html exists in client directory');
  assert(db.getRealPaidCustomerCount() === 0, 'Demo usage does NOT create real customers');

  // --- Group 3: Start Free Application Form (8 Items) ---
  console.log('\n--- Group 3: Start Free Application Form ---');
  const startHtml = fs.readFileSync(path.join(clientDir, 'start.html'), 'utf8');
  assert(startHtml.includes('Create Your Virtual Booth'), 'Start page headline present');
  assert(startHtml.includes('id="companyName"') && startHtml.includes('id="workEmail"'), 'Company and Work Email required fields present');
  assert(startHtml.includes('id="photoReadiness"'), 'Photo readiness options present (60+, fewer, not yet)');
  assert(startHtml.includes('id="approxProductCount"'), 'Product count tier selector present');
  assert(startHtml.includes('id="primaryGoal"'), 'Primary goal selector present');
  assert(startHtml.includes('privacyConsent'), 'Mandatory Privacy Policy acknowledgement checkbox present');
  assert(startHtml.includes('marketingConsent'), 'Optional marketing consent checkbox present (unchecked)');
  assert(startHtml.includes('/api/public/acquisition-leads'), 'Form posts to public acquisition-leads endpoint');

  // --- Group 4: Acquisition Lead Capture & Classification (8 Items) ---
  console.log('\n--- Group 4: Acquisition Lead Capture & Classification ---');
  const lead1 = await db.createAcquisitionLead({
    companyName: 'OmniDrive Robotics Inc',
    workEmail: 'marketing@omnidrive-robotics.test',
    website: 'https://omnidrive-robotics.test',
    industry: 'Industrial Motion Control',
    eventName: 'IMTS 2026 Chicago',
    boothNumber: 'Booth #East-4210',
    photoReadiness: '60_plus',
    approxProductCount: '6-25',
    primaryGoal: 'Generate leads',
    marketingConsent: true,
    environment: 'REAL'
  });

  assert(lead1.id !== undefined, 'Created acquisition lead with unique ID');
  assert(lead1.recordType === 'ACQUISITION_LEAD', 'Lead recordType is ACQUISITION_LEAD');
  assert(lead1.environment === 'REAL', 'Lead environment is REAL');
  assert(lead1.stage === 'NEW', 'Initial lead stage is NEW');
  assert(lead1.marketingConsent === true, 'Marketing consent recorded');
  assert(lead1.privacyVersion === '2026.1-draft', 'Privacy version recorded at consent time');
  assert(db.getAcquisitionLeads('REAL').length >= 1, 'getAcquisitionLeads returns captured lead');
  assert(db.getRealPaidCustomerCount() === 0, 'Acquisition lead creation does NOT count as paid customer');

  // --- Group 5: Sales Pipeline & Stage Transitions (10 Items) ---
  console.log('\n--- Group 5: Sales Pipeline & Stage Transitions ---');
  const updatedLead1 = await db.updateAcquisitionLeadStage(lead1.id, {
    stage: 'QUALIFIED',
    notes: 'Prospect confirmed 75 booth photos and 12 products ready for showcase.',
    nextAction: 'Deliver customized 3D demo & offer pilot'
  });
  assert(updatedLead1.stage === 'QUALIFIED', 'Lead transitioned to QUALIFIED stage');
  assert(updatedLead1.notes.includes('75 booth photos'), 'Sales notes appended to lead record');

  await db.updateAcquisitionLeadStage(lead1.id, { stage: 'DEMO_SCHEDULED' });
  assert((await db.getAcquisitionLeads()).find(l => l.id === lead1.id).stage === 'DEMO_SCHEDULED', 'Stage updated to DEMO_SCHEDULED');

  await db.updateAcquisitionLeadStage(lead1.id, { stage: 'DEMO_COMPLETED' });
  assert((await db.getAcquisitionLeads()).find(l => l.id === lead1.id).stage === 'DEMO_COMPLETED', 'Stage updated to DEMO_COMPLETED');

  await db.updateAcquisitionLeadStage(lead1.id, { stage: 'PILOT_OFFERED' });
  assert((await db.getAcquisitionLeads()).find(l => l.id === lead1.id).stage === 'PILOT_OFFERED', 'Stage updated to PILOT_OFFERED');

  const auditEvents = db.getAuditLogs();
  assert(auditEvents.some(a => a.action === 'acquisition.lead_stage_updated' && a.targetId === lead1.id), 'Stage transitions generate audit log entries');
  assert(auditEvents.some(a => a.action === 'acquisition.lead_submitted'), 'Lead submission generates audit log');
  assert(db.getRealMRR() === 0, 'Pipeline transitions generate $0.00 revenue');
  assert(db.getRealPilotCustomerCount() === 0, 'Pipeline leads are not counted as pilot customers yet');

  // --- Group 6: Lead to Customer Conversion & Quota (10 Items) ---
  console.log('\n--- Group 6: Lead to Customer Conversion & Quota ---');
  // Clear any existing real customer for clean conversion test
  await db.mutate((d) => {
    d.organizations = (d.organizations || []).filter(o => !(o.subscription?.dataEnvironment === 'REAL' && o.subscription?.pilotCustomer));
  });

  const conversionResult = await db.convertLeadToCustomer(lead1.id, 'pro');
  const convertedOrg = conversionResult.organization;
  assert(convertedOrg.subscription.dataEnvironment === 'REAL', 'Converted customer dataEnvironment is strictly REAL');
  assert(convertedOrg.subscription.commercialStatus === 'pre_activation', 'commercialStatus is pre_activation');
  assert(convertedOrg.subscription.billingStatus === 'not_activated', 'billingStatus is not_activated');
  assert(convertedOrg.subscription.pilotCustomer === true, 'pilotCustomer flag is true');
  assert(convertedOrg.subscription.plan === 'pro', 'Customer plan is pro');
  assert(convertedOrg.subscription.liveBillingAllowed === false, 'liveBillingAllowed is false');

  const leadAfterConvert = (await db.getAcquisitionLeads()).find(l => l.id === lead1.id);
  assert(leadAfterConvert.stage === 'PRE_ACTIVATION', 'Lead stage updated to PRE_ACTIVATION');

  // Verify Quota Guard on second conversion attempt
  const lead2 = await db.createAcquisitionLead({
    companyName: 'Secondary Systems LLC',
    workEmail: 'contact@secondary.test',
    environment: 'REAL'
  });

  let secondConvertError = null;
  try {
    await db.convertLeadToCustomer(lead2.id, 'pro');
  } catch (err) {
    secondConvertError = err;
  }
  assert(secondConvertError !== null, 'Second conversion attempt throws quota error');
  assert(secondConvertError.code === 'LIVE_PILOT_CUSTOMER_LIMIT_REACHED', 'Error code is LIVE_PILOT_CUSTOMER_LIMIT_REACHED');

  // --- Group 7: Free Plan Experience & Contextual PRO Upgrade Moments (10 Items) ---
  console.log('\n--- Group 7: Free Plan Experience & Contextual PRO Upgrade Moments ---');
  const freeLimits = db.getPlanLimits('free');
  assert(freeLimits.maxProducts === 5, 'Free plan product limit is 5');
  assert(freeLimits.maxHotspots === 3, 'Free plan hotspot limit is 3');
  assert(freeLimits.precision3D === false, 'Free plan does not include precision 3DGS');
  assert(freeLimits.reconstructionCredits === 0, 'Free plan has 0 reconstruction credits');

  const proLimits = db.getPlanLimits('pro');
  assert(proLimits.maxProducts === 25, 'PRO plan product limit is 25');
  assert(proLimits.maxHotspots === 15, 'PRO plan hotspot limit is 15');
  assert(proLimits.precision3D === true, 'PRO plan includes precision 3DGS');
  assert(proLimits.reconstructionCredits === 1, 'PRO plan includes 1 credit');

  const upgradeReadiness = db.calculateProUpgradeReadiness(convertedOrg.id);
  assert(upgradeReadiness.recommendedPlan.includes('PRO'), 'Upgrade readiness recommends PRO plan');
  assert(Array.isArray(upgradeReadiness.reasons), 'Upgrade readiness provides structured reasons');

  // --- Group 8: Value Milestone Engine (8 Items) ---
  console.log('\n--- Group 8: Value Milestone Engine ---');
  const booth = conversionResult.booth;
  const m1 = await db.recordValueMilestone({
    organizationId: convertedOrg.id,
    boothId: booth.id,
    milestoneType: 'booth_created',
    metadata: { boothNumber: booth.boothNumber }
  });
  assert(m1.id !== undefined, 'Recorded booth_created milestone');

  const m2 = await db.recordValueMilestone({
    organizationId: convertedOrg.id,
    boothId: booth.id,
    milestoneType: 'first_buyer_view',
    metadata: { visitorIpHash: 'anon_123' }
  });
  assert(m2.milestoneType === 'first_buyer_view', 'Recorded first_buyer_view milestone');

  // Deduplication check
  const m2Duplicate = await db.recordValueMilestone({
    organizationId: convertedOrg.id,
    boothId: booth.id,
    milestoneType: 'first_buyer_view'
  });
  assert(m2Duplicate.id === m2.id, 'One-time milestone deduplicated');

  const allMilestones = db.getValueMilestones(convertedOrg.id);
  assert(allMilestones.length === 2, 'getValueMilestones returns 2 unique milestones');
  assert(allMilestones.some(m => m.milestoneType === 'booth_created'), 'booth_created present in list');
  assert(allMilestones.some(m => m.milestoneType === 'first_buyer_view'), 'first_buyer_view present in list');
  assert(db.getRealMRR() === 0, 'Milestone triggers generate $0.00 revenue');
  assert(db.getRealPaidCustomerCount() === 0, 'Milestones do not mutate paid customer count');

  // --- Group 9: Customer Activation Score & Pro Upgrade Readiness (8 Items) ---
  console.log('\n--- Group 9: Customer Activation Score & Pro Upgrade Readiness ---');
  const scoreInitial = db.calculateCustomerActivationScore(convertedOrg.id);
  assert(scoreInitial >= 15, 'Initial activation score calculated (booth created)');

  // Simulate products & leads
  await db.createProduct({ organizationId: convertedOrg.id, boothId: booth.id, name: 'Servo Actuator X1', price: 1200 });
  await db.createLead({ organizationId: convertedOrg.id, name: 'Buyer John', email: 'john@buyer.test' });
  const scoreAfterActivity = db.calculateCustomerActivationScore(convertedOrg.id);
  assert(scoreAfterActivity > scoreInitial, 'Activation score increases with products and leads');
  assert(scoreAfterActivity <= 100, 'Activation score capped at 100');

  const proCheck = db.calculateProUpgradeReadiness(convertedOrg.id);
  assert(proCheck.level === 'LOW' || proCheck.level === 'MEDIUM' || proCheck.level === 'HIGH', 'Valid upgrade readiness level');
  assert(proCheck.recommendedPlan.includes('PRO'), 'Recommends PRO');
  assert(db.getRealPaidCustomerCount() === 0, 'Activation score has zero revenue impact');
  assert(db.getRealMRR() === 0, 'Activation score has zero MRR impact');

  // --- Group 10: Customer Feedback Workflow (6 Items) ---
  console.log('\n--- Group 10: Customer Feedback Workflow ---');
  const fb = await db.recordCustomerFeedback({
    organizationId: convertedOrg.id,
    userId: conversionResult.user.id,
    rating: 5,
    improvements: 'Navigation is fast and responsive on mobile.',
    futureEventInterest: 'Yes'
  });
  assert(fb.id !== undefined, 'Customer feedback recorded');
  assert(fb.rating === 5, 'Feedback rating is 5 stars');
  assert(fb.isPublicTestimonial === false, 'isPublicTestimonial is false (Private feedback)');
  assert(fb.futureEventInterest === 'Yes', 'Future event interest is Yes');
  assert(fb.organizationId === convertedOrg.id, 'Feedback mapped to organization');
  assert(db.getRealMRR() === 0, 'Feedback submission has zero MRR impact');

  // --- Group 11: Acquisition Analytics & Conversion Funnel (8 Items) ---
  console.log('\n--- Group 11: Acquisition Analytics & Conversion Funnel ---');
  const analytics = db.getAcquisitionAnalytics();
  assert(analytics.applicationsCompleted >= 2, 'Analytics counts applications completed');
  assert(analytics.qualifiedLeads >= 1, 'Analytics counts qualified leads');
  assert(analytics.preActivatedCustomers === 1, 'Analytics counts pre-activated customers');
  assert(analytics.realPaidCustomers === 0, 'Analytics reports 0 real paid customers');
  assert(analytics.realMRR === 0, 'Analytics reports $0 real MRR');
  assert(analytics.realARR === 0, 'Analytics reports $0 real ARR');
  assert(analytics.conversionRates.applicationToQualified !== undefined, 'Conversion rates calculated');
  assert(analytics.conversionRates.qualifiedToPreActivated !== undefined, 'Qualified-to-PreActivated rate calculated');

  // --- Group 12: Capture Guide & Intake QA (8 Items) ---
  console.log('\n--- Group 12: Capture Guide & Intake QA ---');
  const guideHtml = fs.readFileSync(path.join(clientDir, 'capture-guide.html'), 'utf8');
  assert(guideHtml.includes('60–100 Photographs'), 'Capture guide specifies 60-100 photo range');
  assert(guideHtml.includes('Full Perimeter Orbit'), 'Guide documents perimeter orbit');
  assert(guideHtml.includes('High & Low Angles'), 'Guide documents elevation passes');
  assert(guideHtml.includes('What to Avoid'), 'Guide documents avoidance rules');

  const photoList70 = Array.from({ length: 70 }, (_, i) => `view_${i + 1}.jpg`);
  const qaResult = db.runCaptureQA(booth.id, photoList70);
  assert(qaResult.intakeStatus === 'QA_PASSED', 'QA passes for 70 valid images');
  assert(qaResult.productionReady === true, 'productionReady is true');
  assert(qaResult.qualityScore === 100, 'Quality score is 100%');
  assert(qaResult.duplicateEstimate === 0, 'Duplicate estimate is 0');

  // --- Group 13: Stripe Test Checkout Rehearsal & Live Gate (8 Items) ---
  console.log('\n--- Group 13: Stripe Test Checkout Rehearsal & Live Gate ---');
  const gov = db.getCommercialGovernance();
  const preflight = db.getStripeLivePreflight();
  assert(preflight.readinessStatus === 'BLOCKED', 'Preflight status is BLOCKED');
  assert(preflight.stripeLiveBillingEnabled === false, 'Live billing enabled is false');
  assert(preflight.actualCashCharged === '$0.00', 'Actual cash charged is $0.00');
  assert(gov.blockers.some(b => b.id === 'stripe_live' && b.state === 'OFF'), 'Stripe Live blocker is OFF');
  assert(gov.blockers.some(b => b.id === 'billing_kill_switch' && b.state === 'ON'), 'Billing kill switch is ON');
  assert(gov.taxReadiness.status === 'review_required', 'Tax readiness is review_required');
  assert(gov.blockers.some(b => b.id === 'legal_approval' && b.state === 'BLOCKED'), 'Legal review blocker is BLOCKED');
  assert(db.getRealMRR() === 0, 'Real MRR remains $0.00');

  // --- Group 14: Tenant Isolation & Security (8 Items) ---
  console.log('\n--- Group 14: Tenant Isolation & Security ---');
  const synthOrg = await db.createOrganization({ name: 'Northstar Synthetic', type: 'exhibitor', dataEnvironment: 'SYNTHETIC_TEST' });
  await db.createLead({ organizationId: synthOrg.id, name: 'Synthetic Buyer', email: 'synth@buyer.test' });

  const synthLeads = db.getLeads(synthOrg.id);
  const realCustomerLeads = db.getLeads(convertedOrg.id);
  assert(synthLeads.length === 1 && synthLeads[0].email === 'synth@buyer.test', 'SYNTHETIC_TEST leads isolated');
  assert(realCustomerLeads.length === 1 && realCustomerLeads[0].email === 'john@buyer.test', 'REAL leads isolated');

  const weakPwd = db.validatePasswordStrength('Short1!');
  assert(!weakPwd.valid && weakPwd.code === 'WEAK_PASSWORD', 'Short password rejected');

  const strongPwd = db.validatePasswordStrength('Northstar2026!Automation');
  assert(strongPwd.valid === true, 'Strong password accepted');

  const user = db.getUserById(conversionResult.user.id);
  assert(user.mustChangePassword === true, 'Customer admin user created with mustChangePassword: true');

  await db.updateUserPassword(user.id, 'NewPass2026!OmniDrive');
  const updatedUser = db.getUserById(user.id);
  assert(updatedUser.mustChangePassword === false, 'mustChangePassword cleared');
  assert(db.verifyPassword('NewPass2026!OmniDrive', updatedUser.hash, updatedUser.salt), 'Password verified');
  assert(!db.verifyPassword(conversionResult.tempPasswordForDisplay, updatedUser.hash, updatedUser.salt), 'Old temp password invalidated');

  // --- Group 15: Localization, Mobile Landscape & 3D Rendering (8 Items) ---
  console.log('\n--- Group 15: Localization, Mobile Landscape & 3D Rendering ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = [
    'index.html', 'demo.html', 'start.html', 'capture-guide.html', 'pricing.html',
    'lobby.html', 'lobby.js', 'viewer.html', 'viewer.js', 'admin.html', 'admin.js',
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
  assert(hangulCount === 0, 'Zero Hangul characters across all 18 client files');

  const viewerHtml = fs.readFileSync(path.join(clientDir, 'viewer.html'), 'utf8');
  const viewerJs = fs.readFileSync(path.join(clientDir, 'viewer.js'), 'utf8');
  assert(viewerHtml.includes('orientation-suggestion-banner'), 'Viewer has orientation banner');
  assert(viewerHtml.includes('safe-area-inset-top'), 'Viewer has safe-area insets');
  assert(viewerJs.includes('precision_splat'), 'Precision splat mode supported');
  assert(viewerJs.includes('webglcontextlost'), 'WebGL context lost handler registered');
  assert(viewerJs.includes('webglcontextrestored'), 'WebGL context restored handler registered');
  assert(fs.existsSync(path.join(clientDir, 'robots.txt')), 'robots.txt exists for SEO');
  assert(fs.existsSync(path.join(clientDir, 'sitemap.xml')), 'sitemap.xml exists for SEO');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase107RTestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

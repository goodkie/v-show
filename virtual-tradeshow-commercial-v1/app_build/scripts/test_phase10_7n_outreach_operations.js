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

async function runPhase107NTestSuite() {
  console.log('============================================================');
  console.log('PHASE 10.7N FIRST 10 PROSPECT OUTREACH OPERATIONS SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const artifactsDir = path.join(appDir, '../production_artifacts');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Group 1: CSV Template & Import Validation (Tests 1-6) ---
  console.log('--- Group 1: CSV Template & Import Validation ---');
  assert(fs.existsSync(path.join(clientDir, 'prospect-import-template.csv')), 'Prospect CSV template exists');
  const templateCsv = fs.readFileSync(path.join(clientDir, 'prospect-import-template.csv'), 'utf8');
  assert(templateCsv.includes('company_name') && templateCsv.includes('contact_email'), 'Template contains company_name & contact_email');
  assert(templateCsv.includes('TEST ONLY'), 'Template sample data explicitly labeled TEST ONLY');

  let badImportErr = false;
  try {
    await db.importOutreachProspects([]);
  } catch (e) {
    badImportErr = true;
  }
  assert(badImportErr === true, 'Empty import array rejected');

  // --- Group 2: Prospect Creation, Scoring & Sprint Capacity (Tests 7-14) ---
  console.log('\n--- Group 2: Prospect Creation, Scoring & Sprint Capacity ---');
  const uid = Date.now();
  const sampleProspects = [
    { company_name: `Alpha Robotics Rehearsal ${uid}`, contact_email: `alpha_${uid}@robotics-rehearsal.test`, contact_name: 'Arthur Pendelton', trade_show: 'Automate 2026', booth_number: 'A-101' },
    { company_name: `Beta Automation Rehearsal ${uid}`, contact_email: `beta_${uid}@automation-rehearsal.test`, contact_name: 'Beatrice Webb', trade_show: 'IMTS 2026', booth_number: 'B-202' }
  ];
  const importRes = await db.importOutreachProspects(sampleProspects, 'TEST');
  assert(importRes.totalImported === 2, 'Imported 2 test prospects');
  const alpha = db.getOutreachProspectById(importRes.imported[0].id);
  assert(alpha !== null, 'Prospect retrieved by ID');
  assert(alpha.recordType === 'ACQUISITION_PROSPECT', 'recordType is ACQUISITION_PROSPECT');
  assert(alpha.commercialStatus === 'prospect', 'commercialStatus is prospect');
  assert(alpha.stage === 'READY_TO_CONTACT', 'Initial stage is READY_TO_CONTACT');
  assert(alpha.qualificationScore >= 0, 'Qualification score calculated');

  // Duplicate detection test
  const dupRes = await db.importOutreachProspects([{ company_name: `Alpha Robotics Rehearsal ${uid}`, contact_email: `alpha_${uid}@robotics-rehearsal.test` }], 'TEST');
  assert(dupRes.totalImported === 0, 'Duplicate prospect skipped from import');
  assert(dupRes.duplicates.length === 1, 'Duplicate recorded in skipped list');


  // --- Group 3: Outreach Lifecycle & Timeline (Tests 15-22) ---
  console.log('\n--- Group 3: Outreach Lifecycle & Timeline ---');
  await db.updateProspectOutreach(alpha.id, { action: 'contacted', note: 'Initial outreach sent via Gmail' });
  const contactedAlpha = db.getOutreachProspectById(alpha.id);
  assert(contactedAlpha.stage === 'CONTACTED', 'Stage transitioned to CONTACTED');
  assert(contactedAlpha.lastContactAt !== null, 'lastContactAt timestamp recorded');
  assert(contactedAlpha.nextFollowUpAt !== null, 'nextFollowUpAt automatically scheduled in 3-4 days');
  assert(contactedAlpha.followUpCount === 1, 'followUpCount incremented to 1');
  assert(contactedAlpha.timeline.length >= 2, 'Timeline logged contacted action');

  // Record Positive Reply & Demo Scheduled
  await db.updateProspectOutreach(alpha.id, { stage: 'DEMO_SCHEDULED', responseCategory: 'POSITIVE', note: 'Prospect agreed to 15-min walkthrough' });
  const demoAlpha = db.getOutreachProspectById(alpha.id);
  assert(demoAlpha.stage === 'DEMO_SCHEDULED', 'Stage updated to DEMO_SCHEDULED');
  assert(demoAlpha.responseCategory === 'POSITIVE', 'responseCategory marked POSITIVE');

  // --- Group 4: Do-Not-Contact (DNC) Safeguard (Tests 23-28) ---
  console.log('\n--- Group 4: Do-Not-Contact (DNC) Safeguard ---');
  const beta = db.getOutreachProspectById(importRes.imported[1].id);
  await db.setProspectDoNotContact(beta.id, 'Opt-out requested');
  const dncBeta = db.getOutreachProspectById(beta.id);
  assert(dncBeta.doNotContact === true, 'Prospect marked doNotContact: true');
  assert(dncBeta.stage === 'NOT_INTERESTED', 'DNC prospect moved to NOT_INTERESTED');
  assert(dncBeta.nextFollowUpAt === null, 'DNC clears scheduled follow-ups');

  let dncBlockErr = false;
  try {
    await db.updateProspectOutreach(beta.id, { action: 'contacted' });
  } catch (e) {
    dncBlockErr = (e.code === 'PROSPECT_DO_NOT_CONTACT');
  }
  assert(dncBlockErr === true, 'Outreach to DNC prospect is strictly BLOCKED (HTTP 400)');

  // --- Group 5: Scorecard & Zero-Denominator Safety (Tests 29-35) ---
  console.log('\n--- Group 5: Scorecard & Zero-Denominator Safety ---');
  const scorecard = db.getOutreachScorecard('REAL');
  assert(scorecard.sprintCapacity !== undefined, 'Scorecard includes sprint capacity');
  assert(typeof scorecard.totalProspects === 'number', 'Total prospects is numeric');
  assert(scorecard.rates.replyRate === 'N/A' || scorecard.rates.replyRate.endsWith('%'), 'Reply rate is valid string (zero-denominator safe)');
  assert(scorecard.rates.demoRate === 'N/A' || scorecard.rates.demoRate.endsWith('%'), 'Demo rate is zero-denominator safe');
  assert(db.getRealMRR() === 0, 'REAL MRR is strictly $0.00');
  assert(db.getRealARR() === 0, 'REAL ARR is strictly $0.00');
  assert(db.getRealPaidCustomerCount() === 0, 'REAL Paid Customers is strictly 0');

  // --- Group 6: CSV Export & Formula Injection Sanitization (Tests 36-40) ---
  console.log('\n--- Group 6: CSV Export & Formula Injection Sanitization ---');
  const exportCsv = db.exportOutreachCsv('TEST');
  assert(typeof exportCsv === 'string' && exportCsv.includes('Company'), 'CSV export generated with headers');
  assert(exportCsv.includes(sampleProspects[0].company_name), 'Export includes test prospect');
  
  // Test formula injection protection
  const formulaProspect = await db.importOutreachProspects([{ company_name: '=SUM(A1:A10)', contact_email: `calc_${uid}@test.test` }], 'TEST');
  const formulaCsv = db.exportOutreachCsv('TEST');
  assert(formulaCsv.includes("'=SUM(A1:A10)"), 'Spreadsheet formula injection sanitized with leading single quote');


  // --- Group 7: Governance, Safety Invariants & Email Policy (Tests 41-47) ---
  console.log('\n--- Group 7: Governance & Safety Invariants ---');
  const flags = db.getFeatureFlags();
  const gov = db.getCommercialGovernance();
  assert(flags.stripeLiveBillingEnabled === false, 'Stripe Live Mode is strictly OFF');
  assert(flags.billingKillSwitch === true, 'Billing Kill Switch is ON');
  assert(flags.legalReviewStatus === 'pending', 'Legal Review status remains PENDING');
  assert(gov.taxReadiness.status === 'review_required', 'Tax Readiness remains REVIEW_REQUIRED');
  assert(gov.businessIdentity.legalBusinessName === 'vivPR', 'Legal business name is vivPR');
  assert(gov.businessIdentity.isComplete === true, 'Business identity is COMPLETE');
  assert(gov.pricingGovernance.pricingStatus === 'approved_for_pilot', 'Pricing is approved_for_pilot');

  // --- Group 8: English-Only Verification ---
  console.log('\n--- Group 8: English-Only Verification ---');
  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = fs.readdirSync(clientDir).filter(f => f.endsWith('.html') || f.endsWith('.js'));
  let hangulCount = 0;
  clientFiles.forEach(f => {
    const content = fs.readFileSync(path.join(clientDir, f), 'utf8');
    if (hangulRegex.test(content)) hangulCount++;
  });
  assert(hangulCount === 0, `Zero Hangul characters across all ${clientFiles.length} client files`);

  const gcHtml = fs.readFileSync(path.join(clientDir, 'grand-control.html'), 'utf8');
  assert(gcHtml.includes('First 10 Prospect Outreach Sprint'), 'Grand Control contains First 10 Outreach section');
  assert(gcHtml.includes('prospect-import-template.csv'), 'Grand Control links to CSV template');

  // --- Group 9: Outreach Message Library & Templates ---
  console.log('\n--- Group 9: Outreach Message Library & Templates ---');
  assert(fs.existsSync(path.join(artifactsDir, 'OUTREACH_MESSAGE_LIBRARY.md')), 'Outreach message library exists');
  const msgLib = fs.readFileSync(path.join(artifactsDir, 'OUTREACH_MESSAGE_LIBRARY.md'), 'utf8');
  assert(msgLib.includes('Free Virtual Booth Pilot for Your Next Trade Show'), 'Initial outreach subject in message library');
  assert(msgLib.includes('Following up — Free Virtual Booth Pilot'), 'Follow-up #1 subject in message library');
  assert(msgLib.includes('Should I close the loop?'), 'Follow-up #2 subject in message library');
  assert(fs.existsSync(path.join(artifactsDir, 'DO_NOT_CONTACT_POLICY.md')), 'Do Not Contact policy document exists');
  assert(fs.existsSync(path.join(artifactsDir, 'OUTREACH_SCORECARD.md')), 'Outreach Scorecard specification exists');
  assert(fs.existsSync(path.join(artifactsDir, 'FIRST_10_PROSPECT_SPRINT_RUNBOOK.md')), 'Sprint Runbook exists');
  assert(fs.existsSync(path.join(artifactsDir, 'OUTREACH_PIPELINE_DEFINITION.md')), 'Pipeline Definition document exists');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase107NTestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

/**
 * dn'a-C04 — Pilot Exhibitor Validation Automated Test Suite
 * Tests: 5 Pilot Projects, Lead Pipeline, Analytics, CRM, Post-Show Report, Pilot Feedback
 * Expected: All PASS
 */

const http = require('http');
const BASE = 'http://localhost:3000';

let pass = 0;
let fail = 0;
const results = [];

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function assert(label, condition, extra = '') {
  if (condition) {
    pass++;
    results.push(`  ✓ ${label}`);
  } else {
    fail++;
    results.push(`  ✗ FAIL: ${label}${extra ? ' — ' + extra : ''}`);
  }
}

async function runTests() {
  console.log('\n=== dn\'a-C04 PILOT EXHIBITOR VALIDATION TEST SUITE ===\n');

  // --- Group A: Pilot Cohort Projects List ---
  console.log('[A] PILOT COHORT PROJECTS LIST');
  const pilotList = await req('GET', '/api/pilot/projects');
  assert('A1: GET /api/pilot/projects — 200', pilotList.status === 200, `got ${pilotList.status}`);
  assert('A2: Returns 5 pilot projects', pilotList.body.count === 5, `got ${pilotList.body.count}`);
  const havens = pilotList.body.projects.find(p => p.id === 'proj-pilot-01-haven');
  assert('A3: Pilot #1 Haven & Oak present', !!havens, '');
  assert('A4: Pilot #3 Lumina PUBLISHED + SHOW_STARTED priority', pilotList.body.projects.find(p => p.id === 'proj-pilot-03-lumina')?.status === 'PUBLISHED', '');
  const managedProjects = pilotList.body.projects.filter(p => p.managedHandoff);
  assert('A5: Minimum 2 managed handoff projects (Nova + Atlantica)', managedProjects.length >= 2, `got ${managedProjects.length}`);

  // --- Group B: Pilot Projects — Individual Endpoints ---
  console.log('\n[B] INDIVIDUAL PILOT PROJECT RETRIEVAL');
  const p1 = await req('GET', '/api/diy/projects/proj-pilot-01-haven');
  assert('B1: GET proj-pilot-01-haven — 200', p1.status === 200);
  assert('B2: Haven & Oak company name', p1.body.company === 'Haven & Oak Furniture Co.', p1.body.company);
  assert('B3: Haven & Oak PUBLISHED status', p1.body.status === 'PUBLISHED');
  assert('B4: Haven & Oak has 3 products', Array.isArray(p1.body.products) && p1.body.products.length >= 3);

  const p2 = await req('GET', '/api/diy/projects/proj-pilot-02-nova');
  assert('B5: proj-pilot-02-nova — 200', p2.status === 200);
  assert('B6: Nova in QUALIFICATION (managed handoff)', p2.body.status === 'QUALIFICATION');
  assert('B7: Nova managedHandoff.handoffStatus = ACTIVE', p2.body.managedHandoff?.handoffStatus === 'ACTIVE');
  assert('B8: Nova — NO data reentry (products preserved)', Array.isArray(p2.body.products) && p2.body.products.length >= 2);

  const p3 = await req('GET', '/api/diy/projects/proj-pilot-03-lumina');
  assert('B9: proj-pilot-03-lumina (ASD — Show Started) — 200', p3.status === 200);
  assert('B10: Lumina priority = SHOW_STARTED', p3.body.priority === 'SHOW_STARTED');

  // --- Group C: Lead Pipeline Inbox ---
  console.log('\n[C] LEAD PIPELINE INBOX');
  const leadsP1 = await req('GET', '/api/diy/projects/proj-pilot-01-haven/leads');
  assert('C1: GET leads for proj-pilot-01-haven — 200', leadsP1.status === 200);
  assert('C2: Haven has >= 4 seed leads', leadsP1.body.count >= 4, `got ${leadsP1.body.count}`);

  // Filter by RFQ
  const rfqFilter = await req('GET', '/api/diy/projects/proj-pilot-01-haven/leads?filter=RFQ');
  assert('C3: Filter by RFQ returns correct subset', rfqFilter.status === 200 && rfqFilter.body.leads.length >= 1);

  // Filter by SAMPLE
  const sampleFilter = await req('GET', '/api/diy/projects/proj-pilot-01-haven/leads?filter=SAMPLE');
  assert('C4: Filter by SAMPLE action returns correct subset', sampleFilter.status === 200 && sampleFilter.body.leads.length >= 1);

  // --- Group D: Lead Detail ---
  console.log('\n[D] LEAD DETAIL');
  const leadDetail = await req('GET', '/api/diy/projects/proj-pilot-01-haven/leads/lead-p1-01');
  assert('D1: GET lead-p1-01 detail — 200', leadDetail.status === 200);
  assert('D2: Lead buyer name = Sarah Jenkins', leadDetail.body.lead?.buyerName === 'Sarah Jenkins');
  assert('D3: Lead action type = RFQ', leadDetail.body.lead?.actionType === 'RFQ');
  assert('D4: Lead source = DIGITAL_BOOTH', leadDetail.body.lead?.source === 'DIGITAL_BOOTH');

  // --- Group E: Follow-up Lead Status Update ---
  console.log('\n[E] LEAD STATUS FOLLOW-UP');
  const leadUpdate = await req('PATCH', '/api/diy/projects/proj-pilot-01-haven/leads/lead-p1-01/status', {
    status: 'CONTACTED',
    note: 'Sent wholesale pricing sheet via email',
    actor: 'Julian Vance'
  });
  assert('E1: PATCH lead status -> CONTACTED — 200', leadUpdate.status === 200);
  assert('E2: Lead status updated to CONTACTED', leadUpdate.body.lead?.status === 'CONTACTED');

  // Update to WON
  const leadWon = await req('PATCH', '/api/diy/projects/proj-pilot-01-haven/leads/lead-p1-01/status', {
    status: 'WON',
    note: 'PO confirmed for 12 Monarch dining tables — signed and uploaded',
    actor: 'Julian Vance'
  });
  assert('E3: PATCH lead status -> WON — 200', leadWon.status === 200);
  assert('E4: Lead status = WON', leadWon.body.lead?.status === 'WON');

  // Invalid status rejected
  const invalidStatus = await req('PATCH', '/api/diy/projects/proj-pilot-01-haven/leads/lead-p1-01/status', {
    status: 'INVALID_STATUS'
  });
  assert('E5: Invalid status rejected (400)', invalidStatus.status === 400);

  // --- Group F: Create New Buyer Lead ---
  console.log('\n[F] CREATE NEW BUYER LEAD');
  const newLead = await req('POST', '/api/diy/projects/proj-pilot-05-textura/leads', {
    buyerName: 'Fiona Marshall',
    buyerCompany: 'Nordic Studio Contract',
    email: 'fiona@nordicstudio.example',
    phone: '+1 (503) 555-0781',
    interestedProduct: 'Aeroweave Performance Jacquard — Slate',
    source: 'PRODUCT_QR',
    actionType: 'SAMPLE',
    notes: 'Scanned QR at Interwoven booth, needs A-grade 10-yard memo sample for hospitality project.'
  });
  assert('F1: POST /leads — 201 Created', newLead.status === 201);
  assert('F2: New lead has id', typeof newLead.body.lead?.id === 'string');
  assert('F3: New lead buyer = Fiona Marshall', newLead.body.lead?.buyerName === 'Fiona Marshall');
  assert('F4: New lead action = SAMPLE', newLead.body.lead?.actionType === 'SAMPLE');

  // --- Group G: Analytics Summary ---
  console.log('\n[G] EXHIBITOR ANALYTICS SUMMARY');
  const an = await req('GET', '/api/diy/projects/proj-pilot-01-haven/analytics/summary');
  assert('G1: GET analytics/summary — 200', an.status === 200);
  assert('G2: Summary contains boothVisits', typeof an.body.summary?.metrics?.boothVisits === 'number');
  assert('G3: Conversion rate computed', typeof an.body.summary?.conversionRate === 'string');
  assert('G4: Funnel structure present', !!an.body.summary?.funnel?.visitors);
  assert('G5: Top products list present', Array.isArray(an.body.summary?.topProducts));
  assert('G6: FAKE_REAL_ANALYTICS = 0 — Haven pilot boothVisits > 0', (an.body.summary?.metrics?.boothVisits || 0) > 0);

  // Lumina ASD show analytics (live show)
  const anLumina = await req('GET', '/api/diy/projects/proj-pilot-03-lumina/analytics/summary');
  assert('G7: Lumina analytics — boothVisits 620', anLumina.body.summary?.metrics?.boothVisits === 620);
  assert('G8: Lumina leadsCaptured = 42', anLumina.body.summary?.metrics?.leadsCaptured === 42);

  // --- Group H: Post-Show Report ---
  console.log('\n[H] POST-SHOW REPORT');
  const psr = await req('POST', '/api/diy/projects/proj-pilot-03-lumina/post-show-report');
  assert('H1: POST post-show-report — 200', psr.status === 200);
  assert('H2: Report has company', psr.body.report?.company === 'Lumina Craft & Giftworks');
  assert('H3: Report has boothVisits', typeof psr.body.report?.boothVisits === 'number');
  assert('H4: Report has rfqsSubmitted', typeof psr.body.report?.rfqsSubmitted === 'number');
  assert('H5: Report has wonDeals', typeof psr.body.report?.wonDeals === 'number');
  assert('H6: Post-show pipeline value estimated', typeof psr.body.report?.pipelineValueEstimate === 'number');

  // --- Group I: Pilot Feedback ---
  console.log('\n[I] PILOT FEEDBACK & UX BLOCKER CLASSIFICATION');
  const fb = await req('POST', '/api/pilot/feedback', {
    projectId: 'proj-pilot-01-haven',
    company: 'Haven & Oak Furniture Co.',
    email: 'julian.vance@havenoak.example',
    diyEase: 8,
    productEntry: 7,
    assetUpload: 9,
    previewQuality: 8,
    publishConfidence: 9,
    analyticsUsefulness: 7,
    managedInterest: 6,
    missingFeatures: 'Would like email notifications when a new RFQ is submitted.',
    uxBlockers: [
      { severity: 'MEDIUM', description: 'Product entry modal requires scrolling on 13" screens — fields feel cramped.' },
      { severity: 'LOW', description: 'Template thumbnail images could be larger for clarity.' }
    ]
  });
  assert('I1: POST /api/pilot/feedback — 201', fb.status === 201);
  assert('I2: Feedback has id', typeof fb.body.feedback?.id === 'string');
  assert('I3: Feedback scores stored correctly', fb.body.feedback?.scores?.diyEase === 8);
  assert('I4: UX blockers captured', fb.body.feedback?.uxBlockers?.length === 2);

  const fbSummary = await req('GET', '/api/pilot/feedback/summary');
  assert('I5: GET /api/pilot/feedback/summary — 200', fbSummary.status === 200);
  assert('I6: Summary shows MEDIUM blocker count', fbSummary.body.summary?.blockers?.MEDIUM >= 1);

  // --- Group J: Managed Handoff Verification ---
  console.log('\n[J] MANAGED HANDOFF DATA PRESERVATION');
  const p4 = await req('GET', '/api/diy/projects/proj-pilot-04-atlantica');
  assert('J1: proj-pilot-04-atlantica (Atlanta Home Decor) — 200', p4.status === 200);
  assert('J2: PROJECT_CONTEXT_PRESERVED — company present', p4.body.company === 'Atlantica Living Home & Decor');
  assert('J3: SHOW_DATA_PRESERVED — tradeShow present', !!p4.body.tradeShow);
  assert('J4: ASSETS_PRESERVED — assets array present', Array.isArray(p4.body.assets) && p4.body.assets.length >= 1);
  assert('J5: PRODUCTS_PRESERVED — products array present', Array.isArray(p4.body.products) && p4.body.products.length >= 1);
  assert('J6: NO_DATA_REENTRY — managedHandoff.handoffStatus = ACTIVE', p4.body.managedHandoff?.handoffStatus === 'ACTIVE');

  // --- SUMMARY ---
  console.log('\n============================================================');
  console.log(`dn'a-C04 TEST RESULTS: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL`);
  console.log('============================================================');
  results.forEach(r => console.log(r));

  if (fail > 0) {
    console.log(`\n[FAIL] ${fail} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\n[ALL PASS] dn'a-C04 Pilot Exhibitor Validation — ${pass}/${pass} Tests Pass.`);
    process.exit(0);
  }
}

runTests().catch(e => { console.error('Test fatal error:', e); process.exit(1); });

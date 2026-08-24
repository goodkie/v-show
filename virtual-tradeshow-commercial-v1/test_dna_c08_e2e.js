// =====================================================================
// dn’a-C08 — ONE-PHOTO FREE VIRTUAL BOOTH FUNNEL E2E TEST SUITE
// =====================================================================

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
let devToken = '';

async function runRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', (e) => reject(e));
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function loginAsDev() {
  const res = await runRequest('POST', '/api/auth/login', {
    email: 'developer@vshow.com',
    password: 'admin123'
  });
  if (res.data && res.data.token) {
    devToken = res.data.token;
    return devToken;
  }
  return '';
}

async function runAllTests() {
  console.log('=====================================================');
  console.log(' dn’a-C08 FREE VIRTUAL BOOTH FUNNEL E2E TEST SUITE');
  console.log('=====================================================\n');

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

  // 1. Authenticate Developer
  await loginAsDev();
  assert(!!devToken, 'Developer session authenticated');

  // Reset Free Usages for Controlled Verification
  await runRequest('POST', '/api/internal/dev/free-funnel/reset', null, { 'Authorization': `Bearer ${devToken}` });

  // 2. Controlled Test A: New Business A + IP A (1 Valid Photo)
  const testARes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Apex Robotics Inc.',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '192.168.1.100' });
  assert(testARes.status === 201 && testARes.data.success, 'Controlled Test A: Free booth created for new business (status 201)');
  assert(testARes.data.experienceType === 'PHOTO_SHOWROOM', 'Controlled Test A: Experience type is truthful PHOTO_SHOWROOM');
  assert(testARes.data.coordinateSystem === 'NORMALIZED_2D', 'Controlled Test A: Coordinate system is NORMALIZED_2D');
  const projectAId = testARes.data.projectId;

  // 3. Controlled Test B: Same Business A + Same IP A (2nd Attempt) -> Expect Denied (409)
  const testBRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Apex Robotics, Inc.', // punctuation variation
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '192.168.1.100' });
  assert(testBRes.status === 409, 'Controlled Test B: Duplicate attempt for same normalized business denied with HTTP 409');
  assert(testBRes.data.error === 'BUSINESS_ALREADY_EXISTS', 'Controlled Test B: Error code is BUSINESS_ALREADY_EXISTS');

  // 4. Controlled Test C: Same Business A + Different IP B -> Expect Denied (409)
  const testCRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: ' apex robotics  ', // whitespace variation
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '203.0.113.45' });
  assert(testCRes.status === 409, 'Controlled Test C: Same business from different IP denied via business normalization');

  // 5. Controlled Test D: Different Business B + Same IP A -> Expect Allowed (201, no blanket NAT lockout)
  const testDRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'BioTech Innovations LLC',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '192.168.1.100' });
  assert(testDRes.status === 201 && testDRes.data.success, 'Controlled Test D: Different business on same NAT/IP is allowed (status 201)');

  // 6. Controlled Test E: Bad / Missing Image Quality Gate
  const testERes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Quantum Cybernetics'
    // missing photoUrl / file
  }, { 'x-forwarded-for': '192.168.1.102' });
  assert(testERes.status === 400, 'Controlled Test E: Missing/bad photo rejected with HTTP 400');
  assert(testERes.data.error === 'BAD_IMAGE_QUALITY', 'Controlled Test E: Rejection code is BAD_IMAGE_QUALITY (Allowance NOT consumed)');

  // 7. Controlled Test F: Add First Product & Pinpoint (u, v) + AI Description Assist
  const aiDraftRes = await runRequest('POST', '/api/free-funnel/ai/suggest-description', {
    productName: 'Apex Industrial Robotic Arm X-1',
    businessName: 'Apex Robotics',
    category: 'Industrial Automation'
  });
  assert(aiDraftRes.status === 200 && aiDraftRes.data.status === 'DRAFT', 'Controlled Test F: AI description generated as DRAFT');

  const addProdRes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/pinpoints`, {
    productName: 'Apex Industrial Robotic Arm X-1',
    description: aiDraftRes.data.suggestedDescription,
    u: 0.42,
    v: 0.65,
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(addProdRes.status === 201 && addProdRes.data.success, 'Controlled Test F: First product and pinpoint placed at (u=0.42, v=0.65)');
  assert(addProdRes.data.pinpoint.u === 0.42 && addProdRes.data.pinpoint.v === 0.65, 'Controlled Test F: Normalized 2D coordinates accurately preserved');

  // 8. Save Email Test
  const emailRes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/save-email`, {
    email: 'sarah.lin@apexrobotics.example'
  });
  assert(emailRes.status === 200 && emailRes.data.success, 'Save Email: Contact email attached to free preview project');

  // 9. Controlled Test G: Convert Free Project to PRO (Zero Data Re-entry)
  const upgradeRes = await runRequest('POST', `/api/free-funnel/projects/${projectAId}/convert-plan`, {
    plan: 'pro'
  });
  assert(upgradeRes.status === 200 && upgradeRes.data.success, 'Controlled Test G: Project converted to PRO plan');
  assert(upgradeRes.data.project.id === projectAId, 'Controlled Test G: Project ID strictly identical (FREE_TO_PRO_DATA_REENTRY = 0)');
  assert(upgradeRes.data.project.products.length === 1, 'Controlled Test G: Uploaded products preserved without re-entry');
  assert(upgradeRes.data.project.pinpoints.length === 1, 'Controlled Test G: Placed pinpoints preserved without re-entry');

  // 10. Controlled Test H: Developer Role Bypass
  const devBypassRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Apex Robotics Inc.', // normally 409
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'Authorization': `Bearer ${devToken}` });
  assert(devBypassRes.status === 201 && devBypassRes.data.success, 'Controlled Test H: Developer authenticated role bypasses free creation limit');

  // 11. Canonical Plan Registry Verification
  const plansRes = await runRequest('GET', '/api/billing/plans');
  assert(plansRes.status === 200, 'GET /api/billing/plans returns 200 OK');
  assert(plansRes.data.pro && plansRes.data.pro.monthlyPriceUsd === 299, 'PRO plan price is $299/mo (canonical)');
  assert(plansRes.data.business && plansRes.data.business.monthlyPriceUsd === 799, 'BUSINESS plan price is $799/mo (canonical)');

  console.log('\n=====================================================');
  console.log(` C08 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal C08 test error:', err);
  process.exit(1);
});

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Configure test environment variables before requiring db
process.env.DNA_SPECIAL_DEVELOPER_EMAILS = 'lead-dev@internal.vshow.com,architect@dn-a.com';
process.env.FREE_PREVIEW_HMAC_SECRET = 'dna_c10_r2_test_hmac_secret_key_2026';

const db = require('./app_build/server/db');

const BASE_URL = 'http://localhost:3000';

function httpRequest(method, pathName, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathName, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (postData) reqHeaders['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request({
      hostname: u.hostname,
      port: u.port || 3000,
      path: u.pathname + u.search,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log(" dn'a-C10-R2 HARDENED EMAIL, DUPLICATE & DEV BYPASS TEST SUITE");
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, condition, extra = '') {
    if (condition) {
      console.log(`[PASS] ${name} ${extra}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${extra}`);
      failed++;
    }
  }

  // TEST 1: Email Normalization & Special Developer Recognition
  const norm1 = db.normalizeEmail('  Test.Merchant+Sales@Domain.COM  ');
  report('TEST 1.1: Email normalization', norm1 === 'test.merchant+sales@domain.com');

  const isDev1 = db.isSpecialDeveloperEmail('lead-dev@internal.vshow.com');
  const isDev2 = db.isSpecialDeveloperEmail('  ARCHITECT@DN-A.COM ');
  const isNormal = db.isSpecialDeveloperEmail('public.buyer@company.com');
  report('TEST 1.2: Special developer email exact matching', isDev1 && isDev2 && !isNormal);

  // TEST 2: Email Mismatch (Normal Customer)
  const mismatchRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Mismatch Robotics',
    email: 'alice@example.com',
    confirmEmail: 'bob@example.com',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 2: Email mismatch rejected (HTTP 400)', mismatchRes.status === 400 && mismatchRes.data.error === 'EMAILS_DO_NOT_MATCH');

  // TEST 3: Unverified Email (Normal Customer)
  const unverifiedRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Unverified Biotech',
    email: 'unverified@clientcorp.com',
    confirmEmail: 'unverified@clientcorp.com',
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 3: Unverified email rejected (HTTP 400)', unverifiedRes.status === 400 && unverifiedRes.data.error === 'EMAIL_NOT_VERIFIED');

  // TEST 4: Email OTP Send & Verification Flow
  const testCustomerEmail = `customer_${Date.now()}@realbusiness.com`;
  const sendRes = await httpRequest('POST', '/api/free-funnel/email/send-code', {
    email: testCustomerEmail,
    businessName: 'Prime Dynamic Displays'
  });
  report('TEST 4.1: OTP code generated & sent', sendRes.status === 200 && sendRes.data.success && sendRes.data.code);

  const otpCode = sendRes.data.code;
  const verifyRes = await httpRequest('POST', '/api/free-funnel/email/verify-code', {
    email: testCustomerEmail,
    code: otpCode
  });
  report('TEST 4.2: OTP code successfully verified & signed token issued', verifyRes.status === 200 && verifyRes.data.verified && verifyRes.data.verificationToken);

  const verificationToken = verifyRes.data.verificationToken;

  // TEST 5: Successful Free Booth Creation for Verified Customer
  const validCustomerBiz = `Lumina Displays ${Date.now()}`;
  const createCustomerRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: validCustomerBiz,
    email: testCustomerEmail,
    confirmEmail: testCustomerEmail,
    verificationToken,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 5: Free Photo Immersive Booth created (HTTP 201)', createCustomerRes.status === 201 && createCustomerRes.data.experienceType === 'PHOTO_IMMERSIVE');

  // TEST 6: Duplicate Email Policy (Same verified email 2nd attempt blocked)
  const duplicateEmailRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: `Another Business ${Date.now()}`,
    email: testCustomerEmail,
    confirmEmail: testCustomerEmail,
    verificationToken,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 6: Same verified email 2nd attempt blocked (HTTP 409)', duplicateEmailRes.status === 409 && duplicateEmailRes.data.error === 'FREE_PREVIEW_EMAIL_ALREADY_USED');

  // TEST 7: Duplicate Business Policy (Same business name with new verified email blocked)
  const newEmail2 = `partner_${Date.now()}@realbusiness.com`;
  const sendRes2 = await httpRequest('POST', '/api/free-funnel/email/send-code', { email: newEmail2, businessName: validCustomerBiz });
  const verifyRes2 = await httpRequest('POST', '/api/free-funnel/email/verify-code', { email: newEmail2, code: sendRes2.data.code });
  const duplicateBizRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: validCustomerBiz,
    email: newEmail2,
    confirmEmail: newEmail2,
    verificationToken: verifyRes2.data.verificationToken,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 7: Same business duplicate blocked (HTTP 409)', duplicateBizRes.status === 409 && duplicateBizRes.data.error === 'BUSINESS_ALREADY_EXISTS');

  // TEST 8: Shared-IP Fairness (Same IP + Different legitimate business/email allowed)
  const newEmail3 = `shared_ip_${Date.now()}@innovate.com`;
  const sendRes3 = await httpRequest('POST', '/api/free-funnel/email/send-code', { email: newEmail3, businessName: 'Shared IP Co' });
  const verifyRes3 = await httpRequest('POST', '/api/free-funnel/email/verify-code', { email: newEmail3, code: sendRes3.data.code });
  const sharedIpRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: `Shared IP Booth ${Date.now()}`,
    email: newEmail3,
    confirmEmail: newEmail3,
    verificationToken: verifyRes3.data.verificationToken,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 8: Shared-IP different business allowed (HTTP 201)', sharedIpRes.status === 201 && sharedIpRes.data.success);

  // TEST 9: Bad Image Quality does NOT consume free allowance
  const badImageEmail = `bad_img_${Date.now()}@testcorp.com`;
  const sendBad = await httpRequest('POST', '/api/free-funnel/email/send-code', { email: badImageEmail, businessName: 'Bad Image Corp' });
  const verifyBad = await httpRequest('POST', '/api/free-funnel/email/verify-code', { email: badImageEmail, code: sendBad.data.code });
  const badImgRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Bad Image Corp',
    email: badImageEmail,
    confirmEmail: badImageEmail,
    verificationToken: verifyBad.data.verificationToken
    // no photo
  });
  report('TEST 9.1: Bad image rejected (HTTP 400)', badImgRes.status === 400 && badImgRes.data.error === 'BAD_IMAGE_QUALITY');

  // Now retry with good photo to prove allowance was NOT consumed
  const retryGoodRes = await httpRequest('POST', '/api/free-funnel/preview', {
    businessName: 'Bad Image Corp',
    email: badImageEmail,
    confirmEmail: badImageEmail,
    verificationToken: verifyBad.data.verificationToken,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  report('TEST 9.2: Allowance was preserved after bad image failure', retryGoodRes.status === 201 && retryGoodRes.data.success);

  // TEST 10: Special Developer Email Immediate Bypass (No Confirm Email, No OTP, Repeated Generations)
  const devEmail = 'lead-dev@internal.vshow.com';
  const devCheckRes = await httpRequest('POST', '/api/free-funnel/check-special-email', { email: devEmail });
  report('TEST 10.1: Special dev email check returns developerBypass: true', devCheckRes.status === 200 && devCheckRes.data.developerBypass === true);

  // Repeat 10 generations with same business name & special developer email
  let devSuccessCount = 0;
  for (let i = 1; i <= 10; i++) {
    const devGenRes = await httpRequest('POST', '/api/free-funnel/preview', {
      businessName: 'Dev Testing Labs Enterprise',
      email: devEmail,
      photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
    });
    if (devGenRes.status === 201 && devGenRes.data.environment === 'INTERNAL_DEV' && devGenRes.data.isTest === true) {
      devSuccessCount++;
    }
  }
  report('TEST 10.2: Special developer email repeated 10 generations allowed (10/10 INTERNAL_DEV)', devSuccessCount === 10);

  // TEST 11: Concurrency Control (10 simultaneous requests with same identity -> exactly 1 success, 9 rejections)
  const concurrentBiz = `Concurrent Systems ${Date.now()}`;
  const concurrentEmail = `concurrent_${Date.now()}@concurrency.test`;
  const sendConc = await httpRequest('POST', '/api/free-funnel/email/send-code', { email: concurrentEmail, businessName: concurrentBiz });
  const verifyConc = await httpRequest('POST', '/api/free-funnel/email/verify-code', { email: concurrentEmail, code: sendConc.data.code });
  const concToken = verifyConc.data.verificationToken;

  const promises = Array.from({ length: 10 }, () => 
    httpRequest('POST', '/api/free-funnel/preview', {
      businessName: concurrentBiz,
      email: concurrentEmail,
      confirmEmail: concurrentEmail,
      verificationToken: concToken,
      photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
    })
  );
  const concResults = await Promise.all(promises);
  const successCount = concResults.filter(r => r.status === 201).length;
  const rejectCount = concResults.filter(r => r.status === 409 || r.status === 400).length;
  report('TEST 11: Concurrency atomicity (Exactly 1 SUCCESS, 9 REJECTED)', successCount === 1 && rejectCount === 9, `[success=${successCount}, rejected=${rejectCount}]`);

  // TEST 12: IP Diagnostics Tool
  const diagRes = await httpRequest('GET', '/api/internal/dev/free-preview/ip-diagnostics');
  report('TEST 12: IP diagnostics endpoint reports resolvedIpHash & trustProxyStatus', diagRes.status === 200 && diagRes.data.resolvedIpHash && diagRes.data.trustProxyStatus === 'ENABLED');

  // TEST 13: Client Bundle Security Scan (No special developer email string exposed)
  const indexHtmlContent = fs.readFileSync(path.join(__dirname, 'app_build', 'client', 'index.html'), 'utf8');
  const hasLeakedDevEmail = indexHtmlContent.includes('lead-dev@internal.vshow.com') || indexHtmlContent.includes('architect@dn-a.com');
  report('TEST 13: Frontend source scan (Special developer emails NOT exposed)', !hasLeakedDevEmail);

  // TEST 14: C10-R1 Photo Immersive & 3 Blank Pins Regression
  report('TEST 14.1: Project returned 3 blank pins', createCustomerRes.data.project.pinpoints.length === 3);
  report('TEST 14.2: Project returned 3 blank product slots', createCustomerRes.data.project.products.length === 3);
  report('TEST 14.3: Coordinate system is NORMALIZED_2D', createCustomerRes.data.coordinateSystem === 'NORMALIZED_2D');

  console.log('\n===============================================================');
  console.log(` C10-R2 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) process.exit(1);
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

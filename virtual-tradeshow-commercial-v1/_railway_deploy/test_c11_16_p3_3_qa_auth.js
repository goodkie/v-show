/**
 * ============================================================
 * ³D₂ / 3DZ — C11.16-P3.3 AUTOMATED VERIFICATION SUITE
 * INTERNAL DEV QA AUTH BYPASS REPAIR TEST RUNNER
 * ============================================================
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.PORT = '3009';
process.env.NODE_ENV = 'development';
process.env.DEV_SANDBOX_ALLOW = 'true';

const { app, server } = require('./server/index');
const db = require('./server/db');

let passCount = 0;
let failCount = 0;

function report(condition, desc) {
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${desc}`);
  } else {
    failCount++;
    console.error(`  ❌ FAIL: ${desc}`);
  }
}

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: 3009,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = data;
        try { body = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSuite() {
  console.log('====================================================');
  console.log('🧪 C11.16-P3.3 INTERNAL DEV QA AUTH BYPASS SUITE');
  console.log('====================================================');

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: CANONICAL INTERNAL QA LOGIN BYPASS
    // ----------------------------------------------------
    console.log('\n🔹 1. Testing Canonical Internal QA Sign In (goodkie.com@gmail.com)...');

    const res1 = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com' }
    });

    report(res1.status === 200, 'HTTP 200 OK on send-otp for canonical QA identity');
    report(res1.body.authenticated === true, 'Bypass immediate session: authenticated === true');
    report(res1.body.otpRequired === false, 'No OTP requested: otpRequired === false');
    report(res1.body.internalQa === true, 'Identified as internalQa === true');
    report(typeof res1.body.token === 'string' && res1.body.token.startsWith('cust-sess-'), 'Issued valid session token cust-sess-*');
    report(Boolean(res1.body.account), 'Account payload returned directly');
    report(res1.body.account.emailNormalized === 'goodkie.com@gmail.com', 'Normalized email matches canonical identity');

    const qaToken = res1.body.token;
    const qaAccountId = res1.body.account.id;

    // ----------------------------------------------------
    // TEST SECTION 2: ACCOUNT CLASSIFICATION & PERSISTENCE
    // ----------------------------------------------------
    console.log('\n🔹 2. Testing Internal QA Account Classification & Attributes...');

    const account = res1.body.account;
    report(account.accountPurpose === 'INTERNAL_FULL_FEATURE_QA', 'accountPurpose === INTERNAL_FULL_FEATURE_QA');
    report(account.environment === 'INTERNAL_DEV', 'environment === INTERNAL_DEV');
    report(account.isTest === true, 'isTest === true');
    report(account.customerAnalyticsExcluded === true, 'customerAnalyticsExcluded === true');
    report(account.entitlement === 'INTERNAL_FULL_ACCESS', 'entitlement === INTERNAL_FULL_ACCESS');
    report(account.status === 'ACTIVE', 'status === ACTIVE');

    // Check reuse of account ID (No duplicate creation)
    const res1Again = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com' }
    });
    report(res1Again.body.account.id === qaAccountId, 'Account is reused by email (no duplicate created)');

    // ----------------------------------------------------
    // TEST SECTION 3: EMAIL NORMALIZATION & NEGATIVE TESTS
    // ----------------------------------------------------
    console.log('\n🔹 3. Testing Normalization & Negative Auth Allowlist Boundary Tests...');

    // Uppercase & trailing whitespace
    const resUpper = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: '  GOODKIE.COM@GMAIL.COM  ' }
    });
    report(resUpper.body.authenticated === true && resUpper.body.otpRequired === false, 'Uppercase + whitespace correctly normalized and bypassed');

    // Plus-addressing sub-identity (Must NOT bypass)
    const resPlus = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com+test@gmail.com' }
    });
    report(resPlus.body.authenticated === false && resPlus.body.otpRequired === true, 'goodkie.com+test@gmail.com denied bypass, requires OTP');

    // Typosquat / lookalike domain
    const resTypo = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.co' }
    });
    report(resTypo.body.authenticated === false && resTypo.body.otpRequired === true, 'goodkie.com@gmail.co denied bypass, requires OTP');

    // Evil subdomain
    const resEvil = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com.evil.example' }
    });
    report(resEvil.body.authenticated === false && resEvil.body.otpRequired === true, 'goodkie.com@gmail.com.evil.example denied bypass, requires OTP');

    // Real customer account (Studio Berry)
    const resBerry = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'studioberryinfo@gmail.com' }
    });
    report(resBerry.body.authenticated === false && resBerry.body.otpRequired === true, 'studioberryinfo@gmail.com requires normal OTP verification');

    // ----------------------------------------------------
    // TEST SECTION 4: SESSION SECURITY & LIFECYCLE
    // ----------------------------------------------------
    console.log('\n🔹 4. Testing Session Authentication, Verification & Revocation...');

    // Validate active session
    const meRes = await makeRequest('/api/customer/auth/me', {
      headers: { 'Authorization': 'Bearer ' + qaToken }
    });
    report(meRes.status === 200 && meRes.body.success && meRes.body.account.id === qaAccountId, 'Active QA session validates successfully via /api/customer/auth/me');

    // Check Entitlement Endpoint
    const entRes = await makeRequest('/api/customer/entitlement', {
      headers: { 'Authorization': 'Bearer ' + qaToken }
    });
    report(entRes.status === 200 && entRes.body.entitlement.planCode === 'INTERNAL_FULL_ACCESS', 'Entitlement meter reflects INTERNAL_FULL_ACCESS');
    report(entRes.body.entitlement.usage.products.limit >= 500, 'Products quota reflects Internal QA limit (500)');

    // Logout / Revoke
    const logoutRes = await makeRequest('/api/customer/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + qaToken }
    });
    report(logoutRes.status === 200 && logoutRes.body.success, 'Session logout revocation successful');

    // Validate revoked token returns 401
    const meRevoked = await makeRequest('/api/customer/auth/me', {
      headers: { 'Authorization': 'Bearer ' + qaToken }
    });
    report(meRevoked.status === 401, 'Revoked QA session returns 401 Unauthorized');

    // Fresh login without OTP
    const resFresh = await makeRequest('/api/customer/auth/send-otp', {
      method: 'POST',
      body: { email: 'goodkie.com@gmail.com' }
    });
    report(resFresh.body.authenticated === true && resFresh.body.otpRequired === false, 'Subsequent login issues fresh session without OTP');
    const freshToken = resFresh.body.token;

    // ----------------------------------------------------
    // TEST SECTION 5: FULL-FEATURE UNLOCKED ACCESS CHECKS
    // ----------------------------------------------------
    console.log('\n🔹 5. Testing Full-Feature Unlocked Access with QA Session...');

    const boothsRes = await makeRequest('/api/customer/booths', {
      headers: { 'Authorization': 'Bearer ' + freshToken }
    });
    report(boothsRes.status === 200 && Array.isArray(boothsRes.body.booths), 'Fetched customer booths for QA account');
    const projectId = boothsRes.body.booths[0]?.id || 'prj-free-b0c6f3ea';

    // Product CRUD
    const prodRes = await makeRequest(`/api/projects/${projectId}/products`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + freshToken },
      body: {
        slotIndex: 1,
        name: 'QA Test Product 500',
        category: 'Robotics',
        price: '$12,500',
        isAvailable: true
      }
    });
    report(prodRes.status === 200 || prodRes.status === 201, 'Product Slot Mutation allowed without paywall');

    // Catalog CRUD
    const catRes = await makeRequest(`/api/projects/${projectId}/catalogs`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + freshToken },
      body: {
        title: 'QA Autonomous Catalog',
        description: 'Testing full catalog access',
        productIds: ['prod-fp-4cbd43']
      }
    });
    report(catRes.status === 201 && catRes.body.success, 'Catalog Creation allowed without paywall');
    const catId = catRes.body.catalog?.id;

    // 3D Pin Placement
    const pinRes = await makeRequest(`/api/projects/${projectId}/pins`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + freshToken },
      body: {
        pinType: 'CATALOG_PIN',
        targetId: catId || 'cat-qa-test',
        label: 'QA 3D Catalog Pin',
        u: 0.7200,
        v: 0.4500
      }
    });
    report(pinRes.status === 201 && pinRes.body.success, '3D Pinpoint placement allowed without paywall');

    // ----------------------------------------------------
    // TEST SECTION 6: CLIENT MARKUP & GOVERNANCE CHECKS
    // ----------------------------------------------------
    console.log('\n🔹 6. Testing Client Markup & Governance Safety...');

    const portalHtml = fs.readFileSync(path.join(__dirname, 'client', 'portal.html'), 'utf8');
    report(portalHtml.includes('data.authenticated && data.token'), 'portal.html handles server authenticated response');
    report(!portalHtml.includes("if (email === 'goodkie.com@gmail.com')"), 'portal.html contains NO client-side email hardcode bypass');
    report(portalHtml.includes('INTERNAL QA'), 'portal.html contains INTERNAL QA badge');

    const indexHtml = fs.readFileSync(path.join(__dirname, 'client', 'index.html'), 'utf8');
    report(indexHtml.includes('isInternalDevAccount'), 'index.html includes isInternalDevAccount entitlement check');

    // Billing safety flags
    const flags = db.getFeatureFlags();
    report(flags.stripeLiveBillingEnabled === false, 'stripeLiveBillingEnabled === false');
    report(flags.liveBillingApprovedByOwner === false, 'liveBillingApprovedByOwner === false');

  } catch (err) {
    console.error('Fatal Suite Execution Error:', err);
    failCount++;
  } finally {
    console.log('\n====================================================');
    console.log(`📊 RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('====================================================\n');
    server.close();
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runSuite();

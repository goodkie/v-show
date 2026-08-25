const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const TEST_PORT = 3199;
const TEST_ENV = {
  ...process.env,
  PORT: TEST_PORT.toString(),
  NODE_ENV: 'test',
  DNA_SPECIAL_DEVELOPER_EMAILS: 'lead-dev@internal.vshow.com,architect@dn-a.com',
  FREE_PREVIEW_HMAC_SECRET: 'dna_magic_link_test_secret_key_2026',
  DATA_DIR: path.join(__dirname, 'test_data_c10_r3')
};

let serverProcess = null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const isMultipart = headers['Content-Type'] && headers['Content-Type'].includes('multipart/form-data');
    let postData = '';
    
    if (body && !isMultipart) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    } else if (isMultipart && Buffer.isBuffer(body)) {
      headers['Content-Length'] = body.length;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: endpoint,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    if (body && !isMultipart) req.write(postData);
    else if (isMultipart && Buffer.isBuffer(body)) req.write(body);
    req.end();
  });
}

function createMultipartFormData(fields, fileField = null) {
  const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
  const buffers = [];

  for (const [key, val] of Object.entries(fields)) {
    buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  if (fileField) {
    buffers.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n`));
    buffers.push(fileField.buffer);
    buffers.push(Buffer.from('\r\n'));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    buffer: Buffer.concat(buffers)
  };
}

(async () => {
  console.log('======================================================================');
  console.log('dn’a-C10-R3: 1-CLICK MAGIC CONFIRMATION LINK & SINGLE EMAIL E2E TEST');
  console.log('======================================================================\n');

  if (fs.existsSync(TEST_ENV.DATA_DIR)) {
    fs.rmSync(TEST_ENV.DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_ENV.DATA_DIR, { recursive: true });

  console.log('[1/12] Starting Isolated Backend Server on port ' + TEST_PORT + '...');
  serverProcess = spawn('node', ['server/index.js'], {
    env: TEST_ENV,
    cwd: path.join(__dirname, 'app_build'),
    stdio: 'pipe'
  });

  await sleep(3500);

  let passed = 0;
  let total = 0;

  function assertTest(name, condition, details = '') {
    total++;
    if (condition) {
      console.log(`  ✅ PASS [${total}]: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [${total}]: ${name} -> ${details}`);
    }
  }

  try {
    // 1. Healthcheck
    const health = await httpRequest('GET', '/health');
    assertTest('Server Health Check', health.statusCode === 200 && health.json?.ok === true);

    // 2. Client HTML Security & Form Structure Inspection
    const indexHtml = fs.readFileSync(path.join(__dirname, 'app_build/client/index.html'), 'utf8');
    assertTest('Confirm Email Input Field Removed from HTML', !indexHtml.includes('id="confirm-email-input"'));
    assertTest('Single Work Email Input Field Present', indexHtml.includes('id="work-email-input"'));
    assertTest('Special Developer Emails NOT Exposed in Client HTML', !indexHtml.includes('lead-dev@internal.vshow.com') && !indexHtml.includes('architect@dn-a.com'));

    // 3. Issue Confirmation Link & Magic Token for Customer
    const testEmail = 'founder@aerodyn.example.com';
    const testBiz = 'Aerodyn Systems LLC';
    const sendRes = await httpRequest('POST', '/api/free-funnel/email/send-code', {
      email: testEmail,
      businessName: testBiz
    });
    assertTest('Confirmation Email Sent with Magic Token and URL', 
      sendRes.statusCode === 200 && 
      sendRes.json?.verificationSent === true && 
      typeof sendRes.json?.magicToken === 'string' &&
      sendRes.json?.verifyUrl.includes('/verify-email?token=')
    );

    const magicToken = sendRes.json?.magicToken;
    const otpCode = sendRes.json?.code;

    // 4. Polling Status BEFORE Link Click -> PENDING
    const pollPending = await httpRequest('GET', `/api/free-funnel/email/poll-status?email=${encodeURIComponent(testEmail)}`);
    assertTest('Real-time Polling Status is PENDING before click', 
      pollPending.statusCode === 200 && 
      pollPending.json?.verified === false && 
      pollPending.json?.status === 'PENDING'
    );

    // 5. User Clicks Magic Link -> Verify via API
    const verifyLinkRes = await httpRequest('GET', `/api/free-funnel/email/verify-link?token=${magicToken}&email=${encodeURIComponent(testEmail)}`);
    assertTest('1-Click Magic Link Verification API Success', 
      verifyLinkRes.statusCode === 200 && 
      verifyLinkRes.json?.verified === true && 
      typeof verifyLinkRes.json?.verificationToken === 'string'
    );

    const customerToken = verifyLinkRes.json?.verificationToken;

    // 6. Polling Status AFTER Link Click -> VERIFIED with Token
    const pollVerified = await httpRequest('GET', `/api/free-funnel/email/poll-status?email=${encodeURIComponent(testEmail)}`);
    assertTest('Real-time Polling Status automatically detects VERIFIED and returns token', 
      pollVerified.statusCode === 200 && 
      pollVerified.json?.verified === true && 
      pollVerified.json?.verificationToken === customerToken
    );

    // 7. User-Facing /verify-email Landing Page HTML Test
    const landingRes = await httpRequest('GET', `/verify-email?token=${magicToken}&email=${encodeURIComponent(testEmail)}`);
    assertTest('User-Facing /verify-email Landing Page Renders 200 and Success Message', 
      landingRes.statusCode === 200 && 
      landingRes.body.includes('Email Verified Successfully!')
    );

    // 8. Normal Customer Free Preview Creation with Verified Token
    const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const form1 = createMultipartFormData({
      businessName: testBiz,
      email: testEmail,
      verificationToken: customerToken
    }, {
      name: 'photo',
      filename: 'booth_photo.png',
      contentType: 'image/png',
      buffer: dummyImage
    });

    const createRes = await httpRequest('POST', '/api/free-funnel/preview', form1.buffer, form1.headers);
    assertTest('Free Preview Booth Created Successfully with 3 Blank Pins & Photo Immersive Viewport', 
      (createRes.statusCode === 200 || createRes.statusCode === 201) && 
      createRes.json?.success === true && 
      createRes.json?.experienceType === 'PHOTO_IMMERSIVE' && 
      createRes.json?.project?.products?.length === 3
    );

    // 9. Duplicate Email Prevention
    const formDuplicateEmail = createMultipartFormData({
      businessName: 'Aerodyn Different Subsidiary',
      email: testEmail,
      verificationToken: customerToken
    }, {
      name: 'photo',
      filename: 'booth2.png',
      contentType: 'image/png',
      buffer: dummyImage
    });

    const dupEmailRes = await httpRequest('POST', '/api/free-funnel/preview', formDuplicateEmail.buffer, formDuplicateEmail.headers);
    assertTest('Duplicate Email Blocked with FREE_PREVIEW_EMAIL_ALREADY_USED', 
      (dupEmailRes.statusCode === 409 || dupEmailRes.statusCode === 400) && 
      dupEmailRes.json?.error === 'FREE_PREVIEW_EMAIL_ALREADY_USED' && 
      typeof dupEmailRes.json?.existingProjectId === 'string'
    );

    // 10. Duplicate Business Prevention
    const testEmail2 = 'co-founder@aerodyn.example.com';
    // Issue token for email2
    const sendRes2 = await httpRequest('POST', '/api/free-funnel/email/send-code', {
      email: testEmail2,
      businessName: 'Another Project'
    });
    const verify2 = await httpRequest('GET', `/api/free-funnel/email/verify-link?token=${sendRes2.json?.magicToken}&email=${encodeURIComponent(testEmail2)}`);

    const formDuplicateBiz = createMultipartFormData({
      businessName: testBiz, // same business
      email: testEmail2,
      verificationToken: verify2.json?.verificationToken
    }, {
      name: 'photo',
      filename: 'booth3.png',
      contentType: 'image/png',
      buffer: dummyImage
    });

    const dupBizRes = await httpRequest('POST', '/api/free-funnel/preview', formDuplicateBiz.buffer, formDuplicateBiz.headers);
    assertTest('Duplicate Business Blocked with BUSINESS_ALREADY_EXISTS', 
      (dupBizRes.statusCode === 409 || dupBizRes.statusCode === 400) && 
      dupBizRes.json?.error === 'BUSINESS_ALREADY_EXISTS'
    );

    // 11. OTP 6-Digit Backup Verification Test
    const testEmail3 = 'client-otp@retailcorp.com';
    const sendRes3 = await httpRequest('POST', '/api/free-funnel/email/send-code', {
      email: testEmail3,
      businessName: 'Retail Corp'
    });
    const otpRes = await httpRequest('POST', '/api/free-funnel/email/verify-code', {
      email: testEmail3,
      code: sendRes3.json?.code
    });
    assertTest('6-Digit OTP Backup Verification Works Flawlessly', 
      otpRes.statusCode === 200 && 
      otpRes.json?.verified === true && 
      typeof otpRes.json?.verificationToken === 'string'
    );

    // 12. Special Developer Immediate Bypass Test (No Email Sending/Verification Required)
    const devEmail = 'lead-dev@internal.vshow.com';
    const formDev = createMultipartFormData({
      businessName: 'Internal Dev Innovation Stand',
      email: devEmail
    }, {
      name: 'photo',
      filename: 'dev_booth.png',
      contentType: 'image/png',
      buffer: dummyImage
    });

    const devCreateRes = await httpRequest('POST', '/api/free-funnel/preview', formDev.buffer, formDev.headers);
    assertTest('Special Developer Immediate Bypass Creates Booth with INTERNAL_DEV environment', 
      (devCreateRes.statusCode === 200 || devCreateRes.statusCode === 201) && 
      devCreateRes.json?.success === true && 
      devCreateRes.json?.project?.environment === 'INTERNAL_DEV' &&
      devCreateRes.json?.project?.isTest === true
    );

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      console.log('\nStopped test server process.');
    }
  }

  console.log('\n======================================================================');
  console.log(`TEST RESULTS: ${passed}/${total} PASSED (${((passed/total)*100).toFixed(1)}%)`);
  console.log('======================================================================');

  if (passed === total) {
    console.log('🎯 ALL dn’a-C10-R3 REQUIREMENTS VERIFIED 100%!');
  } else {
    process.exit(1);
  }
})();

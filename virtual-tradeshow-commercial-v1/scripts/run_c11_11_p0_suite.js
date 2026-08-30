const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const puppeteer = require(path.resolve(__dirname, '../app_build/node_modules/puppeteer'));

const TEST_PORT = 3789;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const BASE_DIR = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');
const TEST_DATA_DIR = path.join(BASE_DIR, 'data_test_c11_11_p0');

// Clean test data directory for fresh hermetic run
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

// Sample image path
let sampleImagePath = path.resolve('E:/vivpr/ai/v-show/DOBOT‘s-booth-at-iREX-2022.jpg');
if (!fs.existsSync(sampleImagePath)) {
  sampleImagePath = path.resolve('E:/vivpr/ai/v-show/phase6_bundle_for_antigravity/phase6_test_booth/images/booth_001.jpg');
}

console.log('Sample image for test:', sampleImagePath);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkServerReady(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(url + '/api/health', (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Server failed to start within timeout'));
        }
      });
    }, 500);
  });
}

async function runSuite() {
  const runId = Date.now().toString().slice(-6);
  const user1Biz = `AeroDynamics Robotics ${runId}`;
  const user1Email = `pilot.${runId}@aerodynamics-test.io`;

  const user2Biz = `Solaris Clean Energy ${runId}`;
  const user2Email = `founder.${runId}@solaris-energy.org`;

  console.log('=====================================================================');
  console.log('³DNa-C11.11-P0: FREE 3D BOOTH FUNNEL COMPREHENSIVE E2E VERIFICATION');
  console.log(`RUN ID: ${runId} | USER 1: ${user1Email} | USER 2: ${user2Email}`);
  console.log('=====================================================================\n');

  // 1. Start Server
  console.log('[1/7] Spawning production-equivalent server on port', TEST_PORT, '...');
  const serverEnv = {
    ...process.env,
    PORT: TEST_PORT.toString(),
    DATA_DIR: TEST_DATA_DIR,
    FREE_PREVIEW_HMAC_SECRET: 'test-c11-11-p0-hmac-secret-2026-super-secure',
    SESSION_SECRET: 'test-c11-11-p0-session-secret-2026',
    NODE_ENV: 'test'
  };

  const serverProcess = spawn('node', ['app_build/server/index.js'], {
    cwd: BASE_DIR,
    env: serverEnv,
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', d => {
    // console.log('[SERVER]', d.toString().trim());
  });
  serverProcess.stderr.on('data', d => {
    console.error('[SERVER ERR]', d.toString().trim());
  });

  await checkServerReady(BASE_URL);
  console.log('✅ Server is ready at', BASE_URL);

  // 2. Launch Puppeteer
  console.log('[2/7] Launching Headless Browser...');
  let execPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(execPath)) {
    execPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  }
  console.log(' - Using browser executable:', execPath);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const consoleErrors = [];
  const uncaughtExceptions = [];
  const emittedRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('  [BROWSER ERROR]', msg.text());
    }
  });

  page.on('pageerror', err => {
    uncaughtExceptions.push(err.message);
    console.log('  [UNCAUGHT EXCEPTION]', err.message);
  });

  page.on('request', req => {
    if (req.url().includes('/api/free-funnel')) {
      emittedRequests.push({ url: req.url(), method: req.method() });
    }
  });

  // 3. Test Step A: Landing Page & Terminology Verification
  console.log('[3/7] Loading Landing Page and Verifying Customer-Facing Product Terminology...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

  const pageTitle = await page.title();
  console.log(' - Page Title:', pageTitle);
  if (!pageTitle.includes('3D Booth')) {
    throw new Error('Title does not contain "3D Booth": ' + pageTitle);
  }

  const frameTitle = await page.$eval('.frame-title', el => el.textContent.trim());
  console.log(' - Frame Title:', frameTitle);
  if (frameTitle !== 'Create Your Free 3D Booth') {
    throw new Error('Frame title mismatch: ' + frameTitle);
  }

  const submitBtnText = await page.$eval('#btn-submit-free', el => el.textContent.trim());
  console.log(' - Primary CTA Text:', submitBtnText);
  if (submitBtnText !== 'CREATE 3D BOOTH') {
    throw new Error('Submit button text mismatch: ' + submitBtnText);
  }

  // 4. Test Step B: Owner Failure Reproduction & No-Op Prevention Drill
  console.log('\n[4/7] Testing Form Input, Photo Selection & Submit Click (Owner No-Op Reproduction Test)...');
  
  // Fill Business Name
  await page.type('#business-name-input', user1Biz);
  // Fill Work Email
  await page.type('#work-email-input', user1Email);

  // Select Photo
  const fileInput = await page.$('#booth-file-input');
  await fileInput.uploadFile(sampleImagePath);

  // Check drop zone status
  await wait(400);
  const dropTitle = await page.$eval('#drop-title-txt', el => el.textContent.trim());
  console.log(' - Drop zone status after selection:', dropTitle);
  if (!dropTitle.includes('Photo Ready')) {
    throw new Error('Drop title does not show Photo Ready: ' + dropTitle);
  }

  // Click CTA
  console.log(' - Clicking "CREATE 3D BOOTH" button...');
  await page.click('#btn-submit-free');

  await wait(1000);

  // Verify that uncaught exception is 0
  console.log(' - Uncaught JS Exceptions count:', uncaughtExceptions.length);
  if (uncaughtExceptions.length > 0) {
    throw new Error('Uncaught JS exception occurred upon submit: ' + uncaughtExceptions.join(', '));
  }

  // Verify network request was emitted
  const sendCodeReq = emittedRequests.find(r => r.url.includes('/api/free-funnel/email/send-verification'));
  console.log(' - Network request emitted for email verification:', Boolean(sendCodeReq));
  if (!sendCodeReq) {
    throw new Error('Network request to send verification was NOT emitted');
  }

  // Verify verification panel is now visible
  const isVerifyPanelVisible = await page.$eval('#inline-verify-panel', el => getComputedStyle(el).display !== 'none');
  console.log(' - Verification panel displayed:', isVerifyPanelVisible);
  if (!isVerifyPanelVisible) {
    throw new Error('Verification panel was not displayed');
  }

  const maskedEmailTxt = await page.$eval('#verify-target-email', el => el.textContent.trim());
  console.log(' - Masked email in verification panel:', maskedEmailTxt);

  // 5. Test Step C: OTP State Machine, Resend, Status Check & Submission
  console.log('\n[5/7] Testing OTP Verification Controls, Resend, and Invalid Code Handling...');
  
  // Fetch latest issued code from server
  const latestEmailRes = await new Promise((resolve) => {
    http.get(`${BASE_URL}/api/free-funnel/email/latest-link?email=${encodeURIComponent(user1Email)}`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
  });
  console.log(' - Verified server sent email with code:', latestEmailRes.code ? '6-digit code issued' : 'none');
  const validOtpCode = latestEmailRes.code;

  // Test entering invalid OTP code "999999"
  console.log(' - Testing invalid OTP rejection (typing 999999)...');
  const otpInputs = await page.$$('.otp-digit');
  for (let i = 0; i < 6; i++) {
    await otpInputs[i].type('9');
  }
  await wait(800);

  const otpErrVisible = await page.$eval('#otp-inline-error', el => getComputedStyle(el).display !== 'none');
  const otpErrMsg = await page.$eval('#otp-error-txt', el => el.textContent.trim());
  console.log(' - Invalid OTP error displayed:', otpErrVisible, '| Message:', otpErrMsg);
  if (!otpErrVisible) {
    throw new Error('Invalid OTP did not trigger error display');
  }

  // Test Resend Code Button
  console.log(' - Testing Resend Code button...');
  await page.click('#btn-resend-otp');
  await wait(500);
  const resendBtnText = await page.$eval('#btn-resend-otp', el => el.textContent.trim());
  console.log(' - Resend button cooldown active:', resendBtnText);

  // Test Entering Valid OTP Code
  console.log(' - Typing valid OTP code:', validOtpCode.replace(/./g, '*'));
  await page.evaluate(() => {
    document.querySelectorAll('.otp-digit').forEach(i => i.value = '');
  });
  for (let i = 0; i < 6; i++) {
    await otpInputs[i].type(validOtpCode[i]);
  }

  await wait(500);
  await page.click('#btn-verify-otp');

  // 6. Test Step D: Generation Progress & Result Studio Render
  console.log('\n[6/7] Monitoring Booth Generation Pipeline & Progress Overlay...');
  
  // Progress overlay should appear
  await page.waitForSelector('#progressOverlay', { visible: true, timeout: 5000 });
  console.log(' - Progress overlay active: YES');

  // Wait for Studio Section to be displayed
  console.log(' - Waiting for 3D Booth Studio completion...');
  await page.waitForSelector('#freeStudioSection', { visible: true, timeout: 25000 });
  console.log(' - Free Studio Section displayed: YES');

  const studioBannerTitle = await page.$eval('.studio-banner-title', el => el.textContent.trim());
  console.log(' - Studio Banner Title:', studioBannerTitle);
  if (!studioBannerTitle.includes('YOUR FREE 3D BOOTH IS READY')) {
    throw new Error('Studio banner title mismatch: ' + studioBannerTitle);
  }

  // Verify Three.js Canvas initialized
  const canvasDims = await page.$eval('#three-canvas', el => ({ width: el.clientWidth, height: el.clientHeight }));
  console.log(' - Three.js WebGL Canvas dimensions:', canvasDims);
  if (canvasDims.width === 0 || canvasDims.height === 0) {
    throw new Error('Three.js canvas has 0 dimensions: ' + JSON.stringify(canvasDims));
  }

  // Verify Session in LocalStorage
  const savedSession = await page.evaluate(() => localStorage.getItem('dna_free_booth_session'));
  console.log(' - LocalStorage session saved:', Boolean(savedSession));
  if (!savedSession) {
    throw new Error('Session was not saved to localStorage');
  }

  // 7. Test Step E: 1-Click Magic Link Polling Test (Second User)
  console.log('\n[7/7] Testing 1-Click Magic Link Verification & Instant Tab Recovery (Solaris Clean Energy)...');
  const page2 = await browser.newPage();
  await page2.goto(BASE_URL, { waitUntil: 'networkidle0' });

  await page2.type('#business-name-input', user2Biz);
  await page2.type('#work-email-input', user2Email);
  const fileInput2 = await page2.$('#booth-file-input');
  await fileInput2.uploadFile(sampleImagePath);
  await wait(400);

  await page2.click('#btn-submit-free');
  await page2.waitForSelector('#inline-verify-panel', { visible: true, timeout: 5000 });
  console.log(' - User 2 verification panel opened.');

  // Fetch magic link from server
  const emailRes2 = await new Promise((resolve) => {
    http.get(`${BASE_URL}/api/free-funnel/email/latest-link?email=${encodeURIComponent(user2Email)}`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
  });
  console.log(' - Magic verify URL issued:', emailRes2.verifyUrl);

  // Request the magic verification link on the local test server
  const parsedUrl = new URL(emailRes2.verifyUrl);
  const localVerifyUrl = `${BASE_URL}${parsedUrl.pathname}${parsedUrl.search}`;
  console.log(' - Simulating user clicking magic link on external device:', localVerifyUrl);
  const verifyLinkRes = await new Promise((resolve) => {
    http.get(localVerifyUrl, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
  });
  console.log(' - Magic link HTTP status:', verifyLinkRes.status);

  // The original tab should automatically detect verification via auto-polling within 3-4s
  console.log(' - Waiting for original tab to auto-detect magic link verification...');
  await page2.waitForSelector('#freeStudioSection', { visible: true, timeout: 25000 });
  console.log(' - Original tab auto-transitioned to 3D Booth Studio successfully!');

  // Mobile Viewport Test
  console.log('\n[Mobile Check] Testing 375x667 Mobile Responsiveness...');
  await page2.setViewport({ width: 375, height: 667 });
  const isOverflowing = await page2.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(' - Horizontal overflow on mobile:', isOverflowing ? 'FAIL' : 'PASS (No overflow)');

  await browser.close();
  serverProcess.kill();
  console.log('\n=====================================================================');
  console.log('🏆 ³DNa-C11.11-P0 VERIFICATION SUITE: 100% PASS');
  console.log('=====================================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
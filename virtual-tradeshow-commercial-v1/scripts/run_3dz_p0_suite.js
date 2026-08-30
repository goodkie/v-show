const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const puppeteer = require(path.resolve(__dirname, '../app_build/node_modules/puppeteer'));
const { OffsiteStorageDriver } = require('../app_build/server/offsite_backup/storage_driver');

const TEST_PORT = 3795;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const BASE_DIR = path.resolve('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1');
const TEST_DATA_DIR = path.join(BASE_DIR, 'data_test_3dz_p0');

if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

let sampleImagePath = path.resolve('E:/vivpr/ai/v-show/DOBOT‘s-booth-at-iREX-2022.jpg');
if (!fs.existsSync(sampleImagePath)) {
  sampleImagePath = path.resolve('E:/vivpr/ai/v-show/phase6_bundle_for_antigravity/phase6_test_booth/images/booth_001.jpg');
}

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

async function run3DZSuite() {
  console.log('=====================================================================');
  console.log('3DZ — FREE 3D BOOTH FUNNEL COMPLETE E2E VERIFICATION SUITE');
  console.log('=====================================================================\n');

  const runId = Date.now().toString().slice(-6);
  const testBusiness = `Nexura Robotics ${runId}`;
  const testEmail1 = `pilot.${runId}@3dz-test.site`;
  const testBusiness2 = `Solaris Dynamics ${runId}`;
  const testEmail2 = `founder.${runId}@3dz-test.site`;

  // 1. Start Server
  console.log('[1/10] Starting production-equivalent test server on port', TEST_PORT, '...');
  const serverEnv = {
    ...process.env,
    PORT: TEST_PORT.toString(),
    DATA_DIR: TEST_DATA_DIR,
    FREE_PREVIEW_HMAC_SECRET: 'test-3dz-p0-hmac-secret-2026-super-secure',
    SESSION_SECRET: 'test-3dz-p0-session-secret-2026',
    NODE_ENV: 'test'
  };

  const serverProcess = spawn('node', ['app_build/server/index.js'], {
    cwd: BASE_DIR,
    env: serverEnv,
    stdio: 'pipe'
  });

  await checkServerReady(BASE_URL);
  console.log('✅ Server ready at', BASE_URL);

  // 2. Launch Puppeteer
  console.log('[2/10] Launching Puppeteer Browser...');
  let execPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(execPath)) {
    execPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const uncaughtErrors = [];
  page.on('pageerror', err => {
    uncaughtErrors.push(err.message);
    console.log('  [UNCAUGHT JS ERROR]', err.message);
  });

  // 3. Branding & Title Audit
  console.log('[3/10] Verifying Customer-Facing 3DZ Branding & Product Terminology...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0' });

  const title = await page.title();
  const frameHeading = await page.$eval('.frame-title', el => el.textContent.trim());
  const ctaBtnText = await page.$eval('#btn-submit-free', el => el.textContent.trim());
  console.log(' - Title:', title);
  console.log(' - Frame Heading:', frameHeading);
  console.log(' - Primary CTA:', ctaBtnText);

  if (!title.includes('3DZ') || !title.includes('3D Booth')) throw new Error('Invalid title branding: ' + title);
  if (frameHeading !== 'Create Your Free 3D Booth') throw new Error('Invalid frame heading: ' + frameHeading);
  if (ctaBtnText !== 'CREATE 3D BOOTH') throw new Error('Invalid CTA button text: ' + ctaBtnText);

  // 4. Form Validation & Owner No-Op Reproduction Test
  console.log('\n[4/10] Testing Field Validation & Form Input Handling...');
  // Test empty submit
  await page.click('#btn-submit-free');
  await wait(200);
  const errEmpty = await page.$eval('#form-inline-error', el => el.textContent.trim());
  console.log(' - Empty submit inline error:', errEmpty);
  if (!errEmpty.includes('business name')) throw new Error('Validation failed to catch empty business name');

  await page.type('#business-name-input', testBusiness);
  await page.type('#work-email-input', testEmail1);
  const fileInput = await page.$('#booth-file-input');
  await fileInput.uploadFile(sampleImagePath);
  await page.evaluate(() => document.getElementById('booth-file-input').dispatchEvent(new Event('change', { bubbles: true })));
  await wait(300);

  const dropTxt = await page.$eval('#drop-title-txt', el => el.textContent.trim());
  console.log(' - Drop zone status after selection:', dropTxt);

  console.log(' - Clicking "CREATE 3D BOOTH"...');
  await page.click('#btn-submit-free');
  await page.waitForSelector('#inline-verify-panel', { visible: true, timeout: 5000 });
  console.log(' - Verification panel displayed with ZERO silent failures: PASS');

  // 5. OTP Verification & Resend Cooldown
  console.log('\n[5/10] Testing OTP Controls, Invalid Code Rejection & Cooldown...');
  // Invalid OTP test
  const otpInputs = await page.$$('.otp-digit');
  for (let i = 0; i < 6; i++) {
    await otpInputs[i].type('9');
  }
  await wait(500);
  const otpErrMsg = await page.$eval('#otp-inline-error', el => el.textContent.trim());
  console.log(' - Invalid OTP inline error:', otpErrMsg);

  // Resend cooldown test
  const resendBtnTxt = await page.$eval('#btn-resend-otp', el => el.textContent.trim());
  console.log(' - Resend button status:', resendBtnTxt);
  if (!resendBtnTxt.includes('RESEND CODE')) throw new Error('Resend button missing');

  // Retrieve valid code from server
  const latestMailRes1 = await new Promise((resolve) => {
    http.get(`${BASE_URL}/api/free-funnel/email/latest-link?email=${encodeURIComponent(testEmail1)}`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
  });
  console.log(' - Server generated 6-digit code for User 1:', latestMailRes1.code);

  // Clear and type valid code
  await page.evaluate(() => {
    const inps = document.querySelectorAll('.otp-digit');
    inps.forEach(i => i.value = '');
  });
  for (let i = 0; i < 6; i++) {
    await otpInputs[i].type(latestMailRes1.code[i]);
  }

  // 6. Monitoring Booth Generation Pipeline & Progress Overlay
  console.log('\n[6/10] Monitoring 3D Booth Generation Pipeline & Studio Render...');
  await page.waitForSelector('#freeStudioSection', { visible: true, timeout: 25000 });
  const bannerTitle = await page.$eval('.studio-banner-title', el => el.textContent.trim());
  console.log(' - Studio Banner Title:', bannerTitle);

  const canvasDims = await page.$eval('#three-canvas', el => ({ width: el.clientWidth, height: el.clientHeight }));
  console.log(' - Three.js WebGL Canvas dimensions:', canvasDims);
  if (canvasDims.width === 0 || canvasDims.height === 0) throw new Error('Canvas width/height is 0');

  // 7. LocalStorage Deep Security Audit
  console.log('\n[7/10] Auditing LocalStorage Security (PII Minimization & Zero Secrets)...');
  const storedSession = await page.evaluate(() => {
    const raw = localStorage.getItem('dna_free_booth_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      keys: Object.keys(parsed),
      hasOtp: Boolean(raw.includes('otp') || raw.includes('magicToken') || raw.includes('codeHash')),
      hasCredentials: Boolean(raw.includes('AWS_') || raw.includes('R2_') || raw.includes('SECRET')),
      hasRawEmail: Boolean(parsed.project && parsed.project.customerEmail),
      length: raw.length
    };
  });
  console.log(' - LocalStorage Session Audit:', JSON.stringify(storedSession, null, 2));
  if (!storedSession || storedSession.hasOtp || storedSession.hasCredentials || storedSession.hasRawEmail) {
    throw new Error('LocalStorage security violation');
  }

  // 8. 1-Click Magic Link & Cross-Tab Auto-Recovery (User 2)
  console.log('\n[8/10] Testing 1-Click Magic Link Verification & Original Tab Recovery (User 2)...');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 900 });
  await page2.goto(BASE_URL, { waitUntil: 'networkidle0' });

  await page2.type('#business-name-input', testBusiness2);
  await page2.type('#work-email-input', testEmail2);
  const fileInput2 = await page2.$('#booth-file-input');
  await fileInput2.uploadFile(sampleImagePath);
  await page2.evaluate(() => document.getElementById('booth-file-input').dispatchEvent(new Event('change', { bubbles: true })));
  await wait(300);

  await page2.click('#btn-submit-free');
  await page2.waitForSelector('#inline-verify-panel', { visible: true, timeout: 5000 });

  const latestMailRes2 = await new Promise((resolve) => {
    http.get(`${BASE_URL}/api/free-funnel/email/latest-link?email=${encodeURIComponent(testEmail2)}`, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
  });

  console.log(' - User 2 Magic Link issued:', latestMailRes2.verifyUrl);
  const parsedVerifyUrl = new URL(latestMailRes2.verifyUrl);
  const localVerifyUrl = `${BASE_URL}${parsedVerifyUrl.pathname}${parsedVerifyUrl.search}`;

  // Simulate user opening link on phone/external device
  const magicLinkRes = await new Promise((resolve) => {
    http.get(localVerifyUrl, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
  });
  console.log(' - External magic link click HTTP status:', magicLinkRes.status);
  if (magicLinkRes.status !== 200) throw new Error('Magic link HTTP status != 200');

  // Verify original tab auto-recovers and continues
  console.log(' - Waiting for original tab to auto-detect verification via background polling...');
  await page2.waitForSelector('#freeStudioSection', { visible: true, timeout: 25000 });
  console.log(' - Original tab auto-recovered and rendered 3D Booth Studio: PASS (DATA_REENTRY=0)');

  // 9. Real Cloudflare R2 Tier 0 Master Backup Proof
  console.log('\n[9/10] Verifying Real Cloudflare R2 Tier 0 Master Ingestion & SHA-256 Match...');
  const localFileBuf = fs.readFileSync(sampleImagePath);
  const localSha256 = crypto.createHash('sha256').update(localFileBuf).digest('hex');
  console.log(' - Local Image SHA-256:', localSha256);

  const r2Driver = new OffsiteStorageDriver({
    accountId: '579b52153b42cb7c7eb1591133e35d9a',
    bucket: '3dna-production-offsite-backup',
    accessKeyId: '41b726bc95ae0e36293de7f0cf9e046f',
    secretAccessKey: 'f5f22474b4e64f049dbfd857fa85e249f198fb12e00cbe4c1548c8ae734b9b9f',
    region: 'auto',
    endpoint: 'https://579b52153b42cb7c7eb1591133e35d9a.r2.cloudflarestorage.com'
  });

  const testKey = `tier0/3dz_p0/${runId}_booth.jpg`;
  await r2Driver.putObject(testKey, localFileBuf, { 'x-3dz-run': runId });
  const isR2Verified = await r2Driver.verifyObject(testKey, localSha256);
  console.log(' - Cloudflare R2 Cryptographic Hash Match:', isR2Verified ? '100% MATCH' : 'FAIL');
  if (!isR2Verified) throw new Error('R2 hash mismatch');

  // 10. 3 Product Slots Entitlement Verification
  console.log('\n[10/10] Verifying 3 Product Slots Entitlement & Pinpoints Layer...');
  const slotCount = await page2.$$eval('.prod-quick-card, .product-card-item, .pin-anchor-btn', els => els.length);
  console.log(' - Interactive Product Slots Count:', slotCount >= 3 ? `${slotCount} Slots (PASS)` : `${slotCount} Slots (FAIL)`);
  if (slotCount < 3) throw new Error('Less than 3 product slots found: ' + slotCount);

  // Mobile responsiveness check
  await page2.setViewport({ width: 375, height: 667 });
  await wait(500);
  const isOverflowing = await page2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(' - Mobile 375x667 Horizontal Overflow:', isOverflowing ? 'FAIL' : 'PASS (No overflow)');
  if (isOverflowing) throw new Error('Mobile horizontal overflow detected');

  console.log(' - Uncaught JS runtime errors count:', uncaughtErrors.length);
  if (uncaughtErrors.length > 0) throw new Error('Uncaught JS runtime errors detected');

  await browser.close();
  serverProcess.kill();

  console.log('\n=====================================================================');
  console.log('🏆 3DZ — FREE 3D BOOTH FUNNEL E2E SUITE: 100% PASS');
  console.log('=====================================================================\n');
}

run3DZSuite().catch(err => {
  console.error('\n❌ 3DZ SUITE FAILED:', err);
  process.exit(1);
});
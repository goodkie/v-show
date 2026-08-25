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

async function runPasswordSecuritySuite() {
  console.log('============================================================');
  console.log('PHASE 10.6A SECURITY HOTFIX: PASSWORD POLICY REGRESSION SUITE');
  console.log('============================================================\n');

  const appDir = path.resolve(__dirname, '..');
  const serverDir = path.join(appDir, 'server');
  const clientDir = path.join(appDir, 'client');
  const db = require(path.join(serverDir, 'db.js'));

  // --- Section 1: Server Source of Truth & Validation Tests ---
  console.log('--- Section 1: Server Password Strength Validation ---');
  
  // 6-char rejected
  const res6 = db.validatePasswordStrength('Abc12!');
  assert(!res6.valid && res6.code === 'WEAK_PASSWORD', '6-char password rejected with WEAK_PASSWORD code');

  // 8-char rejected
  const res8 = db.validatePasswordStrength('Abcdef1!');
  assert(!res8.valid && res8.code === 'WEAK_PASSWORD', '8-char password rejected with WEAK_PASSWORD code');

  // 11-char rejected
  const res11 = db.validatePasswordStrength('Abcdefgh12!');
  assert(!res11.valid && res11.code === 'WEAK_PASSWORD', '11-char password rejected with WEAK_PASSWORD code');

  // 12-char missing uppercase rejected
  const resNoUpper = db.validatePasswordStrength('abcdefgh123!');
  assert(!resNoUpper.valid && resNoUpper.code === 'WEAK_PASSWORD', '12-char password without uppercase rejected');

  // 12-char missing lowercase rejected
  const resNoLower = db.validatePasswordStrength('ABCDEFGH123!');
  assert(!resNoLower.valid && resNoLower.code === 'WEAK_PASSWORD', '12-char password without lowercase rejected');

  // 12-char missing number rejected
  const resNoNum = db.validatePasswordStrength('Abcdefghijkl!');
  assert(!resNoNum.valid && resNoNum.code === 'WEAK_PASSWORD', '12-char password without number rejected');

  // 12-char valid accepted
  const res12 = db.validatePasswordStrength('ValidPass123!');
  assert(res12.valid === true, '12-char valid password accepted');

  // 16-char valid accepted
  const res16 = db.validatePasswordStrength('SecurePassword2026!');
  assert(res16.valid === true, '16-char valid password accepted');

  // --- Section 2: Temporary Password Generation ---
  console.log('\n--- Section 2: Cryptographically Secure Temporary Password Generation ---');
  const temp1 = db.generateSecureTempPassword(16);
  assert(temp1.length >= 16, 'Generated temp password is 16+ characters');
  assert(/[A-Z]/.test(temp1), 'Generated temp password contains uppercase');
  assert(/[a-z]/.test(temp1), 'Generated temp password contains lowercase');
  assert(/[0-9]/.test(temp1), 'Generated temp password contains number');
  const tempCheck = db.validatePasswordStrength(temp1);
  assert(tempCheck.valid === true, 'Generated temp password satisfies full password policy');

  // Verify non-deterministic entropy
  const temp2 = db.generateSecureTempPassword(16);
  assert(temp1 !== temp2, 'Temp passwords have high cryptographic entropy (not identical)');

  // --- Section 3: Multi-Role Forced Password Change Lifecycle ---
  console.log('\n--- Section 3: Multi-Role Authentication & Forced Change Lifecycle ---');
  
  const testRoles = [
    { role: 'exhibitor_admin', email: `test-exhibitor-${Date.now()}@company.com`, name: 'Exhibitor Admin' },
    { role: 'organizer_admin', email: `test-organizer-${Date.now()}@vshow.com`, name: 'Organizer Admin' },
    { role: 'platform_owner', email: `test-owner-${Date.now()}@vshow.com`, name: 'Platform Owner' }
  ];

  for (const r of testRoles) {
    const org = await db.createOrganization({ name: `${r.name} Org`, type: r.role === 'platform_owner' ? 'platform' : (r.role === 'organizer_admin' ? 'organizer' : 'exhibitor') });
    const initialTemp = db.generateSecureTempPassword(16);
    
    // Create user with mustChangePassword = true
    const user = await db.createUser({
      organizationId: org.id,
      email: r.email,
      name: r.name,
      role: r.role,
      password: initialTemp,
      mustChangePassword: true
    });

    assert(user.mustChangePassword === true, `${r.name}: Created with mustChangePassword: true`);

    // Verify temp password works
    const dbUser = db.getUserById(user.id);
    assert(db.verifyPassword(initialTemp, dbUser.hash, dbUser.salt), `${r.name}: Temp password verified against scrypt hash`);

    // Attempt to change to weak 6-char password -> Expect rejection
    try {
      await db.updateUserPassword(user.id, 'Weak6!');
      assert(false, `${r.name}: 6-char password update should fail`);
    } catch (err) {
      assert(true, `${r.name}: 6-char password update rejected`);
    }

    // Attempt to change to weak 11-char password -> Expect rejection
    try {
      await db.updateUserPassword(user.id, 'WeakPass11!');
      assert(false, `${r.name}: 11-char password update should fail`);
    } catch (err) {
      assert(true, `${r.name}: 11-char password update rejected`);
    }

    // Update with valid 16-char password
    const newStrongPassword = `NewStrongPass2026!_${r.role.substring(0, 3)}`;
    await db.updateUserPassword(user.id, newStrongPassword);
    
    const updatedUser = db.getUserById(user.id);
    assert(updatedUser.mustChangePassword === false, `${r.name}: mustChangePassword set to false after update`);
    assert(db.verifyPassword(newStrongPassword, updatedUser.hash, updatedUser.salt), `${r.name}: New strong password verified`);
    assert(!db.verifyPassword(initialTemp, updatedUser.hash, updatedUser.salt), `${r.name}: Old temp password invalidated`);
  }

  // --- Section 4: Client UI Minlength Audit & Zero Hangul Scan ---
  console.log('\n--- Section 4: Client UI Minlength Audit & Zero Hangul Scan ---');
  const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
  assert(!adminHtml.includes('minlength="6"'), 'admin.html does NOT contain minlength="6"');
  assert(adminHtml.includes('minlength="12"'), 'admin.html contains minlength="12"');
  assert(adminHtml.includes('New Password (Minimum 12 characters)'), 'admin.html displays clear 12-char minimum prompt');

  const hangulRegex = /[\uac00-\ud7af]/;
  const clientFiles = [
    'index.html', 'viewer.html', 'viewer.js', 'pricing.html',
    'lobby.html', 'lobby.js', 'admin.html', 'admin.js',
    'organizer.html', 'organizer.js', 'grand-control.html', 'grand-control.js',
    'terms.html', 'privacy.html', 'refund-policy.html'
  ];

  clientFiles.forEach(f => {
    const fpath = path.join(clientDir, f);
    if (fs.existsSync(fpath)) {
      const content = fs.readFileSync(fpath, 'utf8');
      assert(!hangulRegex.test(content), `Zero Hangul characters in ${f}`);
    }
  });

  // --- Section 5: Mobile Landscape & 3D Viewer Regression Verification ---
  console.log('\n--- Section 5: Mobile Landscape & 3D Viewer Regression Verification ---');
  const viewerHtml = fs.readFileSync(path.join(clientDir, 'viewer.html'), 'utf8');
  const viewerJs = fs.readFileSync(path.join(clientDir, 'viewer.js'), 'utf8');

  assert(viewerHtml.includes('orientation-suggestion-banner'), 'Mobile landscape suggestion banner present');
  assert(viewerHtml.includes('viewport-fit=cover'), 'Viewport meta tag configured with viewport-fit=cover');
  assert(viewerJs.includes('orientation: landscape'), 'Viewer JS handles orientationchange & matchMedia');
  assert(viewerJs.includes('precision_splat'), 'Precision Splat & Photo Preview fallback preserved');

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPasswordSecuritySuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

console.log('=== [TEST: Auto CAPTCHA Solver Configurable Waiting Time] ===');

// 1. Check popup.html in both build and root
['build/extension/popup.html', 'popup.html'].forEach(filePath => {
    const html = fs.readFileSync(filePath, 'utf8');
    assert(html.includes('id="captcha-timing-group"'), `${filePath} missing captcha-timing-group`);
    assert(html.includes('id="captcha-poll-interval"'), `${filePath} missing captcha-poll-interval`);
    assert(html.includes('id="captcha-max-wait"'), `${filePath} missing captcha-max-wait`);
    console.log(`  ✅ PASS: ${filePath} contains timing group, poll interval, max wait inputs`);
});

// 2. Check translations.js in both build and root
['build/extension/translations.js', 'translations.js'].forEach(filePath => {
    const transCode = fs.readFileSync(filePath, 'utf8');
    const sandbox = {};
    vm.runInNewContext(transCode, sandbox);
    const i18n = sandbox.I18N_DATA;
    ['en', 'ko', 'ja', 'zh'].forEach(lang => {
        assert(i18n[lang].label_captcha_waiting_time, `Missing label_captcha_waiting_time in ${lang} (${filePath})`);
        assert(i18n[lang].label_poll_interval, `Missing label_poll_interval in ${lang} (${filePath})`);
        assert(i18n[lang].label_max_wait, `Missing label_max_wait in ${lang} (${filePath})`);
        assert(i18n[lang].captcha_timing_tip, `Missing captcha_timing_tip in ${lang} (${filePath})`);
    });
    console.log(`  ✅ PASS: ${filePath} has complete translations for en, ko, ja, zh`);
});

// 3. Check solver-core.js in both build and root
['build/extension/solver-core.js', 'solver-core.js'].forEach(filePath => {
    const solverCode = fs.readFileSync(filePath, 'utf8');
    assert(solverCode.includes('pollIntervalMs = 3000, maxWaitSec = 120'), `${filePath} solveNopeCha missing configurable timing`);
    assert(solverCode.includes('pollIntervalMs = 5000, maxWaitSec = 200'), `${filePath} solve2Captcha missing configurable timing`);
    assert(solverCode.includes('Token not resolved within ${maxSec} seconds'), `${filePath} dynamic timeout message present`);
    console.log(`  ✅ PASS: ${filePath} solveNopeCha and solve2Captcha accept custom timing parameters`);
});

// 4. Check background.js in both build and root
['build/extension/background.js', 'background.js'].forEach(filePath => {
    const bgCode = fs.readFileSync(filePath, 'utf8');
    assert(bgCode.includes('xpider_captcha_poll_interval_sec'), `${filePath} missing xpider_captcha_poll_interval_sec`);
    assert(bgCode.includes('xpider_captcha_poll_interval_ms'), `${filePath} missing xpider_captcha_poll_interval_ms`);
    assert(bgCode.includes('xpider_captcha_max_wait_sec'), `${filePath} missing xpider_captcha_max_wait_sec`);
    assert(bgCode.includes('solver.solve2Captcha(request.sitekey, targetPageUrl, request.type || \'recaptcha\', extra, pollIntervalMs, maxWaitSec)'), `${filePath} solve2Captcha not called with timing params`);
    assert(bgCode.includes('solver.solveNopeCha(request.sitekey, targetPageUrl, request.type || \'recaptcha\', pollIntervalMs, maxWaitSec)'), `${filePath} solveNopeCha not called with timing params`);
    console.log(`  ✅ PASS: ${filePath} reads storage timing settings and passes to solvers`);
});

// 5. Check popup.js in both build and root
['build/extension/popup.js', 'popup.js'].forEach(filePath => {
    const popupCode = fs.readFileSync(filePath, 'utf8');
    assert(popupCode.includes('xpider_captcha_poll_interval_sec'), `${filePath} missing xpider_captcha_poll_interval_sec`);
    assert(popupCode.includes('captcha-poll-interval'), `${filePath} missing captcha-poll-interval reference`);
    assert(popupCode.includes('captcha-max-wait'), `${filePath} missing captcha-max-wait reference`);
    assert(popupCode.includes('captcha-timing-group'), `${filePath} missing captcha-timing-group reference in visibility toggle`);
    console.log(`  ✅ PASS: ${filePath} properly binds, loads, and saves timing settings`);
});

console.log('\n=== ALL CAPTCHA TIMING CONFIGURATION CHECKS PASSED (10/10) ===');

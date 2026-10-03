/**
 * Test Suite: 2Captcha API Priority & Pittsburgh Karate reCAPTCHA v2 Solver Upgrade
 * 
 * Verifies:
 * 1. Extraction of sitekey from reCAPTCHA v2 iframe URL parameter (?k=...)
 * 2. Extraction of sitekey from PerfectMind explicit render inline script
 * 3. Extraction and decoding of host page URL (document.referrer, co param base64)
 * 4. Strict solver exclusivity: NO audio challenge / Wit.ai fallback when 2Captcha is selected
 * 5. Multi-frame token injection & validateRecaptcha callback trigger
 * 6. 100% Hash parity between source and build files
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log("=== [2CAPTCHA & PITTSBURGH KARATE RECAPTCHA V2 UPGRADE TEST SUITE] ===\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${e.message}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${e.message}`);
        failed++;
    }
}

// -------------------------------------------------------------
// Test 1: Sitekey extraction from reCAPTCHA iframe URL (anchor/bframe)
// -------------------------------------------------------------
test("Sitekey extraction from location.search (?k=...)", () => {
    const rawCode = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8');
    
    // Create an instance simulation
    const pittsburghSitekey = '6LcyMGUUAAAAACF1_qvUXZ5uzsRZurI3tIR1oXPV';
    
    // Simulate window.location inside google.com/recaptcha/api2/anchor iframe
    global.window = {
        location: {
            href: `https://www.google.com/recaptcha/api2/anchor?ar=1&k=${pittsburghSitekey}&co=aHR0cHM6Ly9yeWVyYWNhZGVteS5wZXJmZWN0bWluZC5jb206NDQz`,
            search: `?ar=1&k=${pittsburghSitekey}&co=aHR0cHM6Ly9yeWVyYWNhZGVteS5wZXJmZWN0bWluZC5jb206NDQz`
        }
    };
    global.document = {
        querySelector: () => null,
        querySelectorAll: () => []
    };

    // Extract _extractSitekey implementation
    const fnMatch = rawCode.match(/_extractSitekey\(\)\s*\{([\s\S]*?)\n\s{8}\}/);
    assert(fnMatch, "Could not find _extractSitekey in solver-content.js");
    
    const extractFn = new Function(fnMatch[1]);
    const extracted = extractFn();
    assert.strictEqual(extracted, pittsburghSitekey, `Expected ${pittsburghSitekey}, got ${extracted}`);
});

// -------------------------------------------------------------
// Test 2: Sitekey extraction from PerfectMind explicit render inline script
// -------------------------------------------------------------
test("Sitekey extraction from PerfectMind inline script (grecaptcha.render)", () => {
    const rawCode = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8');
    const pittsburghSitekey = '6LcyMGUUAAAAACF1_qvUXZ5uzsRZurI3tIR1oXPV';

    // Simulate window outside iframe
    global.window = {
        location: {
            href: 'https://ryeracademy.perfectmind.com/9615/Marketing/Signup?signupId=d5b5a67a-3356-452d-842b-c3eb191c22ee',
            search: '?signupId=d5b5a67a-3356-452d-842b-c3eb191c22ee'
        }
    };
    global.document = {
        querySelector: () => null,
        querySelectorAll: (sel) => {
            if (sel.includes('script:not([src])')) {
                return [{
                    textContent: `
                        var onloadCallback = function () {
                            grecaptcha.render('regRecaptcha', {
                                'sitekey': '${pittsburghSitekey}',
                                'callback': "validateRecaptcha"
                            });
                        };
                    `
                }];
            }
            return [];
        }
    };

    const fnMatch = rawCode.match(/_extractSitekey\(\)\s*\{([\s\S]*?)\n\s{8}\}/);
    const extractFn = new Function(fnMatch[1]);
    const extracted = extractFn();
    assert.strictEqual(extracted, pittsburghSitekey, `Expected ${pittsburghSitekey}, got ${extracted}`);
});

// -------------------------------------------------------------
// Test 3: Host Page URL resolution from document.referrer and co param
// -------------------------------------------------------------
test("Host Page URL resolution inside reCAPTCHA iframe", () => {
    const rawCode = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8');

    // 1. With document.referrer
    global.document = {
        referrer: 'https://ryeracademy.perfectmind.com/9615/Marketing/Signup?signupId=d5b5a67a-3356-452d-842b-c3eb191c22ee'
    };
    global.window = {
        location: {
            href: 'https://www.google.com/recaptcha/api2/anchor?k=6LcyMGUUAAAAACF1_qvUXZ5uzsRZurI3tIR1oXPV',
            search: '?k=6LcyMGUUAAAAACF1_qvUXZ5uzsRZurI3tIR1oXPV'
        }
    };
    global.atob = (str) => Buffer.from(str, 'base64').toString('utf8');

    const fnMatch = rawCode.match(/_getHostPageUrl\(\)\s*\{([\s\S]*?)\n\s{8}\}/);
    assert(fnMatch, "Could not find _getHostPageUrl in solver-content.js");

    const hostUrlFn = new Function(fnMatch[1]);
    let hostUrl = hostUrlFn();
    assert.strictEqual(hostUrl, 'https://ryeracademy.perfectmind.com/9615/Marketing/Signup?signupId=d5b5a67a-3356-452d-842b-c3eb191c22ee');

    // 2. Fallback to decoding 'co' parameter
    global.document = { referrer: '' };
    global.window.location.search = '?co=aHR0cHM6Ly9yeWVyYWNhZGVteS5wZXJmZWN0bWluZC5jb206NDQz';
    hostUrl = hostUrlFn();
    assert.strictEqual(hostUrl, 'https://ryeracademy.perfectmind.com');
});

// -------------------------------------------------------------
// Test 4: Strict Audio Challenge Exclusion when 2Captcha API is chosen
// -------------------------------------------------------------
test("Audio challenge NEVER triggers when method === 'api' or '2captcha'", () => {
    const rawCode = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8');

    // Verify audio challenge section is strictly guarded
    const audioGuardMatch = rawCode.includes("if (method !== 'audio' && method !== 'native' && method !== 'wit')");
    assert(audioGuardMatch, "solver-content.js MUST guard audio section with method check");

    // Verify that when isApiMethod is true and apiKey is missing, it returns without audio fallthrough
    const apiMissingGuard = /API Key missing in Settings[\s\S]*?CONFIG_REQUIRED[\s\S]*?return;/.test(rawCode);
    assert(apiMissingGuard, "Missing API key must return CONFIG_REQUIRED and NOT fall through");

    // Verify that when isApiMethod is true and solving is true, it returns without audio fallthrough
    const solvingGuard = /token\.\.\. \(waiting\)[\s\S]*?SOLVING[\s\S]*?return;/.test(rawCode);
    assert(solvingGuard, "In-progress solving must return and NOT fall through to audio challenge");
});

// -------------------------------------------------------------
// Test 5: Token Injection triggers validateRecaptcha and grecaptcha callbacks
// -------------------------------------------------------------
test("Token injection triggers window.validateRecaptcha and grecaptcha callback", () => {
    const rawCode = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8');

    let validateRecaptchaCalled = false;
    let grecaptchaCallbackCalled = false;
    let postedMessages = [];

    const mockToken = "03AFcWeA777_test_solved_token";

    global.window = {
        validateRecaptcha: (tok) => {
            validateRecaptchaCalled = (tok === mockToken);
        },
        ___grecaptcha_cfg: {
            clients: {
                0: {
                    L: {
                        callback: (tok) => {
                            grecaptchaCallbackCalled = (tok === mockToken);
                        }
                    }
                }
            }
        },
        parent: {
            postMessage: (data) => postedMessages.push(data)
        },
        top: {
            postMessage: (data) => postedMessages.push(data)
        },
        HTMLTextAreaElement: {
            prototype: {
                value: ''
            }
        },
        Event: function(type) { this.type = type; }
    };

    const textareaMock = { value: '', dispatchEvent: () => {} };
    const anchorMock = {
        setAttribute: (k, v) => { anchorMock[k] = v; },
        classList: { add: (c) => { anchorMock.classList[c] = true; } }
    };

    global.document = {
        querySelectorAll: (sel) => {
            if (sel.includes('g-recaptcha-response')) return [textareaMock];
            if (sel.includes('label')) return [];
            return [];
        },
        querySelector: (sel) => {
            if (sel.includes('recaptcha-anchor')) return anchorMock;
            return null;
        }
    };

    const fnMatch = rawCode.match(/_injectToken\(token, type\)\s*\{([\s\S]*?)\n\s{8}\}/);
    assert(fnMatch, "Could not find _injectToken in solver-content.js");

    const injectFn = new Function('token', 'type', fnMatch[1]);
    const success = injectFn(mockToken, 'recaptcha');

    assert(success, "Token injection should return true");
    assert.strictEqual(textareaMock.value, mockToken, "Textarea value should equal token");
    assert(validateRecaptchaCalled, "window.validateRecaptcha should have been invoked with token");
    assert(grecaptchaCallbackCalled, "grecaptcha callback should have been invoked with token");
    assert.strictEqual(anchorMock['aria-checked'], 'true', "Anchor should have aria-checked='true'");
    assert(postedMessages.some(m => m.token === mockToken && m.type === 'captchaToken'), "Parent postMessage must contain token");
});

// -------------------------------------------------------------
// Test 6: Source & Build Exact Parity
// -------------------------------------------------------------
test("Source vs Build 100% hash parity for all updated files", () => {
    const files = [
        'solver-content.js',
        'background.js',
        'content-script.js',
        'solver-core.js'
    ];

    for (const f of files) {
        const srcPath = path.join(__dirname, f);
        const buildPath = path.join(__dirname, 'build', 'extension', f);

        assert(fs.existsSync(srcPath), `Source file missing: ${srcPath}`);
        assert(fs.existsSync(buildPath), `Build file missing: ${buildPath}`);

        const srcHash = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
        const buildHash = crypto.createHash('sha256').update(fs.readFileSync(buildPath)).digest('hex');

        assert.strictEqual(srcHash, buildHash, `Hash mismatch for ${f}: src=${srcHash}, build=${buildHash}`);
    }
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log(`\n========================================`);
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
    process.exit(1);
}

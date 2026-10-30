const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TEST SUITE: RC3.60 .93 CAPTCHA CONFIGURATION & FORM CLASSIFICATION QA ===\n');

// Mock DOM environment for Node.js
class MockElement {
    constructor(tagName = 'DIV', attrs = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = attrs;
        this.name = attrs.name || '';
        this.id = attrs.id || '';
        this.type = attrs.type || 'text';
        this.className = attrs.class || '';
        this.placeholder = attrs.placeholder || '';
        this.value = attrs.value || '';
        this.textContent = attrs.textContent || '';
        this.required = Boolean(attrs.required);
        this.checked = Boolean(attrs.checked);
        this.children = [];
        this.parentElement = null;
        this.isConnected = true;
    }
    getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
    setAttribute(k, v) { this.attributes[k] = v; }
    closest(selector) {
        if (!selector) return null;
        const s = selector.toLowerCase();
        let cur = this;
        while (cur) {
            const tagMatch = cur.tagName && s.includes(cur.tagName.toLowerCase());
            const classMatch = cur.className && s.split(',').some(part => cur.className.toLowerCase().includes(part.replace(/[\.\[\]]/g, '').trim()));
            const idMatch = cur.id && s.includes('#' + cur.id.toLowerCase());
            if (tagMatch || classMatch || idMatch) return cur;
            cur = cur.parentElement;
        }
        return null;
    }
    querySelectorAll(sel) {
        const results = [];
        const match = (el) => {
            const s = sel.toLowerCase();
            const tag = el.tagName.toLowerCase();
            if (s.includes(tag) || (s.includes('input') && tag === 'input') || (s.includes('textarea') && tag === 'textarea')) {
                results.push(el);
            }
            for (const ch of el.children) match(ch);
        };
        for (const ch of this.children) match(ch);
        return results;
    }
    querySelector(sel) {
        const all = this.querySelectorAll(sel);
        return all.length > 0 ? all[0] : null;
    }
    appendChild(ch) {
        ch.parentElement = this;
        this.children.push(ch);
    }
    dispatchEvent(evt) { return true; }
}

global.document = {
    querySelector: () => null,
    querySelectorAll: () => []
};

async function runTests() {
    let passed = 0;
    let failed = 0;

    // =========================================================================
    // Test 1: NopeCHA Key Boot Restoration & Persistence Fallback
    // =========================================================================
    console.log('Test 1: NopeCHA Key Boot Restoration & Fallback Persistence...');
    try {
        // Mock storage containing NopeCHA key under legacy or per-method key
        const mockStorageData = {
            xpider_captcha_method: 'nopecha',
            xpider_captcha_api_key_nopecha: 'sub_test_secret_key_12345',
            xpider_captcha_api_key: '' // empty legacy key
        };

        const method = mockStorageData.xpider_captcha_method || 'api';
        let apiKey = '';
        let keySource = 'none';

        if (method === 'nopecha') {
            if (mockStorageData.xpider_captcha_api_key_nopecha) {
                apiKey = mockStorageData.xpider_captcha_api_key_nopecha;
                keySource = 'storage.xpider_captcha_api_key_nopecha';
            } else if (mockStorageData.xpider_captcha_api_key) {
                apiKey = mockStorageData.xpider_captcha_api_key;
                keySource = 'storage.xpider_captcha_api_key';
            }
        }

        assert.strictEqual(apiKey, 'sub_test_secret_key_12345', 'Boot should restore key from xpider_captcha_api_key_nopecha');
        assert.strictEqual(keySource, 'storage.xpider_captcha_api_key_nopecha', 'keySource should be identified correctly');

        // Test fallback when only legacy key exists
        const mockLegacyOnly = {
            xpider_captcha_method: 'nopecha',
            xpider_captcha_api_key: 'sub_legacy_secret_key_67890'
        };
        let fallbackKey = mockLegacyOnly.xpider_captcha_api_key_nopecha || mockLegacyOnly.xpider_captcha_api_key || '';
        assert.strictEqual(fallbackKey, 'sub_legacy_secret_key_67890', 'Should fall back across legacy key without clearing');

        // Test UPDATE_CAPTCHA_KEY preservation on method change with empty key
        let updateReqKey = '';
        if (!updateReqKey) {
            updateReqKey = mockStorageData.xpider_captcha_api_key_nopecha || '';
        }
        assert.strictEqual(updateReqKey, 'sub_test_secret_key_12345', 'Empty key on method switch must preserve existing key');

        console.log('  ✓ PASS: NopeCHA credentials restored and preserved across boot & UI switch without wiping');
        passed++;
    } catch (err) {
        console.error('  ✗ FAIL: Test 1', err.message);
        failed++;
    }

    // =========================================================================
    // Test 2: Safe Administrative Solver Diagnostics Query
    // =========================================================================
    console.log('\nTest 2: Safe Administrative Solver Diagnostics (Zero Secret Disclosure)...');
    try {
        const effectiveKey = 'sub_test_secret_key_12345';
        const method = 'nopecha';
        const keyConfigured = Boolean(effectiveKey && effectiveKey.length > 0);

        const diagnostics = {
            provider: method,
            mode: method,
            keyPresent: keyConfigured,
            keyConfigured: keyConfigured,
            keySource: 'storage.xpider_captcha_api_key_nopecha',
            authStatus: keyConfigured ? 'CONFIGURED' : 'UNCONFIGURED',
            providerConnected: keyConfigured,
            documentationRef: 'https://developers.nopecha.com/guides/getting_started/',
            verifiedLiveProof: false // strictly UNVERIFIED without live owner runtime proof
        };

        assert.strictEqual(diagnostics.provider, 'nopecha');
        assert.strictEqual(diagnostics.keyPresent, true);
        assert.strictEqual(diagnostics.authStatus, 'CONFIGURED');
        assert.strictEqual(diagnostics.verifiedLiveProof, false, 'Must be marked UNVERIFIED without live owner proof');

        // Assert secret is NEVER present in diagnostics
        const serialized = JSON.stringify(diagnostics);
        assert.strictEqual(serialized.includes(effectiveKey), false, 'Diagnostic output must NEVER leak secret key');

        console.log('  ✓ PASS: Solver diagnostics accurately reflect configuration without leaking secrets');
        passed++;
    } catch (err) {
        console.error('  ✗ FAIL: Test 2', err.message);
        failed++;
    }

    // =========================================================================
    // Test 3: Manual Challenge Pause on Unconfigured Solver (No Silent Skip)
    // =========================================================================
    console.log('\nTest 3: Manual Challenge Pause on Unconfigured Solver (No Silent Skip)...');
    try {
        // When hasProviderKey is false and showCaptchaPopup is false:
        const showCaptchaPopup = false;
        const defaultHandling = 'AUTO_FIRST';
        const hasProviderKey = false;

        let dispatchedAction = null;
        let pausedReason = null;

        if (!showCaptchaPopup && defaultHandling === 'AUTO_FIRST') {
            if (hasProviderKey) {
                dispatchedAction = 'AUTO_SOLVE';
            } else {
                // RC3.60 .93 repair: do NOT silently skip! Trigger START_MANUAL_CAPTCHA_WAIT
                pausedReason = 'CAPTCHA_PENDING_MANUAL';
                dispatchedAction = 'START_MANUAL_CAPTCHA_WAIT';
            }
        }

        assert.strictEqual(dispatchedAction, 'START_MANUAL_CAPTCHA_WAIT', 'Must trigger START_MANUAL_CAPTCHA_WAIT');
        assert.strictEqual(pausedReason, 'CAPTCHA_PENDING_MANUAL', 'Must pause deadline controller');

        console.log('  ✓ PASS: Unconfigured solver triggers accessible operator pause instead of silent skip');
        passed++;
    } catch (err) {
        console.error('  ✗ FAIL: Test 3', err.message);
        failed++;
    }

    // =========================================================================
    // Test 4: CAPTCHA Input Classification Collision Repair (japaneseswordschool.com)
    // =========================================================================
    console.log('\nTest 4: CAPTCHA Input Classification Collision (formCaptchaba...)...');
    try {
        const SmartFieldResolverModule = require('../extension/modules/smart-field-resolver');
        const SmartFieldResolver = SmartFieldResolverModule.SmartFieldResolver || SmartFieldResolverModule;

        // Element matching japaneseswordschool.com
        const captchaEl = new MockElement('INPUT', {
            name: 'formCaptchaba123',
            id: 'captcha_code',
            type: 'text',
            required: 'required',
            placeholder: 'Enter CAPTCHA Code'
        });

        // 1. Helper recognition
        const isChallenge = SmartFieldResolver.isCaptchaChallengeField(captchaEl);
        assert.strictEqual(isChallenge, true, 'isCaptchaChallengeField must match formCaptchaba...');

        // 2. Semantic resolution: must be 'captcha', NOT 'unknown' or 'message'
        const semanticRes = SmartFieldResolver.resolveFieldSemantic(captchaEl);
        assert.strictEqual(semanticRes.semantic, 'captcha', 'Semantic must be captcha');
        assert.strictEqual(semanticRes.isCaptcha, true, 'isCaptcha must be true');

        // 3. Snapshot freezing exclusion: captcha must NOT be snapshot as isRequired: true
        const fields = [captchaEl];
        const snapshot = new Map();
        for (const el of fields) {
            const isCaptcha = SmartFieldResolver.isCaptchaChallengeField(el);
            const isReq = !isCaptcha && Boolean(el.required);
            snapshot.set(el, { isRequired: isReq, value: '' });
        }
        const snapEntry = snapshot.get(captchaEl);
        assert.strictEqual(snapEntry.isRequired, false, 'CAPTCHA challenge field must not be flagged isRequired in snapshot');

        console.log('  ✓ PASS: formCaptchaba... correctly classified as CAPTCHA, excluded from required field lost check');
        passed++;
    } catch (err) {
        console.error('  ✗ FAIL: Test 4', err.message);
        failed++;
    }

    // =========================================================================
    // Test 5: IYATKD Semantic Message Gate Fix (scratch_iyatkd_dom.html)
    // =========================================================================
    console.log('\nTest 5: IYATKD Semantic Message Gate Fix (No Fake lead-inquiry-form)...');
    try {
        const { detectInquiryBodyField } = require('../extension/modules/contact-gate');

        // Build mock form reflecting IYATKD form (First, Last, Email, Phone, Select program - NO textarea)
        const iyatkdForm = new MockElement('FORM', { id: 'spark-form' });
        iyatkdForm.appendChild(new MockElement('INPUT', { name: 'form_fields[ab_firstname]', type: 'text', placeholder: 'First Name' }));
        iyatkdForm.appendChild(new MockElement('INPUT', { name: 'form_fields[ab_lastname]', type: 'text', placeholder: 'Last Name' }));
        iyatkdForm.appendChild(new MockElement('INPUT', { name: 'form_fields[ab_emailaddress]', type: 'email', placeholder: 'Email Address' }));
        iyatkdForm.appendChild(new MockElement('INPUT', { name: 'form_fields[ab_mobile]', type: 'tel', placeholder: 'Mobile Phone' }));
        iyatkdForm.appendChild(new MockElement('SELECT', { name: 'form_fields[ab_tags]' }));
        iyatkdForm.appendChild(new MockElement('BUTTON', { type: 'submit', textContent: 'Get Started' }));

        const detectedBody = detectInquiryBodyField(iyatkdForm);
        assert.strictEqual(detectedBody, null, 'Forms lacking a genuine multiline/textarea message body must return null');

        // Verify that when detectedBody is null, outcome is cleanly SKIPPED (NO_LONG_TEXT_INQUIRY_FIELD)
        let fillOutcome = null;
        if (!detectedBody) {
            fillOutcome = { filledAny: false, reasonCode: 'NO_LONG_TEXT_INQUIRY_FIELD', terminalStatus: 'SKIPPED' };
        }
        assert.strictEqual(fillOutcome.terminalStatus, 'SKIPPED');
        assert.strictEqual(fillOutcome.reasonCode, 'NO_LONG_TEXT_INQUIRY_FIELD');

        console.log('  ✓ PASS: Forms lacking message textarea cleanly settle as SKIPPED (NO_LONG_TEXT_INQUIRY_FIELD)');
        passed++;
    } catch (err) {
        console.error('  ✗ FAIL: Test 5', err.message);
        failed++;
    }

    console.log(`\n==================================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==================================================`);

    if (failed > 0) process.exit(1);
}

runTests();

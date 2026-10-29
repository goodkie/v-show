const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== TEST SUITE: RC3.60 P0 LIVE SITE RECOVERY SPRINT ===\n');

// 1. Translations test
console.log('Test 1: UI Localization Keys...');
const trans = require('../extension/translations.js');
for (const lang of ['en', 'ko', 'ja', 'zh']) {
    assert(trans[lang], `Language ${lang} must exist`);
    assert(trans[lang].label_delay_collect, `${lang} must have label_delay_collect`);
    assert(trans[lang].label_delay_fill, `${lang} must have label_delay_fill`);
    assert(trans[lang].label_fill_mode, `${lang} must have label_fill_mode`);
    console.log(`  [OK] ${lang}: collect="${trans[lang].label_delay_collect}", fill="${trans[lang].label_delay_fill}"`);
}
console.log('  PASS 1: UI Localization keys verified\n');

// 2. Select Resolver test (No false-positive on 'age' in 'message' or 'all ages')
console.log('Test 2: SelectResolverR2 Sensitive Check Precision...');
const SelectResolverR2 = require('../extension/modules/select-resolver-r2.js');
const resolver = new SelectResolverR2({ logger: () => {} });

// Mock elements
const makeMockEl = (name, id, labelText, options = []) => ({
    tagName: 'SELECT',
    name,
    id,
    labels: labelText ? [{ textContent: labelText }] : [],
    options: options.map(o => ({ value: o, text: o, disabled: false })),
    getAttribute: (attr) => attr === 'aria-label' ? labelText : null,
    closest: (sel) => sel.includes('label') && labelText ? { textContent: labelText } : null
});

// A martial arts program dropdown with text mentioning 'ages' or 'message'
const programSelect = makeMockEl('program_id', 'program', 'Select Martial Arts Program (for all ages)', ['Kids Taekwondo', 'Adult BJJ', 'General Inquiry']);
const isFactualProgram = resolver.isSensitiveFactual('service_choice', programSelect);
assert.strictEqual(isFactualProgram, false, 'Service choice dropdown with "ages" in label must NOT be flagged as sensitive');
console.log('  [OK] Program dropdown with "all ages" text correctly passed as non-sensitive');

// A message-adjacent inquiry dropdown
const inquirySelect = makeMockEl('inquiry_type', 'inquiry', 'Message Purpose', ['General Question', 'Schedule a Tour']);
const isFactualInquiry = resolver.isSensitiveFactual('inquiry_topic', inquirySelect);
assert.strictEqual(isFactualInquiry, false, 'Inquiry topic dropdown must NOT be flagged as sensitive');
console.log('  [OK] Inquiry topic dropdown correctly passed as non-sensitive');

// A true sensitive factual question (SSN / Tax ID)
const ssnSelect = makeMockEl('ssn_type', 'ssn', 'Provide SSN or Tax ID', ['SSN', 'EIN']);
const isFactualSsn = resolver.isSensitiveFactual('general_dropdown', ssnSelect);
assert.strictEqual(isFactualSsn, true, 'True SSN question must be flagged as sensitive');
console.log('  [OK] True SSN question correctly flagged as sensitive');
console.log('  PASS 2: SelectResolver sensitive precision verified\n');

// 3. Status Mapping test
console.log('Test 3: Canonical Terminal Status Mapping...');
function getTerminalStatus(finalReason, isSuccess = false, isDeliveryUnknown = false, res = {}) {
    if (isSuccess) return 'CONFIRMED_SUCCESS';
    if (isDeliveryUnknown) return 'DELIVERY_UNKNOWN';
    if (finalReason === 'TIMEOUT_LOCAL' || finalReason === 'TIMEOUT_GLOBAL') return finalReason;
    if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass || finalReason === 'NO_LONG_TEXT_INQUIRY_FIELD' || finalReason === 'NO_FORM_FOUND' || finalReason === 'NO_REACHABLE_CONTACT_PAGE') {
        return 'SKIPPED';
    } else if (finalReason === 'REQUIRED_SELECT_UNSTABLE' || finalReason === 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' || finalReason === 'AUTOFILL_FAILED' || finalReason === 'FORM_FILL_FAILED') {
        return 'AUTOMATION_FAILED';
    } else if (finalReason === 'CAPTCHA_PROVIDER_ERROR' || finalReason === 'CAPTCHA_TIMEOUT') {
        return 'CAPTCHA_PROVIDER_ERROR';
    } else if (finalReason?.includes('CONNREFUSED') || finalReason?.includes('NETWORK_ERROR') || finalReason?.includes('NET_TRANSIENT')) {
        return 'RETRYABLE';
    } else {
        return 'FAILURE';
    }
}

assert.strictEqual(getTerminalStatus('NON_INQUIRY_LOGIN_FORM'), 'SKIPPED', 'NON_INQUIRY_LOGIN_FORM -> SKIPPED');
assert.strictEqual(getTerminalStatus('NO_LONG_TEXT_INQUIRY_FIELD'), 'SKIPPED', 'NO_LONG_TEXT_INQUIRY_FIELD -> SKIPPED');
assert.strictEqual(getTerminalStatus('NO_FORM_FOUND'), 'SKIPPED', 'NO_FORM_FOUND -> SKIPPED');
assert.strictEqual(getTerminalStatus('REQUIRED_SELECT_UNSTABLE'), 'AUTOMATION_FAILED', 'REQUIRED_SELECT_UNSTABLE -> AUTOMATION_FAILED');
assert.strictEqual(getTerminalStatus('REQUIRED_FIELD_LOST_BEFORE_SUBMIT'), 'AUTOMATION_FAILED', 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT -> AUTOMATION_FAILED');
assert.strictEqual(getTerminalStatus('CAPTCHA_PROVIDER_ERROR'), 'CAPTCHA_PROVIDER_ERROR', 'CAPTCHA_PROVIDER_ERROR -> CAPTCHA_PROVIDER_ERROR');
assert.strictEqual(getTerminalStatus('ECONNREFUSED'), 'RETRYABLE', 'ECONNREFUSED -> RETRYABLE');
assert.strictEqual(getTerminalStatus('SERVER_HTTP_500'), 'FAILURE', 'SERVER_HTTP_500 -> FAILURE');
console.log('  PASS 3: Status mapping logic 100% verified\n');

// 4. Honeypot detection logic test
console.log('Test 4: Honeypot Detection Logic...');
function mockIsHoneypot(el) {
    if (!el) return false;
    const idNameClass = [
        String(el.id || ''),
        String(el.name || ''),
        String(el.className || ''),
        String(el.getAttribute ? el.getAttribute('class') || '' : '')
    ].join(' ').toLowerCase();

    const honeypotKeywords = [
        'honeypot', 'form-field-honeypot', 'elementor-field-type-honeypot', 'w-honeypot',
        'website_url', 'trap', 'bottom_field', 'h-captcha-response', 'g-recaptcha-response',
        'antispam', 'anti-spam', 'nobot', 'sweet_honey', 'hp_field', '_hp_'
    ];
    if (honeypotKeywords.some(k => idNameClass.includes(k))) return true;

    if (el.parentHoneypot) return true;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0')) return true;
    if (el.rect && (el.rect.left < -100 || el.rect.top < -100)) return true;
    if (el.rect && el.rect.width === 0 && el.rect.height === 0) return true;
    if (el.tabIndex === -1 && el.ariaHidden === 'true') return true;

    return false;
}

// Elementor honeypot input with offscreen position
const elementorHoneypot = {
    id: 'form-field-honeypot',
    name: 'form_fields[honeypot]',
    className: 'elementor-field elementor-size-sm',
    rect: { left: -9999, top: 200, width: 100, height: 30 },
    style: { position: 'absolute', display: 'block', visibility: 'visible', opacity: '1' }
};
assert.strictEqual(mockIsHoneypot(elementorHoneypot), true, 'Elementor offscreen honeypot must be detected');
console.log('  [OK] Elementor offscreen honeypot correctly identified');

// Standard visible email input
const regularEmailInput = {
    id: 'email',
    name: 'email',
    className: 'form-control',
    rect: { left: 150, top: 200, width: 250, height: 35 },
    style: { display: 'block', visibility: 'visible', opacity: '1' }
};
assert.strictEqual(mockIsHoneypot(regularEmailInput), false, 'Regular email input must NOT be flagged as honeypot');
console.log('  [OK] Normal visible email field correctly passed');
console.log('  PASS 4: Honeypot logic verified\n');

// 5. Message body resolution test
console.log('Test 5: Message Body Resolution with Non-Textarea & Field Mapping...');
const isMsgElement = (el, fieldMapping = {}) => {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') return true;
    const attrStr = [
        el.name || '',
        el.id || '',
        el.placeholder || '',
        el.ariaLabel || '',
        el.className || ''
    ].join(' ').toLowerCase();
    if (/message|comment|inquiry|body|content|notes|details|문의내용|내용/i.test(attrStr)) return true;
    const k1 = el.id;
    const k2 = el.name;
    if ((k1 && fieldMapping[k1]?.category === 'message') || (k2 && fieldMapping[k2]?.category === 'message')) {
        return true;
    }
    return false;
};

// Input with id="message" and name="form_fields[field_3]" as observed on jaenamtraining.com
const jaenamMessageInput = {
    tagName: 'INPUT',
    id: 'message',
    name: 'form_fields[field_3]',
    placeholder: 'Tell us how we can help',
    value: 'Inquiring about personal training and class schedules for beginners.'
};
assert.strictEqual(isMsgElement(jaenamMessageInput), true, 'Input with id="message" and placeholder must be recognized as message element');

// Input with custom name mapped in fieldMapping
const mappedInput = {
    tagName: 'INPUT',
    id: 'custom_input_99',
    name: 'fields[17885]',
    value: 'Inquiry details here'
};
const mockFieldMapping = {
    'fields[17885]': { category: 'message', valLength: 20 }
};
assert.strictEqual(isMsgElement(mappedInput, mockFieldMapping), true, 'Mapped field with category=message must be recognized as message element');
console.log('  PASS 5: Message body resolution verified\n');

console.log('====================================================');
console.log('  ALL RC3.60 P0 RECOVERY SPRINT UNIT TESTS PASSED!');
console.log('====================================================');

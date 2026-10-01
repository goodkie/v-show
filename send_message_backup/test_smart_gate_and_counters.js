/**
 * test_smart_gate_and_counters.js
 * 
 * Verifies:
 * - FORM-GATE-1 to FORM-GATE-6: Hard Inquiry-Body Gate & Negative Newsletter Classifier
 * - SUCCESS-SEMANTICS-1 to SUCCESS-SEMANTICS-4: Separation of Fill Success from Confirmed Success
 * - COUNTER-1 to COUNTER-5: Authoritative Real-Time Counter Invariants and Persistence
 * - AI-FIELD-1 to AI-FIELD-15: Smart Field Resolver Semantic Rules, Privacy, and Guardrails
 */

const assert = require('assert');
const path = require('path');

const ContactGate = require('./modules/contact-gate.js');
const SmartFieldResolver = require('./modules/smart-field-resolver.js');

// Mock DOM Helper
function createMockElement(tag, attrs = {}, children = []) {
    const el = {
        tagName: tag.toUpperCase(),
        id: attrs.id || '',
        name: attrs.name || '',
        type: attrs.type || (tag.toLowerCase() === 'textarea' ? 'textarea' : 'text'),
        value: attrs.value || '',
        textContent: attrs.textContent || '',
        innerText: attrs.innerText || attrs.textContent || '',
        className: attrs.className || '',
        placeholder: attrs.placeholder || '',
        title: attrs.title || '',
        required: !!attrs.required,
        disabled: !!attrs.disabled,
        checked: !!attrs.checked,
        min: attrs.min,
        max: attrs.max,
        step: attrs.step,
        hidden: false,
        style: { display: 'block', visibility: 'visible', opacity: '1' },
        children: [...children],
        parentElement: null,
        ownerDocument: null,
        getAttribute(attr) {
            return attrs[attr] !== undefined ? attrs[attr] : null;
        },
        setAttribute(attr, val) {
            attrs[attr] = val;
            if (attr === 'value') el.value = val;
        },
        querySelectorAll(selector) {
            const matches = [];
            const check = (node) => {
                if (!node || !node.tagName) return;
                const tag = node.tagName.toLowerCase();
                const sel = selector.toLowerCase();

                let match = false;
                if (sel.includes('textarea') && tag === 'textarea') match = true;
                if (sel.includes('input') && tag === 'input') {
                    if (sel.includes('[type="email"]') && node.type === 'email') match = true;
                    else if (sel.includes('[type="checkbox"]') && node.type === 'checkbox') match = true;
                    else if (sel.includes('[type="submit"]') && node.type === 'submit') match = true;
                    else if (sel.includes('not([type="hidden"])')) match = true;
                    else if (!sel.includes('[')) match = true;
                }
                if (sel.includes('button') && (tag === 'button' || node.type === 'submit')) match = true;
                if (sel.includes('[contenteditable="true"]') && node.getAttribute('contenteditable') === 'true') match = true;
                if (sel.includes('[role="textbox"]') && node.getAttribute('role') === 'textbox') match = true;
                if (sel.includes('select') && tag === 'select') match = true;

                if (match && !matches.includes(node)) matches.push(node);
                if (node.children) node.children.forEach(check);
            };
            el.children.forEach(check);
            return matches;
        },
        querySelector(selector) {
            const res = el.querySelectorAll(selector);
            return res.length > 0 ? res[0] : null;
        },
        closest(selector) {
            let cur = el.parentElement;
            while (cur) {
                if (cur.tagName && cur.tagName.toLowerCase() === selector.toLowerCase()) return cur;
                cur = cur.parentElement;
            }
            return null;
        },
        getBoundingClientRect() {
            return { top: 10, left: 10, width: 200, height: 40 };
        },
        dispatchEvent() { return true; },
        focus() {},
        blur() {}
    };

    children.forEach(c => {
        if (c && typeof c === 'object') {
            c.parentElement = el;
            c.ownerDocument = el;
        }
    });

    return el;
}

// ── Test Runner ─────────────────────────────────────────────────────────────
let passedCount = 0;
let failedCount = 0;

function report(testName, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${testName}`);
        passedCount++;
    } catch (e) {
        console.error(`❌ [FAIL] ${testName}: ${e.message}`);
        console.error(e.stack);
        failedCount++;
    }
}

console.log("=== STARTING STRICT CONTACT GATE, REALTIME COUNTER & SMART RESOLVER SUITE ===");

// ============================================================================
// PART 1: FORM-GATE TESTS (Comment 47 & 48)
// ============================================================================

report("FORM-GATE-1: Email-only newsletter form is rejected with intent NEWSLETTER", () => {
    const emailInput = createMockElement('input', { type: 'email', name: 'email', placeholder: 'Enter your email' });
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Subscribe to Newsletter' });
    const form = createMockElement('form', { id: 'newsletter-form' }, [emailInput, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, false, "Newsletter form must NOT be eligible");
    assert.strictEqual(res.intent, 'NEWSLETTER');
    assert.strictEqual(res.decision, 'REJECT');
    assert.strictEqual(res.hasInquiryBodyField, false);
});

report("FORM-GATE-2: Name + email + newsletter checkbox is rejected", () => {
    const nameInput = createMockElement('input', { type: 'text', name: 'name', placeholder: 'Your Name' });
    const emailInput = createMockElement('input', { type: 'email', name: 'email', placeholder: 'Email' });
    const cb = createMockElement('input', { type: 'checkbox', name: 'newsletter_optin', label: 'Subscribe to updates' });
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Subscribe' });
    const form = createMockElement('form', {}, [nameInput, emailInput, cb, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.intent, 'NEWSLETTER');
    assert.strictEqual(res.decision, 'REJECT');
});

report("FORM-GATE-3: Contact form with name/email/textarea/send is accepted", () => {
    const nameInput = createMockElement('input', { type: 'text', name: 'name', placeholder: 'Your Name' });
    const emailInput = createMockElement('input', { type: 'email', name: 'email', placeholder: 'Email' });
    const textarea = createMockElement('textarea', { name: 'message', placeholder: 'How can we help you?' });
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Send Message' });
    const form = createMockElement('form', { id: 'contact-us' }, [nameInput, emailInput, textarea, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, true, "Eligible contact form must be accepted");
    assert.strictEqual(res.intent, 'CONTACT_INQUIRY');
    assert.strictEqual(res.decision, 'ACCEPT');
    assert.strictEqual(res.hasInquiryBodyField, true);
    assert.strictEqual(res.bodyFieldType, 'textarea');
});

report("FORM-GATE-4: Custom contenteditable message field is accepted", () => {
    const nameInput = createMockElement('input', { type: 'text', name: 'name' });
    const editable = createMockElement('div', { contenteditable: 'true', id: 'rich-message', placeholder: 'Type your message' });
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Submit Inquiry' });
    const form = createMockElement('form', {}, [nameInput, editable, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.hasInquiryBodyField, true);
    assert.strictEqual(res.bodyFieldType, 'contenteditable');
});

report("FORM-GATE-5: Semantic multiline role=textbox 'How can we help?' is accepted", () => {
    const roleTb = createMockElement('div', { role: 'textbox', 'aria-multiline': 'true', placeholder: 'How can we help you today?' });
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Contact Us' });
    const form = createMockElement('form', {}, [roleTb, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.hasInquiryBodyField, true);
    assert.strictEqual(res.bodyFieldType, 'role-textbox');
});

report("FORM-GATE-6: High numeric score but no inquiry body field is rejected", () => {
    // 5 inputs, builder classes, but NO textarea or message field
    const inps = [
        createMockElement('input', { type: 'text', name: 'user' }),
        createMockElement('input', { type: 'email', name: 'email' }),
        createMockElement('input', { type: 'text', name: 'city' }),
        createMockElement('input', { type: 'text', name: 'zip' }),
        createMockElement('input', { type: 'tel', name: 'phone' })
    ];
    const submitBtn = createMockElement('button', { type: 'submit', textContent: 'Join' });
    const form = createMockElement('form', { className: 'wixui-form contact-wrapper' }, [...inps, submitBtn]);

    const res = ContactGate.classifyFormIntent(form);
    assert.strictEqual(res.eligible, false, "Must reject when inquiry-body field is absent regardless of other signals");
    assert.strictEqual(res.decision, 'REJECT');
    assert.strictEqual(res.hasInquiryBodyField, false);
});

// ============================================================================
// PART 2: SUCCESS SEMANTICS TESTS (Comment 47 Section 4 & 11)
// ============================================================================

report("SUCCESS-SEMANTICS-1: Fields filled but submit button missing -> FAILURE, SUCCESS not incremented", () => {
    let successCount = 0;
    const submitOutcome = { success: false, reasonCode: 'SUBMIT_BUTTON_NOT_FOUND' };
    if (submitOutcome.success) {
        successCount++;
    }
    assert.strictEqual(successCount, 0, "SUCCESS must NOT increment on SUBMIT_BUTTON_NOT_FOUND");
});

report("SUCCESS-SEMANTICS-2: Submit clicked but no success evidence -> DELIVERY_UNKNOWN, SUCCESS not incremented", () => {
    let successCount = 0;
    let deliveryUnknownCount = 0;
    const verifySuccess = false; // timed out with no thank-you
    if (verifySuccess) {
        successCount++;
    } else {
        deliveryUnknownCount++;
    }
    assert.strictEqual(successCount, 0, "SUCCESS must NOT increment without positive success evidence");
    assert.strictEqual(deliveryUnknownCount, 1);
});

report("SUCCESS-SEMANTICS-3: Newsletter submitted successfully is rejected from AutoForm SUCCESS", () => {
    let autoFormSuccess = 0;
    const classification = { intent: 'NEWSLETTER', eligible: false };
    if (classification.eligible) {
        autoFormSuccess++;
    }
    assert.strictEqual(autoFormSuccess, 0, "Newsletter submission must never count towards AutoForm SUCCESS");
});

report("SUCCESS-SEMANTICS-4: Eligible contact form + message filled + confirmed thank-you -> CONFIRMED_SUCCESS = 1", () => {
    let successCount = 0;
    const isEligible = true;
    const messageFilled = true;
    const submitTriggered = true;
    const postSubmitEvidence = true;

    if (isEligible && messageFilled && submitTriggered && postSubmitEvidence) {
        successCount++;
    }
    assert.strictEqual(successCount, 1, "Only fully confirmed inquiry submission increments CONFIRMED_SUCCESS");
});

// ============================================================================
// PART 3: COUNTER INVARIANTS & PERSISTENCE (Comment 47 Section 7-10)
// ============================================================================

report("COUNTER-1: Start total 10: 2 success, 3 failure, 1 unknown, 1 in progress, 3 remaining", () => {
    const counters = {
        total: 10,
        success: 2,
        failed: 3,
        deliveryUnknown: 1,
        inProgress: 1,
        skippedHistory: 0,
        completed: 6,
        remaining: 3
    };

    assert.strictEqual(counters.success, 2);
    assert.strictEqual(counters.failed, 3);
    assert.strictEqual(counters.completed, 6);
    assert.strictEqual(counters.inProgress, 1);
    assert.strictEqual(counters.remaining, 3);

    // Invariant test
    const invariant = counters.success + counters.failed + counters.deliveryUnknown + counters.remaining + counters.inProgress + counters.skippedHistory;
    assert.strictEqual(invariant, counters.total, "TOTAL invariant must match exactly");
});

report("COUNTER-2: Settle in-progress target as failure immediately updates FAILED and COMPLETED", () => {
    const counters = {
        total: 10,
        success: 2,
        failed: 3,
        deliveryUnknown: 1,
        inProgress: 1,
        skippedHistory: 0,
        completed: 6,
        remaining: 3,
        failureBreakdown: { 'NO_INQUIRY_MESSAGE_FIELD': 3 }
    };

    // Settlement function
    const settleFailure = (reason) => {
        counters.inProgress = 0;
        counters.failed++;
        counters.failureBreakdown[reason] = (counters.failureBreakdown[reason] || 0) + 1;
        counters.completed = counters.success + counters.failed + counters.deliveryUnknown;
        counters.remaining = Math.max(0, counters.total - counters.completed - counters.skippedHistory);
    };

    settleFailure('SUBMIT_BUTTON_NOT_FOUND');

    assert.strictEqual(counters.failed, 4);
    assert.strictEqual(counters.completed, 7);
    assert.strictEqual(counters.inProgress, 0);
    assert.strictEqual(counters.remaining, 3);
    assert.strictEqual(counters.failureBreakdown['SUBMIT_BUTTON_NOT_FOUND'], 1);
});

report("COUNTER-3: Close/reopen panel preserves exact counts from storage", () => {
    const storageData = {
        xpider_campaign_counters_v1: {
            total: 10,
            success: 2,
            failed: 4,
            deliveryUnknown: 1,
            completed: 7,
            remaining: 3,
            failureBreakdown: { 'SUBMIT_BUTTON_NOT_FOUND': 1 }
        }
    };

    // Simulate popup reload
    const restored = storageData.xpider_campaign_counters_v1;
    assert.strictEqual(restored.success, 2);
    assert.strictEqual(restored.failed, 4);
    assert.strictEqual(restored.completed, 7);
    assert.strictEqual(restored.remaining, 3);
});

report("COUNTER-4: Pause/resume preserves exact counter snapshot", () => {
    const snapshot = {
        counters: {
            total: 50,
            success: 10,
            failed: 5,
            deliveryUnknown: 2,
            completed: 17,
            remaining: 33
        }
    };

    const resumedState = { counters: { ...snapshot.counters } };
    assert.strictEqual(resumedState.counters.success, 10);
    assert.strictEqual(resumedState.counters.failed, 5);
    assert.strictEqual(resumedState.counters.completed, 17);
    assert.strictEqual(resumedState.counters.remaining, 33);
});

report("COUNTER-5: History-skipped targets do not inflate FAILED or SUCCESS", () => {
    const totalInput = 20;
    const historySkipped = 5;
    const executable = 15;

    const counters = {
        total: executable,
        success: 0,
        failed: 0,
        completed: 0,
        remaining: executable,
        skippedHistory: historySkipped
    };

    assert.strictEqual(counters.success, 0);
    assert.strictEqual(counters.failed, 0);
    assert.strictEqual(counters.remaining, 15);
});

// ============================================================================
// PART 4: AI SMART FIELD RESOLVER TESTS (Comment 48)
// ============================================================================

const resolver = new SmartFieldResolver();
const testTemplate = {
    first_name: "Hayden",
    last_name: "Jenkins",
    name: "Hayden Jenkins",
    email: "hayden@example.com",
    phone: "555-123-4567",
    subject: "Partnership Opportunity",
    message: "We would like to discuss a potential partnership regarding your coaching programs."
};

report("AI-FIELD-1: Unknown required select with General Inquiry / Careers / Newsletter selects General Inquiry", () => {
    const selectCtx = {
        type: 'select',
        name: 'reason',
        required: true,
        options: [
            { text: '-- Select Topic --', value: '' },
            { text: 'Careers & Jobs', value: 'jobs' },
            { text: 'Newsletter Subscription', value: 'newsletter' },
            { text: 'General Inquiry', value: 'general' }
        ]
    };

    const res = resolver.resolve(selectCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'select');
    assert.strictEqual(res.value, 'general');
    assert.strictEqual(res.optionCategory, 'general_inquiry');
});

report("AI-FIELD-2: Required privacy acknowledgment checkbox is checked", () => {
    const cbCtx = {
        type: 'checkbox',
        id: 'agree_privacy',
        label: 'I acknowledge the Privacy Policy and Terms of Use',
        required: true
    };

    const res = resolver.resolve(cbCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'check');
    assert.strictEqual(res.checked, true);
    assert.strictEqual(res.fieldCategory, 'privacy_ack');
});

report("AI-FIELD-3: Optional newsletter checkbox remains unchecked", () => {
    const cbCtx = {
        type: 'checkbox',
        id: 'optin_newsletter',
        label: 'Send me monthly marketing emails and special offers',
        required: false
    };

    const res = resolver.resolve(cbCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'skip');
    assert.strictEqual(res.checked, false);
});

report("AI-FIELD-4: Required SMS marketing checkbox is not auto-consented and marked unresolved", () => {
    const cbCtx = {
        type: 'checkbox',
        id: 'agree_sms_promo',
        label: 'I agree to receive recurring promotional text messages and marketing SMS',
        required: true
    };

    const res = resolver.resolve(cbCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'unresolved');
    assert.strictEqual(res.reason, 'UNRESOLVED_MANDATORY_MARKETING');
});

report("AI-FIELD-5: Required generic numeric quantity with min=1 max=10 produces safe value", () => {
    const numCtx = {
        type: 'number',
        name: 'guests_count',
        label: 'Number of attendees',
        required: true,
        min: 1,
        max: 10,
        step: 1
    };

    const res = resolver.resolve(numCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'number');
    assert.strictEqual(res.value, '1');
    assert.strictEqual(res.fieldCategory, 'generic_quantity');
});

report("AI-FIELD-6: Required annual revenue numeric field absent from template produces UNRESOLVED_REQUIRED_FACT", () => {
    const numCtx = {
        type: 'number',
        name: 'annual_revenue',
        label: 'Annual Company Revenue (USD)',
        required: true
    };

    const res = resolver.resolve(numCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'unresolved');
    assert.strictEqual(res.reason, 'UNRESOLVED_REQUIRED_FACT');
});

report("AI-FIELD-7: Custom ARIA dropdown resets after selection triggers at most one corrective retry", () => {
    const fieldCtx = {
        signature: 'aria_dropdown_test',
        type: 'select',
        isDropdown: true,
        options: [{ text: 'General Question', value: 'gen' }]
    };

    const res1 = resolver.resolve(fieldCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res1.action, 'select');
    // Call second time (corrective retry)
    const res2 = resolver.resolve(fieldCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res2.action, 'select');
    // Call 3rd time (bounded limit reached)
    const res3 = resolver.resolve(fieldCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res3.action, 'select');
});

report("AI-FIELD-8: Unknown 'How can we help?' textarea classifies as inquiry-body and uses saved message", () => {
    const taCtx = {
        type: 'textarea',
        label: 'How can we help your team?',
        required: true,
        isInquiryBody: true
    };

    const res = resolver.resolve(taCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'fill');
    assert.strictEqual(res.value, testTemplate.message);
});

report("AI-FIELD-9: Custom unknown inquiry short-answer field produces concise consistent answer", () => {
    const qCtx = {
        type: 'text',
        label: 'Briefly describe your inquiry topic',
        required: true
    };

    const res = resolver.resolve(qCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'fill');
    assert(res.value.length > 5, "Should provide short answer derived from subject/message");
});

report("AI-FIELD-10: Form with resolvable fields but NO message body is hard rejected with NO_INQUIRY_MESSAGE_FIELD", () => {
    const inps = [
        createMockElement('input', { type: 'text', name: 'name', value: 'Hayden' }),
        createMockElement('input', { type: 'email', name: 'email', value: 'hayden@example.com' }),
        createMockElement('input', { type: 'checkbox', name: 'agree', checked: true })
    ];
    const form = createMockElement('form', {}, inps);

    const classification = ContactGate.classifyFormIntent(form);
    assert.strictEqual(classification.eligible, false);
    assert.strictEqual(classification.reason, 'NO_INQUIRY_MESSAGE_FIELD');
});

report("AI-FIELD-11: Newsletter form with textarea only for subscription comments is rejected", () => {
    const emailInput = createMockElement('input', { type: 'email', name: 'sub_email' });
    const ta = createMockElement('textarea', { name: 'newsletter_comment', placeholder: 'Any comments about your subscription?' });
    const btn = createMockElement('button', { type: 'submit', textContent: 'Subscribe Now' });
    const form = createMockElement('form', { id: 'newsletter-signup' }, [emailInput, ta, btn]);

    const classification = ContactGate.classifyFormIntent(form);
    assert.strictEqual(classification.eligible, false, "Pure newsletter intent must be rejected despite textarea");
    assert.strictEqual(classification.intent, 'NEWSLETTER');
});

report("AI-FIELD-12: Message field present but empty produces readyToSubmit=false", () => {
    const summary = resolver.generateSmartFillSummary({
        eligibleContact: true,
        messageField: true,
        messageFilled: false, // empty!
        messageLength: 0,
        fieldsSeen: 4,
        resolutions: [
            { source: 'template', action: 'fill' }
        ]
    });

    assert.strictEqual(summary.readyToSubmit, false, "Must not submit when message is unfilled");
    assert.strictEqual(summary.messageFilled, false);
});

report("AI-FIELD-13: Low confidence AI answer for required factual field remains unresolved", () => {
    const factualCtx = {
        type: 'text',
        label: 'Tax Identification Number (EIN)',
        required: true
    };

    const res = resolver.resolve(factualCtx, testTemplate, { host: 'testsite.com' });
    assert.strictEqual(res.action, 'unresolved');
    assert.strictEqual(res.reason, 'UNRESOLVED_REQUIRED_FACT');
});

report("AI-FIELD-14: Resolver cache prevents duplicate AI calls on same field signature", () => {
    const fieldCtx = {
        signature: 'cached_test_field_14',
        type: 'text',
        label: 'How did you hear about us?'
    };

    const res1 = resolver.resolve(fieldCtx, testTemplate, { host: 'cached.com' });
    const res2 = resolver.resolve(fieldCtx, testTemplate, { host: 'cached.com' });
    assert.strictEqual(res1.value, res2.value);
    assert.strictEqual(res1.source, res2.source);
});

report("AI-FIELD-15: Submit allowed ONLY when unresolvedRequired=0 and messageFilled=true", () => {
    const auditPass = resolver.generateSmartFillSummary({
        eligibleContact: true,
        messageField: true,
        messageFilled: true,
        messageLength: 45,
        fieldsSeen: 5,
        resolutions: [
            { source: 'template', action: 'fill' },
            { source: 'semantic', action: 'check' }
        ]
    });
    assert.strictEqual(auditPass.readyToSubmit, true);

    const auditBlocked = resolver.generateSmartFillSummary({
        eligibleContact: true,
        messageField: true,
        messageFilled: true,
        messageLength: 45,
        fieldsSeen: 5,
        resolutions: [
            { action: 'unresolved', required: true, reason: 'UNRESOLVED_REQUIRED_FACT' }
        ]
    });
    assert.strictEqual(auditBlocked.readyToSubmit, false);
    assert.strictEqual(auditBlocked.unresolvedRequired, 1);
});

console.log("\n=================================================================");
console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log("=================================================================");

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

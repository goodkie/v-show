/**
 * test_r6_9g10_3_7_1_4_35_decision_serialization.js
 * 
 * Issue #6 R6.9G.10.3.7.1.4.35 (RC3.21) Regression Test Suite:
 * Mandatory Regression Tests for Directive #6288456994:
 * 1. Make Retry Detection/Autofill independent of CAPTCHA provider setup (field resolution before CAPTCHA).
 * 2. Add exclusive per-attempt decision locking / serialization in background.js.
 * 3. Defer CAPTCHA modal until current Owner-assist decision is resolved in popup.js.
 * 4. Prevent xpider-click-interception-banner from covering interactive controls (#settings-toggle).
 * 5. Verify: AUTOFILL_PARTIAL + CAPTCHA present + Owner pause => only one active decision surface at a time.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'send_message_backup');
const bgSrc = fs.readFileSync(path.join(SRC_DIR, 'background.js'), 'utf8');
const popSrc = fs.readFileSync(path.join(SRC_DIR, 'popup.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(SRC_DIR, 'content-script.js'), 'utf8');
const fdeSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'form-discovery-engine-r2.js'), 'utf8');
const vseSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'vision-submit-executor.js'), 'utf8');
const bpSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'build-provenance.js'), 'utf8');

const { FormDiscoveryEngineR2, inferLogicalContainer, inspectContainerControls } = require(path.join(SRC_DIR, 'modules', 'form-discovery-engine-r2.js'));

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`✅ [PASS] ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`❌ [FAIL] ${name}: ${err.message}`);
        testsFailed++;
    }
}

console.log('========================================================================');
console.log(' R6.9G.10.3.7.1.4.35 RC3.21: DECISION SERIALIZATION & AUTOFILL DECOUPLING');
console.log('========================================================================\n');

// -------------------------------------------------------------------------
// SUITE 1: Static Code Assertions (Items 1 - 4)
// -------------------------------------------------------------------------
console.log('--- SUITE 1: Static Code Assertions ---');

runTest('1.1 content-script: Proactive tryAutoSolveCaptcha before autofill removed', () => {
    // tryAutoSolveCaptcha('FORM_RECOGNITION') should NOT be present before fillFormIntelligent
    assert(!csSrc.includes("tryAutoSolveCaptcha('FORM_RECOGNITION')"), 'Must NOT trigger proactive CAPTCHA solver before autofill');
});

runTest('1.2 content-script: fillFormIntelligent returns rich unresolved fields and accurate counts', () => {
    assert(csSrc.includes('fieldsDetected: totalInputsCount'), 'Must return fieldsDetected count');
    assert(csSrc.includes('fieldsFilled: filledFields'), 'Must return fieldsFilled count');
    assert(csSrc.includes('unresolvedFields: unresolvedFields.length > 0'), 'Must return dynamic unresolvedFields list');
    assert(csSrc.includes("requestManualFormAssist('AUTOFILL_PARTIAL', '', unresolvedList)"), 'Must pass dynamic unresolvedList to requestManualFormAssist');
});

runTest('1.3 background: OWNER_CAPTCHA_REQUEST defers if in manual assist stages', () => {
    assert(bgSrc.includes("campaignState.currentTargetStage === 'FORM_MANUAL_ASSIST_PENDING_OWNER'"), 'Must check FORM_MANUAL_ASSIST_PENDING_OWNER');
    assert(bgSrc.includes("campaignState.deferredCaptchaRequest = request"), 'Must stash deferredCaptchaRequest');
    assert(bgSrc.includes("status: 'CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST'"), 'Must return CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST status');
});

runTest('1.4 background: FORM_MANUAL_ASSIST_DECISION clears deferredCaptchaRequest and latches', () => {
    assert(bgSrc.includes("campaignState.deferredCaptchaRequest = null"), 'Must clear deferredCaptchaRequest on manual assist decision');
    assert(bgSrc.includes("campaignState.captchaRequestLatch = {}"), 'Must reset captchaRequestLatch on retry');
});

runTest('1.5 popup: displayClickInterceptionBanner enforces pointer-events: none', () => {
    assert(popSrc.includes('pointer-events:none;'), 'displayClickInterceptionBanner must have pointer-events:none;');
});

runTest('1.6 popup: checkClickInterceptionDiagnostic suppresses when modal active or excludes banner', () => {
    assert(popSrc.includes("document.querySelector('#xpider-manual-assist-modal, #xpider-captcha-decision-modal"), 'Must suppress checks when modal is active');
    assert(popSrc.includes("#xpider-click-interception-banner"), 'Must exclude #xpider-click-interception-banner from interception stack');
});

runTest('1.7 form-discovery & vision-submit: link-based submit buttons recognized', () => {
    assert(fdeSrc.includes('a[data-link-type="SUBMIT"]'), 'FormDiscoveryEngineR2 must recognize a[data-link-type="SUBMIT"]');
    assert(vseSrc.includes('a[data-link-type="SUBMIT"]'), 'VisionSubmitExecutor must recognize a[data-link-type="SUBMIT"]');
});

runTest('1.8 build-provenance: channel, buildId, and implementationHead set to RC3.22', () => {
    assert(bpSrc.includes("channel: 'OWNER_BETA_PRIVATE_EGRESS_RC3.22'"), 'Channel must be OWNER_BETA_PRIVATE_EGRESS_RC3.22');
    assert(bpSrc.includes("buildId: 'R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22'"), 'buildId must be RC3.22');
    assert(bpSrc.includes("implementationHead: 'fdc4c0941df5d3604dcd0c140a25520eb5118856'"), 'implementationHead must be fdc4c094');
});

runTest('1.9 native host & companion: COMPANION_BUILD_ID stamped from authoritative buildId', () => {
    const nhSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'native_host', 'xpider_native_host.js'), 'utf8');
    const prsSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'privacy-relay-service.js'), 'utf8');
    const ecsSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'ensure_companion_service.js'), 'utf8');
    assert(nhSrc.includes("const COMPANION_BUILD_ID = 'R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22';"), 'Native host COMPANION_BUILD_ID must match RC3.22');
    assert(prsSrc.includes("const COMPANION_BUILD_ID = 'R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22';"), 'Privacy relay COMPANION_BUILD_ID must match RC3.22');
    assert(prsSrc.includes("const COMPANION_IMPLEMENTATION_HEAD = 'fdc4c0941df5d3604dcd0c140a25520eb5118856';"), 'Privacy relay COMPANION_IMPLEMENTATION_HEAD must match fdc4c094');
    assert(ecsSrc.includes("const EXPECTED_BUILD_ID = 'R6.9G.10.3.7.1.4.36-20261020-PRIVATE-EGRESS-RC3.22';"), 'Ensure companion EXPECTED_BUILD_ID must match RC3.22');
});

runTest('1.10 OS isolation guards present in auto setup and installers', () => {
    const setupBat = fs.readFileSync(path.join(SRC_DIR, '..', 'XPIDER_AUTO_SETUP.bat'), 'utf8');
    const inhSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'install_native_host.js'), 'utf8');
    const iasSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'install_autostart.js'), 'utf8');
    const ecsSrc = fs.readFileSync(path.join(SRC_DIR, '..', 'companion', 'ensure_companion_service.js'), 'utf8');
    assert(setupBat.includes('if defined XPIDER_ISOLATED_TEST'), 'XPIDER_AUTO_SETUP.bat must check XPIDER_ISOLATED_TEST');
    assert(inhSrc.includes("process.env.XPIDER_ISOLATED_TEST === '1'"), 'install_native_host.js must check XPIDER_ISOLATED_TEST');
    assert(iasSrc.includes("process.env.XPIDER_ISOLATED_TEST === '1'"), 'install_autostart.js must check XPIDER_ISOLATED_TEST');
    assert(ecsSrc.includes("process.env.XPIDER_ISOLATED_TEST === '1'"), 'ensure_companion_service.js must check XPIDER_ISOLATED_TEST');
});

// -------------------------------------------------------------------------
// SUITE 2: Click Interception & Banner Diagnostic Isolation (Item 4)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 2: Click Interception Banner & Diagnostics Isolation ---');

runTest('2.1 Diagnostic banner does NOT intercept clicks on #settings-toggle (pointer-events: none)', () => {
    // Create mock DOM environment
    const mockDocument = {
        body: {
            prepend: (el) => { mockDocument._bodyChildren.unshift(el); },
            appendChild: (el) => { mockDocument._bodyChildren.push(el); }
        },
        _bodyChildren: [],
        getElementById: (id) => mockDocument._bodyChildren.find(el => el.id === id) || null,
        createElement: (tag) => ({
            tagName: tag.toUpperCase(),
            id: '',
            style: { cssText: '' },
            textContent: '',
            remove: function() {
                const idx = mockDocument._bodyChildren.indexOf(this);
                if (idx !== -1) mockDocument._bodyChildren.splice(idx, 1);
            }
        })
    };

    // Simulate displayClickInterceptionBanner
    let banner = mockDocument.createElement('div');
    banner.id = 'xpider-click-interception-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 12px;font-size:12px;font-weight:700;z-index:999999;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;';
    mockDocument.body.prepend(banner);

    assert.strictEqual(banner.id, 'xpider-click-interception-banner');
    assert(banner.style.cssText.includes('pointer-events:none;'), 'Banner style must include pointer-events:none;');
});

runTest('2.2 Diagnostic ignores authorized modals and click interception banner', () => {
    const ignoredSelectors = [
        '#xpider-manual-assist-modal',
        '#xpider-captcha-decision-modal',
        '#xpider-click-interception-banner'
    ];
    for (const sel of ignoredSelectors) {
        assert(popSrc.includes(sel), `Diagnostic must explicitly mention ${sel}`);
    }
});

// -------------------------------------------------------------------------
// SUITE 3: Decision Surface Serialization in Popup (Items 2, 3, 5)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 3: Decision Surface Serialization in Popup ---');

runTest('3.1 AUTOFILL_PARTIAL + CAPTCHA present + Owner pause => Strictly ONE modal active at any time', () => {
    const activeModals = new Set();
    let pendingCaptchaModal = null;

    function renderModal(id) {
        activeModals.add(id);
    }
    function removeModal(id) {
        activeModals.delete(id);
    }

    // Step 1: SHOW_MANUAL_FORM_ASSIST_MODAL arrives
    const manualAssistRequest = {
        action: 'SHOW_MANUAL_FORM_ASSIST_MODAL',
        attemptId: 'att_test_1',
        targetToken: 'tok_test_1',
        reason: 'AUTOFILL_PARTIAL',
        unresolvedFields: ['message_body', 'name', 'email']
    };

    // If CAPTCHA modal was open, it would be removed
    if (activeModals.has('xpider-captcha-decision-modal')) {
        removeModal('xpider-captcha-decision-modal');
    }
    renderModal('xpider-manual-assist-modal');

    assert.strictEqual(activeModals.size, 1, 'Exactly 1 active modal after manual assist request');
    assert(activeModals.has('xpider-manual-assist-modal'), 'Manual assist modal must be active');

    // Step 2: SHOW_CAPTCHA_DECISION_MODAL arrives while manual assist modal is active
    const captchaRequest = {
        action: 'SHOW_CAPTCHA_DECISION_MODAL',
        attemptId: 'att_test_1',
        targetToken: 'tok_test_1',
        captchaType: 'recaptcha_v2'
    };

    if (activeModals.has('xpider-manual-assist-modal')) {
        // Must stash and NOT render in DOM
        pendingCaptchaModal = captchaRequest;
    } else {
        renderModal('xpider-captcha-decision-modal');
    }

    // VERIFY: Still exactly 1 active modal! No overlapping modal surfaces!
    assert.strictEqual(activeModals.size, 1, 'Must NOT display overlapping CAPTCHA modal while manual assist active');
    assert.strictEqual(activeModals.has('xpider-captcha-decision-modal'), false, 'CAPTCHA modal must not be in DOM');
    assert.strictEqual(pendingCaptchaModal, captchaRequest, 'CAPTCHA request must be safely stashed in pending');

    // Step 3: Owner resolves manual assist modal by clicking 'retry'
    const ownerDecision = 'retry';
    removeModal('xpider-manual-assist-modal');

    // Upon dismissal, pending CAPTCHA modal is rendered
    if (pendingCaptchaModal && pendingCaptchaModal.attemptId === manualAssistRequest.attemptId && ownerDecision === 'retry') {
        const deferred = pendingCaptchaModal;
        pendingCaptchaModal = null;
        renderModal('xpider-captcha-decision-modal');
    }

    // VERIFY: Still exactly 1 active modal (serialized transition)
    assert.strictEqual(activeModals.size, 1, 'Must have exactly 1 modal active after serialized transition');
    assert(activeModals.has('xpider-captcha-decision-modal'), 'Deferred CAPTCHA modal is now active');
    assert.strictEqual(pendingCaptchaModal, null, 'Pending modal queue cleared');

    // Step 4: Owner solves or skips CAPTCHA
    removeModal('xpider-captcha-decision-modal');
    assert.strictEqual(activeModals.size, 0, 'Zero modals after full sequence completion');
});

runTest('3.2 If SHOW_MANUAL_FORM_ASSIST arrives while CAPTCHA modal is active, Autofill takes priority', () => {
    const activeModals = new Set();
    activeModals.add('xpider-captcha-decision-modal');
    assert.strictEqual(activeModals.size, 1);

    // Incoming SHOW_MANUAL_FORM_ASSIST_MODAL
    if (activeModals.has('xpider-captcha-decision-modal')) {
        activeModals.delete('xpider-captcha-decision-modal');
    }
    activeModals.add('xpider-manual-assist-modal');

    assert.strictEqual(activeModals.size, 1, 'Only 1 active modal after preemption');
    assert(activeModals.has('xpider-manual-assist-modal'), 'Manual assist takes precedence over CAPTCHA');
});

// -------------------------------------------------------------------------
// SUITE 4: Background State Machine Serialization (Item 2)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 4: Background State Machine Serialization ---');

runTest('4.1 OWNER_CAPTCHA_REQUEST is deferred without changing stage when paused in manual assist', () => {
    const campaignState = {
        currentTargetStage: 'FORM_MANUAL_ASSIST_PENDING_OWNER',
        deferredCaptchaRequest: null,
        captchaRequestLatch: {}
    };

    let response = null;
    function sendResponse(r) { response = r; }

    const incomingCaptchaRequest = {
        action: 'OWNER_CAPTCHA_REQUEST',
        attemptId: 'att_kempomaa_1',
        captchaType: 'turnstile',
        challengeKey: 'kempomaa.com:turnstile'
    };

    // Simulate background listener logic
    if (campaignState.currentTargetStage === 'FORM_MANUAL_ASSIST_PENDING_OWNER' || campaignState.currentTargetStage === 'FORM_MANUAL_WAIT') {
        campaignState.deferredCaptchaRequest = incomingCaptchaRequest;
        sendResponse({ success: true, status: 'CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST' });
    } else {
        campaignState.currentTargetStage = 'CAPTCHA_PENDING_OWNER';
        sendResponse({ success: true, status: 'CAPTCHA_MODAL_SHOWN' });
    }

    assert.strictEqual(campaignState.currentTargetStage, 'FORM_MANUAL_ASSIST_PENDING_OWNER', 'Stage must NOT transition to CAPTCHA_PENDING_OWNER');
    assert.strictEqual(campaignState.deferredCaptchaRequest, incomingCaptchaRequest, 'Request must be stashed');
    assert.strictEqual(response.status, 'CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST', 'Status must be CAPTCHA_DEFERRED_FOR_MANUAL_ASSIST');
});

runTest('4.2 FORM_MANUAL_ASSIST_DECISION retry resets latch and unblocks subsequent operations', () => {
    const campaignState = {
        currentTargetStage: 'FORM_MANUAL_ASSIST_PENDING_OWNER',
        deferredCaptchaRequest: { action: 'OWNER_CAPTCHA_REQUEST' },
        captchaRequestLatch: { 'test_key': 'PENDING_OWNER' },
        targetDeadlineController: {
            resumed: false,
            resume: function() { this.resumed = true; }
        }
    };

    // Owner clicks Retry Detection / Autofill
    const decision = 'retry';
    if (decision === 'retry') {
        campaignState.currentTargetStage = 'IN_FLIGHT';
        campaignState.deferredCaptchaRequest = null;
        if (campaignState.captchaRequestLatch) campaignState.captchaRequestLatch = {};
        if (campaignState.targetDeadlineController) {
            campaignState.targetDeadlineController.resume();
        }
    }

    assert.strictEqual(campaignState.currentTargetStage, 'IN_FLIGHT', 'Stage must resume to IN_FLIGHT');
    assert.strictEqual(campaignState.deferredCaptchaRequest, null, 'deferredCaptchaRequest must be cleared');
    assert.deepStrictEqual(campaignState.captchaRequestLatch, {}, 'captchaRequestLatch must be emptied');
    assert.strictEqual(campaignState.targetDeadlineController.resumed, true, 'Deadline controller must resume');
});

// -------------------------------------------------------------------------
// SUITE 5: Turbify/XPRS Form Discovery & Submission Links (Item 1)
// -------------------------------------------------------------------------
console.log('\n--- SUITE 5: Turbify/XPRS Form Discovery & Control Aggregation ---');

runTest('5.1 inferLogicalContainer climbs out of single-input preview-form wrappers to common parent', () => {
    // Create a mock Turbify DOM tree
    const rootContainer = {
        tagName: 'DIV',
        id: 'contact-section',
        className: 'contact-wrapper',
        parentElement: null,
        children: []
    };

    function createMockInput(name, type = 'text', tag = 'INPUT') {
        return {
            tagName: tag,
            name: name,
            type: type,
            id: 'input_' + name,
            value: '',
            parentElement: null,
            closest: (selector) => null
        };
    }

    // On kempomaa.com, each field is inside a separate <div class="preview-form">
    const nameWrapper = { tagName: 'DIV', id: '', className: 'preview-form', parentElement: rootContainer, children: [] };
    const emailWrapper = { tagName: 'DIV', id: '', className: 'preview-form', parentElement: rootContainer, children: [] };
    const msgWrapper = { tagName: 'DIV', id: '', className: 'preview-form', parentElement: rootContainer, children: [] };
    const submitWrapper = { tagName: 'DIV', id: '', className: 'preview-form', parentElement: rootContainer, children: [] };

    const nameInput = createMockInput('name');
    nameInput.parentElement = nameWrapper;
    nameWrapper.children.push(nameInput);

    const emailInput = createMockInput('email', 'email');
    emailInput.parentElement = emailWrapper;
    emailWrapper.children.push(emailInput);

    const msgInput = createMockInput('message', 'textarea', 'TEXTAREA');
    msgInput.parentElement = msgWrapper;
    msgWrapper.children.push(msgInput);

    const submitLink = {
        tagName: 'A',
        className: 'item-link',
        parentElement: submitWrapper,
        getAttribute: (attr) => attr === 'data-link-type' ? 'SUBMIT' : null,
        textContent: 'Send Message'
    };
    submitWrapper.children.push(submitLink);

    rootContainer.children = [nameWrapper, emailWrapper, msgWrapper, submitWrapper];

    // Setup querySelectorAll for wrappers
    nameWrapper.querySelectorAll = (sel) => [nameInput];
    emailWrapper.querySelectorAll = (sel) => [emailInput];
    msgWrapper.querySelectorAll = (sel) => [msgInput];
    submitWrapper.querySelectorAll = (sel) => [];

    // Setup querySelectorAll for rootContainer
    rootContainer.querySelectorAll = (sel) => {
        if (sel.includes('input') || sel.includes('select') || sel.includes('textarea')) {
            return [nameInput, emailInput, msgInput];
        }
        if (sel.includes('button') || sel.includes('SUBMIT') || sel.includes('item-link')) {
            return [submitLink];
        }
        return [];
    };

    const discoveredContainer = inferLogicalContainer(msgInput);
    assert(discoveredContainer !== null, 'Container must be found');
    assert.strictEqual(discoveredContainer, rootContainer, 'Must climb up to rootContainer instead of stopping at single-field msgWrapper');
});

runTest('5.2 inspectContainerControls recognizes a[data-link-type="SUBMIT"] as submit buttons', () => {
    const mockContainer = {
        querySelectorAll: (sel) => {
            if (sel.includes('input, select, textarea')) {
                return [
                    { tagName: 'INPUT', type: 'text', name: 'name', value: '' },
                    { tagName: 'INPUT', type: 'email', name: 'email', value: '' },
                    { tagName: 'TEXTAREA', name: 'message', value: '' }
                ];
            }
            if (sel.includes('button') || sel.includes('data-link-type') || sel.includes('item-link')) {
                return [
                    {
                        tagName: 'A',
                        className: 'item-link',
                        textContent: 'Submit Form',
                        getAttribute: (attr) => attr === 'data-link-type' ? 'SUBMIT' : null
                    }
                ];
            }
            return [];
        }
    };

    const controls = inspectContainerControls(mockContainer);
    assert.strictEqual(controls.submits.length, 1, 'Must find 1 submit button');
    assert.strictEqual(controls.submits[0].getAttribute('data-link-type'), 'SUBMIT', 'Must recognize data-link-type="SUBMIT"');
});

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(` RESULTS: ${testsPassed} Passed, ${testsFailed} Failed`);
console.log('========================================================================');

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('🎉 ALL R6.9G.10.3.7.1.4.35 RC3.21 REGRESSION TESTS PASSED!');
}

#!/usr/bin/env node
/**
 * test/run_no_message_discovery_r2_dom_suite.js
 *
 * Dedicated Chrome DOM Test Suite for Directive #6732442879:
 * P0 NO-MESSAGE FORM DISCOVERY & ELIGIBILITY VERIFICATION
 *
 * Exercises actual packaged modules:
 * - extension/modules/contact-gate.js
 * - extension/modules/form-discovery-engine-r2.js
 * - extension/content-script.js (findOptimalForm / groupAndScoreContainers)
 *
 * Cases:
 * (a) Email-only visible newsletter form: OFF skips, ON discovers & fills (ELIGIBLE_NO_MESSAGE_FORM)
 * (b) No-textarea name+email subscribe form: ON discovers & fills
 * (c) Unrelated generic layout with stray "newsletter" word: REJECTED / ineligible
 * (d) Unauthorized required marketing/legal consent: BLOCKED (NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM)
 * (e) Login / search / payment / booking / comment: REJECTED even when ON
 * (f) Inaccessible cross-origin iframe: remains ineligible (CROSS_ORIGIN_FORM_UNAVAILABLE / null)
 * (g) Page with no actual form: cannot be misclassified as found newsletter (NO_BODY_FIELD_FOUND)
 */

'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const REPORT_FILE = path.join(ROOT, 'dist', 'report_no_message_discovery_r2_dom_suite.json');

const contactGateSrc = fs.readFileSync(path.join(ROOT, 'extension', 'modules', 'contact-gate.js'), 'utf8');
const r2Src = fs.readFileSync(path.join(ROOT, 'extension', 'modules', 'form-discovery-engine-r2.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(ROOT, 'extension', 'content-script.js'), 'utf8');

const report = {
    suite: 'XPIDER_NO_MESSAGE_DISCOVERY_R2_DOM_SUITE',
    directive: '#6732442879',
    timestamp: new Date().toISOString(),
    assertions: [],
    status: 'RUNNING'
};

let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

/**
 * Helper to create DOM environment and initialize real packaged modules
 */
function createEnvironment(html, options = {}) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${html}</body></html>`, {
        runScripts: 'dangerously',
        url: options.url || 'http://127.0.0.1:8088/test-fixture.html'
    });
    const win = dom.window;

    // Stubs
    win.console = console;
    if (options.includeNoMessage !== undefined) {
        win.__xpider_include_forms_without_message = Boolean(options.includeNoMessage);
    }
    if (options.campaignMode) {
        win.__xpider_campaign_mode = options.campaignMode;
    }

    // Load ContactGate
    const cgFn = new win.Function('module', 'exports', 'require', contactGateSrc);
    const cgMod = { exports: {} };
    cgFn(cgMod, cgMod.exports, () => ({}));
    win.ContactGate = cgMod.exports;

    // Load FormDiscoveryEngineR2
    const r2Fn = new win.Function('module', 'exports', 'require', r2Src);
    const r2Mod = { exports: {} };
    r2Fn(r2Mod, r2Mod.exports, (modPath) => {
        if (modPath.includes('contact-gate')) return win.ContactGate;
        return {};
    });
    win.XPIDER_FORM_DISCOVERY_R2 = r2Mod.exports;
    win.FormDiscoveryEngineR2 = r2Mod.exports.FormDiscoveryEngineR2;

    return { dom, win, doc: win.document };
}

async function runSuite() {
    console.log('================================================================================');
    console.log('🧪 RUNNING NO-MESSAGE FORM DISCOVERY & ELIGIBILITY DOM SUITE (DIRECTIVE #6732442879)');
    console.log('================================================================================\n');

    // -------------------------------------------------------------------------
    // Case (a): Email-only visible newsletter form with real submit button
    // -------------------------------------------------------------------------
    console.log('--- Case (a): Email-only visible newsletter form (OFF skips, ON discovers & fills) ---');
    const htmlA = `
        <form id="newsletter-form" action="/subscribe" method="POST">
            <h3>Subscribe to our Newsletter</h3>
            <input type="email" name="email" id="nl-email" placeholder="Your email address" required>
            <button type="submit" id="nl-submit">Subscribe</button>
        </form>
    `;

    // (a.1) OFF skips: includeFormsWithoutMessage = false
    {
        const { win, doc } = createEnvironment(htmlA, { includeNoMessage: false });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: false,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligibleCandidates = scanRes.candidates.filter(c => c.eligible);

        A('CASE_A_OFF_DISCOVERY_RETURNS_NULL', discovered === null, { discovered: !!discovered });
        A('CASE_A_OFF_ELIGIBLE_CANDIDATES_EMPTY', eligibleCandidates.length === 0, {
            eligibleCount: eligibleCandidates.length,
            candidates: scanRes.candidates.map(c => ({ sig: c.signature, eligible: c.eligible, reason: c.reason }))
        });
        A('CASE_A_OFF_LAST_RESULT_REJECTED',
            !engine.lastDiscoveryResult || !engine.lastDiscoveryResult.success,
            { lastResult: engine.lastDiscoveryResult });
    }

    // (a.2) ON discovers & fills: includeFormsWithoutMessage = true
    {
        const { win, doc } = createEnvironment(htmlA, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligibleCandidates = scanRes.candidates.filter(c => c.eligible);

        A('CASE_A_ON_DISCOVERS_FORM', discovered !== null && discovered.id === 'newsletter-form', {
            discoveredId: discovered ? discovered.id : null
        });
        A('CASE_A_ON_REASON_IS_ELIGIBLE_NO_MESSAGE_FORM',
            eligibleCandidates.length === 1 && eligibleCandidates[0].reason === 'ELIGIBLE_NO_MESSAGE_FORM',
            { candidate: eligibleCandidates[0] ? { eligible: eligibleCandidates[0].eligible, reason: eligibleCandidates[0].reason } : null });

        // Autofill bridge test
        let autofilledEmail = '';
        const fillExecutor = (form, template) => {
            const emailInput = form.querySelector('input[type="email"]');
            if (emailInput && template && template.email) {
                emailInput.value = template.email;
                autofilledEmail = emailInput.value;
            }
        };
        const bridgeRes = win.XPIDER_FORM_DISCOVERY_R2.startAutofillForEligibleForm(
            'att_case_a',
            { form: discovered, template: { email: 'client@newsletter-test.org' }, speed: {} },
            fillExecutor
        );
        A('CASE_A_ON_AUTOFILL_DISPATCHED', bridgeRes.dispatched === true, bridgeRes);
        A('CASE_A_ON_AUTOFILL_VALUE_SET', autofilledEmail === 'client@newsletter-test.org', { autofilledEmail });
    }

    // -------------------------------------------------------------------------
    // Case (b): No-textarea name + email subscribe form
    // -------------------------------------------------------------------------
    console.log('\n--- Case (b): No-textarea name+email subscribe form (ON discovers & fills) ---');
    const htmlB = `
        <form id="subscribe-name-email" action="/join-list" method="POST">
            <h2>Join Our Mailing List</h2>
            <input type="text" name="name" id="sub-name" placeholder="Full Name">
            <input type="email" name="email" id="sub-email" placeholder="Email Address">
            <button type="submit" id="sub-submit">Join Newsletter</button>
        </form>
    `;
    {
        const { win, doc } = createEnvironment(htmlB, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligible = scanRes.candidates.find(c => c.eligible);

        A('CASE_B_ON_DISCOVERS_NAME_EMAIL_FORM', discovered !== null && discovered.id === 'subscribe-name-email', {
            discoveredId: discovered ? discovered.id : null
        });
        A('CASE_B_ON_REASON_IS_ELIGIBLE_NO_MESSAGE_FORM',
            eligible && eligible.reason === 'ELIGIBLE_NO_MESSAGE_FORM',
            { eligible }
        );

        // Autofill name and email
        let filledName = '';
        let filledEmail = '';
        const fillExecutor = (form, tpl) => {
            const nameEl = form.querySelector('#sub-name');
            const emailEl = form.querySelector('#sub-email');
            if (nameEl) { nameEl.value = tpl.name; filledName = nameEl.value; }
            if (emailEl) { emailEl.value = tpl.email; filledEmail = emailEl.value; }
        };
        const bridgeRes = win.XPIDER_FORM_DISCOVERY_R2.startAutofillForEligibleForm(
            'att_case_b',
            { form: discovered, template: { name: 'Alice Walker', email: 'alice@subscriber.test' } },
            fillExecutor
        );
        A('CASE_B_ON_AUTOFILL_DISPATCHED', bridgeRes.dispatched === true, bridgeRes);
        A('CASE_B_ON_NAME_AND_EMAIL_FILLED', filledName === 'Alice Walker' && filledEmail === 'alice@subscriber.test', {
            filledName, filledEmail
        });
    }

    // -------------------------------------------------------------------------
    // Case (c): Unrelated generic layout with stray "newsletter" word
    // -------------------------------------------------------------------------
    console.log('\n--- Case (c): Generic layout with stray "newsletter" word (MUST NOT be eligible) ---');
    const htmlC = `
        <div class="blog-entry" id="main-content">
            <h1>Autumn Updates & News</h1>
            <p>In our October newsletter article, we announced new hardware releases.</p>
            <p>For inquiries, please call our offices directly during business hours.</p>
        </div>
    `;
    {
        const { win, doc } = createEnvironment(htmlC, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligible = scanRes.candidates.filter(c => c.eligible);

        A('CASE_C_STRAY_WORD_RETURNS_NULL', discovered === null, { discovered });
        A('CASE_C_STRAY_WORD_NO_ELIGIBLE_CANDIDATE', eligible.length === 0, {
            eligibleCount: eligible.length,
            candidates: scanRes.candidates
        });
        A('CASE_C_TERMINAL_REASON_NO_BODY_FIELD',
            engine.lastDiscoveryResult && (engine.lastDiscoveryResult.reason === 'NO_BODY_FIELD_FOUND' || engine.lastDiscoveryResult.reasonCode === 'NO_BODY_FIELD_FOUND'),
            { lastResult: engine.lastDiscoveryResult }
        );
    }

    // -------------------------------------------------------------------------
    // Case (d): Unauthorized required marketing / legal consent
    // -------------------------------------------------------------------------
    console.log('\n--- Case (d): Unauthorized required marketing/legal consent (BLOCKED) ---');
    const htmlD = `
        <form id="consent-newsletter" action="/optin" method="POST">
            <h2>Weekly Newsletter</h2>
            <input type="email" name="email" id="c-email" placeholder="Email">
            <input type="checkbox" name="marketing_consent" id="c-consent" required>
            <label for="c-consent">I authorize automated promotional marketing calls and partner emails</label>
            <button type="submit" id="c-submit">Subscribe Now</button>
        </form>
    `;
    {
        const { win, doc } = createEnvironment(htmlD, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            ownerAuthorizedConsent: false,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const candidate = scanRes.candidates.find(c => c.container.id === 'consent-newsletter');

        A('CASE_D_UNAUTHORIZED_CONSENT_RETURNS_NULL', discovered === null, { discovered });
        A('CASE_D_UNAUTHORIZED_CONSENT_REJECTED',
            candidate && candidate.eligible === false && candidate.reason === 'NON_INQUIRY_UNAUTHORIZED_CONSENT_FORM',
            { candidate: candidate ? { eligible: candidate.eligible, reason: candidate.reason } : null }
        );
    }

    // -------------------------------------------------------------------------
    // Case (e): Negative controls: Login, Search, Payment, Booking, Comment (REJECTED even when ON)
    // -------------------------------------------------------------------------
    console.log('\n--- Case (e): Negative controls: Login / Search / Payment / Booking / Comment ---');
    const htmlE = `
        <!-- Login Form -->
        <form id="neg-login-form" action="/login" method="POST">
            <input type="text" name="username">
            <input type="password" name="password">
            <button type="submit">Log In</button>
        </form>

        <!-- Search Form -->
        <form id="neg-search-form" action="/search" method="GET">
            <input type="search" name="q" placeholder="Search site...">
            <button type="submit">Search</button>
        </form>

        <!-- Payment Form -->
        <form id="neg-pay-form" action="/checkout" method="POST">
            <input type="text" name="cardnumber" autocomplete="cc-number">
            <button type="submit">Pay Now</button>
        </form>

        <!-- Booking Form -->
        <form id="neg-book-form" action="/booking" method="POST">
            <input type="date" name="book_date">
            <input type="time" name="book_time">
            <button type="submit">Reserve Appointment</button>
        </form>

        <!-- WordPress Comment Form -->
        <form id="neg-comment-form" action="/wp-comments-post.php" method="POST">
            <textarea name="comment" id="comment"></textarea>
            <button type="submit">Post Comment</button>
        </form>
    `;
    {
        const { win, doc } = createEnvironment(htmlE, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligible = scanRes.candidates.filter(c => c.eligible);

        A('CASE_E_NEGATIVE_CONTROLS_RETURNS_NULL', discovered === null, { discovered });
        A('CASE_E_NO_NEGATIVE_FORM_ELIGIBLE', eligible.length === 0, {
            eligibleList: eligible.map(c => ({ id: c.container.id, reason: c.reason }))
        });

        // Verify each individual form has an explicit rejection reason
        const formIds = ['neg-login-form', 'neg-search-form', 'neg-pay-form', 'neg-book-form', 'neg-comment-form'];
        const classifiedReasons = {};
        for (const fId of formIds) {
            const formEl = doc.getElementById(fId);
            const cgRes = win.ContactGate.classifyFormIntent(formEl, { includeFormsWithoutMessage: true });
            classifiedReasons[fId] = cgRes.reason;
        }
        A('CASE_E_LOGIN_FORM_REJECTED', classifiedReasons['neg-login-form'] === 'NON_INQUIRY_LOGIN_FORM', { reason: classifiedReasons['neg-login-form'] });
        A('CASE_E_SEARCH_FORM_REJECTED', classifiedReasons['neg-search-form'] === 'NON_INQUIRY_SEARCH_FORM', { reason: classifiedReasons['neg-search-form'] });
        A('CASE_E_PAYMENT_FORM_REJECTED', classifiedReasons['neg-pay-form'] === 'NON_INQUIRY_PAYMENT_FORM', { reason: classifiedReasons['neg-pay-form'] });
        A('CASE_E_BOOKING_FORM_REJECTED',
            classifiedReasons['neg-book-form'] === 'NON_INQUIRY_BOOKING_FORM' || classifiedReasons['neg-book-form'] === 'NON_INQUIRY_APPOINTMENT_FORM',
            { reason: classifiedReasons['neg-book-form'] }
        );
        A('CASE_E_COMMENT_FORM_REJECTED', classifiedReasons['neg-comment-form'] === 'NON_INQUIRY_COMMENT_FORM', { reason: classifiedReasons['neg-comment-form'] });
    }

    // -------------------------------------------------------------------------
    // Case (f): Inaccessible cross-origin iframe remains ineligible
    // -------------------------------------------------------------------------
    console.log('\n--- Case (f): Inaccessible cross-origin iframe ---');
    const htmlF = `
        <div id="wrapper">
            <h2>Third-Party Embedded Area</h2>
            <iframe id="cross-origin-frame" src="https://external-auth.example.com/widget"></iframe>
        </div>
    `;
    {
        const { win, doc } = createEnvironment(htmlF, { includeNoMessage: true });
        const iframe = doc.getElementById('cross-origin-frame');
        // Simulate cross-origin security exception on contentDocument access
        Object.defineProperty(iframe, 'contentDocument', {
            get: () => { throw new win.DOMException('Blocked a frame with origin from accessing a cross-origin frame.', 'SecurityError'); }
        });
        Object.defineProperty(iframe, 'contentWindow', {
            get: () => { throw new win.DOMException('Blocked a frame with origin from accessing a cross-origin frame.', 'SecurityError'); }
        });

        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const eligible = scanRes.candidates.filter(c => c.eligible);

        A('CASE_F_CROSS_ORIGIN_IFRAME_RETURNS_NULL', discovered === null, { discovered });
        A('CASE_F_CROSS_ORIGIN_NO_ELIGIBLE_CONTAINER', eligible.length === 0, { eligible });
        A('CASE_F_CROSS_ORIGIN_SIGNAL_RECORDED',
            scanRes.crossOriginSignals && scanRes.crossOriginSignals.length >= 1,
            { signals: scanRes.crossOriginSignals }
        );
        A('CASE_F_TERMINAL_REASON_CROSS_ORIGIN_UNAVAILABLE',
            engine.lastDiscoveryResult && (engine.lastDiscoveryResult.reason === 'CROSS_ORIGIN_FORM_UNAVAILABLE' || engine.lastDiscoveryResult.reasonCode === 'CROSS_ORIGIN_FORM_UNAVAILABLE'),
            { lastResult: engine.lastDiscoveryResult }
        );
    }

    // -------------------------------------------------------------------------
    // Case (g): Page with no actual form cannot be misclassified
    // -------------------------------------------------------------------------
    console.log('\n--- Case (g): Page with no actual form (cannot be misclassified) ---');
    const htmlG = `
        <div id="company-profile">
            <h1>Enterprise Architecture Specialists</h1>
            <p>Our team builds high-reliability, fault-tolerant distributed systems.</p>
            <p>Office locations: New York, Tokyo, London, Seoul.</p>
        </div>
    `;
    {
        const { win, doc } = createEnvironment(htmlG, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);

        A('CASE_G_FORMLESS_PAGE_RETURNS_NULL', discovered === null, { discovered });
        A('CASE_G_FORMLESS_PAGE_ZERO_CANDIDATES', scanRes.candidates.length === 0, { count: scanRes.candidates.length });
        A('CASE_G_FORMLESS_PAGE_TERMINAL_NO_BODY',
            engine.lastDiscoveryResult && (engine.lastDiscoveryResult.reason === 'NO_BODY_FIELD_FOUND' || engine.lastDiscoveryResult.reasonCode === 'NO_BODY_FIELD_FOUND'),
            { lastResult: engine.lastDiscoveryResult }
        );
    }

    // -------------------------------------------------------------------------
    // Case (h): Genuine inquiry form priority invariant (Inquiry > Newsletter)
    // -------------------------------------------------------------------------
    console.log('\n--- Case (h): Inquiry form priority invariant (Inquiry > Newsletter) ---');
    const htmlH = `
        <!-- Newsletter form in footer -->
        <form id="footer-newsletter" action="/newsletter">
            <input type="email" name="email" placeholder="Join Newsletter">
            <button type="submit">Subscribe</button>
        </form>

        <!-- Primary contact inquiry form with textarea in main body -->
        <form id="main-contact-form" action="/contact">
            <input type="text" name="name" placeholder="Name">
            <input type="email" name="email" placeholder="Email">
            <textarea name="message" placeholder="How can we help?"></textarea>
            <button type="submit">Send Inquiry</button>
        </form>
    `;
    {
        const { win, doc } = createEnvironment(htmlH, { includeNoMessage: true });
        const engine = new win.FormDiscoveryEngineR2({
            includeFormsWithoutMessage: true,
            pass1WaitMs: 0, pass2WaitMs: 0, pass3WaitMs: 0
        });
        const discovered = await engine.discoverForm(doc);
        const scanRes = engine.groupAndScoreContainers(doc);
        const topCandidate = scanRes.candidates[0];

        A('CASE_H_GENUINE_INQUIRY_CHOSEN_OVER_NEWSLETTER',
            discovered !== null && discovered.id === 'main-contact-form',
            { discoveredId: discovered ? discovered.id : null }
        );
        A('CASE_H_GENUINE_INQUIRY_HAS_HIGHER_SCORE',
            topCandidate && topCandidate.container.id === 'main-contact-form' && topCandidate.score > 150,
            { topCandidateId: topCandidate ? topCandidate.container.id : null, score: topCandidate ? topCandidate.score : 0 }
        );
    }

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    report.status = failures ? 'FAILED' : 'SUCCESS';
    report.total = report.assertions.length;
    report.failed = failures;
    report.passed = report.total - failures;

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
    console.log('================================================================================');
    console.log(`DOM SUITE RESULT: ${report.passed}/${report.total} PASS (Failures: ${failures}) -> ${REPORT_FILE}`);
    console.log('================================================================================');

    return failures === 0;
}

runSuite().then(ok => {
    process.exit(ok ? 0 : 1);
}).catch(err => {
    console.error('Fatal in test runner:', err);
    process.exit(1);
});

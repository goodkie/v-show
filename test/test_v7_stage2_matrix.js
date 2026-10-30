/**
 * test/test_v7_stage2_matrix.js
 * Comprehensive Stage 2 Deterministic Verification Matrix for XPIDER v7.0 Dual Mode
 * Covers Directives #6514763285, #6514783886, #6514864061, #6515867050.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const ChallengeGate = require('../extension/modules/challenge-gate.js');
const SmartFieldResolver = require('../extension/modules/smart-field-resolver.js');
const FinalFormCompletionEngine = require('../extension/modules/final-form-completion-engine.js');
const FormDiscoveryEngineR2 = require('../extension/modules/form-discovery-engine-r2.js');

let passed = 0;
let failed = 0;

async function runSection(name, fn) {
    try {
        await fn();
        console.log(`  PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL: ${name} -> ${err.message}`);
        if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
        failed++;
    }
}

function loadContentScriptInDom(html, url = 'http://127.0.0.1:8088/contact.html', campaignMode = 'AUTO') {
    const dom = new JSDOM(html, {
        url,
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;
    const { document } = window;

    // Mock layout dimensions so JSDOM elements are considered visible
    window.HTMLElement.prototype.getClientRects = function() {
        if (this.style && (this.style.display === 'none' || this.style.visibility === 'hidden')) return [];
        if (this.type === 'hidden') return [];
        return [{ width: 200, height: 40, top: 10, left: 10 }];
    };
    Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
        get() { return (this.style && this.style.display === 'none') ? 0 : 200; }
    });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
        get() { return (this.style && this.style.display === 'none') ? 0 : 40; }
    });

    const sentMessages = [];
    window.chrome = {
        runtime: {
            sendMessage: (msg, cb) => {
                sentMessages.push(msg);
                let reply = { success: true, ready: true, reached: false };
                if (msg && msg.action === 'CAPTCHA_PENDING_EXTERNAL_USER') {
                    reply = { success: true, state: 'CAPTCHA_PENDING_EXTERNAL_USER', deadlinePaused: true, tabRetained: true };
                } else if (msg && msg.action === 'MANUAL_MODE_HOLD') {
                    reply = { success: true, state: 'MANUAL_HOLD', deadlinePaused: true, tabRetained: true };
                } else if (msg && msg.action === 'STAGE_PROGRESSION') {
                    reply = { success: true };
                } else if (msg && msg.action === 'ASSERT_PRIVACY_TRANSPORT_READY') {
                    reply = { ready: true };
                } else if (msg && msg.action === 'QUERY_SUBMIT_BOUNDARY') {
                    reply = { reached: false };
                }
                if (typeof cb === 'function') setTimeout(() => cb(reply), 5);
                return Promise.resolve(reply);
            },
            onMessage: {
                addListener: () => {},
                removeListener: () => {}
            }
        },
        storage: {
            local: {
                get: (keys, cb) => {
                    const res = { xpider_campaign_mode: campaignMode };
                    if (typeof cb === 'function') cb(res);
                    return Promise.resolve(res);
                },
                set: (obj, cb) => {
                    if (typeof cb === 'function') cb();
                    return Promise.resolve();
                }
            }
        }
    };

    window.ChallengeGate = ChallengeGate;
    window.SmartFieldResolver = SmartFieldResolver;
    window.FinalFormCompletionEngine = FinalFormCompletionEngine;
    window.FormDiscoveryEngineR2 = FormDiscoveryEngineR2;
    window.__xpider_campaign_mode = campaignMode;
    window.__xpider_execution_identity = {
        attemptId: 'att_test_' + Date.now(),
        targetToken: 'tok_test_1',
        campaignRunId: 'run_test_1',
        sessionId: 1,
        captchaEpoch: 1,
        campaignMode
    };

    // Bind globals temporarily to require content-script cleanly
    const prevWin = global.window;
    const prevDoc = global.document;
    const prevChrome = global.chrome;
    const prevSess = global.sessionStorage;
    const prevLoc = global.location;
    const prevEvent = global.Event;

    global.window = window;
    global.document = document;
    global.chrome = window.chrome;
    global.sessionStorage = window.sessionStorage;
    global.location = window.location;
    global.Event = window.Event;

    delete require.cache[require.resolve('../extension/content-script.js')];
    const cs = require('../extension/content-script.js');

    const restoreGlobals = () => {
        global.window = prevWin;
        global.document = prevDoc;
        global.chrome = prevChrome;
        global.sessionStorage = prevSess;
        global.location = prevLoc;
        global.Event = prevEvent;
    };

    return { dom, window, document, cs, sentMessages, restoreGlobals };
}

(async () => {
    console.log('=== STAGE 2 DETERMINISTIC VERIFICATION MATRIX (v7.0 DUAL MODE) ===');

    // ------------------------------------------------------------------------
    // 1. Stage 0 Backup & 92-Remaining Checkpoint Parity
    // ------------------------------------------------------------------------
    await runSection('1. Stage 0 Backup, .94 Anchor & 92-Remaining Checkpoint Parity', async () => {
        const tags = execFileSync('git', ['tag', '-l'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/);
        assert(tags.includes('major-backup-20261030-from-93'), 'Restore tag major-backup-20261030-from-93 must exist');
        assert(tags.includes('v6.9g.10.3-rc3.60.7.1.4.94'), 'Release tag v6.9g.10.3-rc3.60.7.1.4.94 must exist');

        const manifestPath = path.join(ROOT, 'backups', 'MAJOR_BACKUP_20261030_from_93_4be780b4', 'MANIFEST.json');
        assert(fs.existsSync(manifestPath), 'Stage 0 backup MANIFEST.json must exist');
        const reconPath = path.join(ROOT, 'backups', 'RECON_20261030', 'RECON_REPORT.json');
        assert(fs.existsSync(reconPath), 'Reconciliation report must exist');
        const recon = JSON.parse(fs.readFileSync(reconPath, 'utf8'));
        const chromeProfile = recon.find(p => p.label && p.label.includes('chrome_default_live'));
        assert(chromeProfile, 'Chrome Default profile entry must exist in reconciliation report');
        assert.strictEqual(chromeProfile.checkpoint.totalTargets, 97);
        assert.strictEqual(chromeProfile.checkpoint.remaining, 92);
        assert.strictEqual(chromeProfile.checkpoint.visited, 5);
    });

    // ------------------------------------------------------------------------
    // 2. CLI Syntax & Static ESLint no-undef Guard
    // ------------------------------------------------------------------------
    await runSection('2. All 24 Extension JS Files Pass node --check & ESLint no-undef', async () => {
        const dirs = ['extension', 'extension/modules'];
        let checked = 0;
        for (const d of dirs) {
            for (const f of fs.readdirSync(path.join(ROOT, d))) {
                if (f.endsWith('.js')) {
                    execFileSync(process.execPath, ['--check', path.join(ROOT, d, f)]);
                    checked++;
                }
            }
        }
        assert(checked >= 24, `Expected >= 24 JS files checked, got ${checked}`);
        const undefOut = execFileSync(process.execPath, [path.join(ROOT, 'test', 'test_no_new_undefined_identifiers.js')], { encoding: 'utf8' });
        assert(undefOut.includes('PASS: no new undefined identifiers'), 'ESLint no-undef check must pass');
    });

    // ------------------------------------------------------------------------
    // 3. Manifest, UI Dual Buttons & Internal Solver Retirement Verification
    // ------------------------------------------------------------------------
    await runSection('3. Manifest v7.0, Dual Start Buttons & Internal Solver Retirement', async () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
        assert.strictEqual(manifest.version, '7.0.0', 'Manifest version must be 7.0.0');
        assert(!manifest.content_scripts, 'Manifest must not inject solver-content.js into third-party challenge iframes');

        const solverContentSrc = fs.readFileSync(path.join(ROOT, 'extension', 'solver-content.js'), 'utf8');
        assert(solverContentSrc.includes('__xpider_internal_solver_retired = true'), 'solver-content.js must be retired stub');
        assert(!solverContentSrc.includes('SOLVE_CAPTCHA'), 'solver-content.js must not call SOLVE_CAPTCHA');

        const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
        assert(bgSrc.includes("'modules/challenge-gate.js'"), 'background.js must inject modules/challenge-gate.js');
        assert(bgSrc.includes("case 'CAPTCHA_PENDING_EXTERNAL_USER':"), 'background.js must handle CAPTCHA_PENDING_EXTERNAL_USER');
        assert(bgSrc.includes("case 'MANUAL_MODE_HOLD':"), 'background.js must handle MANUAL_MODE_HOLD');
        assert(bgSrc.includes('[JGMMA_TAB_RETENTION_GUARD]'), 'background.js must enforce JGMMA tab retention guard');

        const popupHtml = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
        assert(popupHtml.includes('id="start-btn" data-mode="AUTO"'), 'popup.html must have Start Automatic button');
        assert(popupHtml.includes('id="start-manual-btn" data-mode="MANUAL"'), 'popup.html must have Start Manual button');
        assert(popupHtml.includes('id="campaign-mode-pill"'), 'popup.html must have campaign-mode-pill');
        assert(popupHtml.includes('id="v7-captcha-external-notice"'), 'popup.html must display v7 external challenge notice');
    });

    // ------------------------------------------------------------------------
    // 4. AUTO Mode Verification (No-Challenge Auto Submit, Challenge Wait, Re-Verify)
    // ------------------------------------------------------------------------
    await runSection('4A. AUTO Mode — Standard Form Without Challenge Submits Automatically Without Popup', async () => {
        const html = `<!DOCTYPE html><html><body>
            <form id="contact-form">
                <input type="text" name="name" required value="John Doe" />
                <input type="email" name="email" required value="john@example.com" />
                <textarea name="message" required>Hello, I would like to inquire about your services.</textarea>
                <button type="submit">Send</button>
            </form>
        </body></html>`;
        const ctx = loadContentScriptInDom(html, 'http://127.0.0.1:8088/standard-contact.html', 'AUTO');
        try {
            const challenge = ctx.cs.ChallengeGate.detectChallenge(ctx.document);
            assert.strictEqual(challenge.detected, false);
            const decision = ctx.cs.ChallengeGate.decideAction({
                mode: 'AUTO',
                fieldsComplete: true,
                challenge,
                alreadySubmitted: false
            });
            assert.strictEqual(decision, 'SUBMIT_ONCE');
            assert.strictEqual(ctx.document.getElementById('xpider-v7-manual-hold-panel'), null, 'No manual popup in AUTO mode');
            assert.strictEqual(ctx.document.getElementById('xpider-v7-external-captcha-hud'), null, 'No challenge wait HUD when no challenge present');
        } finally {
            ctx.restoreGlobals();
        }
    });

    await runSection('4B & 4C. AUTO Mode — Unresolved Challenge Pauses in CAPTCHA_PENDING_EXTERNAL_USER, Rejects Premature Re-verify, Restores Drifted Field & Resumes Only After DOM Token Verification', async () => {
        const html = `<!DOCTYPE html><html><body>
            <form id="contact-form">
                <input type="text" id="f-name" name="name" required value="John Doe" />
                <input type="email" id="f-email" name="email" required value="john@example.com" />
                <input type="tel" id="f-phone" name="phone" value="555-0199" />
                <textarea id="f-msg" name="message" required>Inquiry about partnership opportunities.</textarea>
                <div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>
                <textarea name="g-recaptcha-response"></textarea>
                <button type="submit">Submit</button>
            </form>
        </body></html>`;
        const ctx = loadContentScriptInDom(html, 'http://127.0.0.1:8088/recaptcha-contact.html', 'AUTO');
        try {
            const form = ctx.document.getElementById('contact-form');
            const template = { name: 'John Doe', email: 'john@example.com', phone: '555-0199', message: 'Inquiry about partnership opportunities.' };
            const frozenSnapshot = ctx.cs.freezeFieldValues(form, template);
            const initialChallenge = ctx.cs.ChallengeGate.detectChallenge(ctx.document);
            assert.strictEqual(initialChallenge.detected, true);
            assert.strictEqual(initialChallenge.verified, false);

            // Launch waitForExternalOrUserChallengeV7 asynchronously
            let resolvedOutcome = null;
            const waitPromise = ctx.cs.waitForExternalOrUserChallengeV7(form, template, frozenSnapshot, initialChallenge).then(r => {
                resolvedOutcome = r;
                return r;
            });

            await new Promise(r => setTimeout(r, 30));

            // Verify background was notified to pause deadline and retain tab
            assert(ctx.sentMessages.some(m => m.action === 'CAPTCHA_PENDING_EXTERNAL_USER' && m.challengeType === 'recaptcha'), 'Must emit CAPTCHA_PENDING_EXTERNAL_USER');
            const hud = ctx.document.getElementById('xpider-v7-external-captcha-hud');
            assert(hud, 'Top challenge waiting HUD must be rendered');

            // Premature click on "I Completed Challenge — Re-verify & Submit" while token is still empty must NOT resolve!
            ctx.window.__xpiderTriggerExternalCaptchaAction('REVERIFY_AND_SUBMIT');
            await new Promise(r => setTimeout(r, 30));
            assert.strictEqual(resolvedOutcome, null, 'Must NOT submit or resolve while reCAPTCHA token is still empty');

            // Simulate a field drifting/clearing while user interacts with challenge
            ctx.document.getElementById('f-phone').value = '';

            // Now simulate external/user completing the challenge on page (populating g-recaptcha-response)
            ctx.document.querySelector('textarea[name="g-recaptcha-response"]').value = '03AGdBq24PBCbwiDRaS_v7_verified_token_1234567890';
            ctx.window.__xpiderTriggerExternalCaptchaAction('REVERIFY_AND_SUBMIT');

            const finalWait = await waitPromise;
            assert.strictEqual(finalWait.resolved, true, 'Must resolve once DOM token is independently verified');
            assert(ctx.sentMessages.some(m => m.action === 'CAPTCHA_EXTERNAL_VERIFIED_RESUME'), 'Must notify background CAPTCHA_EXTERNAL_VERIFIED_RESUME');

            // Verify post-wait field restoration and integrity check before single automatic submit
            const restoredCount = ctx.cs.restoreFrozenSnapshot(form, frozenSnapshot);
            assert(restoredCount >= 1, 'Drifted field must be restored from frozenSnapshot before auto-submit');
            assert.strictEqual(ctx.document.getElementById('f-phone').value, '555-0199');
            const integrity = ctx.cs.verifyFieldIntegrity(form, frozenSnapshot, template);
            assert.strictEqual(integrity.intact, true, 'Post-challenge field integrity must pass');

            // Verify retired tryAutoSolveCaptcha never calls SOLVE_CAPTCHA
            const solverRes = await ctx.cs.tryAutoSolveCaptcha('TEST');
            assert.strictEqual(solverRes.retired, true);
            assert(!ctx.sentMessages.some(m => m.action === 'SOLVE_CAPTCHA'), 'Must NEVER emit SOLVE_CAPTCHA in v7');
        } finally {
            ctx.restoreGlobals();
        }
    });

    // ------------------------------------------------------------------------
    // 5. MANUAL Mode Verification (Hold Modal, Claim vs Evidence, Retry<=3, Skip, Stop&Save)
    // ------------------------------------------------------------------------
    await runSection('5A & 5B. MANUAL Mode — Fills First, Holds Queue, Unverified "I Registered" Settles as DELIVERY_UNKNOWN (Never False SUCCESS)', async () => {
        const html = `<!DOCTYPE html><html><body>
            <form id="contact-form">
                <input type="text" id="f-name" name="name" required value="John Doe" />
                <input type="email" id="f-email" name="email" required value="john@example.com" />
                <textarea id="f-msg" name="message" required>Manual mode inquiry test.</textarea>
                <button type="submit">Send</button>
            </form>
        </body></html>`;
        const ctx = loadContentScriptInDom(html, 'http://127.0.0.1:8088/manual-contact-1.html', 'MANUAL');
        try {
            const form = ctx.document.getElementById('contact-form');
            const template = { name: 'John Doe', email: 'john@example.com', message: 'Manual mode inquiry test.' };
            const frozenSnapshot = ctx.cs.freezeFieldValues(form, template);
            const chal = ctx.cs.ChallengeGate.detectChallenge(ctx.document);

            const holdPromise = ctx.cs.handleV7ManualModeHold(form, template, frozenSnapshot, chal);
            await new Promise(r => setTimeout(r, 30));

            // Verify MANUAL_MODE_HOLD sent and modal rendered
            assert(ctx.sentMessages.some(m => m.action === 'MANUAL_MODE_HOLD'), 'Must emit MANUAL_MODE_HOLD');
            const panel = ctx.document.getElementById('xpider-v7-manual-hold-panel');
            assert(panel, 'Manual Registration Hold Modal must be rendered');

            // Click "I Registered — Continue" while form is still on page and NO positive confirmation exists
            ctx.window.__xpiderTriggerManualAction('REGISTERED_CONTINUE');
            const outcome = await holdPromise;
            assert.strictEqual(outcome.success, false, 'Must NOT commit SUCCESS without confirmation evidence');
            assert.strictEqual(outcome.status, 'DELIVERY_UNKNOWN');
            assert.strictEqual(outcome.reasonCode, 'MANUAL_CLAIM_NO_EVIDENCE');
        } finally {
            ctx.restoreGlobals();
        }
    });

    await runSection('5C & 5D. MANUAL Mode — Bounded Retry/Edit (Max 3) Preserves Snapshot & Positive Evidence Settles as SUCCESS', async () => {
        const html = `<!DOCTYPE html><html><body>
            <form id="contact-form">
                <input type="text" id="f-name" name="name" required value="John Doe" />
                <input type="email" id="f-email" name="email" required value="john@example.com" />
                <textarea id="f-msg" name="message" required>Manual mode inquiry test.</textarea>
                <button type="submit">Send</button>
            </form>
            <div id="status-msg"></div>
        </body></html>`;
        const ctx = loadContentScriptInDom(html, 'http://127.0.0.1:8088/manual-contact-2.html', 'MANUAL');
        try {
            const form = ctx.document.getElementById('contact-form');
            const template = { name: 'John Doe', email: 'john@example.com', message: 'Manual mode inquiry test.' };
            const frozenSnapshot = ctx.cs.freezeFieldValues(form, template);
            const chal = ctx.cs.ChallengeGate.detectChallenge(ctx.document);

            const holdPromise = ctx.cs.handleV7ManualModeHold(form, template, frozenSnapshot, chal);
            await new Promise(r => setTimeout(r, 30));

            // Clear email field and test Retry / Edit (bounded to 3)
            ctx.document.getElementById('f-email').value = '';
            const r1 = ctx.window.__xpiderTriggerManualAction('RETRY_EDIT');
            assert.strictEqual(r1.retryCount, 1);
            assert.strictEqual(ctx.document.getElementById('f-email').value, 'john@example.com', 'Retry must restore cleared field from frozenSnapshot');

            const r2 = ctx.window.__xpiderTriggerManualAction('RETRY_EDIT');
            assert.strictEqual(r2.retryCount, 2);
            const r3 = ctx.window.__xpiderTriggerManualAction('RETRY_EDIT');
            assert.strictEqual(r3.retryCount, 3);
            assert.strictEqual(r3.limitReached, true);

            const r4 = ctx.window.__xpiderTriggerManualAction('RETRY_EDIT');
            assert.strictEqual(r4.retryCount, 3, 'Must not exceed 3 retries');
            assert.strictEqual(r4.limitReached, true);

            // Simulate user submitting form and page rendering positive confirmation text
            ctx.document.getElementById('status-msg').textContent = 'Thank you! Your message has been sent successfully.';
            ctx.window.__xpiderTriggerManualAction('REGISTERED_CONTINUE');

            const outcome = await holdPromise;
            assert.strictEqual(outcome.success, true, 'Must commit SUCCESS when positive confirmation evidence is present');
            assert.strictEqual(outcome.status, 'SUCCESS');
            assert.strictEqual(outcome.reasonCode, 'MANUAL_REGISTRATION_EVIDENCE_CONFIRMED');
        } finally {
            ctx.restoreGlobals();
        }
    });

    await runSection('5E. MANUAL Mode — Skip & Stop-and-Save Actions Settle Cleanly', async () => {
        const html = `<!DOCTYPE html><html><body>
            <form id="contact-form">
                <input type="text" name="name" required value="John Doe" />
                <input type="email" name="email" required value="john@example.com" />
                <textarea name="message" required>Skip and Stop-Save test.</textarea>
            </form>
        </body></html>`;
        const ctx1 = loadContentScriptInDom(html, 'http://127.0.0.1:8088/manual-skip.html', 'MANUAL');
        try {
            const form = ctx1.document.getElementById('contact-form');
            const snap = ctx1.cs.freezeFieldValues(form, {});
            const pSkip = ctx1.cs.handleV7ManualModeHold(form, {}, snap, { detected: false, verified: true, type: 'none' });
            await new Promise(r => setTimeout(r, 20));
            ctx1.window.__xpiderTriggerManualAction('SKIP');
            const resSkip = await pSkip;
            assert.strictEqual(resSkip.status, 'SKIPPED');
            assert.strictEqual(resSkip.reasonCode, 'MANUAL_OPERATOR_SKIP');
        } finally {
            ctx1.restoreGlobals();
        }

        const ctx2 = loadContentScriptInDom(html, 'http://127.0.0.1:8088/manual-stop.html', 'MANUAL');
        try {
            const form = ctx2.document.getElementById('contact-form');
            const snap = ctx2.cs.freezeFieldValues(form, {});
            const pStop = ctx2.cs.handleV7ManualModeHold(form, {}, snap, { detected: false, verified: true, type: 'none' });
            await new Promise(r => setTimeout(r, 20));
            ctx2.window.__xpiderTriggerManualAction('STOP_AND_SAVE');
            const resStop = await pStop;
            assert.strictEqual(resStop.status, 'PAUSED');
            assert(ctx2.sentMessages.some(m => m.action === 'STOP_AND_SAVE_CAMPAIGN'), 'Stop & Save must send STOP_AND_SAVE_CAMPAIGN');
        } finally {
            ctx2.restoreGlobals();
        }
    });

    // ------------------------------------------------------------------------
    // 6. Core Regression Guards (Form Classification, No Fabricated DOB, Captcha Input Exclusion, Cross-Origin Map Exclusion, History & Email Parity)
    // ------------------------------------------------------------------------
    await runSection('6. Form Classification, No Fabricated DOB, Captcha Input Exclusion & Cross-Origin Map Exclusion', async () => {
        const SFR = SmartFieldResolver.SmartFieldResolver || SmartFieldResolver;
        // 6A: formCaptchaba7c05121 excluded from inquiry/required field classification
        assert.strictEqual(SFR.isCaptchaChallengeField({
            name: 'formCaptchaba7c05121',
            id: 'formCaptchaba7c05121',
            type: 'text',
            tagName: 'INPUT',
            getAttribute: () => ''
        }), true, 'formCaptchaba... must be classified as captcha challenge field');

        // 6B: IYATKD no-inquiry form -> detectInquiryBodyField returns null -> NO_LONG_TEXT_INQUIRY_FIELD
        const { detectInquiryBodyField } = require('../extension/modules/contact-gate');
        const domNoInq = new JSDOM(`<!DOCTYPE html><html><body><form id="f"><input name="name" /><input type="email" name="email" /><button type="submit">Go</button></form></body></html>`);
        assert.strictEqual(detectInquiryBodyField(domNoInq.window.document.getElementById('f')), null, 'Form without long-text inquiry field must return null from detectInquiryBodyField');

        // 6C: No fabricated DOB / sensitive unknown facts
        const domDob = new JSDOM(`<!DOCTYPE html><html><body><form id="f">
            <input type="text" name="name" required value="John Doe" />
            <input type="email" name="email" required value="john@example.com" />
            <input type="text" name="date_of_birth" placeholder="Date of Birth (MM/DD/YYYY)" required value="" />
            <textarea name="message" required>Hello inquiry</textarea>
        </form></body></html>`);
        const FFCClass = FinalFormCompletionEngine.FinalFormCompletionEngine || FinalFormCompletionEngine;
        const engine = new FFCClass({ ownerAuthorizedConsent: true });
        const auditRes = await engine.run(domDob.window.document.getElementById('f'), { name: 'John Doe', email: 'john@example.com', message: 'Hello inquiry' }, { url: 'http://127.0.0.1:8088/dob.html' });
        assert.strictEqual(auditRes.pass, false, 'Form with required unknown DOB must not fabricate value and must block submit');
        assert.strictEqual(domDob.window.document.querySelector('[name="date_of_birth"]').value, '', 'DOB field must remain empty');

        // 6D: HistoryStore & EmailCollector parity
        const HistoryStoreMod = require('../extension/modules/history-store.js');
        const EmailCollectorMod = require('../extension/modules/email-collector.js');
        const HistoryStore = HistoryStoreMod.HistoryStore || HistoryStoreMod;
        const EmailCollector = EmailCollectorMod.EmailCollector || EmailCollectorMod;
        assert(typeof HistoryStore === 'function', 'HistoryStore must be available');
        const extractFn = EmailCollector.extractEmailsFromText || EmailCollector.extractEmails;
        assert(typeof extractFn === 'function', 'EmailCollector extraction function must be available');
    });

    console.log(`\n=== STAGE 2 MATRIX SUMMARY: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
})();

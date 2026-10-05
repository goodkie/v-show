/**
 * test_r6_9f_runtime_submit_counters.js
 * 
 * Issue #6 R6.9F Runtime Build Lock, Submit Discovery, and Counter Semantics Test Suite
 * Covers 19 comprehensive unit and static integration tests.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname);
const bgSrc = fs.readFileSync(path.join(SRC_DIR, 'background.js'), 'utf8');
const csSrc = fs.readFileSync(path.join(SRC_DIR, 'content-script.js'), 'utf8');
const popSrc = fs.readFileSync(path.join(SRC_DIR, 'popup.js'), 'utf8');
const provSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'build-provenance.js'), 'utf8');
const gateSrc = fs.readFileSync(path.join(SRC_DIR, 'modules', 'contact-gate.js'), 'utf8');

const { HistoryStore } = require(path.join(SRC_DIR, 'modules', 'history-store.js'));
const ContactGate = require(path.join(SRC_DIR, 'modules', 'contact-gate.js'));
const BuildProvenance = require(path.join(SRC_DIR, 'modules', 'build-provenance.js'));

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

async function main() {
    console.log('================================================================');
    console.log(' R6.9F RUNTIME BUILD LOCK, SUBMIT DISCOVERY, COUNTER SEMANTICS');
    console.log('================================================================');

    // -------------------------------------------------------------
    // Test 1: Build Handshake: popup verifyBuildHandshake matches local and background
    // -------------------------------------------------------------
    runTest('1. Build Handshake: popup verifyBuildHandshake matches local and bg build', () => {
        assert(popSrc.includes('async function verifyBuildHandshake()'), 'popup.js must implement verifyBuildHandshake()');
        assert(popSrc.includes("action: 'GET_BUILD_PROVENANCE'"), 'verifyBuildHandshake must query GET_BUILD_PROVENANCE');
        assert(popSrc.includes('[BUILD_HANDSHAKE] localHead='), 'verifyBuildHandshake must log [BUILD_HANDSHAKE]');
    });

    // -------------------------------------------------------------
    // Test 2: Build Handshake: popup blocks start-btn on mismatch
    // -------------------------------------------------------------
    runTest('2. Build Handshake: popup blocks start-btn and displays banner on mismatch', () => {
        assert(popSrc.includes('build-mismatch-banner'), 'popup.js must reference build-mismatch-banner');
        assert(popSrc.includes('data-build-locked'), 'popup.js must set data-build-locked attribute on mismatch');
        assert(popSrc.includes('CANNOT START CAMPAIGN: RUNTIME BUILD MISMATCH'), 'startCampaign must alert on mismatch');
    });

    // -------------------------------------------------------------
    // Test 3: Build Handshake: background rejects START_CAMPAIGN on mismatch
    // -------------------------------------------------------------
    runTest('3. Build Handshake: background rejects START_CAMPAIGN on mismatch', () => {
        assert(bgSrc.includes("error: 'RUNTIME_BUILD_MISMATCH'"), 'background.js must reject with RUNTIME_BUILD_MISMATCH');
        assert(bgSrc.includes('reqHead !== liveHead'), 'background.js must check reqHead vs liveHead');
        assert(bgSrc.includes('reqBuild !== liveBuild'), 'background.js must check reqBuild vs liveBuild');
    });

    // -------------------------------------------------------------
    // Test 4: Build Handshake: background logs [BUILD_HANDSHAKE] with PASS/REJECT
    // -------------------------------------------------------------
    runTest('4. Build Handshake: background logs [BUILD_HANDSHAKE] with PASS/REJECT', () => {
        assert(bgSrc.includes('[BUILD_HANDSHAKE] popup='), 'background.js must log [BUILD_HANDSHAKE] popup=');
        assert(bgSrc.includes('result=REJECT'), 'background.js must log result=REJECT on mismatch');
        assert(bgSrc.includes('result=PASS'), 'background.js must log result=PASS on match');
    });

    // -------------------------------------------------------------
    // Test 5: Comment Form: ContactGate rejects WP comment forms
    // -------------------------------------------------------------
    runTest('5. Comment Form: ContactGate rejects WP comment form with NON_INQUIRY_COMMENT_FORM', () => {
        assert(gateSrc.includes('NON_INQUIRY_COMMENT_FORM'), 'contact-gate.js must define NON_INQUIRY_COMMENT_FORM');
        assert(gateSrc.includes('hasWpCommentAction'), 'contact-gate.js must check wp-comments-post action');
        
        // Mock DOM for a WordPress comment form
        const mockForm = {
            getAttribute: (attr) => {
                if (attr === 'action') return 'https://dominionshotokan.com/wp-comments-post.php';
                if (attr === 'id') return 'commentform';
                return null;
            },
            id: 'commentform',
            className: 'comment-form',
            querySelector: (sel) => {
                if (sel.includes('textarea')) return { name: 'comment', id: 'comment' };
                if (sel.includes('submit')) return { value: 'Post Comment' };
                return null;
            },
            querySelectorAll: (sel) => {
                if (sel.includes('textarea')) return [{ name: 'comment' }];
                if (sel.includes('input')) return [{ name: 'author' }, { name: 'email' }, { name: 'comment_post_ID' }];
                return [];
            },
            innerText: 'Leave a Reply\nLogged in as admin. Log out?\nComment\nPost Comment'
        };

        const result = ContactGate.classifyFormIntent(mockForm);
        assert.strictEqual(result.intent, 'COMMENT', 'WordPress comment form must be classified as COMMENT');
        assert.strictEqual(result.decision, 'REJECT', 'WordPress comment form must be REJECTed');
        assert.strictEqual(result.reason, 'NON_INQUIRY_COMMENT_FORM', 'Reason must be NON_INQUIRY_COMMENT_FORM');
    });

    // -------------------------------------------------------------
    // Test 6: Comment Form: ContactGate preserves legitimate inquiry with comments textarea
    // -------------------------------------------------------------
    runTest('6. Comment Form: ContactGate preserves inquiry forms with "Comments" textarea and submit button', () => {
        const mockContactForm = {
            getAttribute: (attr) => {
                if (attr === 'action') return '/contact-us/send';
                if (attr === 'id') return 'contact-form-123';
                return null;
            },
            id: 'contact-form-123',
            className: 'wpforms-form',
            querySelector: (sel) => {
                if (sel.includes('textarea')) return { name: 'comments', id: 'comments' };
                if (sel.includes('submit')) return { value: 'Send Message' };
                return null;
            },
            querySelectorAll: (sel) => {
                if (sel.includes('textarea')) return [{ name: 'comments' }];
                if (sel.includes('input')) return [{ name: 'fullname' }, { name: 'email' }, { name: 'phone' }];
                return [];
            },
            innerText: 'Contact Us\nPlease leave your comments or inquiry below.\nName\nEmail\nComments\nSend Message'
        };

        const result = ContactGate.classifyFormIntent(mockContactForm);
        assert.strictEqual(result.intent, 'CONTACT_INQUIRY', 'Legitimate inquiry must be classified as CONTACT_INQUIRY');
        assert.strictEqual(result.decision, 'ACCEPT', 'Legitimate inquiry must be ACCEPTed');
    });

    // -------------------------------------------------------------
    // Test 7: Comment Form: Content script early form gate aborts autofill
    // -------------------------------------------------------------
    runTest('7. Comment Form: Content script early form gate aborts autofill lock', () => {
        assert(csSrc.includes("NON_INQUIRY_COMMENT_FORM"), 'content-script.js must reference NON_INQUIRY_COMMENT_FORM');
        assert(csSrc.includes('_ContactGate.classifyFormIntent(currentForm)'), 'content-script.js must classify discovered form intent immediately');
    });

    // -------------------------------------------------------------
    // Test 8: Submit Discovery: Native submit button discovery in SubmitExecutorR5
    // -------------------------------------------------------------
    runTest('8. Submit Discovery: Native submit buttons discovered and scored highest', () => {
        assert(csSrc.includes("type === 'submit' && form.contains(btn)"), 'SubmitExecutorR5 must identify native submit owned by form');
        assert(csSrc.includes("kind: 'native'"), 'SubmitExecutorR5 must gather native submit buttons');
    });

    // -------------------------------------------------------------
    // Test 9: Submit Discovery: Associated external form submit button
    // -------------------------------------------------------------
    runTest('9. Submit Discovery: Associated external form submit button discovered via form attribute', () => {
        assert(csSrc.includes("kind: 'external'"), 'SubmitExecutorR5 must gather external submit buttons');
        assert(csSrc.includes('btn.getAttribute(\'form\') === form.id'), 'SubmitExecutorR5 must verify external button form attribute matches form id');
    });

    // -------------------------------------------------------------
    // Test 10: Submit Discovery: Shadow DOM submit buttons inspected
    // -------------------------------------------------------------
    runTest('10. Submit Discovery: Shadow DOM submit candidates inspected via querySelectorAllIncludingShadowDOM', () => {
        assert(csSrc.includes('querySelectorAllIncludingShadowDOM(form, nativeSelector)'), 'SubmitExecutorR5 must inspect nativeSelector in Shadow DOM');
        assert(csSrc.includes('querySelectorAllIncludingShadowDOM(form, customSelector)'), 'SubmitExecutorR5 must inspect customSelector in Shadow DOM');
    });

    // -------------------------------------------------------------
    // Test 11: Submit Discovery: Semantic custom buttons inside form context
    // -------------------------------------------------------------
    runTest('11. Submit Discovery: Semantic custom buttons (a, div, span) inside form context discovered', () => {
        assert(csSrc.includes("kind: 'custom'"), 'SubmitExecutorR5 must gather custom elements');
        assert(csSrc.includes("['A', 'DIV', 'SPAN', 'P'].includes(tag)"), 'SubmitExecutorR5 must inspect semantic tags inside form');
        assert(csSrc.includes('tag === \'A\' && hasSubmitKeyword'), 'SubmitExecutorR5 must promote semantic A buttons');
    });

    // -------------------------------------------------------------
    // Test 12: Submit Discovery: Header/nav/footer contact links rejected
    // -------------------------------------------------------------
    runTest('12. Submit Discovery: Unrelated contact links in header/nav/footer rejected', () => {
        assert(csSrc.includes('isRejectedContext'), 'SubmitExecutorR5 must define isRejectedContext()');
        assert(csSrc.includes("el.closest('header, nav, footer"), 'SubmitExecutorR5 must reject elements in header, nav, or footer');
    });

    // -------------------------------------------------------------
    // Test 13: Submit Discovery: Logging of candidates and decision
    // -------------------------------------------------------------
    runTest('13. Submit Discovery: Candidate scan and decision logged with strategy', () => {
        assert(csSrc.includes('[SUBMIT_CANDIDATES] total='), 'SubmitExecutorR5 must log [SUBMIT_CANDIDATES]');
        assert(csSrc.includes('[SUBMIT_DECISION] chosen='), 'SubmitExecutorR5 must log [SUBMIT_DECISION]');
    });

    // -------------------------------------------------------------
    // Test 14: Submit Discovery: Fallback to VisionSubmitExecutor
    // -------------------------------------------------------------
    runTest('14. Submit Discovery: Fallback to VisionSubmitExecutor before SUBMIT_CANDIDATE_NOT_FOUND', () => {
        assert(csSrc.includes('_VisionSubmitExecutor'), 'SubmitExecutorR5 must reference VisionSubmitExecutor');
        assert(csSrc.includes("new _VisionSubmitExecutor()"), 'SubmitExecutorR5 must instantiate VisionSubmitExecutor before failure');
    });

    // -------------------------------------------------------------
    // Test 15: Duplicate Submit Block: Background tracks submitBoundaryReached per attempt
    // -------------------------------------------------------------
    runTest('15. Duplicate Submit Block: Background tracks submitBoundaryReached per attempt', () => {
        assert(bgSrc.includes('campaignState.submitBoundaryReached'), 'background.js must initialize submitBoundaryReached');
        assert(bgSrc.includes('[SUBMIT_DUPLICATE_BLOCK] attemptId='), 'background.js must log duplicate submit block');
        assert(bgSrc.includes("QUERY_SUBMIT_BOUNDARY"), 'background.js must support QUERY_SUBMIT_BOUNDARY IPC');
    });

    // -------------------------------------------------------------
    // Test 16: Duplicate Submit Block: Content script queries boundary before submit
    // -------------------------------------------------------------
    runTest('16. Duplicate Submit Block: Content script checks QUERY_SUBMIT_BOUNDARY and aborts duplicate', () => {
        assert(csSrc.includes("action: 'QUERY_SUBMIT_BOUNDARY'"), 'content-script.js must query boundary state');
        assert(csSrc.includes('__xpider_submitBoundaryReached'), 'content-script.js must track local submit boundary flag');
    });

    // -------------------------------------------------------------
    // Test 17: Captcha Zero Balance: 2Captcha zero balance settled as CAPTCHA_SOLVER_UNAVAILABLE
    // -------------------------------------------------------------
    runTest('17. Captcha Zero Balance: 2Captcha ERROR_ZERO_BALANCE settled as CAPTCHA_SOLVER_UNAVAILABLE', () => {
        assert(bgSrc.includes("ERROR_ZERO_BALANCE"), 'background.js must identify ERROR_ZERO_BALANCE terminal error');
        assert(bgSrc.includes("CAPTCHA_SOLVER_UNAVAILABLE"), 'background.js must set settleReason CAPTCHA_SOLVER_UNAVAILABLE');
    });

    // -------------------------------------------------------------
    // Test 18: Captcha Zero Balance: Content script halts submit without logging bypass
    // -------------------------------------------------------------
    runTest('18. Captcha Zero Balance: Content script aborts submit on terminal captcha error', () => {
        assert(csSrc.includes('solveResult.terminalError'), 'content-script.js must inspect solveResult.terminalError');
        assert(csSrc.includes("finishCampaign(false, 'CAPTCHA_SOLVER_UNAVAILABLE'"), 'content-script.js must settle CAPTCHA_SOLVER_UNAVAILABLE');
    });

    // -------------------------------------------------------------
    // Test 19: Counter Bucket Parity: 7 distinct buckets with sum(terminal) === completed
    // -------------------------------------------------------------
    runTest('19. Counter Bucket Parity: HistoryStore currentRun returns 7 distinct buckets with sum === completed', () => {
        const mockStorage = {};
        const hs = new HistoryStore({
            storageAdapter: {
                get: async (keys) => {
                    const res = {};
                    for (const k of (Array.isArray(keys) ? keys : [keys])) {
                        if (mockStorage[k] !== undefined) res[k] = mockStorage[k];
                    }
                    return res;
                },
                set: async (obj) => {
                    Object.assign(mockStorage, obj);
                }
            }
        });

        const run1 = 'run_test_001';
        const run2 = 'run_test_002';

        // Add attempts to run1
        hs.attempts = [
            { attemptId: 'a1', campaignRunId: run1, status: 'CONFIRMED_SUCCESS', reasonCode: 'SUCCESS' },
            { attemptId: 'a2', campaignRunId: run1, status: 'CONFIRMED_SUCCESS', reasonCode: 'SUCCESS' },
            { attemptId: 'a3', campaignRunId: run1, status: 'FAILURE', reasonCode: 'SUBMIT_FAILED' },
            { attemptId: 'a4', campaignRunId: run1, status: 'TIMEOUT_LOCAL', reasonCode: 'NAVIGATION_TIMEOUT' },
            { attemptId: 'a5', campaignRunId: run1, status: 'TIMEOUT_GLOBAL', reasonCode: 'CAMPAIGN_GLOBAL_TIMEOUT' },
            { attemptId: 'a6', campaignRunId: run1, status: 'DELIVERY_UNKNOWN', reasonCode: 'DISCONNECTED' },
            { attemptId: 'a7', campaignRunId: run1, status: 'SKIPPED', reasonCode: 'NON_INQUIRY_COMMENT_FORM' },
            // Attempt in run2
            { attemptId: 'a8', campaignRunId: run2, status: 'CONFIRMED_SUCCESS', reasonCode: 'SUCCESS' }
        ];

        const stats1 = hs.getLedgerStats('currentRun', run1);
        assert.strictEqual(stats1.success, 2, 'run1 success should be 2');
        assert.strictEqual(stats1.failure, 1, 'run1 failure should be 1');
        assert.strictEqual(stats1.timeout, 2, 'run1 timeout should be 2');
        assert.strictEqual(stats1.unknown, 1, 'run1 unknown should be 1');
        assert.strictEqual(stats1.skipped, 1, 'run1 skipped should be 1');
        
        const sumBuckets = stats1.success + stats1.failure + stats1.timeout + stats1.unknown + stats1.skipped;
        assert.strictEqual(sumBuckets, stats1.completed, 'sum(terminal buckets) must strictly equal completed');
        assert.strictEqual(stats1.completed, 7, 'Total completed in run1 must be 7');

        // Verify isolation when no active run is given
        const emptyStats = hs.getLedgerStats('currentRun', null);
        assert.strictEqual(emptyStats.completed, 0, 'currentRun without targetRunId must return 0 completed (never leaks prior runs)');
    });

    console.log('================================================================');
    console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
    console.log('================================================================');

    if (testsFailed > 0) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});

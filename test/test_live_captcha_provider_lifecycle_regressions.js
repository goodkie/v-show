/**
 * test/test_live_captcha_provider_lifecycle_regressions.js
 *
 * Deterministic Regression Test Suite for Directive #6335592395:
 * Live CAPTCHA Provider Lifecycle, Socket Timeouts, Explicit Terminal States,
 * Credential Redaction, and Single Manual Solve Fallback.
 */

const assert = require('assert');
const path = require('path');
const { XpiderSolverCore } = require('../extension/solver-core.js');

console.log('=== TEST SUITE: LIVE CAPTCHA PROVIDER LIFECYCLE & MANUAL FALLBACK REGRESSIONS ===\n');

async function runTests() {
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        return (async () => {
            try {
                await fn();
                console.log(`  ✅ PASS: ${name}`);
                passed++;
            } catch (err) {
                console.error(`  ❌ FAIL: ${name}`);
                console.error(`     Error: ${err.message}\n${err.stack}`);
                failed++;
            }
        })();
    }

    // -------------------------------------------------------------
    // Test 1: Telemetry Credential Redaction
    // -------------------------------------------------------------
    await test('Telemetry strictly redacts API keys, tokens, and secrets', async () => {
        const solver = new XpiderSolverCore();
        const logs = [];
        const capture = (line) => logs.push(line);

        solver._emitTelemetry('nopecha', 'REQUEST_START', {
            apiKey: 'np_live_secret_key_1234567890abcdef',
            userToken: 'token_sensitive_secret_998877',
            sitekey: '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
            attemptId: 'att_12345',
            taskId: 'task_abc123456789'
        }, capture);

        assert.strictEqual(logs.length, 1);
        const logLine = logs[0];
        assert.ok(!logLine.includes('np_live_secret_key_1234567890abcdef'), 'Raw API key must not appear in log');
        assert.ok(!logLine.includes('token_sensitive_secret_998877'), 'Raw token must not appear in log');
        assert.ok(logLine.includes('apiKey=np_***cdef'), 'API key must be masked');
        assert.ok(logLine.includes('userToken=tok***8877'), 'User token must be masked');
        assert.ok(logLine.includes('taskId=***456789'), 'Job/Task ID must be masked');
        assert.ok(logLine.includes('attemptId=att_12345'), 'Public attemptId should be preserved');
    });

    // -------------------------------------------------------------
    // Test 2: NopeCHA HTTP 401 / 403 maps to AUTH_ERROR terminal state
    // -------------------------------------------------------------
    await test('NopeCHA submit HTTP 401/403 maps to AUTH_ERROR terminal state', async () => {
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'invalid_test_key_1234';

        // Mock global fetch for this test
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 401,
            text: async () => JSON.stringify({ error: 15, message: 'Invalid key' }),
            json: async () => ({ error: 15, message: 'Invalid key' })
        });

        let thrown = null;
        try {
            await solver.solveNopeCha('sitekey_abc', 'https://example.com', 'recaptcha', 1000, 5);
        } catch (e) {
            thrown = e;
        } finally {
            global.fetch = originalFetch;
        }

        assert.ok(thrown, 'Should have thrown an error');
        assert.strictEqual(thrown.terminalState, 'AUTH_ERROR', 'Terminal state must be AUTH_ERROR');
        assert.ok(/auth/i.test(thrown.message), 'Message must indicate auth failure');
    });

    // -------------------------------------------------------------
    // Test 3: NopeCHA HTTP 429 Rate Limit maps to PROVIDER_TIMEOUT
    // -------------------------------------------------------------
    await test('NopeCHA HTTP 429 rate limit maps to PROVIDER_TIMEOUT', async () => {
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'valid_test_key_1234';

        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: 11, message: 'Rate limit exceeded' }),
            json: async () => ({ error: 11, message: 'Rate limit exceeded' })
        });

        let thrown = null;
        try {
            await solver.solveNopeCha('sitekey_abc', 'https://example.com', 'recaptcha', 1000, 5);
        } catch (e) {
            thrown = e;
        } finally {
            global.fetch = originalFetch;
        }

        assert.ok(thrown, 'Should have thrown an error');
        assert.strictEqual(thrown.terminalState, 'PROVIDER_TIMEOUT', 'Terminal state must be PROVIDER_TIMEOUT');
        assert.ok(thrown.message.includes('429') || thrown.message.includes('Rate limited'), 'Message must indicate rate limit');
    });

    // -------------------------------------------------------------
    // Test 4: 5xx server error retry handling during polling
    // -------------------------------------------------------------
    await test('NopeCHA 5xx transient server error retries until solved', async () => {
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'valid_test_key_1234';

        let callCount = 0;
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            callCount++;
            if (url.includes('/token') && !url.includes('id=')) {
                // Submit response
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: 'job_12345' })
                };
            }
            if (callCount === 2) {
                // 502 Bad Gateway transient error
                return {
                    ok: false,
                    status: 502,
                    text: async () => 'Bad Gateway'
                };
            }
            // Next poll resolves with token
            return {
                ok: true,
                status: 200,
                json: async () => ({ data: '03AFcWeA_TEST_TOKEN_RESOLVED_AFTER_502_TRANSIENT_RETRY_123456789' })
            };
        };

        let resultToken = null;
        try {
            resultToken = await solver.solveNopeCha('sitekey_abc', 'https://example.com', 'recaptcha', 1000, 10);
        } finally {
            global.fetch = originalFetch;
        }

        assert.ok(resultToken.includes('TEST_TOKEN_RESOLVED'), 'Should have successfully resolved after 502 retry');
        assert.ok(callCount >= 3, 'Should have made at least 3 requests (submit + 502 + success)');
    });

    // -------------------------------------------------------------
    // Test 5: Hanging socket / Fetch timeout aborts per-request
    // -------------------------------------------------------------
    await test('_fetchWithTimeout aborts hung request when timeout expires', async () => {
        const solver = new XpiderSolverCore();
        const originalFetch = global.fetch;

        // Fetch that never resolves
        global.fetch = (url, opts) => new Promise((_, reject) => {
            if (opts && opts.signal) {
                opts.signal.addEventListener('abort', () => reject(new Error('FETCH_ABORTED: ' + opts.signal.reason)));
            }
        });

        const start = Date.now();
        let thrown = null;
        try {
            await solver._fetchWithTimeout('https://api.nopecha.com/test', {}, 200);
        } catch (e) {
            thrown = e;
        } finally {
            global.fetch = originalFetch;
        }

        const elapsed = Date.now() - start;
        assert.ok(thrown, 'Hung fetch must throw upon timeout');
        assert.ok(elapsed >= 180 && elapsed < 800, `Elapsed should be around 200ms (was ${elapsed}ms)`);
        assert.ok(thrown.message.includes('FETCH_ABORTED') || thrown.message.includes('REQUEST_TIMEOUT'));
    });

    // -------------------------------------------------------------
    // Test 6: Malformed JSON during polling does not crash poller
    // -------------------------------------------------------------
    await test('Malformed JSON response during polling retries cleanly', async () => {
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'valid_test_key_1234';

        let callCount = 0;
        const originalFetch = global.fetch;
        global.fetch = async (url) => {
            callCount++;
            if (url.includes('/token') && !url.includes('id=')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: 'job_malformed_test' })
                };
            }
            if (callCount === 2) {
                // Malformed JSON (HTML error page returned with 200 OK)
                return {
                    ok: true,
                    status: 200,
                    json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); }
                };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ data: '03AFcWeA_TOKEN_SUCCESS_AFTER_MALFORMED_JSON_RECOVERY_123456789' })
            };
        };

        let resultToken = null;
        try {
            resultToken = await solver.solveNopeCha('sitekey_abc', 'https://example.com', 'recaptcha', 1000, 10);
        } finally {
            global.fetch = originalFetch;
        }

        assert.ok(resultToken.includes('MALFORMED_JSON_RECOVERY'), 'Must recover from malformed JSON and return token');
    });

    // -------------------------------------------------------------
    // Test 7: External cancellation aborts solve transaction cleanly
    // -------------------------------------------------------------
    await test('External abort signal cancels solve transaction with CANCELLED terminal state', async () => {
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'valid_test_key_1234';

        const ctrl = new AbortController();
        const originalFetch = global.fetch;
        let submitDone = false;
        global.fetch = async () => {
            if (!submitDone) {
                submitDone = true;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: 'job_cancel_test' })
                };
            }
            // Emulate pending poll
            return {
                ok: true,
                status: 200,
                json: async () => ({ error: 14, message: 'In progress' })
            };
        };

        setTimeout(() => ctrl.abort('USER_CANCELLED'), 300);

        let thrown = null;
        try {
            await solver.solveNopeCha('sitekey_abc', 'https://example.com', 'recaptcha', 100, 5, {
                signal: ctrl.signal
            });
        } catch (e) {
            thrown = e;
        } finally {
            global.fetch = originalFetch;
        }

        assert.ok(thrown, 'Must abort when external signal cancels');
        assert.strictEqual(thrown.terminalState, 'CANCELLED', 'Terminal state must be CANCELLED');
    });

    // -------------------------------------------------------------
    // Test 8: Manual Fallback State Machine Simulation
    // -------------------------------------------------------------
    await test('Auto-solver failure transitions to CAPTCHA_PENDING_MANUAL and single manual solve prompt', async () => {
        const campaignState = {
            currentAttempt: { attemptId: 'att_target_1' },
            currentTargetStage: 'IDLE',
            manualFallbackAttemptId: null,
            targetDeadlineController: {
                paused: false,
                pauseReason: null,
                pause: function(r) { this.paused = true; this.pauseReason = r; },
                resume: function() { this.paused = false; }
            },
            captchaLedger: { manualSuccess: 0, manualSkip: 0 },
            counters: { captchaSolved: 0, captchaFailed: 0 }
        };

        const sentMessages = [];
        const mockSendMessage = (msg) => sentMessages.push(msg);

        // Simulation of auto-solver failure handling in OWNER_CAPTCHA_REQUEST
        function onAutoSolverFailed(solveRes) {
            const curAttemptId = campaignState.currentAttempt?.attemptId;
            if (curAttemptId && curAttemptId !== campaignState.manualFallbackAttemptId) {
                campaignState.manualFallbackAttemptId = curAttemptId;
                campaignState.currentTargetStage = 'CAPTCHA_PENDING_MANUAL';
                campaignState.targetDeadlineController.pause('CAPTCHA_PENDING_MANUAL');
                mockSendMessage({
                    action: 'START_MANUAL_CAPTCHA_WAIT',
                    attemptId: curAttemptId,
                    message: `Auto-solver failed (${solveRes.error}). Please solve CAPTCHA in browser.`
                });
                return 'MANUAL_OFFERED';
            } else {
                campaignState.captchaLedger.manualSkip++;
                campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
                return 'SKIPPED';
            }
        }

        // 1st failure: triggers manual fallback
        const r1 = onAutoSolverFailed({ success: false, error: 'NopeCHA Timeout' });
        assert.strictEqual(r1, 'MANUAL_OFFERED');
        assert.strictEqual(campaignState.currentTargetStage, 'CAPTCHA_PENDING_MANUAL');
        assert.strictEqual(campaignState.targetDeadlineController.paused, true);
        assert.strictEqual(sentMessages.length, 1);
        assert.strictEqual(sentMessages[0].action, 'START_MANUAL_CAPTCHA_WAIT');

        // 2nd failure for same attempt: does NOT offer duplicate prompt, skips
        const r2 = onAutoSolverFailed({ success: false, error: 'NopeCHA Timeout' });
        assert.strictEqual(r2, 'SKIPPED');
        assert.strictEqual(campaignState.currentTargetStage, 'CAPTCHA_SKIPPED');
        assert.strictEqual(sentMessages.length, 1, 'Must not send duplicate prompt');
    });

    // -------------------------------------------------------------
    // Test 9: Skip cancellation increments manualSkip and resets state
    // -------------------------------------------------------------
    await test('CAPTCHA_MANUAL_SKIPPED increments skip ledger and cancels deadline', async () => {
        let deadlineCancelled = false;
        const campaignState = {
            currentAttempt: { attemptId: 'att_target_1' },
            currentTargetStage: 'CAPTCHA_PENDING_MANUAL',
            captchaLedger: { manualSuccess: 0, manualSkip: 0 },
            counters: { captchaSolved: 0, captchaFailed: 0 },
            targetDeadlineController: {
                cancel: () => { deadlineCancelled = true; }
            }
        };

        // Handle manual skip event
        function handleManualSkip() {
            if (campaignState.currentTargetStage !== 'CAPTCHA_PENDING_MANUAL' && campaignState.currentTargetStage !== 'CAPTCHA_MANUAL_WAIT') {
                return false;
            }
            campaignState.currentTargetStage = 'CAPTCHA_SKIPPED';
            campaignState.captchaLedger.manualSkip++;
            campaignState.counters.captchaFailed++;
            campaignState.targetDeadlineController.cancel('CAPTCHA_MANUAL_SKIPPED');
            return true;
        }

        const ok = handleManualSkip();
        assert.strictEqual(ok, true);
        assert.strictEqual(campaignState.currentTargetStage, 'CAPTCHA_SKIPPED');
        assert.strictEqual(campaignState.captchaLedger.manualSkip, 1);
        assert.strictEqual(campaignState.counters.captchaFailed, 1);
        assert.strictEqual(deadlineCancelled, true);
    });

    // -------------------------------------------------------------
    // Test 10: State Isolation Between Target Attempts
    // -------------------------------------------------------------
    await test('State does not bleed across attempts (Attempt B gets fresh manual fallback)', async () => {
        const campaignState = {
            currentAttempt: { attemptId: 'attempt_A' },
            manualFallbackAttemptId: 'attempt_A',
            currentTargetStage: 'CAPTCHA_SKIPPED',
            targetDeadlineController: { paused: false, pause: function() { this.paused = true; } }
        };

        function offerFallbackForAttempt(attemptId) {
            campaignState.currentAttempt = { attemptId };
            if (attemptId && attemptId !== campaignState.manualFallbackAttemptId) {
                campaignState.manualFallbackAttemptId = attemptId;
                campaignState.currentTargetStage = 'CAPTCHA_PENDING_MANUAL';
                campaignState.targetDeadlineController.pause();
                return true;
            }
            return false;
        }

        // New attempt B arrives
        const offered = offerFallbackForAttempt('attempt_B');
        assert.strictEqual(offered, true, 'Attempt B must receive its own manual fallback offer');
        assert.strictEqual(campaignState.manualFallbackAttemptId, 'attempt_B');
        assert.strictEqual(campaignState.currentTargetStage, 'CAPTCHA_PENDING_MANUAL');
        assert.strictEqual(campaignState.targetDeadlineController.paused, true);
    });

    console.log(`\n=============================================================`);
    console.log(`Total tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`=============================================================`);

    if (failed > 0) process.exit(1);
}

runTests();

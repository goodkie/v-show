/**
 * test/test_waf_block_classification_regressions.js
 *
 * Deterministic Regression Test Suite for Directive #6336861540:
 * Cloudflare WAF 1020 / Datacenter IP 403 Hard Block Fast-Fail Classification,
 * Negative Guards for Interactive CAPTCHAs & Normal Forms, and Exact Ledger Accounting.
 */

const assert = require('assert');
const path = require('path');
const { HistoryStore } = require('../extension/modules/history-store.js');

// Helper to create a lightweight mock Document for testing classifyWafBlock
function createMockDoc({ title = '', bodyText = '', selectors = [], headings = [] } = {}) {
    const selectorSet = new Set(selectors);
    return {
        title,
        body: {
            textContent: bodyText
        },
        querySelector: (sel) => {
            const parts = sel.split(',').map(s => s.trim());
            for (const p of parts) {
                if (selectorSet.has(p)) {
                    return { tagName: 'DIV', getAttribute: () => null };
                }
            }
            return null;
        },
        querySelectorAll: (sel) => {
            if (sel === 'h1, h2') {
                return headings.map(h => ({ textContent: h }));
            }
            const parts = sel.split(',').map(s => s.trim());
            const matches = [];
            for (const p of parts) {
                if (selectorSet.has(p)) {
                    matches.push({ tagName: 'DIV' });
                }
            }
            return matches;
        }
    };
}

// Setup minimal globals for content-script in Node test harness
if (typeof global.window === 'undefined') {
    global.window = {
        location: { href: 'https://example.com' },
        addEventListener: () => {},
        removeEventListener: () => {}
    };
}
if (typeof global.document === 'undefined') {
    global.document = {
        title: '',
        body: { textContent: '' },
        querySelector: () => null,
        querySelectorAll: () => []
    };
}
if (typeof global.chrome === 'undefined') {
    global.chrome = {
        runtime: {
            sendMessage: () => Promise.resolve(),
            onMessage: { addListener: () => {}, removeListener: () => {} }
        }
    };
}

// Extract classifyWafBlock from content-script module
const contentScript = require('../extension/content-script.js');
const classifyWafBlock = contentScript.classifyWafBlock;

console.log('=== TEST SUITE: WAF BLOCK CLASSIFICATION & ACCOUNTING REGRESSIONS ===\n');

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
    // Test 1: Cloudflare 1020 Hard Block Detection (<100ms)
    // -------------------------------------------------------------
    await test('Cloudflare 1020 WAF page is classified as ACCESS_BLOCKED_WAF with Ray ID', async () => {
        const start = Date.now();
        const mockDoc = createMockDoc({
            title: 'Access denied | lititzmartialarts.com used Cloudflare to restrict access',
            bodyText: `
                Please stand by, while we are checking your browser...
                Why have I been blocked?
                This website is using a security service to protect itself from online attacks.
                The action you just performed triggered the security solution.
                There are several actions that could trigger this block including submitting a certain word or phrase.
                Cloudflare Ray ID: 8d6694e22a1b415b • Your IP: 143.198.40.33 • Performance & security by Cloudflare
            `,
            selectors: ['#cf-error-details']
        });

        const res = classifyWafBlock(mockDoc);
        const elapsed = Date.now() - start;

        assert.strictEqual(res.isBlocked, true, 'Page must be classified as blocked');
        assert.strictEqual(res.vendor, 'cloudflare', 'WAF vendor must be cloudflare');
        assert.strictEqual(res.reasonCode, 'ACCESS_BLOCKED_WAF', 'reasonCode must be ACCESS_BLOCKED_WAF');
        assert.strictEqual(res.rayId, '8d6694e22a1b415b', 'Ray ID must be accurately extracted');
        assert.ok(elapsed < 100, `Classification must complete in <100ms (took ${elapsed}ms)`);
    });

    // -------------------------------------------------------------
    // Test 2: Generic 403 Access Denied Detection
    // -------------------------------------------------------------
    await test('Generic 403 Forbidden / Access Denied is classified as ACCESS_BLOCKED_WAF', async () => {
        const mockDoc = createMockDoc({
            title: '403 Forbidden',
            bodyText: `
                Access Denied
                You don't have permission to access /contact on this server.
                Additionally, a 403 Forbidden error was encountered while trying to use an ErrorDocument to handle the request.
            `,
            headings: ['403 Forbidden', 'Access Denied']
        });

        const res = classifyWafBlock(mockDoc);
        assert.strictEqual(res.isBlocked, true, 'Generic 403 must be detected as blocked');
        assert.strictEqual(res.vendor, 'generic_waf');
        assert.strictEqual(res.reasonCode, 'ACCESS_BLOCKED_WAF');
    });

    // -------------------------------------------------------------
    // Test 3: Normal Interactive CAPTCHA Negative Guard
    // -------------------------------------------------------------
    await test('Negative Guard: Interactive challenge widget is NOT classified as WAF hard block', async () => {
        const mockDoc = createMockDoc({
            title: 'Just a moment...',
            bodyText: 'Verify you are human. Cloudflare Ray ID: 8d6694e22a1b415b',
            selectors: ['#challenge-stage', '.cf-turnstile']
        });

        const res = classifyWafBlock(mockDoc);
        assert.strictEqual(res.isBlocked, false, 'Interactive challenge page must NOT be classified as hard WAF block');
    });

    // -------------------------------------------------------------
    // Test 4: Normal Form Negative Guard
    // -------------------------------------------------------------
    await test('Negative Guard: Page with real contact form is NOT classified as WAF block', async () => {
        const mockDoc = createMockDoc({
            title: 'Contact Us - Security Service Provider',
            bodyText: 'Welcome to our online security portal. Fill out the form below to get in touch.',
            selectors: ['form textarea', 'form input[type="email"]']
        });

        const res = classifyWafBlock(mockDoc);
        assert.strictEqual(res.isBlocked, false, 'Page with legitimate form fields must NOT be classified as blocked');
    });

    // -------------------------------------------------------------
    // Test 5: HistoryStore classifyFailure maps to SECURITY_BLOCKED
    // -------------------------------------------------------------
    await test('HistoryStore maps ACCESS_BLOCKED_WAF to SECURITY_BLOCKED failureClass', async () => {
        const hs = new HistoryStore();
        
        const fClass = hs.classifyFailure('FAILURE', 'ACCESS_BLOCKED_WAF', {
            wafVendor: 'CLOUDFLARE_WAF',
            rayId: '8d6694e22a1b415b'
        });

        assert.strictEqual(fClass, 'SECURITY_BLOCKED', 'ACCESS_BLOCKED_WAF must classify as SECURITY_BLOCKED');
    });

    // -------------------------------------------------------------
    // Test 6: Ledger Accounting and Counter Invariance
    // -------------------------------------------------------------
    await test('Ledger accounting on ACCESS_BLOCKED_WAF: failed+1, timeout unchanged, CAPTCHA unchanged', async () => {
        const hs = new HistoryStore();
        const runId = 'test_run_' + Date.now();
        hs.activeCampaignRunId = runId;

        // Register initial row via canonical ingestImportRows
        const importRes = await hs.ingestImportRows(['https://lititzmartialarts.com'], runId);
        assert.strictEqual(importRes.rows.length, 1);

        // Create attempt via recordAttempt
        const attempt = await hs.recordAttempt('https://lititzmartialarts.com', {
            campaignRunId: runId,
            importId: runId
        });

        // Settle as ACCESS_BLOCKED_WAF
        await hs.settleCanonicalAttempt(attempt.attemptId, 'FAILURE', 'ACCESS_BLOCKED_WAF', {
            wafVendor: 'CLOUDFLARE_WAF',
            rayId: '8d6694e22a1b415b'
        }, {
            campaignRunId: runId,
            submissionStatus: 'FAILURE'
        });

        // Verify stats
        const stats = hs.getLedgerStats('currentRun', runId);
        assert.strictEqual(stats.completed, 1, 'completed must be 1');
        assert.strictEqual(stats.failure, 1, 'failure must be 1');
        assert.strictEqual(stats.success, 0, 'success must be 0');
        assert.strictEqual(stats.timeout, 0, 'timeout must be 0 (NOT incremented)');
        assert.strictEqual(stats.unknown, 0, 'unknown must be 0');
        assert.strictEqual(stats.skipped, 0, 'skipped must be 0');
        assert.strictEqual(stats.pending, 0, 'pending must be 0');

        // Verify attempt record
        const rec = hs.attempts.find(a => a.attemptId === attempt.attemptId);
        assert.strictEqual(rec.status, 'FAILURE');
        assert.strictEqual(rec.reasonCode, 'ACCESS_BLOCKED_WAF');
        assert.strictEqual(rec.failureClass, 'SECURITY_BLOCKED');
        assert.strictEqual(rec.outcomeEvidence.wafVendor, 'CLOUDFLARE_WAF');
        assert.strictEqual(rec.outcomeEvidence.rayId, '8d6694e22a1b415b');
    });

    console.log(`\n=============================================================`);
    console.log(`Total tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`=============================================================`);

    if (failed > 0) process.exit(1);
}

runTests();

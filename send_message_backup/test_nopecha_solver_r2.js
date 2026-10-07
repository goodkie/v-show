const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("================================================================");
console.log(" NOPECHA SOLVER & ANTI-STAMPEDE DEDUPLICATION TEST SUITE");
console.log("================================================================");

let passed = 0;
let total = 0;

function runTest(name, fn) {
    total++;
    try {
        fn();
        console.log(`✅ [PASS] ${total}. ${name}`);
        passed++;
    } catch (e) {
        console.error(`❌ [FAIL] ${total}. ${name}: ${e.message}`);
    }
}

async function runAsyncTest(name, fn) {
    total++;
    try {
        await fn();
        console.log(`✅ [PASS] ${total}. ${name}`);
        passed++;
    } catch (e) {
        console.error(`❌ [FAIL] ${total}. ${name}: ${e.message}`);
    }
}

(async () => {
    const bgSrc = fs.readFileSync(path.join(__dirname, 'build/extension/background.js'), 'utf8');
    const solverCoreSrc = fs.readFileSync(path.join(__dirname, 'build/extension/solver-core.js'), 'utf8');
    const solverContentSrc = fs.readFileSync(path.join(__dirname, 'build/extension/solver-content.js'), 'utf8');

    // Test 1: NopeCHA Bearer Auth Header & /token endpoint
    runTest('NopeCHA uses Bearer Auth and /token endpoint', () => {
        assert(solverCoreSrc.includes("'Authorization': `Bearer ${this.config.nopeChaKey}`"), 'Must use Bearer auth header');
        assert(solverCoreSrc.includes("let submitUrl = 'https://api.nopecha.com/token'"), 'Must submit to /token');
        assert(solverCoreSrc.includes("pollUrl = `${submitUrl}?id=${encodeURIComponent(jobId)}&key=${encodeURIComponent(this.config.nopeChaKey)}`"), 'Must poll same endpoint with id and key');
    });

    // Test 2: NopeCHA GET request does not include Content-Type
    runTest('NopeCHA GET poll does not carry Content-Type header', () => {
        assert(solverCoreSrc.includes("const getHeaders = { 'Authorization': `Bearer ${this.config.nopeChaKey}` }"), 'Must use getHeaders without Content-Type');
        assert(solverCoreSrc.includes("getRes = await fetch(pollUrl, { headers: getHeaders })"), 'Must fetch with getHeaders');
    });

    // Test 3: Rate limit Error 11 backoff and retry
    runTest('NopeCHA Error 11 Rate Limit backoff and retry logic present', () => {
        assert(solverCoreSrc.includes("postData.error === 11"), 'Must detect submit Error 11');
        assert(solverCoreSrc.includes("getData.error === 11"), 'Must detect poll Error 11');
        assert(solverCoreSrc.includes("Backing off"), 'Must back off on rate limit');
    });

    // Test 4: Incomplete job Error 14 handled
    runTest('NopeCHA Error 14 Incomplete Job continues polling', () => {
        assert(solverCoreSrc.includes("getData.error === 14"), 'Must handle Error 14');
    });

    // Test 5: Single-flight concurrency lock in background.js
    runTest('background.js implements single-flight concurrency lock for SOLVE_CAPTCHA', () => {
        assert(bgSrc.includes("globalThis.__xpider_activeSolvingPromises = new Map()"), 'Must create activeSolvingPromises map');
        assert(bgSrc.includes("globalThis.__xpider_activeSolvingPromises.has(dedupeKey)"), 'Must check for in-flight request with dedupeKey');
        assert(bgSrc.includes("Joining single-flight execution"), 'Must join existing single-flight request');
        assert(bgSrc.includes("globalThis.__xpider_activeSolvingPromises.delete(dedupeKey)"), 'Must cleanup promise in finally block');
    });

    // Test 6: Multi-frame token injection on NopeCHA success
    runTest('background.js injects token across frames on NopeCHA success', () => {
        const nopechaBlock = bgSrc.substring(bgSrc.indexOf("if (method === 'nopecha' && solver.config.nopeChaKey)"), bgSrc.indexOf("// [Priority 3] Autonomous Multi-Tier Fallback Chain"));
        assert(nopechaBlock.includes("await injectSolvedToken(token, request.type || 'recaptcha')"), 'Must call injectSolvedToken on NopeCHA success');
        assert(nopechaBlock.includes("NopeCHA SUCCESS"), 'Must log success');
    });

    // Test 7: Auto-fallback from NopeCHA to 2Captcha and Wit.ai
    runTest('background.js implements auto-fallback when NopeCHA fails', () => {
        const nopechaBlock = bgSrc.substring(bgSrc.indexOf("if (method === 'nopecha' && solver.config.nopeChaKey)"), bgSrc.indexOf("// [Priority 3] Autonomous Multi-Tier Fallback Chain"));
        assert(nopechaBlock.includes("Attempting auto-fallback to 2Captcha"), 'Must attempt fallback to 2Captcha');
        assert(nopechaBlock.includes("Auto-fallback to Wit.ai Audio Solver"), 'Must attempt fallback to Wit.ai');
    });

    // Test 8: solver-content.js frame dispatch cooldown
    runTest('solver-content.js enforces dispatch cooldown', () => {
        assert(solverContentSrc.includes("this.lastSolveRequestTime"), 'Must track lastSolveRequestTime');
        assert(solverContentSrc.includes("nowSolve - this.lastSolveRequestTime < 4000"), 'Must enforce min 4000ms cooldown per frame');
    });

    // Test 9: Functional test of solveNopeCha mock
    await runAsyncTest('Functional mock execution of solveNopeCha flow', async () => {
        const { XpiderSolverCore } = require('./build/extension/solver-core.js');
        const solver = new XpiderSolverCore();
        solver.config.nopeChaKey = 'test_key_abc';

        let postCalled = false;
        let getCalled = 0;

        // Mock global fetch
        const originalFetch = global.fetch;
        global.fetch = async (url, opts) => {
            if (opts && opts.method === 'POST') {
                postCalled = true;
                assert(opts.headers['Authorization'] === 'Bearer test_key_abc', 'POST must have Bearer header');
                assert(opts.headers['Content-Type'] === 'application/json', 'POST must have Content-Type');
                const body = JSON.parse(opts.body);
                assert(body.key === 'test_key_abc', 'Body must contain key');
                assert(body.type === 'recaptcha2', 'Default type must normalize to recaptcha2');
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: 'job_12345' })
                };
            } else {
                getCalled++;
                assert(opts.headers['Authorization'] === 'Bearer test_key_abc', 'GET must have Bearer header');
                assert(!opts.headers['Content-Type'], 'GET must not have Content-Type header');
                assert(url.includes('id=job_12345'), 'Poll URL must contain job id');
                assert(url.includes('key=test_key_abc'), 'Poll URL must contain key param');
                if (getCalled === 1) {
                    // Simulate incomplete job
                    return {
                        ok: true,
                        status: 409,
                        json: async () => ({ error: 14, message: 'Incomplete job' })
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ data: '03AFcWeA7TokenStringLongEnoughToPassValidation12345' })
                };
            }
        };

        try {
            const token = await solver.solveNopeCha('6Ld8-rwtAAAAAKpn...', 'https://example.com/contact', 'recaptcha', 10, 10);
            assert(postCalled, 'Must have called POST');
            assert(getCalled === 2, 'Must have polled twice (1st: incomplete, 2nd: resolved)');
            assert(token.startsWith('03AFcWeA7'), 'Must return valid token');
        } finally {
            global.fetch = originalFetch;
        }
    });

    console.log("================================================================");
    console.log(` RESULTS: ${passed} PASSED / ${total - passed} FAILED`);
    console.log("================================================================");
    if (passed !== total) process.exit(1);
})();

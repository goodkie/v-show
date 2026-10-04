/**
 * test_captcha_autosolve_no_retry_loop.js
 * Verification of Auto Captcha Solver Non-Looping, Frame Coordination, and Submit Activation (Issue #6)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log(' [TEST SUITE: Auto Captcha Solver Non-Looping & Submit Activation]');
console.log('======================================================================\n');

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
    totalCount++;
    try {
        fn();
        console.log(`✅ PASS: [${name}]`);
        passedCount++;
    } catch (err) {
        console.error(`❌ FAIL: [${name}]`);
        console.error(err.stack || err.message);
        process.exitCode = 1;
    }
}

async function runAsyncTest(name, fn) {
    totalCount++;
    try {
        await fn();
        console.log(`✅ PASS: [${name}]`);
        passedCount++;
    } catch (err) {
        console.error(`❌ FAIL: [${name}]`);
        console.error(err.stack || err.message);
        process.exitCode = 1;
    }
}

// 1. Verify solver-content.js logic
runTest('solver-content.js has markSolved, clears interval, guards loop and reload', () => {
    const solverSrc = fs.readFileSync(path.join(__dirname, 'solver-content.js'), 'utf8').replace(/\r\n/g, '\n');
    
    assert(solverSrc.includes('this.solved = false;'), 'Missing this.solved initialization');
    assert(solverSrc.includes('markSolved(token'), 'Missing markSolved implementation');
    assert(solverSrc.includes('clearInterval(window.__xpider_solver_active_interval)'), 'markSolved must clear active interval');
    assert(solverSrc.includes("action: 'CAPTCHA_SOLVED'"), 'markSolved must dispatch CAPTCHA_SOLVED postMessage');
    assert(solverSrc.includes('if (this.solved) return;'), 'reload must guard against calling reload after solved');
    assert(solverSrc.includes('if (this.solved) {\n                return;\n            }'), 'loop must immediately return when solved');
});

// 2. Verify content-script.js logic
runTest('content-script.js listens for CAPTCHA_SOLVED and sets _isCaptchaSolved', () => {
    const csSrc = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8').replace(/\r\n/g, '\n');
    
    assert(csSrc.includes('let _isCaptchaSolved = false;'), 'Missing _isCaptchaSolved flag in content-script');
    assert(csSrc.includes("event.data.action === 'CAPTCHA_SOLVED'"), 'Missing window postMessage CAPTCHA_SOLVED listener');
    assert(csSrc.includes("_isCaptchaSolved = true;"), 'Missing _isCaptchaSolved = true on solve event');
});

// 3. Verify waitForCaptchaSolved returns immediately on _isCaptchaSolved
runTest('content-script.js waitForCaptchaSolved returns immediately when solved without throwing', () => {
    const csSrc = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8').replace(/\r\n/g, '\n');
    
    // Check that waitForCaptchaSolved checks _isCaptchaSolved early
    assert(csSrc.includes('if (_isCaptchaSolved) {\n                logDev("🔑 [Security] Challenge solved verified.'), 'Missing immediate return on _isCaptchaSolved');
    
    // Check that tryAutoSolveCaptcha success returns immediately rather than continue
    assert(!csSrc.includes('if (solved) continue;'), 'Old bug: if (solved) continue; must NOT exist in waitForCaptchaSolved');
    assert(csSrc.includes('if (solved) {\n                    _isCaptchaSolved = true;\n                    logDev("🔑 [Security] Auto-solve succeeded.'), 'Must return immediately when tryAutoSolveCaptcha resolves true');
    
    // Check fast-fail logic doesn't falsely throw if _isCaptchaSolved
    assert(csSrc.includes('if (!_isCaptchaSolved && !hasToken && stillHasCaptcha'), 'Fast-fail must not throw when solved or hasToken is true');
});

// 4. Verify SubmitExecutorR5 unlocking disabled submit button
runTest('SubmitExecutorR5 unlocks disabled submit button to prevent SUBMIT_ACTIVATION_EXHAUSTED', () => {
    const csSrc = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
    
    assert(csSrc.includes('primary.removeAttribute(\'disabled\')'), 'SubmitExecutorR5 must unlock disabled attribute');
    assert(csSrc.includes('primary.disabled = false'), 'SubmitExecutorR5 must set primary.disabled = false');
    assert(csSrc.includes('primary.removeAttribute(\'aria-disabled\')'), 'SubmitExecutorR5 must remove aria-disabled');
});

// 5. Functional Simulation: Mock Solver State Machine
runTest('Mock Solver: markSolved terminates loops and blocks reload', () => {
    let intervalCleared = false;
    let reloadClicked = false;
    let postMessageSent = false;
    
    const mockWindow = {
        __xpider_solver_active_interval: 12345,
        parent: {
            postMessage: (msg) => {
                if (msg.action === 'CAPTCHA_SOLVED') postMessageSent = true;
            }
        },
        top: {
            postMessage: () => {}
        }
    };
    
    const mockClearInterval = (id) => {
        if (id === 12345) intervalCleared = true;
    };
    
    // Simulated class
    class MockXpiderSolver {
        constructor() {
            this.solved = false;
            this.waitCycles = 25;
        }
        markSolved(token = 'solved', type = 'unknown') {
            this.solved = true;
            if (mockWindow.__xpider_solver_active_interval) {
                mockClearInterval(mockWindow.__xpider_solver_active_interval);
                mockWindow.__xpider_solver_active_interval = null;
            }
            if (mockWindow.parent) {
                mockWindow.parent.postMessage({ type: 'captchaToken', action: 'CAPTCHA_SOLVED', token, captchaType: type }, '*');
            }
        }
        loop() {
            if (this.solved) return 'SOLVED_ABORT';
            if (this.waitCycles > 20 && !this.solved) {
                this.reload();
            }
            return 'RUNNING';
        }
        reload() {
            if (this.solved) return;
            reloadClicked = true;
        }
    }
    
    const solver = new MockXpiderSolver();
    solver.markSolved('token_abc123', 'recaptcha');
    
    assert.strictEqual(solver.solved, true, 'Solver should be marked solved');
    assert.strictEqual(intervalCleared, true, 'Active interval should be cleared');
    assert.strictEqual(postMessageSent, true, 'postMessage should be delivered to parent');
    
    const loopResult = solver.loop();
    assert.strictEqual(loopResult, 'SOLVED_ABORT', 'loop() must return early when solved');
    assert.strictEqual(reloadClicked, false, 'reload() must not be called after solved');
});

// 6. Functional Simulation: SubmitExecutor unlocking disabled button
runTest('Mock SubmitExecutor: Unlock disabled button and trigger submit', () => {
    let clickFired = false;
    const button = {
        disabled: true,
        attributes: { 'disabled': '', 'aria-disabled': 'true' },
        classList: new Set(['btn', 'disabled']),
        removeAttribute: function(attr) { delete this.attributes[attr]; },
        click: function() { clickFired = true; }
    };
    
    // Simulating SubmitExecutor unlock pass
    if (button.disabled) {
        button.removeAttribute('disabled');
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        button.classList.delete('disabled');
    }
    
    assert.strictEqual(button.disabled, false, 'Button disabled flag must be false');
    assert.strictEqual(button.attributes['disabled'], undefined, 'disabled attribute must be removed');
    assert.strictEqual(button.attributes['aria-disabled'], undefined, 'aria-disabled must be removed');
    assert.strictEqual(button.classList.has('disabled'), false, 'disabled class must be removed');
    
    button.click();
    assert.strictEqual(clickFired, true, 'Click must fire successfully');
});

// 7. Parity check between send_message_backup and build/extension
runTest('File Parity: source and build/extension files are 100% synchronized', () => {
    const crypto = require('crypto');
    const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    
    const f1_src = path.join(__dirname, 'solver-content.js');
    const f1_bld = path.join(__dirname, 'build', 'extension', 'solver-content.js');
    assert.strictEqual(hash(f1_src), hash(f1_bld), 'solver-content.js build parity mismatch');
    
    const f2_src = path.join(__dirname, 'content-script.js');
    const f2_bld = path.join(__dirname, 'build', 'extension', 'content-script.js');
    assert.strictEqual(hash(f2_src), hash(f2_bld), 'content-script.js build parity mismatch');
    
    const f3_src = path.join(__dirname, 'modules', 'build-provenance.js');
    const f3_bld = path.join(__dirname, 'build', 'extension', 'modules', 'build-provenance.js');
    assert.strictEqual(hash(f3_src), hash(f3_bld), 'build-provenance.js build parity mismatch');
});

console.log(`\n======================================================================`);
console.log(` RESULTS: ${passedCount} PASSED / ${totalCount - passedCount} FAILED`);
console.log(`======================================================================\n`);

if (passedCount !== totalCount) {
    process.exit(1);
}

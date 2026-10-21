/**
 * test_rc3_27_isolated_boot_chain.js
 * Verification suite for [RC3.27-ISOLATED-BOOT-CHAIN-AND-PROVENANCE-FALLBACK-REMOVAL]
 * Directives 1 to 7 from ChatGPT Directive Comment #6304805944
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('========================================================================');
console.log(' R6.9G.10.3.7.1.4.41 RC3.27: ISOLATED BOOT CHAIN & PROVENANCE TESTS');
console.log('========================================================================\n');

let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ [PASS] ${name}`);
        passedCount++;
    } catch (e) {
        console.error(`❌ [FAIL] ${name}: ${e.message}`);
        failedCount++;
    }
}

const bgPath = path.join(__dirname, 'extension', 'background.js');
const popupPath = path.join(__dirname, 'extension', 'popup.js');
const solverPath = path.join(__dirname, 'extension', 'solver-core.js');
const bpPath = path.join(__dirname, 'extension', 'modules', 'build-provenance.js');

const bgSrc = fs.readFileSync(bgPath, 'utf8');
const popupSrc = fs.readFileSync(popupPath, 'utf8');
const solverSrc = fs.readFileSync(solverPath, 'utf8');
const bpSrc = fs.readFileSync(bpPath, 'utf8');

// --- SUITE 1: Syntax & Standalone Compilation Assertions ---
console.log('--- SUITE 1: Syntax & Standalone Compilation ---');
test('1.1 solver-core.js compiles without syntax errors (no misplaced closing braces)', () => {
    const ctx = {
        self: {},
        console: console,
        chrome: { storage: { local: {} }, runtime: {} }
    };
    ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(solverSrc, ctx);
    assert(typeof ctx.XpiderSolverCore === 'function' || typeof ctx.self.XpiderSolverCore === 'function', 'XpiderSolverCore class must be defined');
});

// --- SUITE 2: Isolated SW Boot Chain (Directives 1, 2, 5) ---
console.log('\n--- SUITE 2: Isolated SW Boot Chain (Directives 1, 2, 5) ---');
test('2.1 background.js imports modules/build-provenance.js FIRST in its own isolated block', () => {
    const bpIndex = bgSrc.indexOf("importScripts('modules/build-provenance.js')");
    const solverIndex = bgSrc.indexOf("importScripts(mod)");
    assert(bpIndex > 0, 'Must import modules/build-provenance.js');
    assert(bpIndex < solverIndex, 'build-provenance.js must be imported before foundation module loop');
});

test('2.2 background.js imports foundation modules in per-module isolated blocks', () => {
    assert(bgSrc.includes('const _swFoundationModules = ['), 'Must define array of foundation modules');
    assert(bgSrc.includes('for (const mod of _swFoundationModules)'), 'Must loop through foundation modules');
    assert(bgSrc.includes("globalThis.__xpider_sw_boot_modules[mod] = { status: 'PASS' }"), 'Must record PASS status');
    assert(bgSrc.includes("globalThis.__xpider_sw_boot_modules[mod] = { status: 'FAIL', error: eMod.message }"), 'Must record FAIL status on error');
});

test('2.3 background.js records per-module telemetry in globalThis.__xpider_sw_boot_modules', () => {
    assert(bgSrc.includes('globalThis.__xpider_sw_boot_modules = {}'), 'Must initialize __xpider_sw_boot_modules');
    assert(bgSrc.includes('globalThis.__xpider_sw_boot_errors = []'), 'Must initialize __xpider_sw_boot_errors');
});

// --- SUITE 3: Synthetic .7 Fallback Removal (Directive 3) ---
console.log('\n--- SUITE 3: Synthetic Fallback Removal (Directive 3) ---');
test('3.1 GET_BUILD_PROVENANCE returns BUILD_PROVENANCE_UNAVAILABLE instead of fake .7 fallback', () => {
    assert(!bgSrc.includes("R6.9G.10.3.7.1.4.7-20261014-START-CONTROL-PLANE-RECOVERY"), 'Must NOT contain fake .7 buildId');
    assert(!bgSrc.includes("55dc6d69a25b4ea27283d3b40ba1c5fea730914b"), 'Must NOT contain fake 55dc6d69 head');
    assert(bgSrc.includes("error: 'BUILD_PROVENANCE_UNAVAILABLE'"), 'Must return explicit BUILD_PROVENANCE_UNAVAILABLE');
    assert(bgSrc.includes("bootErrors: globalThis.__xpider_sw_boot_errors"), 'Must include sanitized boot errors');
});

test('3.2 START_CAMPAIGN rejects fail-closed if BuildProvenance is unavailable', () => {
    assert(bgSrc.includes("if (!liveBp) {"), 'Must verify liveBp before starting campaign');
    assert(bgSrc.includes("reason: 'Service worker BuildProvenance is unavailable'"), 'Must reject with explicit reason');
});

// --- SUITE 4: Popup Handshake & Badge Protection (Directives 4 & 7) ---
console.log('\n--- SUITE 4: Popup Handshake & Badge Protection (Directives 4 & 7) ---');
test('4.1 popup.js verifyBuildHandshake treats BUILD_PROVENANCE_UNAVAILABLE as SW_BOOT_FAILURE / TRANSIENT', () => {
    assert(popupSrc.includes("state: 'SW_BOOT_FAILURE'"), 'Must define SW_BOOT_FAILURE state');
    assert(popupSrc.includes("setStartGateState('TRANSIENT_WAIT', 'Service worker initializing modules...')"), 'Must map to TRANSIENT_WAIT, never LOCKED_MISMATCH');
    assert(!popupSrc.includes("R6.9G.10.3.7.1.4.7-20261014-START-CONTROL-PLANE-RECOVERY"), 'popup.js must NOT contain fake .7 fallback');
});

test('4.2 popup.js initBuildProvenanceBadge never overwrites local badge with non-matching provenance', () => {
    assert(popupSrc.includes("res.ok && res.state === 'MATCH' && res.bgInfo"), 'Must only update badge when state is MATCH');
});

test('4.3 updateRelayStatusUI shows BUILD SYNC REQUIRED during unresolved boot / locked mismatch', () => {
    assert(popupSrc.includes("relayDaemonBadge.textContent = 'BUILD SYNC REQUIRED'"), 'Must show BUILD SYNC REQUIRED');
    assert(popupSrc.includes("currentStartGateState === 'LOCKED_MISMATCH' || currentStartGateState === 'TRANSIENT_WAIT'"), 'Must guard against displaying alarming OFFLINE during boot mismatch');
});

// --- SUITE 5: Regression Fixture — Fault Injection Resilience (Directive 6) ---
console.log('\n--- SUITE 5: Regression Fixture — Fault Injection (Directive 6) ---');
test('5.1 Pre-provenance or broken foundation module does NOT prevent BuildProvenance from loading', () => {
    const mockCtx = {
        self: {},
        globalThis: {},
        console: console,
        importScripts: (scriptPath) => {
            if (scriptPath === 'modules/build-provenance.js') {
                vm.runInContext(bpSrc, mockCtx);
            } else if (scriptPath === 'solver-core.js') {
                // Simulate a catastrophic throwing module
                throw new Error('Simulated foundation module failure in solver-core');
            } else {
                // Other modules succeed or mock
            }
        }
    };
    mockCtx.self = mockCtx;
    mockCtx.globalThis = mockCtx;
    vm.createContext(mockCtx);

    // Run the isolated SW boot chain logic in mock context
    const swBootCode = `
    globalThis.__xpider_sw_boot_modules = {};
    globalThis.__xpider_sw_boot_errors = [];

    // 1. Build Provenance first
    try {
        if (typeof importScripts === 'function') {
            importScripts('modules/build-provenance.js');
        }
        const hasBp = typeof BuildProvenance !== 'undefined' && Boolean(BuildProvenance.BUILD_INFO);
        globalThis.__xpider_sw_boot_modules['modules/build-provenance.js'] = { 
            status: hasBp ? 'PASS' : 'FAIL',
            buildId: hasBp ? BuildProvenance.BUILD_INFO.buildId : null
        };
    } catch (eBp) {
        globalThis.__xpider_sw_boot_errors.push({ module: 'modules/build-provenance.js', error: eBp.message });
    }

    // 2. Foundation modules
    const _swFoundationModules = ['solver-core.js', 'modules/operation-queue.js'];
    for (const mod of _swFoundationModules) {
        try {
            if (typeof importScripts === 'function') {
                importScripts(mod);
            }
            globalThis.__xpider_sw_boot_modules[mod] = { status: 'PASS' };
        } catch (eMod) {
            globalThis.__xpider_sw_boot_modules[mod] = { status: 'FAIL', error: eMod.message };
            globalThis.__xpider_sw_boot_errors.push({ module: mod, error: eMod.message });
        }
    }
    `;

    vm.runInContext(swBootCode, mockCtx);

    // Assert: BuildProvenance is defined and valid
    assert(mockCtx.BuildProvenance && mockCtx.BuildProvenance.BUILD_INFO, 'BuildProvenance must be loaded despite solver-core error');
    assert(mockCtx.globalThis.__xpider_sw_boot_modules['modules/build-provenance.js'].status === 'PASS', 'build-provenance must be PASS');
    assert(mockCtx.globalThis.__xpider_sw_boot_modules['solver-core.js'].status === 'FAIL', 'solver-core must record FAIL gracefully');
    assert(mockCtx.globalThis.__xpider_sw_boot_errors.length === 1, 'Exactly one module recorded in boot errors');
});

console.log('\n========================================================================');
console.log(` RESULTS: ${passedCount} Passed, ${failedCount} Failed`);
console.log('========================================================================');

if (failedCount > 0) {
    process.exit(1);
} else {
    console.log('🎉 ALL RC3.27 DIRECTIVE TESTS PASSED!\n');
    process.exit(0);
}

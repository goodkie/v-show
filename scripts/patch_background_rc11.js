const fs = require('fs');
const path = require('path');

const bgPath = path.join(__dirname, '..', 'extension', 'background.js');
let bg = fs.readFileSync(bgPath, 'utf8');

console.log('Original length:', bg.length);

// 1. Replace XpiderSolverCore block and boot credential restore
const solverStart = "if (typeof self.XpiderSolverCore === 'undefined') {";
const solverEnd = 'console.log("[X PIDER] Background script initializing (Unified Mode)...");';

const startIndex = bg.indexOf(solverStart);
const endIndex = bg.indexOf(solverEnd);

if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    console.error('Failed to locate solver block', { startIndex, endIndex });
    process.exit(1);
}

const replacementSolver = `// [v7.0.0-rc11 P0 Item 4] In-app solvers retired (Wit.ai, Whisper, NopeCHA, 2Captcha, Audio STT bypass).
// Retain ChallengeGate detection/verification and user/external-extension handling (CAPTCHA_PENDING_EXTERNAL_USER).
if (typeof self.XpiderSolverCore === 'undefined') {
    self.XpiderSolverCore = class XpiderSolverCore {
        constructor(config = {}) {
            this.config = { retired: true };
        }
        async transcribeAudio() {
            throw new Error("IN_APP_SOLVER_RETIRED: In-app audio STT solver has been retired.");
        }
        async solve2Captcha() {
            throw new Error("IN_APP_SOLVER_RETIRED: 2Captcha API solver has been retired.");
        }
        async solveNopeCha() {
            throw new Error("IN_APP_SOLVER_RETIRED: NopeCHA API solver has been retired.");
        }
        async solveSmartFallbackChain() {
            return { success: false, error: "IN_APP_SOLVER_RETIRED" };
        }
    };
}

markBoot("solver_instantiation");
const solver = new self.XpiderSolverCore();
let solverDiagnosticsState = { provider: 'external_or_user', keyConfigured: false, keySource: 'none', lastSyncedAt: Date.now() };

`;

bg = bg.slice(0, startIndex) + replacementSolver + bg.slice(endIndex);
console.log('Post solver replacement length:', bg.length);

// 2. In SOLVE_CAPTCHA, replace lines from `// [Priority 1] 2Captcha token solver` to `throw new Error(\`CAPTCHA solver: no valid method/key configured`
const solveCapStart = "// [Priority 1] 2Captcha token solver";
const solveCapEnd = "throw new Error(`CAPTCHA solver: no valid method/key configured (method: ${method}). Configure API key in Settings.`);";

const capStartIndex = bg.indexOf(solveCapStart);
const capEndIndex = bg.indexOf(solveCapEnd);

if (capStartIndex === -1 || capEndIndex === -1 || capStartIndex >= capEndIndex) {
    console.error('Failed to locate SOLVE_CAPTCHA block', { capStartIndex, capEndIndex });
    process.exit(1);
}

const replacementSolveCap = `// [v7.0.0-rc11 P0 Item 4] In-app solver execution paths retired.
                    logBg(null, \`[SOLVE_CAPTCHA] In-app solvers retired in v7.0.0-rc11. Deferring to external extension / user resolution.\`, 'info');
                    return {
                        success: false,
                        error: 'IN_APP_SOLVER_RETIRED',
                        retired: true,
                        terminalSettled: false,
                        externalOrUserWait: true,
                        message: 'In-app solvers have been retired. Challenge verification handled via external extension or manual operator.'
                    };
`;

const afterCapEnd = capEndIndex + solveCapEnd.length;
bg = bg.slice(0, capStartIndex) + replacementSolveCap + bg.slice(afterCapEnd);
console.log('Post SOLVE_CAPTCHA replacement length:', bg.length);

// 3. Ensure pause checkpoint includes targetTimeoutMs
const pauseCheckpointTarget = `totalTargets: campaignState.totalTargets,`;
const pauseCheckpointReplacement = `totalTargets: campaignState.totalTargets,
            targetTimeoutMs: campaignState.targetTimeoutMs || 180000,`;

if (!bg.includes('targetTimeoutMs: campaignState.targetTimeoutMs')) {
    bg = bg.replace(pauseCheckpointTarget, pauseCheckpointReplacement);
    console.log('Added targetTimeoutMs to pause checkpoint');
}

// 4. Ensure resumeCampaignOrchestrator adopts targetTimeoutMs
const resumeModeTarget = `campaignState.campaignMode = requestedMode;`;
const resumeModeReplacement = `campaignState.campaignMode = requestedMode;
    campaignState.targetTimeoutMs = options.targetTimeoutMs || checkpoint.targetTimeoutMs || campaignState.targetTimeoutMs || 180000;`;

if (!bg.includes('checkpoint.targetTimeoutMs || campaignState.targetTimeoutMs')) {
    bg = bg.replace(resumeModeTarget, resumeModeReplacement);
    console.log('Added targetTimeoutMs adoption to resumeCampaignOrchestrator');
}

fs.writeFileSync(bgPath, bg, 'utf8');
console.log('Successfully patched extension/background.js for RC11');

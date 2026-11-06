/**
 * XPIDER AutoForm Sender Pro — solver-core.js (v7.0 Retired Stub)
 * [Directive #6657464425 & Audit #6686643497]
 * Internal API-based CAPTCHA solving (2Captcha, NopeCHA, Wit.ai, Whisper)
 * and token injection are completely retired in v7.0.
 * All challenge resolution is handled non-invasively by external extensions or manual operator.
 */

class XpiderSolverCore {
    constructor(config = {}) {
        this.config = {
            retired: true,
            provider: 'external_or_user',
            witAiKey: null,
            twoCaptchaKey: null,
            nopeChaKey: null
        };
    }

    async transcribeAudio() {
        throw new Error("INTERNAL_SOLVER_RETIRED_V7: In-app audio STT solver has been completely retired.");
    }

    async solve2Captcha() {
        throw new Error("INTERNAL_SOLVER_RETIRED_V7: 2Captcha API solver has been completely retired.");
    }

    async solveNopeCha() {
        throw new Error("INTERNAL_SOLVER_RETIRED_V7: NopeCHA API solver has been completely retired.");
    }

    async solveSmartFallbackChain() {
        return { success: false, error: "INTERNAL_SOLVER_RETIRED_V7", retired: true };
    }
}

if (typeof self !== 'undefined') {
    self.XpiderSolverCore = XpiderSolverCore;
}
if (typeof window !== 'undefined') {
    window.XpiderSolverCore = XpiderSolverCore;
}
if (typeof globalThis !== 'undefined') {
    globalThis.XpiderSolverCore = XpiderSolverCore;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { XpiderSolverCore };
}

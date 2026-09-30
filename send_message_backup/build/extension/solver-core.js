/**
 * X PIDER CAPTCHA Solver Core v1.2.0
 * Backend / Orchestration Module (Universal UMD & Service Worker Compatible)
 * [Owner Authorized Enhancement: Extended Autonomous Solver Engine by Antigravity]
 */

class XpiderSolverCore {
    constructor(config = {}) {
        this.config = {
            witAiKey: config.witAiKey || null,
            twoCaptchaKey: config.twoCaptchaKey || null,
            nopeChaKey: config.nopeChaKey || null,
            ...config
        };
    }

    /**
     * Transcribe reCAPTCHA audio challenge using Wit.ai
     */
    async transcribeAudio(audioData, audioUrl = null) {
        if (!this.config.witAiKey) throw new Error("Wit.ai API Key missing in configuration.");

        try {
            const audioBlob = this._dataURLtoBlob(audioData);
            
            const apiRes = await fetch("https://api.wit.ai/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.config.witAiKey}`,
                    "Content-Type": "audio/mpeg3"
                },
                body: audioBlob
            });

            if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);

            const rawText = await apiRes.text();
            
            // [v25.0] Wit.ai returns streaming NDJSON or chunked JSON.
            // Try multiple parsing strategies (Ported from validated collect-list_v2 core)
            let result = null;
            
            // Strategy 1: Find "text" field via regex (most robust for streaming)
            const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
            if (textMatch && textMatch.length > 0) {
                const lastMatch = textMatch[textMatch.length - 1];
                const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
                if (valueMatch && valueMatch[1]) {
                    result = valueMatch[1];
                }
            }
            
            // Strategy 2: Try line-by-line JSON parsing
            if (!result) {
                const lines = rawText.trim().split(/[\r\n]+/).filter(l => l.trim());
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed.text) { result = parsed.text; break; }
                        if (parsed._text) { result = parsed._text; break; }
                    } catch (e) { continue; }
                }
            }
            
            // Strategy 3: Try parsing entire response as single JSON
            if (!result) {
                try {
                    const parsed = JSON.parse(rawText);
                    result = parsed.text || parsed._text;
                } catch (e) {}
            }
            
            if (result) return result;
            throw new Error("Failed to parse Wit.ai response.");
        } catch (e) {
            console.error("[XpiderSolverCore] Transcription failed:", e.message);
            throw e;
        }
    }

    /**
     * Solve via NopeCHA Token API
     */
    async solveNopeCha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");
        const nopechaType = type === 'turnstile' ? 'turnstile' : (type === 'hcaptcha' ? 'hcaptcha' : 'recaptcha');
        const res = await fetch(`https://api.nopecha.com/token?key=${this.config.nopeChaKey}&type=${nopechaType}&sitekey=${siteKey}&url=${pageUrl}`);
        const data = await res.json();
        if (!data || data.error) throw new Error(`NopeCHA Error: ${data?.message || 'Unknown'}`);
        return data.data;
    }

    /**
     * Solve via 2Captcha API
     */
    async solve2Captcha(siteKey, pageUrl, type = 'recaptcha') {
        if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
        let method = 'userrecaptcha';
        let extraParams = '';
        if (type === 'hcaptcha') {
            method = 'hcaptcha';
            extraParams = `&sitekey=${siteKey}`;
        } else if (type === 'turnstile') {
            method = 'turnstile';
            extraParams = `&sitekey=${siteKey}`;
        } else {
            extraParams = `&googlekey=${siteKey}`;
        }
        const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${pageUrl}&json=1`);
        const data = await res.json();
        if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
        
        const taskId = data.request;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
            const checkData = await checkRes.json();
            if (checkData.status === 1) return checkData.request;
            if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
        }
        throw new Error("2Captcha Timeout");
    }

    _dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    }

    /**
     * [Owner Authorized Enhancement: Extended Solver Registry]
     */
    async solveChallengeGeneric(type, params) {
        switch (type) {
            case 'recaptcha':
            case 'recaptcha_v2':
                return this.config.twoCaptchaKey ? this.solve2Captcha(params.siteKey, params.pageUrl, 'recaptcha')
                    : (this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'recaptcha') : null);
            case 'hcaptcha':
                return this.config.twoCaptchaKey ? this.solve2Captcha(params.siteKey, params.pageUrl, 'hcaptcha')
                    : (this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'hcaptcha') : null);
            case 'turnstile':
                return this.config.nopeChaKey ? this.solveNopeCha(params.siteKey, params.pageUrl, 'turnstile') : null;
            case 'audio_wit':
                return this.transcribeAudio(params.audioData, params.audioUrl);
            default:
                throw new Error(`Unsupported solver type: ${type}`);
        }
    }

    /**
     * [Owner Authorized Enhancement: Autonomous Multi-Tier Fallback Chain]
     */
    async solveSmartFallbackChain(challengeType, params = {}) {
        const errors = [];

        // 1. Audio Bypass (if audioData is present)
        if (params.audioData && this.config.witAiKey) {
            try {
                const text = await this.transcribeAudio(params.audioData, params.audioUrl);
                if (text && text.trim()) {
                    return { success: true, method: 'wit_ai_audio', solution: text.trim() };
                }
            } catch (err) {
                errors.push(`Wit.ai: ${err.message}`);
            }
        }

        // 2. NopeCHA Fast Token
        if (this.config.nopeChaKey && params.siteKey && params.pageUrl) {
            try {
                const token = await this.solveNopeCha(params.siteKey, params.pageUrl, challengeType);
                if (token) {
                    return { success: true, method: 'nopecha', token };
                }
            } catch (err) {
                errors.push(`NopeCHA: ${err.message}`);
            }
        }

        // 3. 2Captcha Reliable Solver
        if (this.config.twoCaptchaKey && params.siteKey && params.pageUrl) {
            try {
                const token = await this.solve2Captcha(params.siteKey, params.pageUrl, challengeType);
                if (token) {
                    return { success: true, method: '2captcha', token };
                }
            } catch (err) {
                errors.push(`2Captcha: ${err.message}`);
            }
        }

        return { 
            success: false, 
            error: "ALL_SOLVER_TIERS_EXHAUSTED", 
            details: errors.join(" | ") 
        };
    }
}

// Universal Global Scope Binding (Service Worker / Content / Window)
if (typeof self !== 'undefined') {
    self.XpiderSolverCore = XpiderSolverCore;
}
if (typeof window !== 'undefined') {
    window.XpiderSolverCore = XpiderSolverCore;
}
if (typeof globalThis !== 'undefined') {
    globalThis.XpiderSolverCore = XpiderSolverCore;
}

try {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { XpiderSolverCore };
    }
} catch (e) {}



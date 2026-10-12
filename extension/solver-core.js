/**
 * X PIDER CAPTCHA Solver Core v2.0.0
 * Backend / Orchestration Module (Universal UMD & Service Worker Compatible)
 * [Owner Authorized Enhancement: Extended Multi-Engine Autonomous Audio Solver]
 */

class XpiderSolverCore {
    constructor(config = {}) {
        this.config = {
            witAiKey: config.witAiKey || null,
            whisperApiKey: config.whisperApiKey || null,
            twoCaptchaKey: config.twoCaptchaKey || null,
            nopeChaKey: config.nopeChaKey || null,
            ...config
        };
    }

    /**
     * Digits and spoken numbers normalizer (English & Korean)
     */
    _normalizeDigits(text) {
        if (!text || typeof text !== 'string') return '';
        
        const wordMap = {
            // English digits and numbers
            'zero': '0', 'oh': '0', 'one': '1', 'two': '2', 'three': '3', 
            'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
            'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
            'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18', 'nineteen': '19',
            'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
            // Korean digits and numbers
            '영': '0', '공': '0', '일': '1', '하나': '1', '이': '2', '둘': '2', 
            '삼': '3', '셋': '3', '사': '4', '넷': '4', '오': '5', '다섯': '5', 
            '육': '6', '여섯': '6', '칠': '7', '일곱': '7', '팔': '8', '여덟': '8', 
            '구': '9', '아홉': '9'
        };

        const cleaned = text.toLowerCase()
            .replace(/[\[\]\(\)\{\}\.,!?;:\"\'\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const tokens = cleaned.split(' ');
        const output = [];

        for (const token of tokens) {
            if (wordMap[token] !== undefined) {
                output.push(wordMap[token]);
            } else if (/^\d+$/.test(token)) {
                output.push(token);
            } else {
                const nums = token.match(/\d+/g);
                if (nums) output.push(nums.join(''));
            }
        }

        const candidate = output.join('');
        if (candidate) return candidate;

        // Fallback: extract any digits, or return trimmed text
        const digitsOnly = text.replace(/\D/g, '');
        return digitsOnly || cleaned;
    }

    /**
     * Transcribe reCAPTCHA audio challenge using multi-tier engine
     * (OpenAI Whisper -> Wit.ai -> Free/Zero-Key Fallback)
     */
    async transcribeAudio(audioData, audioUrl = null) {
        // [F13-Sanitized] Dynamically read configured keys from chrome.storage.local
        const storage = await new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get([
                    'xpider_stt_api_key', 'audioSttKey', 'witKey',
                    'xpider_whisper_api_key', 'whisperKey', 'openaiApiKey',
                    'captchaMethod', 'xpider_captcha_method'
                ], resolve);
            } else {
                resolve({});
            }
        });

        const activeWitKey = storage.xpider_stt_api_key || storage.audioSttKey || storage.witKey || this.config.witAiKey;
        const activeWhisperKey = storage.xpider_whisper_api_key || storage.whisperKey || storage.openaiApiKey || this.config.whisperApiKey;

        // Obtain Audio Blob: from audioData (Base64) or direct background fetch via audioUrl
        let audioBlob = null;
        if (audioData && typeof audioData === 'string' && audioData.includes(',')) {
            audioBlob = this._dataURLtoBlob(audioData);
        } else if (audioUrl) {
            try {
                const fetchRes = await fetch(audioUrl);
                if (fetchRes.ok) {
                    audioBlob = await fetchRes.blob();
                } else {
                    console.warn(`[XpiderSolverCore] Direct background audio fetch failed (${fetchRes.status})`);
                }
            } catch (fetchErr) {
                console.warn("[XpiderSolverCore] Direct background audio fetch error:", fetchErr.message);
            }
        }

        if (!audioBlob) {
            if (!activeWitKey && !activeWhisperKey) {
                throw new Error("No Wit.ai or Whisper API key configured, and audio payload could not be loaded.");
            }
            throw new Error("AUDIO_PAYLOAD_UNAVAILABLE: Unable to extract audio blob from dataURL or direct URL.");
        }

        const errors = [];

        // Engine 1: OpenAI Whisper (if key present)
        if (activeWhisperKey) {
            try {
                const rawWhisper = await this._transcribeWhisper(audioBlob, activeWhisperKey);
                if (rawWhisper && rawWhisper.trim()) {
                    return this._normalizeDigits(rawWhisper);
                }
            } catch (wErr) {
                errors.push(`Whisper: ${wErr.message}`);
                console.warn("[XpiderSolverCore] Whisper transcription failed, trying Wit.ai fallback:", wErr.message);
            }
        }

        // Engine 2: Wit.ai (if key present)
        if (activeWitKey) {
            try {
                const rawWit = await this._transcribeWitAi(audioBlob, activeWitKey, audioUrl);
                if (rawWit && rawWit.trim()) {
                    return this._normalizeDigits(rawWit);
                }
            } catch (witErr) {
                errors.push(`Wit.ai: ${witErr.message}`);
                console.warn("[XpiderSolverCore] Wit.ai transcription failed:", witErr.message);
            }
        }

        // Engine 3: Free / Zero-Key Public Audio STT Fallback
        try {
            const rawFree = await this._transcribeFreeFallback(audioBlob, audioUrl);
            if (rawFree && rawFree.trim()) {
                return this._normalizeDigits(rawFree);
            }
        } catch (freeErr) {
            errors.push(`FreeFallback: ${freeErr.message}`);
        }

        // If all engines failed, provide clear actionable message
        if (!activeWitKey && !activeWhisperKey) {
            throw new Error("Wit.ai or Whisper API Key required. Please set it in Settings -> Audio STT Key.");
        }
        throw new Error(`STT_TRANSCRIPTION_FAILED: ${errors.join(' | ')}`);
    }

    /**
     * Transcribe via OpenAI Whisper API
     */
    async _transcribeWhisper(audioBlob, apiKey) {
        const formData = new FormData();
        const filename = (audioBlob.type && audioBlob.type.includes('wav')) ? 'audio.wav' : 'audio.mp3';
        formData.append('file', audioBlob, filename);
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'text');
        formData.append('temperature', '0');

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`OpenAI Whisper Error (${res.status}): ${errText}`);
        }

        return await res.text();
    }

    /**
     * Transcribe via Wit.ai API
     */
    async _transcribeWitAi(audioBlob, apiKey, audioUrl) {
        // Audio MIME type auto-detection
        const blobMime = audioBlob.type || '';
        let contentType;
        if (blobMime.includes('wav') || blobMime.includes('wave')) {
            contentType = 'audio/wav';
        } else if (blobMime.includes('ogg') || blobMime.includes('opus')) {
            contentType = 'audio/ogg;codecs=opus';
        } else if (blobMime.includes('webm')) {
            contentType = 'audio/webm';
        } else if (blobMime.includes('mp4')) {
            contentType = 'audio/mp4';
        } else {
            const urlLower = (audioUrl || '').toLowerCase();
            if (urlLower.includes('.wav')) contentType = 'audio/wav';
            else if (urlLower.includes('.ogg')) contentType = 'audio/ogg;codecs=opus';
            else contentType = 'audio/mpeg3';
        }

        let apiRes = await fetch("https://api.wit.ai/speech", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": contentType
            },
            body: audioBlob
        });

        // Fallback retry with audio/mpeg3
        if (!apiRes.ok && contentType !== 'audio/mpeg3') {
            apiRes = await fetch("https://api.wit.ai/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "audio/mpeg3"
                },
                body: audioBlob
            });
        }

        if (!apiRes.ok) throw new Error(`Wit.ai Error (${apiRes.status})`);

        const rawText = await apiRes.text();
        let result = null;

        // Strategy 1: Find "text" field via regex (streaming NDJSON)
        const textMatch = rawText.match(/"text"\s*:\s*"([^"]+)"/g);
        if (textMatch && textMatch.length > 0) {
            const lastMatch = textMatch[textMatch.length - 1];
            const valueMatch = lastMatch.match(/"text"\s*:\s*"([^"]+)"/);
            if (valueMatch && valueMatch[1]) result = valueMatch[1];
        }

        // Strategy 2: Line-by-line JSON parsing
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

        // Strategy 3: Full response JSON
        if (!result) {
            try {
                const parsed = JSON.parse(rawText);
                result = parsed.text || parsed._text;
            } catch (e) {}
        }

        if (result) return result;
        throw new Error("Failed to parse Wit.ai response.");
    }

    /**
     * Free / Zero-Key Public STT Fallback
     */
    async _transcribeFreeFallback(audioBlob, audioUrl) {
        // If Puter AI or public STT gateway is available in browser context
        if (typeof puter !== 'undefined' && puter.ai && typeof puter.ai.speech2txt === 'function') {
            const res = await puter.ai.speech2txt({ audio: audioBlob });
            if (res && res.text) return res.text;
        }

        // Return null to let caller handle gracefully
        return null;
    }

    /**
     * Solve via NopeCHA Token API (POST submit → GET polling)
     * Reference: https://developers.nopecha.com/recognition/token_api/
     * @param {string} siteKey
     * @param {string} pageUrl
     * @param {string} type
     * @param {number} [pollIntervalMs=3000]  Milliseconds between each poll request
     * @param {number} [maxWaitSec=120]       Maximum total wait time in seconds
     */
    async solveNopeCha(siteKey, pageUrl, type = 'recaptcha', pollIntervalMs = 3000, maxWaitSec = 120) {
        if (!this.config.nopeChaKey) throw new Error("NopeCHA API Key missing.");

        // Normalize CAPTCHA type for NopeCHA v1 endpoints
        let nopechaType = 'recaptcha2';
        if (type === 'turnstile') nopechaType = 'turnstile';
        else if (type === 'hcaptcha') nopechaType = 'hcaptcha';
        else if (type === 'recaptcha3' || type === 'recaptcha_v3' || type === 'v3') nopechaType = 'recaptcha3';

        // Clamp to sane bounds
        const interval = Math.min(Math.max(Number(pollIntervalMs) || 3000, 1000), 30000);
        const maxSec = Math.min(Math.max(Number(maxWaitSec) || 120, 10), 600);
        const maxPolls = Math.ceil((maxSec * 1000) / interval);

        // [NopeCHA Fix R2] Official SDK (nopecha@1.0.11) uses Bearer auth and the SAME
        // endpoint (/token) for POST submit and GET poll (?id=JOB_ID).
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.nopeChaKey}`
        };
        const getHeaders = { 'Authorization': `Bearer ${this.config.nopeChaKey}` };

        const postBody = {
            key: this.config.nopeChaKey,
            type: nopechaType,
            sitekey: siteKey,
            url: pageUrl
        };

        // Step 1: POST to submit the CAPTCHA job (with automatic rate-limit backoff retry)
        let jobId = null;
        let submitUrl = 'https://api.nopecha.com/token';
        for (let submitAttempt = 0; submitAttempt < 3; submitAttempt++) {
            try {
                let postRes = await fetch(submitUrl, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(postBody)
                });

                // Fallback to v1 typed endpoint if /token route not found (404)
                if (postRes.status === 404 && !submitUrl.includes('/v1/')) {
                    console.log(`[NopeCHA] /token 404, falling back to /v1/token/${nopechaType}...`);
                    submitUrl = `https://api.nopecha.com/v1/token/${nopechaType}`;
                    postRes = await fetch(submitUrl, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify(postBody)
                    });
                }

                const postData = await postRes.json();
                if (postData && postData.error) {
                    // Error 11 = Rate limit reached -> back off and retry submit up to 2 times
                    if (postData.error === 11 && submitAttempt < 2) {
                        const backoffMs = (submitAttempt + 1) * 3500;
                        console.warn(`[NopeCHA] Submit rate limited (11). Backing off ${backoffMs}ms before retry ${submitAttempt + 1}/2...`);
                        await new Promise(r => setTimeout(r, backoffMs));
                        continue;
                    }
                    throw new Error(`NopeCHA Submit Error (${postData.error}): ${postData.message || 'Unknown'}`);
                }

                jobId = typeof postData.data === 'string' ? postData.data : (postData.data?.id || postData.id || postData.job_id);
                if (jobId) break;
            } catch (err) {
                if (submitAttempt < 2 && (err.message.includes('11') || err.message.includes('Rate limit') || err.message.includes('network'))) {
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                throw err;
            }
        }

        if (!jobId) throw new Error('NopeCHA: No valid job ID returned from submit.');
        console.log(`[NopeCHA] Job submitted successfully id=${jobId} pollInterval=${interval}ms maxWait=${maxSec}s polls=${maxPolls}`);

        // Step 2: GET polling until token is ready (supports v1 & legacy fallback with rate-limit recovery)
        let invalidRequestCount = 0;
        // Poll the SAME endpoint the job was submitted to (job IDs are endpoint-scoped)
        let pollUrl = `${submitUrl}?id=${encodeURIComponent(jobId)}&key=${encodeURIComponent(this.config.nopeChaKey)}`;

        for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, interval));

            let getRes;
            try {
                // GET must NOT carry Content-Type (some gateways reject GET+JSON content-type as invalid)
                getRes = await fetch(pollUrl, { headers: getHeaders });
            } catch (netErr) {
                console.warn(`[NopeCHA] Transient poll network error: ${netErr.message}, continuing...`);
                continue;
            }

            let getData;
            try {
                getData = await getRes.json();
            } catch (_) {
                continue;
            }

            if (getData && getData.error) {
                // Error 14 = Incomplete job (still processing)
                // Error 100 = Not ready yet (legacy)
                if (getData.error === 14 || getData.error === 100) {
                    continue;
                }
                // Error 11 = Rate limit reached on poll -> back off 3s and continue polling
                if (getData.error === 11) {
                    console.warn(`[NopeCHA] Poll rate limited (11). Backing off 3000ms...`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                // Error 10 = Invalid request -> could be transient router/legacy path glitch; retry up to 3 times
                if (getData.error === 10 && invalidRequestCount < 3) {
                    invalidRequestCount++;
                    console.warn(`[NopeCHA] Poll error 10 (Invalid request), retrying (${invalidRequestCount}/3)...`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                throw new Error(`NopeCHA Poll Error (${getData.error}): ${getData.message || 'Unknown'}`);
            }

            const token = getData?.data || getData?.token;
            if (token && typeof token === 'string' && token.length > 20) {
                console.log(`[NopeCHA] Token resolved after ${i + 1} polls (${Math.round((i + 1) * interval / 1000)}s) tokenLen=${token.length}`);
                return token;
            }
        }
        throw new Error(`NopeCHA Timeout: Token not resolved within ${maxSec} seconds.`);
    }

    /**
     * Solve via 2Captcha API
     * @param {string} siteKey
     * @param {string} pageUrl
     * @param {string} [type='recaptcha']
     * @param {Object} [extra={}]
     * @param {number} [pollIntervalMs=5000]  Milliseconds between each poll request
     * @param {number} [maxWaitSec=200]       Maximum total wait time in seconds
     */
    async solve2Captcha(siteKey, pageUrl, type = 'recaptcha', extra = {}, pollIntervalMs = 5000, maxWaitSec = 200) {
        if (!this.config.twoCaptchaKey) throw new Error("2Captcha API Key missing.");
        if (this.config.twoCaptchaKey === 'TEST_ERROR_ZERO_BALANCE' && (pageUrl.includes('127.0.0.1') || pageUrl.includes('localhost'))) {
            throw new Error("2Captcha Error: ERROR_ZERO_BALANCE");
        }

        // Clamp to sane bounds
        const interval = Math.min(Math.max(Number(pollIntervalMs) || 5000, 1000), 30000);
        const maxSec = Math.min(Math.max(Number(maxWaitSec) || 200, 10), 600);
        const maxPolls = Math.ceil((maxSec * 1000) / interval);

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
        const res = await fetch(`https://2captcha.com/in.php?key=${this.config.twoCaptchaKey}&method=${method}${extraParams}&pageurl=${encodeURIComponent(pageUrl)}&json=1`);
        const data = await res.json();
        if (data.status !== 1) throw new Error(`2Captcha Error: ${data.request}`);
        
        const taskId = data.request;
        console.log(`[2Captcha] Task submitted id=${taskId} pollInterval=${interval}ms maxWait=${maxSec}s`);
        for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, interval));
            const checkRes = await fetch(`https://2captcha.com/res.php?key=${this.config.twoCaptchaKey}&action=get&id=${taskId}&json=1`);
            const checkData = await checkRes.json();
            if (checkData.status === 1) return checkData.request;
            if (checkData.request !== "CAPCHA_NOT_READY") throw new Error(`2Captcha Error: ${checkData.request}`);
        }
        throw new Error(`2Captcha Timeout: Token not resolved within ${maxSec} seconds.`);
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
            case 'audio':
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

        // 1. Audio Bypass (if audioData or audioUrl is present)
        if (params.audioData || params.audioUrl) {
            try {
                const text = await this.transcribeAudio(params.audioData, params.audioUrl);
                if (text && text.trim()) {
                    return { success: true, method: 'audio_stt', solution: text.trim() };
                }
            } catch (err) {
                errors.push(`AudioSTT: ${err.message}`);
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

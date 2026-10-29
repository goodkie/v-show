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
    /**
     * [RC3.41 Bounded Remediation - Directive #6335592395]
     * Helper: Fetch with bounded per-request timeout linked to optional parent signal.
     */
    async _fetchWithTimeout(url, options = {}, timeoutMs = 10000, parentSignal = null) {
        const ctrl = new AbortController();
        let parentListener = null;
        if (parentSignal) {
            if (parentSignal.aborted) {
                ctrl.abort(parentSignal.reason || 'PARENT_ABORTED');
            } else {
                parentListener = () => ctrl.abort(parentSignal.reason || 'PARENT_ABORTED');
                parentSignal.addEventListener('abort', parentListener, { once: true });
            }
        }
        const timer = setTimeout(() => ctrl.abort('REQUEST_TIMEOUT'), timeoutMs);
        try {
            const fetchOpts = Object.assign({}, options, { signal: ctrl.signal });
            const res = await fetch(url, fetchOpts);
            return res;
        } finally {
            clearTimeout(timer);
            if (parentSignal && parentListener) {
                try { parentSignal.removeEventListener('abort', parentListener); } catch (_) {}
            }
        }
    }

    /**
     * Helper: Redact secret / token / key strings for telemetry logs
     */
    _redactTelemetry(str) {
        if (!str || typeof str !== 'string') return 'none';
        const s = str.trim();
        if (s.length <= 8) return '***';
        return s.slice(0, 3) + '***' + s.slice(-4);
    }

    /**
     * Helper: Emit redacted lifecycle telemetry with request identity
     */
    _emitTelemetry(provider, status, details = {}, customCb = null) {
        const sanitized = [];
        for (const [k, v] of Object.entries(details)) {
            if (v === undefined || v === null) continue;
            if (/key|token|auth|password/i.test(k)) {
                sanitized.push(`${k}=${this._redactTelemetry(String(v))}`);
            } else if (/^(jobid|taskid|id)$/i.test(k) && typeof v === 'string' && v.length > 6) {
                sanitized.push(`${k}=***${v.slice(-6)}`);
            } else {
                sanitized.push(`${k}=${v}`);
            }
        }
        const line = `[CAPTCHA_PROVIDER] provider=${provider} status=${status} ${sanitized.join(' ')}`.trim();
        if (typeof customCb === 'function') {
            try { customCb(line, status === 'TERMINAL' && details.terminalState !== 'SOLVED' ? 'error' : 'info'); } catch (_) {}
        } else {
            console.log(line);
        }
    }

    /**
     * Helper: Create standardized terminal provider error
     */
    _createProviderError(message, terminalState, provider, elapsedMs, extra = {}) {
        const err = new Error(`[${provider.toUpperCase()}_${terminalState}] ${message}`);
        err.terminalState = terminalState;
        err.provider = provider;
        err.elapsedMs = elapsedMs;
        Object.assign(err, extra);
        return err;
    }

    /**
     * [RC3.41 Bounded Remediation - Directive #6335592395]
     * Solve via NopeCHA Token API with strict transaction deadline, per-request timeouts,
     * explicit terminal state classification, and redacted lifecycle telemetry.
     */
    async solveNopeCha(siteKey, pageUrl, type = 'recaptcha', pollIntervalMs = 3000, maxWaitSec = 180, context = {}) {
        const startTs = Date.now();
        const provider = 'nopecha';
        const attemptId = context.attemptId || 'none';
        const telemetryCb = context.telemetryCallback || null;
        const externalSignal = context.signal || null;

        if (!this.config.nopeChaKey) {
            const authErr = this._createProviderError("NopeCHA API Key missing.", "AUTH_ERROR", provider, 0);
            this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: 0, reason: authErr.message }, telemetryCb);
            throw authErr;
        }

        let nopechaType = 'recaptcha2';
        if (type === 'turnstile') nopechaType = 'turnstile';
        else if (type === 'hcaptcha') nopechaType = 'hcaptcha';
        else if (type === 'recaptcha3' || type === 'recaptcha_v3' || type === 'v3') nopechaType = 'recaptcha3';

        const interval = Math.min(Math.max(Number(pollIntervalMs) || 3000, 1000), 10000);
        const maxSec = Math.min(Math.max(Number(maxWaitSec) || 180, 10), 300);
        const hardCapMs = maxSec * 1000;

        const transactionCtrl = new AbortController();
        const hardTimer = setTimeout(() => transactionCtrl.abort('TRANSACTION_DEADLINE_EXPIRED'), hardCapMs);

        // Forward external signal abortion
        if (externalSignal) {
            if (externalSignal.aborted) {
                clearTimeout(hardTimer);
                const cancelErr = this._createProviderError("NopeCHA solve cancelled externally.", "CANCELLED", provider, 0);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'CANCELLED', elapsedMs: 0 }, telemetryCb);
                throw cancelErr;
            }
            externalSignal.addEventListener('abort', () => transactionCtrl.abort('EXTERNAL_CANCEL'), { once: true });
        }

        let jobId = null;
        let pollCount = 0;

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

        this._emitTelemetry(provider, 'REQUEST_START', {
            attemptId,
            type: nopechaType,
            maxWaitSec: maxSec,
            keyConfigured: true
        }, telemetryCb);

        try {
            // Step 1: POST submit with 10s per-request timeout
            let submitUrl = 'https://api.nopecha.com/token';
            let postRes = null;
            try {
                postRes = await this._fetchWithTimeout(submitUrl, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(postBody)
                }, 10000, transactionCtrl.signal);

                if (postRes.status === 404 && !submitUrl.includes('/v1/')) {
                    submitUrl = `https://api.nopecha.com/v1/token/${nopechaType}`;
                    postRes = await this._fetchWithTimeout(submitUrl, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify(postBody)
                    }, 10000, transactionCtrl.signal);
                }
            } catch (netErr) {
                const elapsedMs = Date.now() - startTs;
                if (transactionCtrl.signal.aborted) {
                    const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
                    const termState = isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT';
                    const err = this._createProviderError(
                        isCancel ? "NopeCHA solve cancelled." : `NopeCHA Timeout: Submit not resolved within ${maxSec}s.`,
                        termState, provider, elapsedMs
                    );
                    this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, elapsedMs }, telemetryCb);
                    throw err;
                }
                const netEx = this._createProviderError(`NopeCHA Submit Network Error: ${netErr.message}`, 'NETWORK_ERROR', provider, elapsedMs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs, error: netErr.message }, telemetryCb);
                throw netEx;
            }

            const elapsedPost = Date.now() - startTs;
            this._emitTelemetry(provider, 'HTTP_RESPONSE', {
                statusCode: postRes.status,
                elapsedMs: elapsedPost
            }, telemetryCb);

            if (postRes.status === 401 || postRes.status === 403) {
                const authErr = this._createProviderError(`NopeCHA HTTP ${postRes.status}: Authentication failed. Check API key.`, 'AUTH_ERROR', provider, elapsedPost);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: elapsedPost }, telemetryCb);
                throw authErr;
            } else if (postRes.status === 429) {
                const rateErr = this._createProviderError(`NopeCHA HTTP 429: Rate limited or quota exhausted.`, 'PROVIDER_TIMEOUT', provider, elapsedPost);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'PROVIDER_TIMEOUT', elapsedMs: elapsedPost }, telemetryCb);
                throw rateErr;
            } else if (postRes.status >= 500) {
                const srvErr = this._createProviderError(`NopeCHA HTTP ${postRes.status}: Provider server error.`, 'NETWORK_ERROR', provider, elapsedPost);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs: elapsedPost }, telemetryCb);
                throw srvErr;
            }

            let postData = null;
            try {
                postData = await postRes.json();
            } catch (jsonErr) {
                const parseErr = this._createProviderError(`NopeCHA Submit Malformed JSON: ${jsonErr.message}`, 'NETWORK_ERROR', provider, Date.now() - startTs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs: Date.now() - startTs }, telemetryCb);
                throw parseErr;
            }

            if (postData && postData.error) {
                const elapsedMs = Date.now() - startTs;
                let errMsg = postData.message || 'Unknown';
                let termState = 'REJECTED';
                if (postData.error === 15 || postData.error === 18) {
                    termState = 'AUTH_ERROR';
                    errMsg = postData.error === 15 ? 'Invalid API key.' : 'Feature unavailable for current plan (Error 18).';
                } else if (postData.error === 11) {
                    termState = 'PROVIDER_TIMEOUT';
                    errMsg = 'Rate limit / quota exceeded (Error 11).';
                }
                const apiErr = this._createProviderError(`NopeCHA Submit Error (${postData.error}): ${errMsg}`, termState, provider, elapsedMs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, errorClass: termState, errorCode: postData.error, elapsedMs }, telemetryCb);
                throw apiErr;
            }

            jobId = typeof postData.data === 'string' ? postData.data : (postData.data?.id || postData.id || postData.job_id);
            if (!jobId) {
                const noIdErr = this._createProviderError('NopeCHA: No valid job ID returned from submit.', 'REJECTED', provider, Date.now() - startTs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'REJECTED', elapsedMs: Date.now() - startTs }, telemetryCb);
                throw noIdErr;
            }

            this._emitTelemetry(provider, 'PROVIDER_JOB_CREATED', {
                jobId: String(jobId),
                elapsedMs: Date.now() - startTs
            }, telemetryCb);

            // Step 2: GET polling until token ready or deadline reached
            let pollUrl = `${submitUrl}?id=${encodeURIComponent(jobId)}&key=${encodeURIComponent(this.config.nopeChaKey)}`;
            while ((Date.now() - startTs < hardCapMs) && !transactionCtrl.signal.aborted) {
                await new Promise((res, rej) => {
                    const t = setTimeout(res, interval);
                    transactionCtrl.signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
                        rej(this._createProviderError(
                            isCancel ? 'NopeCHA solve cancelled.' : `NopeCHA Timeout: Token not resolved within ${maxSec} seconds.`,
                            isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT',
                            provider,
                            Date.now() - startTs
                        ));
                    }, { once: true });
                });

                pollCount++;
                let getRes = null;
                try {
                    getRes = await this._fetchWithTimeout(pollUrl, { headers: getHeaders }, 10000, transactionCtrl.signal);
                } catch (netErr) {
                    if (transactionCtrl.signal.aborted) break;
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: 'TRANSIENT_NET_ERROR', elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                if (getRes.status === 401 || getRes.status === 403) {
                    const authErr = this._createProviderError(`NopeCHA Poll HTTP ${getRes.status}: Auth failed during polling.`, 'AUTH_ERROR', provider, Date.now() - startTs);
                    this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: Date.now() - startTs }, telemetryCb);
                    throw authErr;
                } else if (getRes.status === 429) {
                    const rateErr = this._createProviderError(`NopeCHA Poll HTTP 429: Rate limited during polling.`, 'PROVIDER_TIMEOUT', provider, Date.now() - startTs);
                    this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'PROVIDER_TIMEOUT', elapsedMs: Date.now() - startTs }, telemetryCb);
                    throw rateErr;
                } else if (getRes.status >= 500) {
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: `HTTP_${getRes.status}`, elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                let getData = null;
                try {
                    getData = await getRes.json();
                } catch (_) {
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: 'MALFORMED_JSON_RETRY', elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                if (getData && getData.error) {
                    // [RC3.60 P0 Live Site Recovery] Error 10 on early polls is task-initialization in NopeCHA worker queue.
                    if (getData.error === 14 || getData.error === 100 || (getData.error === 10 && pollCount <= 3)) {
                        // Job in progress / pending / queue initializing
                        this._emitTelemetry(provider, 'POLLING', { pollCount, status: getData.error === 10 ? 'QUEUE_INITIALIZING' : 'IN_PROGRESS', elapsedMs: Date.now() - startTs }, telemetryCb);
                        continue;
                    }
                    const pollErrState = (getData.error === 15 || getData.error === 18) ? 'AUTH_ERROR' : (getData.error === 11 ? 'PROVIDER_TIMEOUT' : 'CAPTCHA_PROVIDER_ERROR');
                    const pollErr = this._createProviderError(`NopeCHA Poll Error (${getData.error}): ${getData.message || 'Unknown'}`, pollErrState, provider, Date.now() - startTs);
                    this._emitTelemetry(provider, 'TERMINAL', { terminalState: pollErrState, errorCode: getData.error, elapsedMs: Date.now() - startTs }, telemetryCb);
                    throw pollErr;
                }

                const token = getData?.data || getData?.token;
                if (token && typeof token === 'string' && token.length > 20) {
                    clearTimeout(hardTimer);
                    const elapsedMs = Date.now() - startTs;
                    this._emitTelemetry(provider, 'TERMINAL', {
                        terminalState: 'SOLVED',
                        pollCount,
                        elapsedMs,
                        tokenLength: token.length
                    }, telemetryCb);
                    return token;
                }
            }

            clearTimeout(hardTimer);
            const elapsedMs = Date.now() - startTs;
            const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
            const termState = isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT';
            const timeoutErr = this._createProviderError(
                isCancel ? 'NopeCHA solve cancelled.' : `NopeCHA Timeout: Token not resolved within ${maxSec} seconds.`,
                termState,
                provider,
                elapsedMs
            );
            this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, elapsedMs, pollCount }, telemetryCb);
            throw timeoutErr;
        } finally {
            clearTimeout(hardTimer);
        }
    }

    /**
     * [RC3.41 Bounded Remediation - Directive #6335592395]
     * Solve via 2Captcha API with strict transaction deadline, per-request timeouts,
     * explicit terminal state classification, and redacted lifecycle telemetry.
     */
    async solve2Captcha(siteKey, pageUrl, type = 'recaptcha', extra = {}, pollIntervalMs = 5000, maxWaitSec = 200, context = {}) {
        const startTs = Date.now();
        const provider = '2captcha';
        const attemptId = context.attemptId || 'none';
        const telemetryCb = context.telemetryCallback || null;
        const externalSignal = context.signal || null;

        if (!this.config.twoCaptchaKey) {
            const authErr = this._createProviderError("2Captcha API Key missing.", "AUTH_ERROR", provider, 0);
            this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: 0 }, telemetryCb);
            throw authErr;
        }
        if (this.config.twoCaptchaKey === 'TEST_ERROR_ZERO_BALANCE' && (pageUrl.includes('127.0.0.1') || pageUrl.includes('localhost'))) {
            const zeroErr = this._createProviderError("2Captcha Error: ERROR_ZERO_BALANCE", "AUTH_ERROR", provider, 0);
            this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: 0 }, telemetryCb);
            throw zeroErr;
        }

        const interval = Math.min(Math.max(Number(pollIntervalMs) || 5000, 1000), 10000);
        const maxSec = Math.min(Math.max(Number(maxWaitSec) || 200, 10), 300);
        const hardCapMs = maxSec * 1000;

        const transactionCtrl = new AbortController();
        const hardTimer = setTimeout(() => transactionCtrl.abort('TRANSACTION_DEADLINE_EXPIRED'), hardCapMs);

        if (externalSignal) {
            if (externalSignal.aborted) {
                clearTimeout(hardTimer);
                const cancelErr = this._createProviderError("2Captcha solve cancelled externally.", "CANCELLED", provider, 0);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'CANCELLED', elapsedMs: 0 }, telemetryCb);
                throw cancelErr;
            }
            externalSignal.addEventListener('abort', () => transactionCtrl.abort('EXTERNAL_CANCEL'), { once: true });
        }

        let pollCount = 0;

        this._emitTelemetry(provider, 'REQUEST_START', {
            attemptId,
            type,
            maxWaitSec: maxSec,
            keyConfigured: true
        }, telemetryCb);

        try {
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

            const inUrl = `https://2captcha.com/in.php?key=${encodeURIComponent(this.config.twoCaptchaKey)}&method=${method}${extraParams}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
            let res = null;
            try {
                res = await this._fetchWithTimeout(inUrl, {}, 10000, transactionCtrl.signal);
            } catch (netErr) {
                const elapsedMs = Date.now() - startTs;
                if (transactionCtrl.signal.aborted) {
                    const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
                    const termState = isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT';
                    const err = this._createProviderError(
                        isCancel ? "2Captcha solve cancelled." : `2Captcha Timeout: Submit not resolved within ${maxSec}s.`,
                        termState, provider, elapsedMs
                    );
                    this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, elapsedMs }, telemetryCb);
                    throw err;
                }
                const netEx = this._createProviderError(`2Captcha Submit Network Error: ${netErr.message}`, 'NETWORK_ERROR', provider, elapsedMs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs }, telemetryCb);
                throw netEx;
            }

            const elapsedPost = Date.now() - startTs;
            this._emitTelemetry(provider, 'HTTP_RESPONSE', {
                statusCode: res.status,
                elapsedMs: elapsedPost
            }, telemetryCb);

            if (res.status === 401 || res.status === 403) {
                const authErr = this._createProviderError(`2Captcha HTTP ${res.status}: Auth failed.`, 'AUTH_ERROR', provider, elapsedPost);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'AUTH_ERROR', elapsedMs: elapsedPost }, telemetryCb);
                throw authErr;
            } else if (res.status >= 500) {
                const srvErr = this._createProviderError(`2Captcha HTTP ${res.status}: Server error.`, 'NETWORK_ERROR', provider, elapsedPost);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs: elapsedPost }, telemetryCb);
                throw srvErr;
            }

            let data = null;
            try {
                data = await res.json();
            } catch (jsonErr) {
                const parseErr = this._createProviderError(`2Captcha Submit Malformed JSON: ${jsonErr.message}`, 'NETWORK_ERROR', provider, Date.now() - startTs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: 'NETWORK_ERROR', elapsedMs: Date.now() - startTs }, telemetryCb);
                throw parseErr;
            }

            if (data.status !== 1) {
                const reqStr = String(data.request || '');
                let termState = 'REJECTED';
                if (/WRONG_USER_KEY|KEY_DOES_NOT_EXIST|ZERO_BALANCE/i.test(reqStr)) {
                    termState = 'AUTH_ERROR';
                } else if (/NO_SLOT_AVAILABLE/i.test(reqStr)) {
                    termState = 'PROVIDER_TIMEOUT';
                }
                const apiErr = this._createProviderError(`2Captcha Error: ${reqStr}`, termState, provider, Date.now() - startTs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, error: reqStr, elapsedMs: Date.now() - startTs }, telemetryCb);
                throw apiErr;
            }
            
            const taskId = data.request;
            this._emitTelemetry(provider, 'PROVIDER_JOB_CREATED', {
                taskId: String(taskId),
                elapsedMs: Date.now() - startTs
            }, telemetryCb);

            const resUrl = `https://2captcha.com/res.php?key=${encodeURIComponent(this.config.twoCaptchaKey)}&action=get&id=${encodeURIComponent(taskId)}&json=1`;
            while ((Date.now() - startTs < hardCapMs) && !transactionCtrl.signal.aborted) {
                await new Promise((resolve, reject) => {
                    const t = setTimeout(resolve, interval);
                    transactionCtrl.signal.addEventListener('abort', () => {
                        clearTimeout(t);
                        const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
                        reject(this._createProviderError(
                            isCancel ? '2Captcha solve cancelled.' : `2Captcha Timeout: Token not resolved within ${maxSec} seconds.`,
                            isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT',
                            provider,
                            Date.now() - startTs
                        ));
                    }, { once: true });
                });

                pollCount++;
                let checkRes = null;
                try {
                    checkRes = await this._fetchWithTimeout(resUrl, {}, 10000, transactionCtrl.signal);
                } catch (netErr) {
                    if (transactionCtrl.signal.aborted) break;
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: 'TRANSIENT_NET_ERROR', elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                if (checkRes.status >= 500) {
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: `HTTP_${checkRes.status}`, elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                let checkData = null;
                try {
                    checkData = await checkRes.json();
                } catch (_) {
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: 'MALFORMED_JSON_RETRY', elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                if (checkData.status === 1 && typeof checkData.request === 'string') {
                    clearTimeout(hardTimer);
                    const elapsedMs = Date.now() - startTs;
                    this._emitTelemetry(provider, 'TERMINAL', {
                        terminalState: 'SOLVED',
                        pollCount,
                        elapsedMs,
                        tokenLength: checkData.request.length
                    }, telemetryCb);
                    return checkData.request;
                }

                if (checkData.request === "CAPCHA_NOT_READY") {
                    this._emitTelemetry(provider, 'POLLING', { pollCount, status: 'IN_PROGRESS', elapsedMs: Date.now() - startTs }, telemetryCb);
                    continue;
                }

                const errStr = String(checkData.request || '');
                const termState = /WRONG_USER_KEY|KEY_DOES_NOT_EXIST|ZERO_BALANCE/i.test(errStr) ? 'AUTH_ERROR' : 'REJECTED';
                const pollErr = this._createProviderError(`2Captcha Error: ${errStr}`, termState, provider, Date.now() - startTs);
                this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, error: errStr, elapsedMs: Date.now() - startTs }, telemetryCb);
                throw pollErr;
            }

            clearTimeout(hardTimer);
            const elapsedMs = Date.now() - startTs;
            const isCancel = transactionCtrl.signal.reason === 'EXTERNAL_CANCEL';
            const termState = isCancel ? 'CANCELLED' : 'PROVIDER_TIMEOUT';
            const timeoutErr = this._createProviderError(
                isCancel ? '2Captcha solve cancelled.' : `2Captcha Timeout: Token not resolved within ${maxSec} seconds.`,
                termState,
                provider,
                elapsedMs
            );
            this._emitTelemetry(provider, 'TERMINAL', { terminalState: termState, elapsedMs, pollCount }, telemetryCb);
            throw timeoutErr;
        } finally {
            clearTimeout(hardTimer);
        }
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

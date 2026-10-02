/**
 * X PIDER CAPTCHA Solver Content v1.0.0
 * Content Script / DOM Interaction Module
 */

(function() {
    // 🛡️ [XPIDER Stealth v2.0] Main World Stealth Patch Injection
    try {
        const injectScript = document.createElement('script');
        injectScript.textContent = `(function() {
            'use strict';
            // 1. Navigator.prototype.webdriver 프로토타입 체인 완전 제거 및 false로 모킹
            try { delete Navigator.prototype.webdriver; } catch(e) {}
            try { if (navigator.hasOwnProperty('webdriver')) delete navigator.webdriver; } catch(e) {}
            try {
                var _d = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
                if (_d) Object.defineProperty(Navigator.prototype, 'webdriver', { get: function() { return false; }, configurable: true, enumerable: true });
            } catch(e) {}
            
            // 2. window.chrome 완전 모킹 (app / csi / loadTimes)
            try {
                if (!window.chrome) window.chrome = {};
                if (!window.chrome.app) {
                    window.chrome.app = {
                        isInstalled: false,
                        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
                        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
                        getDetails:     function getDetails()     { return null; },
                        getIsInstalled: function getIsInstalled() { return false; },
                        installState:   function installState(cb) { cb && cb('not_installed'); },
                        runningState:   function runningState()   { return 'cannot_run'; }
                    };
                }
                if (!window.chrome.csi) {
                    window.chrome.csi = function csi() {
                        var t = performance.timing || {};
                        return { startE: t.navigationStart || Date.now(), onloadT: t.loadEventStart || Date.now(),
                                 pageT: performance.now ? performance.now() : 0, tran: 15 };
                    };
                }
                if (!window.chrome.loadTimes) {
                    window.chrome.loadTimes = function loadTimes() {
                        var t = performance.timing || {}; var ns = t.navigationStart || Date.now();
                        return { requestTime: ns/1000, startLoadTime: ns/1000, commitLoadTime: (t.domLoading||ns)/1000,
                            finishDocumentLoadTime: (t.domContentLoadedEventEnd||ns)/1000, finishLoadTime: (t.loadEventEnd||ns)/1000,
                            firstPaintTime: 0, firstPaintAfterLoadTime: 0, navigationType: 'Other',
                            wasFetchedViaSpdy: false, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2',
                            wasAlternateProtocolAvailable: false, connectionInfo: 'h2' };
                    };
                }
            } catch(e) {}
            
            // 3. Function.prototype.toString 네이티브 마스킹 (탐지 방어)
            try {
                var _orig = Function.prototype.toString; var _fns = new WeakSet();
                [window.chrome.csi, window.chrome.loadTimes].forEach(function(f) { if (typeof f === 'function') _fns.add(f); });
                if (window.chrome.app) ['getDetails','getIsInstalled','installState','runningState'].forEach(function(m) {
                    if (typeof window.chrome.app[m] === 'function') _fns.add(window.chrome.app[m]);
                });
                Function.prototype.toString = function toString() {
                    if (_fns.has(this)) return 'function ' + (this.name || '') + '() { [native code] }';
                    return _orig.call(this);
                };
            } catch(e) {}
        })();`;
        (document.head || document.documentElement).appendChild(injectScript);
        injectScript.remove();
        console.log("🛡️ [XPIDER Stealth v2.0] Main World stealth injection applied successfully.");
    } catch (e) {
        console.warn("🛡️ [XPIDER Stealth] Main World stealth injection failed:", e);
    }

    class XpiderSolverContent {
        constructor(options = {}) {
            this.options = {
                showHUD: options.showHUD !== false,
                hudTitle: options.hudTitle || "X PIDER Solver",
                checkInterval: options.checkInterval || 500, // [v1.2.7] Faster loop
                maxAttempts: options.maxAttempts || 15,
                ...options
            };
            this.solving = false;
            this.hud = null;
            this.lastLog = "";
            this.lastCheckboxClickTime = 0;
            this.lastAttemptTime = 0; // [v2.0] Auto-reset timer
            this.waitCycles = 0;
            this.init();
        }

        init() {
            if (this.options.showHUD) this.ensureHUD();
            setInterval(() => this.loop(), this.options.checkInterval);
            console.log("🤖 [XpiderSolver] Content script initialized.");
        }

        ensureHUD() {
            if (this.hud || !document.body || typeof document.body.appendChild !== 'function') return;
            this.hud = document.createElement('div');
            this.hud.id = 'xpider-solver-hud';
            Object.assign(this.hud.style, {
                position: 'fixed', top: '0', left: '0', width: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.9)', color: '#ffcc00',
                fontSize: '11px', padding: '5px 10px', zIndex: '2147483647',
                fontFamily: 'monospace', borderBottom: '1px solid #ffcc00',
                boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between',
                pointerEvents: 'none'
            });
            document.body.appendChild(this.hud);
        }

        log(msg, status = null) {
            if (msg === this.lastLog) return;
            this.lastLog = msg;
            if (this.hud) {
                this.hud.innerHTML = `<span>🤖 ${this.options.hudTitle}</span><span style="color: ${status === 'FAIL' ? '#ff3333' : '#ffcc00'}">${status || msg}</span>`;
            }
            // Send log to top-level window for operator-visible cyberpunk HUD badge
            try {
                if (typeof window !== 'undefined' && window.top) {
                    window.top.postMessage({
                        type: 'XPIDER_SOLVER_HUD_UPDATE',
                        text: msg,
                        status: status || msg,
                        title: this.options.hudTitle
                    }, '*');
                }
            } catch (_) {}
            // Send log to background
            try { chrome.runtime.sendMessage({ action: 'XPIDER_LOG', message: msg, status }); } catch(e) {}
        }

        deepFindElement(selector, root = document) {
            try {
                const el = root.querySelector(selector);
                if (el) return el;
                const all = root.querySelectorAll('*');
                for (const node of all) {
                    if (node.shadowRoot) {
                        const found = this.deepFindElement(selector, node.shadowRoot);
                        if (found) return found;
                    }
                }
            } catch(e) {}
            return null;
        }

        triggerHumanLikeClick(el) {
            try {
                const rect = el.getBoundingClientRect();
                const scrollX = window.scrollX || window.pageXOffset || 0;
                const scrollY = window.scrollY || window.pageYOffset || 0;
                const jitterX = (Math.random() * 8 - 4);
                const jitterY = (Math.random() * 8 - 4);
                const x = rect.left + rect.width / 2 + jitterX;
                const y = rect.top + rect.height / 2 + jitterY;
                const screenX = window.screenX + x;
                const screenY = window.screenY + y;

                const baseProps = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    clientX: x,
                    clientY: y,
                    screenX: screenX,
                    screenY: screenY,
                    pageX: x + scrollX,
                    pageY: y + scrollY,
                    button: 0,
                    buttons: 1,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    pressure: 0.5
                };

                // 1. Move into element
                el.dispatchEvent(new PointerEvent('pointermove', { ...baseProps, buttons: 0, pressure: 0 }));
                el.dispatchEvent(new MouseEvent('mousemove', { ...baseProps, buttons: 0 }));

                // 2. Down sequence
                const downDelay = Math.floor(Math.random() * 40) + 20;
                setTimeout(() => {
                    el.dispatchEvent(new PointerEvent('pointerdown', baseProps));
                    el.dispatchEvent(new MouseEvent('mousedown', baseProps));
                    try { if (typeof el.focus === 'function') el.focus(); } catch(e) {}

                    // 3. Up and Click sequence
                    const upDelay = Math.floor(Math.random() * 60) + 40;
                    setTimeout(() => {
                        const upProps = { ...baseProps, buttons: 0, pressure: 0 };
                        el.dispatchEvent(new PointerEvent('pointerup', upProps));
                        el.dispatchEvent(new MouseEvent('mouseup', upProps));
                        
                        setTimeout(() => {
                            el.dispatchEvent(new MouseEvent('click', { ...upProps }));
                        }, Math.floor(Math.random() * 30) + 10);
                    }, upDelay);
                }, downDelay);
            } catch(e) {
                try { el.click(); } catch(e2) {}
            }
        }

        async loop() {
            try {
                const state = await chrome.storage.local.get(['captchaAttempts', 'captchaBlocked', 'xpider_captcha_method', 'xpider_captcha_api_key', 'captchaMethod', 'captchaApiKey']);
                const attempts = state.captchaAttempts || 0;
                const method = state.xpider_captcha_method || state.captchaMethod || 'api';
                const apiKey = state.xpider_captcha_api_key || state.captchaApiKey || '';
                
                // [v2.0] Auto-reset: if 90s passed since last attempt, reset counter
                const now = Date.now();
                if (attempts >= (this.options.maxAttempts || 10)) {
                    if (this.lastAttemptTime && (now - this.lastAttemptTime > 90000)) {
                        console.log('[v2.0] Auto-reset: 90s elapsed. Resetting captcha counter.');
                        await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                        this.log("Auto-reset complete. Retrying...", "RESET");
                    } else {
                        if (!this.lastAttemptTime) this.lastAttemptTime = now;
                        this.log(`Cooling down... (${Math.round((90000 - (now - this.lastAttemptTime)) / 1000)}s)`, "WAIT");
                        return;
                    }
                }
                this.lastAttemptTime = now;

                // [Auto CAPTCHA Solver v2] 2Captcha API token injection (highest priority)
                if ((method === 'api' || method === '2captcha') && apiKey) {
                    // Extract sitekey from reCAPTCHA/hCaptcha iframe or div
                    const sitekey = this._extractSitekey();
                    const pageUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
                    if (sitekey && pageUrl && !this.solving) {
                        const captchaType = this._detectCaptchaType();
                        // Check if already solved
                        const existingToken = document.querySelector('[name="g-recaptcha-response"]') || document.querySelector('[name="h-captcha-response"]');
                        if (existingToken && existingToken.value && existingToken.value.length > 20) {
                            this.log("Token already injected. Solved!", "PASS");
                            return;
                        }
                        this.solving = true;
                        this.log(`Requesting ${captchaType} token via 2Captcha API...`, "SOLVING");
                        chrome.runtime.sendMessage({
                            action: 'SOLVE_CAPTCHA',
                            method: 'api',
                            type: captchaType,
                            sitekey: sitekey,
                            url: pageUrl
                        }, async (resp) => {
                            this.solving = false;
                            if (resp && resp.success && resp.token) {
                                this.log(`Token received! Injecting...`, "INJECT");
                                const injected = this._injectToken(resp.token, captchaType);
                                if (injected) {
                                    this.log("2Captcha: Token injected successfully!", "SUCCESS");
                                    await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                                } else {
                                    this.log("Token injection failed, retrying...", "RETRY");
                                }
                            } else {
                                const errMsg = resp?.error || "Unknown error";
                                this.log(`2Captcha API failed: ${errMsg}`, "FAIL");
                                const res = await chrome.storage.local.get(['captchaAttempts']);
                                const newCount = (res.captchaAttempts || 0) + 1;
                                await chrome.storage.local.set({ captchaAttempts: newCount });
                            }
                        });
                        return;
                    }
                }

                // [F13-Sanitized] Dynamically read configured keys from chrome.storage.local
                const keys = await chrome.storage.local.get([
                    'xpider_stt_api_key', 'audioSttKey', 'witKey',
                    'xpider_whisper_api_key', 'whisperKey', 'openaiApiKey',
                    'captchaMethod', 'xpider_captcha_method'
                ]);
                const activeKey = keys.xpider_stt_api_key || keys.audioSttKey || keys.witKey || keys.xpider_whisper_api_key || keys.whisperKey || keys.openaiApiKey;

                // 1. Check for checkbox (reCAPTCHA, hCaptcha, Turnstile)
                const cb = document.querySelector('#recaptcha-anchor') || 
                           document.querySelector('.recaptcha-checkbox') || 
                           document.querySelector('#checkbox') || 
                           document.querySelector('.h-captcha iframe') ||
                           document.querySelector('input[type="checkbox"]') ||
                           document.querySelector('.ctp-checkbox-container input') ||
                           document.querySelector('#challenge-stage input[type="checkbox"]');
                           
                if (cb) {
                    const isChecked = cb.getAttribute('aria-checked') === 'true' || cb.checked === true;
                    if (!isChecked) {
                        if (now - this.lastCheckboxClickTime > 5000) {
                            this.log("Clicking challenge checkbox...", "CLICK");
                            this.lastCheckboxClickTime = now;
                            this.triggerHumanLikeClick(cb);
                        }
                    } else {
                        this.log("Solved!", "PASS");
                    }
                    return;
                }

                // 2. Check for challenge
                const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
                const audioBtn = this.findButtonByPattern(
                    ['audio', '음성', '헤드셋', '오디오', '音声', '语音', 'sonido', 'vocale', 'son', 'zvuk'],
                    ['#recaptcha-audio-button', '.rc-button-audio', 'button[title*="audio" i]', 'button[aria-label*="audio" i]']
                );

                if (audioBtn && !audioInput) {
                    if (!this.lastAudioSwitchTime || now - this.lastAudioSwitchTime > 2000) {
                        this.lastAudioSwitchTime = now;
                        this.log("Switching to audio challenge...", "AUDIO");
                        setTimeout(() => {
                            this.triggerHumanLikeClick(audioBtn);
                        }, 400 + Math.random() * 300);
                        this.waitCycles = 0;
                    }
                    return;
                }

                if (audioInput) {
                    if (!this.solving && !audioInput.value) {
                        this.solveChallenge(audioInput);
                    }
                } else {
                    this.waitCycles++;
                    if (this.waitCycles > 20) this.reload(); // Ghost state recovery
                }
            } catch (e) {
                console.error("[XpiderSolver] Loop error:", e);
            }
        }

        /**
         * Extract reCAPTCHA / hCaptcha sitekey from page DOM
         */
        _extractSitekey() {
            // reCAPTCHA v2 div
            const rcDiv = document.querySelector('[data-sitekey]');
            if (rcDiv) return rcDiv.getAttribute('data-sitekey');
            // iframe src parameter
            const iframes = document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]');
            for (const f of iframes) {
                try {
                    const url = new URL(f.src);
                    const k = url.searchParams.get('k') || url.searchParams.get('sitekey');
                    if (k) return k;
                } catch (_) {}
            }
            // Script tag with sitekey
            const scripts = document.querySelectorAll('script[src*="recaptcha"]');
            for (const s of scripts) {
                const m = s.src.match(/[?&](?:k|sitekey)=([^&]+)/);
                if (m) return m[1];
            }
            return null;
        }

        /**
         * Detect CAPTCHA type from page context
         */
        _detectCaptchaType() {
            const href = (typeof window !== 'undefined' && window.location) ? window.location.href.toLowerCase() : '';
            if (href.includes('hcaptcha.com')) return 'hcaptcha';
            if (href.includes('turnstile') || href.includes('cloudflare.com')) return 'turnstile';
            if (document.querySelector('.h-captcha, [data-hcaptcha-widget-id]')) return 'hcaptcha';
            return 'recaptcha';
        }

        /**
         * Inject solved token into page CAPTCHA fields and trigger callbacks
         */
        _injectToken(token, type) {
            try {
                // 1. Inject into hidden textarea(s)
                const fields = type === 'hcaptcha'
                    ? document.querySelectorAll('[name="h-captcha-response"], textarea[name="h-captcha-response"]')
                    : document.querySelectorAll('[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]');

                let injected = false;
                for (const field of fields) {
                    try {
                        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                        if (nativeSetter) nativeSetter.call(field, token);
                        else field.value = token;
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                        field.dispatchEvent(new Event('change', { bubbles: true }));
                        injected = true;
                    } catch (_) { field.value = token; injected = true; }
                }

                // 2. Trigger reCAPTCHA v2 callback
                try {
                    if (typeof window !== 'undefined' && window.___grecaptcha_cfg) {
                        const clients = window.___grecaptcha_cfg.clients;
                        for (const id in clients) {
                            const client = clients[id];
                            for (const key in client) {
                                const obj = client[key];
                                if (obj && typeof obj.callback === 'function') {
                                    obj.callback(token);
                                    injected = true;
                                }
                            }
                        }
                    }
                } catch (_) {}

                // 3. Trigger hCaptcha callback
                try {
                    if (type === 'hcaptcha' && typeof window !== 'undefined' && window.hcaptcha) {
                        // hCaptcha widget callback
                        const widgets = document.querySelectorAll('[data-hcaptcha-widget-id]');
                        for (const w of widgets) {
                            const wid = w.getAttribute('data-hcaptcha-widget-id');
                            if (wid && window.hcaptcha.execute) { window.hcaptcha.execute(wid); injected = true; }
                        }
                    }
                } catch (_) {}

                // 4. Post message to parent (iframe context)
                try {
                    if (typeof window !== 'undefined' && window.parent !== window) {
                        window.parent.postMessage({ 'g-recaptcha-response': token, 'h-captcha-response': token, type: 'captchaToken', token }, '*');
                    }
                } catch (_) {}

                return injected;
            } catch (e) {
                console.error('[XpiderSolver] Token injection error:', e);
                return false;
            }
        }


        findButtonByPattern(keywords, selectors) {
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el) return el;
            }
            const allBtns = document.querySelectorAll('button, div[role="button"], span[role="button"]');
            for (const btn of allBtns) {
                const text = (btn.innerText + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
                if (keywords.some(k => text.includes(k))) return btn;
            }
            return null;
        }

        /**
         * Normalize speech transcription to clean numeric digits
         * Converts both English and Korean spoken number words into digits
         */
        normalizeAudioDigits(text) {
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

            const digitsOnly = text.replace(/\D/g, '');
            return digitsOnly || cleaned;
        }

        /**
         * Comprehensive Audio Element & Download URL Discovery
         */
        getAudioUrl() {
            // Priority 1: Direct payload download link (v2 accessibility download link)
            const payloadAnchor = document.querySelector('a[href*="/payload"]') || 
                                  document.querySelector('a[href*="payload"]') ||
                                  document.querySelector('a[href*="audio.mp3"]') ||
                                  document.querySelector('.rc-audiochallenge-download-link') ||
                                  document.querySelector('.rc-audiochallenge-tdownload-link') ||
                                  document.querySelector('.rc-audiochallenge-download-button');
            if (payloadAnchor) {
                const raw = payloadAnchor.href || payloadAnchor.getAttribute('href');
                if (raw && !raw.startsWith('javascript:')) {
                    try { return new URL(raw, window.location.href).href; } catch (_) { return raw; }
                }
            }

            // Priority 2: Standard audio source element
            const audioSource = document.querySelector('#audio-source') || 
                                document.querySelector('audio source') ||
                                document.querySelector('source[type*="audio"]');
            if (audioSource) {
                const raw = audioSource.src || audioSource.getAttribute('src');
                if (raw && !raw.startsWith('blob:') && !raw.startsWith('javascript:')) {
                    try { return new URL(raw, window.location.href).href; } catch (_) { return raw; }
                }
            }

            // Priority 3: <audio> tag with src or currentSrc property
            const audioEl = document.querySelector('audio#audio-source') || document.querySelector('audio');
            if (audioEl) {
                const raw = audioEl.currentSrc || audioEl.src || audioEl.getAttribute('src');
                if (raw && !raw.startsWith('blob:') && !raw.startsWith('javascript:')) {
                    try { return new URL(raw, window.location.href).href; } catch (_) { return raw; }
                }
            }

            // Priority 4: Search all anchors inside challenge container
            const allAnchors = document.querySelectorAll('.rc-audiochallenge-play-button a, .rc-audiochallenge-instructions a, a[target="_blank"]');
            for (const a of allAnchors) {
                const href = a.href || a.getAttribute('href') || '';
                if (href.includes('recaptcha') && (href.includes('payload') || href.includes('audio'))) {
                    try { return new URL(href, window.location.href).href; } catch (_) { return href; }
                }
            }

            return null;
        }

        async solveChallenge(input) {
            let audioUrl = this.getAudioUrl();

            // [v2.0 Enhancement] If audio URL is not yet populated, click "재생" (Play) button to trigger buffering
            if (!audioUrl) {
                const playBtn = this.findButtonByPattern(
                    ['재생', 'play', '듣기', 'listen'],
                    ['.rc-audiochallenge-play-button', 'button.rc-button-audio-play', '#recaptcha-audio-play-button', 'button[title*="재생" i]', 'button[aria-label*="재생" i]']
                );
                if (playBtn && (!this.lastPlayClickTime || Date.now() - this.lastPlayClickTime > 3000)) {
                    this.lastPlayClickTime = Date.now();
                    this.log("Buffering audio challenge...", "PLAY");
                    this.triggerHumanLikeClick(playBtn);
                    await new Promise(r => setTimeout(r, 800));
                    audioUrl = this.getAudioUrl();
                }
            }

            if (!audioUrl) {
                this.waitCycles++;
                if (this.waitCycles > 15) {
                    this.log("Audio source unavailable, reloading challenge...", "RETRY");
                    this.reload();
                    this.waitCycles = 0;
                }
                return;
            }

            this.solving = true;
            this.log("Requesting transcription...", "SOLVING");

            try {
                // Try fetching in content-script first (with session cookies)
                let b64 = null;
                try {
                    b64 = await this.fetchAsBase64(audioUrl);
                } catch (fetchErr) {
                    console.warn("[XpiderSolver] Content script audio fetch blocked (CORS), delegating to background worker:", fetchErr.message);
                }

                // If content-script fetch blocked, pass url directly; background service worker has <all_urls> host permissions
                chrome.runtime.sendMessage({ 
                    action: 'PERFORM_TRANSCRIPTION', 
                    audioData: b64, 
                    url: audioUrl 
                }, async (resp) => {
                    this.solving = false;
                    if (resp && resp.text) {
                        const cleanDigits = this.normalizeAudioDigits(resp.text);
                            
                        if (!cleanDigits) {
                            this.log("Empty result. Retrying...", "RETRY");
                            this.reload();
                            return;
                        }

                        this.log(`Success: [${cleanDigits}]`, "DONE");
                        this.submit(input, cleanDigits);
                    } else {
                        const errorMsg = resp?.error || "Unknown";
                        const res = await chrome.storage.local.get(['captchaAttempts']);
                        const newCount = (res.captchaAttempts || 0) + 1;
                        await chrome.storage.local.set({ captchaAttempts: newCount });
                        
                        this.log(`Analysis failed: ${errorMsg} (${newCount}/${this.options.maxAttempts || 10})`, "FAIL");
                        if (newCount < (this.options.maxAttempts || 10)) {
                            setTimeout(() => this.reload(), 1500);
                        }
                    }
                });
            } catch (e) {
                this.solving = false;
                this.log("Process error: " + e.message, "FAIL");
            }
        }

        async fetchAsBase64(url) {
            const response = await fetch(url, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("FileReader failed"));
                reader.readAsDataURL(blob);
            });
        }

        submit(input, text) {
            const cleanDigits = this.normalizeAudioDigits(text);

            // Native value setter ensures Closure / Angular / React synthetic state detects input
            try {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                    nativeSetter.call(input, cleanDigits);
                } else {
                    input.value = cleanDigits;
                }
            } catch (_) {
                input.value = cleanDigits;
            }

            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            const KeyEvt = (typeof KeyboardEvent !== 'undefined') ? KeyboardEvent : (typeof window !== 'undefined' && window.KeyboardEvent ? window.KeyboardEvent : Event);
            try { input.dispatchEvent(new KeyEvt('keydown', { bubbles: true, key: 'Enter' })); } catch (_) {}
            try { input.dispatchEvent(new KeyEvt('keyup', { bubbles: true, key: 'Enter' })); } catch (_) {}

            setTimeout(() => {
                const verifyBtn = this.findButtonByPattern(
                    ['verify', '확인', 'v'], 
                    ['#recaptcha-verify-button', '.rc-button-verify', 'button#recaptcha-verify-button']
                );
                if (verifyBtn) {
                    this.log("Finalizing verification...", "VERIFY");
                    this.triggerHumanLikeClick(verifyBtn);
                    
                    // Post-verification check
                    setTimeout(async () => {
                        const audioInput = document.querySelector('#audio-response') || document.querySelector('input[id*="audio"]');
                        const errorMsg = document.querySelector('.rc-audiochallenge-error-message') || document.querySelector('.rc-audiochallenge-error');
                        const isWrong = (audioInput && audioInput.value === '') || !!errorMsg;
                        
                        if (isWrong) {
                            const res = await chrome.storage.local.get(['captchaAttempts']);
                            const newCount = (res.captchaAttempts || 0) + 1;
                            await chrome.storage.local.set({ captchaAttempts: newCount });
                            this.log(`Incorrect (${newCount}/${this.options.maxAttempts || 10})`, "FAIL");
                            if (newCount < (this.options.maxAttempts || 10)) this.reload();
                        } else {
                            this.log("Challenge Solved!", "SUCCESS");
                            await chrome.storage.local.set({ captchaAttempts: 0, captchaBlocked: false });
                        }
                    }, 3000);
                }
            }, 500);
        }

        reload() {
            const btn = this.findButtonByPattern(['reload', '새로', '업데이트'], ['#recaptcha-reload-button', '.rc-button-reload']);
            if (btn) setTimeout(() => btn.click(), 1000);
        }
    }

    // Export for test runner and window global
    if (typeof window !== 'undefined') {
        window.XpiderSolverContent = XpiderSolverContent;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { XpiderSolverContent };
    }

    // [v1.2.0 Autonomous Solver Engine] Universal Frame Detection & Auto-init
    const currentHref = (typeof window !== 'undefined' && window.location && window.location.href ? window.location.href : '').toLowerCase();
    const hasIframeChallenge = typeof document !== 'undefined' && document.querySelector ? document.querySelector('iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="hcaptcha"]') !== null : false;
    const isChallengeEnvironment = 
        currentHref.includes('google.com/recaptcha') ||
        currentHref.includes('google.co.kr/recaptcha') ||
        currentHref.includes('recaptcha.net') ||
        currentHref.includes('hcaptcha.com') ||
        currentHref.includes('cloudflare.com/turnstile') ||
        currentHref.includes('challenges.cloudflare.com') ||
        currentHref.includes('/sorry/') ||
        hasIframeChallenge;

    if (isChallengeEnvironment && typeof window !== 'undefined') {
        window.xpiderSolver = new XpiderSolverContent();
    }
})();

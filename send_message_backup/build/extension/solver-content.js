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
            if (this.hud || !document.body) return;
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
                const state = await chrome.storage.local.get(['captchaAttempts', 'captchaBlocked']);
                const attempts = state.captchaAttempts || 0;
                
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

                // [F13-Sanitized] No hardcoded credentials. Key must be supplied by user via Settings UI.
                const keys = await chrome.storage.local.get(['xpider_stt_api_key', 'audioSttKey', 'witKey']);
                let activeKey = keys.xpider_stt_api_key || keys.audioSttKey || keys.witKey;
                if (!activeKey || activeKey.trim() === '') {
                    this.log("⚠️ [STT] No Wit.ai key configured. Please set it in Settings.", "WARN");
                    return null;
                }

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

        async solveChallenge(input) {
            const audioUrl = this.getAudioUrl();
            if (!audioUrl) return;

            this.solving = true;
            this.log("Requesting transcription...", "SOLVING");

            try {
                const b64 = await this.fetchAsBase64(audioUrl);
                chrome.runtime.sendMessage({ 
                    action: 'PERFORM_TRANSCRIPTION', 
                    audioData: b64, 
                    url: audioUrl 
                }, async (resp) => {
                    this.solving = false;
                    if (resp && resp.text) {
                        // [v2.0] Clean transcription: remove brackets, extra punctuation, trim
                        const cleanText = resp.text
                            .replace(/[\[\]]/g, '')
                            .replace(/[.,!?;:]+$/g, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .toLowerCase();
                            
                        if (!cleanText) {
                            this.log("Empty result. Retrying...", "RETRY");
                            this.reload();
                            return;
                        }

                        this.log(`Success: [${cleanText}]`, "DONE");
                        this.submit(input, cleanText);
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

        getAudioUrl() {
            const el = document.querySelector('a[href*="payload"]') || document.querySelector('.rc-audiochallenge-tdownload-link') || document.querySelector('audio source') || document.querySelector('audio[src]');
            return el?.href || el?.src;
        }

        async fetchAsBase64(url) {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }

        submit(input, text) {
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            setTimeout(() => {
                const verifyBtn = this.findButtonByPattern(['verify', '확인', 'v'], ['#recaptcha-verify-button', '.rc-button-verify']);
                if (verifyBtn) {
                    this.log("Finalizing...", "VERIFY");
                    verifyBtn.click();
                    
                    // Post-verification check
                    setTimeout(async () => {
                        const audioInput = document.querySelector('#audio-response');
                        const errorMsg = document.querySelector('.rc-audiochallenge-error-message');
                        const isWrong = audioInput && (audioInput.value === '' || errorMsg);
                        
                        if (isWrong) {
                            const res = await chrome.storage.local.get(['captchaAttempts']);
                            const newCount = (res.captchaAttempts || 0) + 1;
                            await chrome.storage.local.set({ captchaAttempts: newCount });
                            this.log(`Incorrect (${newCount}/${this.options.maxAttempts || 10})`, "FAIL");
                            if (newCount < (this.options.maxAttempts || 10)) this.reload();
                        } else {
                            this.log("Solved successfully!", "SUCCESS");
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

    // [v1.2.0 Autonomous Solver Engine] Universal Frame Detection & Auto-init
    const currentHref = window.location.href.toLowerCase();
    const isChallengeEnvironment = 
        currentHref.includes('google.com/recaptcha') ||
        currentHref.includes('google.co.kr/recaptcha') ||
        currentHref.includes('recaptcha.net') ||
        currentHref.includes('hcaptcha.com') ||
        currentHref.includes('cloudflare.com/turnstile') ||
        currentHref.includes('challenges.cloudflare.com') ||
        currentHref.includes('/sorry/') ||
        document.querySelector('iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="hcaptcha"]') !== null;

    if (isChallengeEnvironment) {
        window.xpiderSolver = new XpiderSolverContent();
    }
})();

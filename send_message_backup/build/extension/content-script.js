/**
 * X PIDER Sender Pro - Content Script (V2.0 Advanced Engine)
 * Borrowing high-performance patterns from XSpider Pro core.
 * [v4.17.0] XPIDER DevLog Bridge 패치 적용됨
 */

// ── XPIDER DEV LOG BRIDGE (Content Script) ───────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[AutoFormSender/Content]';
  const _xDL = (lvl, msg) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl, source: _EXT_NAME,
        msg: String(msg).substring(0, 2048)
      }).catch(() => {});
    } catch(_) {}
  };
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
    };
  });
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (e) => _xDL('ERROR', `[Uncaught] ${e.message} at ${e.filename}:${e.lineno}`));
  }
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

(function() {
    console.log("🚀 [XpiderSender] Advanced Engine Loaded: " + (typeof window !== 'undefined' && window.location ? window.location.href : '(node-test)'));

    const _ContactGate = (typeof ContactGate !== 'undefined' && ContactGate) || 
        (typeof window !== 'undefined' && window.ContactGate) || 
        (typeof require !== 'undefined' ? require('./modules/contact-gate.js') : null);

    const _SmartFieldResolver = (typeof SmartFieldResolver !== 'undefined' && SmartFieldResolver) || 
        (typeof window !== 'undefined' && window.SmartFieldResolver) || 
        (typeof require !== 'undefined' ? require('./modules/smart-field-resolver.js') : null);

    const _MathCaptchaSolver = (typeof MathCaptchaSolver !== 'undefined' && MathCaptchaSolver) || 
        (typeof window !== 'undefined' && window.MathCaptchaSolver) || 
        (typeof require !== 'undefined' ? (function(){ try { return require('./modules/math-captcha-solver.js'); } catch(_) { return null; } })() : null);

    const _ContactDiscoveryEngine = (typeof ContactDiscoveryEngine !== 'undefined' && ContactDiscoveryEngine) || 
        (typeof window !== 'undefined' && window.ContactDiscoveryEngine) || 
        (typeof require !== 'undefined' ? require('./modules/contact-discovery-engine.js') : null);

    const _CheckboxResolverR2 = (typeof CheckboxResolverR2 !== 'undefined' && CheckboxResolverR2) || 
        (typeof window !== 'undefined' && window.CheckboxResolverR2) || 
        (typeof require !== 'undefined' ? require('./modules/checkbox-resolver-r2.js') : null);

    const _SelectResolverR2 = (typeof SelectResolverR2 !== 'undefined' && SelectResolverR2) || 
        (typeof window !== 'undefined' && window.SelectResolverR2) || 
        (typeof require !== 'undefined' ? require('./modules/select-resolver-r2.js') : null);

    const _FinalFormCompletionEngine = (typeof FinalFormCompletionEngine !== 'undefined' && FinalFormCompletionEngine) || 
        (typeof window !== 'undefined' && window.FinalFormCompletionEngine) || 
        (typeof require !== 'undefined' ? require('./modules/final-form-completion-engine.js') : null);

    const _FormDiscoveryEngineR2 = (typeof window !== 'undefined' && window.FormDiscoveryEngineR2) || 
        (typeof global !== 'undefined' && global.FormDiscoveryEngineR2) || 
        (typeof require !== 'undefined' ? require('./modules/form-discovery-engine-r2.js') : null);

    const _VisionSubmitExecutor = (typeof VisionSubmitExecutor !== 'undefined' && VisionSubmitExecutor) || 
        (typeof window !== 'undefined' && window.VisionSubmitExecutor) || 
        (typeof require !== 'undefined' ? require('./modules/vision-submit-executor.js') : null);

    // [Issue #6 R4 Top-Level Scope Guarantee] Downloadable extensions filter
    const NON_HTML_DOWNLOADABLE_EXTENSIONS = /\.(vcf|ics|ical|ifb|msg|eml|pdf|doc|docx|rtf|odt|xls|xlsx|csv|tsv|ppt|pptx|zip|rar|7z|tar|gz|bz2|exe|msi|bat|cmd|sh|apk|dmg|pkg|bin|mp3|wav|ogg|mp4|avi|mov|mkv|webm|jpg|jpeg|png|gif|svg|webp|ico|bmp|tiff|xml|json)(\?.*)?$/i;
    console.log("[RUNTIME_ASSERT] NON_HTML_DOWNLOADABLE_EXTENSIONS ready=true");

    // [Issue #6 R6.5] Target Lifecycle State Machine
    const TargetLifecycleState = {
        ACTIVE_FORM: 'ACTIVE_FORM',
        SUBMIT_RECOVERY: 'SUBMIT_RECOVERY',
        DISCOVERY_FALLBACK: 'DISCOVERY_FALLBACK',
        SETTLING: 'SETTLING',
        SETTLED: 'SETTLED'
    };
    let currentTargetLifecycleState = TargetLifecycleState.ACTIVE_FORM;
    let _isCaptchaSolved = false;

    function getTargetLifecycleState() {
        return currentTargetLifecycleState;
    }
    function setTargetLifecycleState(state) {
        currentTargetLifecycleState = state;
    }


    // ============================================================
    // [HyperEngine v4.0] Top-level React/Vue/Angular Native Value & Checked Setters
    // ============================================================
    function setNativeValue(el, val) {
        if (!el) return;
        try {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                        : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                        : HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (nativeSetter && nativeSetter.set) {
                nativeSetter.set.call(el, val);
            } else {
                el.value = val;
            }
        } catch (e) {
            el.value = val;
        }
    }

    function setNativeChecked(el, checked) {
        if (!el) return;
        try {
            const proto = HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'checked');
            if (nativeSetter && nativeSetter.set) {
                nativeSetter.set.call(el, checked);
            } else {
                el.checked = checked;
            }
        } catch (e) {
            el.checked = checked;
        }
    }

    // [v4.18.0] Operator-Visible Top-Level CAPTCHA Solver HUD
    function updateTopSolverHUD(message, status = 'ACTIVE') {
        try {
            if (typeof document === 'undefined' || !document.body) return;
            let hud = document.getElementById('xpider-top-solver-hud');
            if (!hud) {
                hud = document.createElement('div');
                hud.id = 'xpider-top-solver-hud';
                Object.assign(hud.style, {
                    position: 'fixed',
                    top: '12px',
                    right: '12px',
                    zIndex: '2147483647',
                    background: 'rgba(10, 15, 25, 0.95)',
                    border: '1px solid #00ffcc',
                    boxShadow: '0 0 15px rgba(0, 255, 204, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#e0e0e0',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: '12px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    pointerEvents: 'none',
                    backdropFilter: 'blur(6px)',
                    transition: 'opacity 0.3s ease'
                });
                document.body.appendChild(hud);
            }
            const isSuccess = status === 'DONE' || status === 'PASS' || status === 'SUCCESS';
            const isFail = status === 'FAIL' || status === 'ERROR';
            const statusColor = isSuccess ? '#00ffcc' : (isFail ? '#ff3333' : '#ffaa00');
            hud.innerHTML = `<span style="font-size: 14px;">🤖</span><span>[XPIDER AI Solver] <span style="color:${statusColor}">${message}</span></span>`;
            if (isSuccess) {
                setTimeout(() => { if (hud) hud.style.opacity = '0'; }, 3500);
            } else {
                hud.style.opacity = '1';
            }
        } catch (_) {}
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('message', (ev) => {
            if (ev.data && ev.data.type === 'XPIDER_SOLVER_HUD_UPDATE') {
                updateTopSolverHUD(ev.data.text || ev.data.status, ev.data.status);
            }
        });
    }

    // [Issue #6 R6.2 Requirement 8 / R6.3 A2] Reset Duplicate/SPA Suppression Per Real Navigation
    const currentSetupUrl = (typeof window !== 'undefined' && window.location ? window.location.href : '');
    const isNewSetupUrl = !window.__xpider_last_setup_url || window.__xpider_last_setup_url !== currentSetupUrl;
    window.__xpider_last_setup_url = currentSetupUrl;

    // [R6.3 A2] Execution Identity — multi-dimension lock replacing single boolean
    // Format: { attemptId, url, domGeneration }
    // URL change invalidates previous page's processing latch entirely.
    if (isNewSetupUrl) {
        const prevUrl = window.__xpider_exec_identity ? window.__xpider_exec_identity.url : null;
        if (prevUrl && prevUrl !== currentSetupUrl) {
            try {
                chrome.runtime.sendMessage({
                    action: 'SENDER_LOG',
                    message: `[TARGET_PAGE] url=${currentSetupUrl} domGeneration=${Date.now()} (prev=${prevUrl} invalidated)`,
                    logType: 'info'
                });
            } catch (_) {}
        }
        // Clear stale setup and running latch from previous DOM generation
        window.__xpider_initialized = false;
        window.__xpider_exec_identity = null;  // [R6.3] replaces __xpider_running boolean
        window.__xpider_running = false;        // legacy compat — keep in sync
        window.__xpider_running_url = null;
    }

    // [R6.3] Expose execution identity helpers on window for testability
    window.__xpider_acquireProcessingLock = function(attemptId, url, domGeneration) {
        if (window.__xpider_exec_identity) {
            const id = window.__xpider_exec_identity;
            // Same execution key — suppress duplicate
            if (id.attemptId === attemptId || (id.url === url && id.domGeneration === domGeneration)) {
                return false;
            }
            // Different URL or domGeneration — must have been released already (stale)
        }
        window.__xpider_exec_identity = { attemptId, url, domGeneration };
        window.__xpider_running = true;
        window.__xpider_running_url = url;
        return true;
    };
    window.__xpider_releaseProcessingLock = function(forUrl) {
        if (!forUrl || (window.__xpider_exec_identity && window.__xpider_exec_identity.url === forUrl)) {
            window.__xpider_exec_identity = null;
            window.__xpider_running = false;
            window.__xpider_running_url = null;
        }
    };
    window.__xpider_hasProcessingLock = function(url, domGeneration) {
        const id = window.__xpider_exec_identity;
        if (!id) return false;
        if (url && id.url !== url) return false;  // different URL -> no lock
        if (domGeneration !== undefined && id.domGeneration !== domGeneration) return false;
        return true;
    };

    const alreadyInitialized = window.__xpider_initialized;
    window.__xpider_initialized = true;

    // Initial signal to background that we are ready
    // [v6.0.0] Signal Flooding: Send READY multiple times to ensure sync on slow loads
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'SENDER_READY' });
        }, i * 500);
    }

    if (alreadyInitialized && !isNewSetupUrl) {
        logDev("⚠️ [Engine] Suppressing duplicate setup (Signals re-sent).", "debug");
        return;
    }

    // [v1.6.2] Bulletproof Heartbeat - Keep background alive during slow operations
    function startHeartbeat() {
        setInterval(() => {
            logDev("💓 [Heartbeat] Engine active and processing...", "debug");
        }, 5000); // [v18.9.0] 5s Heartbeat for MV3 Service Worker survival
    }

    function logDev(msg, type = 'info') {
        try {
            chrome.runtime.sendMessage({
                action: 'SENDER_LOG',
                message: msg,
                logType: type
            });
            console.log(`[XpiderLog] ${msg}`);
        } catch (e) {}
    }

    // [XSpider Pro Pattern] High-priority contact candidates
    const CONTACT_KEYWORDS = {
        high: ['contact', 'inquiry', 'support', 'message', '문의', '연락', 'お問い合わせ', '留言', '联系', 'customer-service', 'write-to-us', 'feedback', 'help-center'],
        mid: ['about', 'help', 'company', 'service', 'info', 'directions', 'location', '오시는길', '회사소개', '고객센터', '도움말'],
        low: ['get-in-touch', 'mail', 'form', 'account', 'sign-up']
    };

    const FIELD_PATTERNS = {
        firstName: [/\bfirst.?name\b/i,/\bgiven.?name\b/i,/\bforename\b/i,/\bfname\b/i,/\bfirst\b/i,/\bgiven\b/i,/이름/i,/성함/i,/名前/i,/名/i,/given/i,/\bnombre\b/i,/\bprenom\b/i,/\bvorname\b/i],
        lastName: [/\blast.?name\b/i,/\bfamily.?name\b/i,/\bsurname\b/i,/\blname\b/i,/\blast\b/i,/\bfamily\b/i,/성(?!명|함)/i,/苗字/i,/姓/i,/\bapellido\b/i,/\bnom\b/i,/\bnachname\b/i],
        name: [/\bname\b/i,/\bfull.?name\b/i,/\byour.*name\b/i,/\bcontact.*name\b/i,/\bcustomer.*name\b/i,/\bsender.*name\b/i,/성함/i,/氏名/i,/姓名/i,/성명/i,/이름/i,/user/i,/fullname/i,/\bcontact.*person\b/i,/\bclient.*name\b/i],
        email: [/email/i, /e-mail/i, /이메일/i, /メール/i, /邮箱/i, /correo/i, /courriel/i, /correo.*electrónico/i],
        subject: [/subject/i, /title/i, /제목/i, /件名/i, /主题/i, /topic/i, /asunto/i, /betreff/i, /objet/i],
        phone: [/phone/i, /tel/i, /mobile/i, /contact/i, /전화/i, /연락처/i, /電話/i, /手机/i, /电话/i, /teléfono/i, /telefon/i, /téléphone/i],
        message: [/message/i, /content/i, /body/i, /내용/i, /本文/i, /内容/i, /comment/i, /description/i, /inquiry/i, /mensaje/i, /nachricht/i, /\bmessage.*text\b/i, /\bbody.*text\b/i]
    };

    const DOMAIN_BLACKLIST = [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 
        'tiktok.com', 'pinterest.com', 'whatsapp.com', 't.me', 'wa.me',
        'google.com', 'naver.com', 'daum.net', 'yahoo.com', 'bing.com',
        '.gov', '.go.kr', '.mil', '.edu', 'wikipedia.org',
        'github.com', 'wordpress.org', 'squarespace.com', 'wix.com', 'weebly.com', 'medium.com'
    ];

    // [v2.5.0] Branch Discovery Keywords
    const BRANCH_KEYWORDS = ['location', 'branch', 'office', 'direction', '지점', '위치', '오시는길', '찾아오시는길', '약도', '본사', '사업소'];

    // [Issue #6 R6.8 P0-8] Single-Flight START_SENDING listener registration
    if (typeof window !== 'undefined') {
        if (window.__xpider_start_sending_handler && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            try {
                chrome.runtime.onMessage.removeListener(window.__xpider_start_sending_handler);
            } catch (_) {}
        }
        
        window.__xpider_getExecutionPayload = (extra = {}) => {
            const ident = window.__xpider_execution_identity || {};
            return Object.assign({
                attemptId: ident.attemptId || null,
                targetToken: ident.targetToken || null,
                campaignRunId: ident.campaignRunId || null,
                sessionId: ident.sessionId || null,
                captchaEpoch: ident.captchaEpoch || 1
            }, extra);
        };

        window.__xpider_sendExecutionMessage = (msg, cb) => {
            const payload = window.__xpider_getExecutionPayload ? window.__xpider_getExecutionPayload(msg) : msg;
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                try {
                    const p = chrome.runtime.sendMessage(payload, cb);
                    if (p && typeof p.catch === 'function') p.catch(() => {});
                    return p;
                } catch (_) {}
            }
        };

        window.__xpider_start_sending_handler = (request, sender, sendResponse) => {
            if (request.action === 'START_SENDING') {
                const currentRunUrl = (window.location ? window.location.href : '');
                const domGeneration = window.__xpider_dom_generation || (window.__xpider_dom_generation = Date.now());
                const attemptId = request.attemptId || (Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7));
                const singleFlightKey = `${attemptId}:${currentRunUrl}:${domGeneration}`;

                // [Issue #6 R6.9E] Canonical Execution Identity Binding
                window.__xpider_execution_identity = {
                    attemptId: request.attemptId || attemptId,
                    targetToken: request.targetToken || null,
                    campaignRunId: request.campaignRunId || null,
                    sessionId: request.sessionId || null,
                    captchaEpoch: request.captchaEpoch || 1
                };

                if (window.__xpider_active_single_flight === singleFlightKey || (window.__xpider_hasProcessingLock && window.__xpider_hasProcessingLock(currentRunUrl))) {
                    console.log(`[CONTROL_PLANE] duplicate START_SENDING suppressed key=${singleFlightKey}`);
                    return;
                }
                window.__xpider_active_single_flight = singleFlightKey;

                // [R6.3 A2] Acquire lock before proceeding
                if (window.__xpider_acquireProcessingLock) {
                    window.__xpider_acquireProcessingLock(attemptId, currentRunUrl, domGeneration);
                } else {
                    window.__xpider_running = true;
                    window.__xpider_running_url = currentRunUrl;
                }

                console.log(`[CONTROL_PLANE] listenersActive=1 key=${singleFlightKey}`);
                logDev(`[TARGET_PAGE] url=${currentRunUrl} domGeneration=${domGeneration} attemptId=${attemptId}`, "info");

                // [v17.6.0] Redirect Recovery
                const isVerificationMode = sessionStorage.getItem('xpider_pending_verify') === 'true';
                if (isVerificationMode) {
                    logDev("🔄 [Engine] Post-Redirect Recovery active. Verifying previous attempt...", "info");
                    detectSubmissionResult(null, request.template);
                    return;
                }
                
                processCampaign(request.template, request.delayMs, request.triedUrl, request.fillDelayMs, request.submitDelayMs);
            }
        };

        if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener(window.__xpider_start_sending_handler);
            console.log('[CONTROL_PLANE] listenersActive=1');
        }
    }

    function getSpeedProfile(delayMs, fillDelayMs = 300, submitDelayMs = 1500) {
        return {
            field: parseInt(fillDelayMs) || 300,
            hold: parseInt(submitDelayMs) || 1500
        };
    }

    function normalizeUrl(url) {
        if (!url) return '';
        try {
            const u = new URL(url);
            return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
        } catch (e) {
            return url.split('#')[0].replace(/\/$/, '').toLowerCase();
        }
    }

    async function discoverBranchLinks() {
        logDev("🔍 [Supreme-X 5.0] Scanning for multi-location / branch links...", "info");
        const links = queryAllDeep('a');
        const results = [];
        const currentOrigin = window.location.origin;
        const normalizedCurrent = normalizeUrl(window.location.href);

        for (const link of links) {
            const href = link.href || '';
            const text = (link.textContent || '').toLowerCase().trim();
            
            if (!href.startsWith(currentOrigin)) continue; // Keep within same domain
            
            // [v2.8.7] Normalize and avoid current page loop
            const normalizedHref = normalizeUrl(href);
            if (normalizedHref === normalizedCurrent) continue; 
            
            // [v2.9.1] Strict Domain Isolation for branch discovery
            try {
                if (new URL(href).origin !== currentOrigin) continue;
            } catch(e) { continue; }
            
            const isBranchLink = BRANCH_KEYWORDS.some(k => text.includes(k) || href.toLowerCase().includes(k)) && 
                                 !CONTACT_KEYWORDS.high.some(k => text.includes(k)); // Exclude main contact

            if (isBranchLink && results.length < 5) {
                if (!results.includes(href)) {
                    results.push(href);
                    logDev(`📍 [Supreme-X 5.0] Branch discovered: ${text} -> ${href}`);
                }
            }
        }
        return results;
    }

    async function safeNavigate(target, template) {
        const currentUrl = window.location.href;
        const currentPath = normalizeUrl(currentUrl);
        const targetPath = normalizeUrl(target);
        
        // [v2.9.6] Internal log for tracing
        console.log(`[Xpider] Navigating to: ${target}`);

        if (currentPath === targetPath && target.includes('#')) {
            logDev("🔗 [Engine] Hash-only (SPA) navigation detected. Re-triggering discovery...", "info");
            window.location.hash = target.split('#')[1] || '';
            setTimeout(() => {
                window.__xpider_running = false;
                processCampaign(template);
            }, 1500);
            return false; 
        } else {
            window.location.href = target;
            return true;
        }
    }

    async function guessDirectContactPaths(template) {
        // [v18.26.0] Logic Deprecated: Orchestration moved to background engine for persistence.
        return null;
    }

    // [v1.3.7] Shadow DOM Deep Search Utility
    function queryAllDeep(selector, root = document) {
        let nodes = [];
        try {
            nodes = Array.from(root.querySelectorAll(selector));
        } catch (e) {}

        const scan = (node) => {
            try {
                if (node.shadowRoot) {
                    try {
                        nodes = nodes.concat(Array.from(node.shadowRoot.querySelectorAll(selector)));
                    } catch (e) {}
                    Array.from(node.shadowRoot.children).forEach(scan);
                }
                Array.from(node.children || []).forEach(scan);
            } catch (e) {} // [v2.8.5] Resilience: Don't crash on protected components
        };
        
        try {
            Array.from(root.children || []).forEach(scan);
        } catch (e) {}
        return nodes;
    }

    async function cleanPageEnvironment() {
        logDev("🧹 [Cleaner] Scanning for intrusive overlays/popups...", "info");
        
        // [v17.7.0] Protected Elements: Never remove containers that contain actual inputs/forms
        const intrusiveSelectors = [
            '.wix-instant-popup', '.modal-overlay', '.cookie-banner', '#cookie-notice',
            '.sqs-announcement-bar', '.sp-popup-wrapper', '[class*="popup"]', '[id*="popup"]'
        ];
        
        // [v18.0.0] Protected Elements: Squarespace Modal & Lightbox Shield
        const isFormProtected = (el) => {
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const identifier = `${id} ${cls}`;
            return el.querySelector('input, textarea, select, canvas, iframe, .wpcf7-form, .gform_wrapper') || 
                   identifier.includes('sqs-modal') || identifier.includes('lightbox') || identifier.includes('yui3-');
        };

        intrusiveSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (isFormProtected(el)) return; // Protection logic
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' || style.zIndex > 1000) {
                    el.style.display = 'none';
                    logDev(`   - [Removed] Blocked intrusive element: ${sel}`);
                }
            });
        });
        
        // Remove high z-index blank overlays (with form protection)
        document.querySelectorAll('div').forEach(el => {
            if (isFormProtected(el)) return;
            const style = window.getComputedStyle(el);
            if (parseInt(style.zIndex) > 500 && (el.innerText || '').length < 10) {
                el.style.display = 'none';
            }
        });
    }

    async function triggerContactInteraction() {
        logDev("🔘 [Supreme-Scan] No form found. Attempting to trigger hidden contact containers...", "info");
        const triggerKeywords = [
            'contact', 'write', 'message', '문의', '연락', '보내기', 'inquiry',
            'escríbenos', 'contacto', // Spanish
            'kontakt', 'schreiben', // German
            'contattaci', // Italian
            'contacter', // French
            'お問い合わせ', '連絡', // Japanese
            '联系', '留言', // Chinese
            'tribeca', 'canarsie', 'marine park', 'location' // [v18.0.0] Regional location buttons
        ];
        
        // Search for buttons, links, and action-oriented spans/divs
        const possibleTriggers = queryAllDeep('button, a, div[role="button"], span.btn, .contact-btn, #contact-trigger, [class*="chat"], [id*="chat"], .support-trigger, .lightbox-handle, .sqs-block-button, .sqs-editable-button');
        
        for (const btn of possibleTriggers) {
            // [Safety Guard] Skip elements that trigger downloads or external application protocols (e.g. Outlook/vCard/PDF)
            if (btn.hasAttribute && btn.hasAttribute('download')) continue;
            if (btn.tagName === 'A' || (btn.hasAttribute && btn.hasAttribute('href'))) {
                const href = (btn.getAttribute('href') || '').toLowerCase().trim();
                if (/^(mailto:|tel:|callto:|sms:|javascript:)/i.test(href)) continue;
                if (NON_HTML_DOWNLOADABLE_EXTENSIONS.test(href)) continue;
                // In-page contact modal triggers must not perform full-page anchor navigation
                if (href.startsWith('http') || href.startsWith('/') || href.startsWith('.')) continue;
            }
            const text = (btn.textContent || btn.ariaLabel || '').toLowerCase().trim();
            const cls = (btn.className || '').toString().toLowerCase();
            const isIconTrigger = /chat|message|contact|support|mail/i.test(cls) || /chat|message|support/i.test(btn.id) || cls.includes('lightbox-handle');
            
            if (triggerKeywords.some(k => text.includes(k) && text.length < 25) || isIconTrigger) {
                logDev(`🎯 [Supreme-Scan 3.0] Activating high-probability trigger: "${text}" | Class: ${btn.className}`);
                try {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // [v18.27.0] Navigation Signal: Alert background that a navigation is likely
                    chrome.runtime.sendMessage({ action: 'SENDER_LOG', message: "🚀 [Engine] Trigger clicked. Expecting navigation...", logType: "info" });
                    
                    btn.click();
                    // Multi-event firing for heavy JS frameworks
                    ['mouseenter', 'mousedown', 'mouseup', 'click'].forEach(evt => {
                        btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true }));
                    });
                } catch(e) {}
                
                await new Promise(r => setTimeout(r, 1500)); 
                return true;
            }
        }
        return false;
    }

    async function closeIntrusivePopups() {
        logDev("🧹 [Cleaner] Scanning for intrusive overlays/popups and cookie banners...");
        
        // 1. 쿠키 및 일반 팝업 닫기/수락 버튼 전방위 탐색
        const closeSelectors = [
            '.close', '.dismiss', '.X', '[aria-label*="close"]', '[class*="close"]', 
            '[id*="close"]', '.modal-close', '.popup-close', '.et_pb_close_button',
            '.happyforms-close',
            // Cookie specific accept buttons
            '[id*="accept" i]', '[class*="accept" i]', '[id*="agree" i]', '[class*="agree" i]',
            '[id*="consent" i] button', '[class*="consent" i] button', '[id*="cookie" i] button', '[class*="cookie" i] button',
            '#cookie-accept', '.cookie-accept', '#cookie-agree', '.cookie-agree'
        ];
        
        const buttons = queryAllDeep('button, a, span, div[role="button"]');
        let closedCount = 0;
        
        // 다국어 쿠키 동의 및 닫기 키워드 매처
        const consentKeywords = [
            'x', 'close', '닫기', '閉じる', '关闭', 'accept', 'agree', 'allow', 
            'accept all', 'allow all', 'i agree', '수락', '동의', '허용', '동의합니다', '허용합니다',
            'ok', 'okay', 'yes', 'understood', '확인', '了解'
        ];
        
        for (const btn of buttons) {
            if (btn.hasAttribute && btn.hasAttribute('download')) continue;
            if (btn.tagName === 'A' && btn.hasAttribute && btn.hasAttribute('href')) {
                const href = (btn.getAttribute('href') || '').toLowerCase().trim();
                if (/^(mailto:|tel:|callto:|sms:)/i.test(href) || NON_HTML_DOWNLOADABLE_EXTENSIONS.test(href)) continue;
            }
            const isMatch = closeSelectors.some(s => {
                try { return btn.matches(s); } catch(e) { return false; }
            });
            const text = (btn.textContent || '').toLowerCase().trim();
            if (isMatch || consentKeywords.includes(text)) {
                const style = window.getComputedStyle(btn);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    btn.click();
                    closedCount++;
                }
            }
        }
        
        // 2. 강제 쿠키 스위핑 (클릭 실패나 오버레이 방어벽 제거)
        // 일반적인 쿠키 배너와 모달 오버레이 컨테이너들을 display: none 처리
        const cookieContainerSelectors = [
            '[id*="cookie" i]', '[class*="cookie" i]',
            '[id*="consent" i]', '[class*="consent" i]',
            '[id*="gdpr" i]', '[class*="gdpr" i]',
            '#cookie-law', '.cookie-banner', '[data-cookie]',
            // Wix/WordPress 특정 모달 차단
            '.wix-cookie-consent', '.sqs-cookie-banner-v2',
            // 화면 전체를 블로킹하는 배경막 overlay 제거
            '[class*="backdrop" i]', '[class*="overlay" i]:not(form):not(input)'
        ];
        
        let sweptCount = 0;
        for (const selector of cookieContainerSelectors) {
            try {
                const elements = queryAllDeep(selector);
                for (const el of elements) {
                    // 단, 폼 입력 요소나 실제 문의 폼 컨테이너가 쿠키 키워드를 ID에 포함하여 날아가는 현상 방지
                    if (el.tagName === 'FORM' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contains(document.querySelector('form'))) {
                        continue;
                    }
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && (style.position === 'fixed' || style.position === 'absolute' || parseInt(style.zIndex) > 100)) {
                        el.style.setProperty('display', 'none', 'important');
                        sweptCount++;
                    }
                }
            } catch(e) {}
        }
        
        if (closedCount > 0 || sweptCount > 0) {
            logDev(`✅ [Cleaner] Suppressed ${closedCount} buttons & swept ${sweptCount} cookie/overlay containers.`);
        }
    }

    async function checkAndRecoverPage() {
        const bodyText = document.body.textContent.toLowerCase();
        const errorKeywords = ['404 not found', 'page not found', 'forbidden', 'error 403', 'connection refused'];
        
        if (errorKeywords.some(k => bodyText.includes(k) && bodyText.length < 500)) {
            logDev("⚠️ [Recovery] Error page detected. Aborting path.", "error");
            finishCampaign(false, "Server Error / 404");
            return true;
        }
        return false;
    }

    async function processCampaign(template, delayMs = 10000, triedUrl = '', fillDelayMs = 300, submitDelayMs = 1500) {
        try {
            if (typeof document !== 'undefined' && document.readyState === 'loading') {
                await new Promise(r => {
                    document.addEventListener('DOMContentLoaded', r, { once: true });
                    setTimeout(r, 1000);
                });
            }
            const speed = getSpeedProfile(delayMs, fillDelayMs, submitDelayMs);
            const currentUrl = window.location.href;
            
            // [v2.9.8] Navigation Registry: Mark background-opened and current pages as visited
            const visited = JSON.parse(sessionStorage.getItem('xpider_guessed_paths') || '[]');
            const normalizedTried = normalizeUrl(triedUrl);
            const normalizedCurrent = normalizeUrl(currentUrl);

            if (normalizedTried && !visited.includes(normalizedTried)) visited.push(normalizedTried);
            if (normalizedCurrent && !visited.includes(normalizedCurrent)) visited.push(normalizedCurrent);
            sessionStorage.setItem('xpider_guessed_paths', JSON.stringify(visited));

            // [v1.6.5] Loop Protection: Check for recent successful submission on this path
            const lastSubmittedPath = sessionStorage.getItem('xpider_last_submit_path');
            const lastSubmitTime = parseInt(sessionStorage.getItem('xpider_last_submit_time') || '0');
            const now = Date.now();
            const submitCount = parseInt(sessionStorage.getItem('xpider_submit_count') || '0');
            
            // If we are on a path that was just submitted (within 20s)
            if (submitCount === 0 && lastSubmittedPath && currentUrl.includes(lastSubmittedPath) && (now - lastSubmitTime) < 20000) {
                logDev("🔄 [LoopGuard] Self-refresh detected. Waiting for actual success indicator...", "info");
                setTimeout(() => detectSubmissionResult(null, template), 500); 
                return;
            }

            logDev("🚀 [Engine] Ultra-Mode process started", "start");
            startHeartbeat();
            
            await closeIntrusivePopups();
            if (await checkAndRecoverPage()) return;

            const recursionDebt = parseInt(sessionStorage.getItem('xpider_recursion_debt') || '0');

            logDev(`[TARGET_PAGE] url=${currentUrl} recursion=${recursionDebt}`);
            logDev(`🔍 [Discovery] URL: ${currentUrl} | Recursion: ${recursionDebt}`);
            
            // 1. [v1.3.7] Ultra Polling Form Discovery
            await cleanPageEnvironment();

            // [Email Collector Integration] Auxiliary non-blocking email scan
            try {
                extractAndSendPageEmails();
            } catch (_) {}
            
            // [R6.3 B] FORM_SCAN log
            let currentForm = null;
            let formScanBodyCandidates = 0;
            let formScanForms = 0;
            let formScanLogical = 0;
            for (let i = 1; i <= 3; i++) {
                logDev(`🧐 [Discovery] Polling attempt ${i}/3... | URL: ${window.location.href} | Recursion: ${recursionDebt}`);
                currentForm = await findOptimalForm();

                // Count form scan stats
                try {
                    const allForms = document.querySelectorAll('form');
                    const allTextareas = document.querySelectorAll('textarea');
                    formScanForms = allForms.length;
                    formScanBodyCandidates = allTextareas.length;
                    formScanLogical = document.querySelectorAll('[role="form"], form, [data-form]').length;
                } catch (_) {}
                
                if (currentForm) break;
                
                // [Ultra-Mode] Try scrolling to reveal lazy-loaded forms
                if (i === 1) {
                    logDev("🚀 [Engine] Ultra-Mode: Scrolling to reveal lazy-loaded content...");
                    window.scrollBy({ top: 400, behavior: 'smooth' });
                } else if (i === 2) {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    await triggerContactInteraction();
                }
                
                await new Promise(r => setTimeout(r, 1500)); 
            }

            // [Issue #6 R6.8 P0-2] Strict Long-Text Gate & Container Assertion
            const validContainerTags = ['FORM', 'FIELDSET', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE'];
            if (currentForm && (!currentForm.tagName || !validContainerTags.includes(currentForm.tagName.toUpperCase()))) {
                console.log(`[FORM_GATE_INVARIANT_VIOLATION] Discarding invalid form container element: ${currentForm.tagName || typeof currentForm}`);
                logDev(`[FORM_GATE_INVARIANT_VIOLATION] Discarding invalid container: ${currentForm.tagName || typeof currentForm}`, "warning");
                currentForm = null;
            }

            let inquiryBody = null;
            if (currentForm && _ContactGate && typeof _ContactGate.detectInquiryBodyField === 'function') {
                inquiryBody = _ContactGate.detectInquiryBodyField(currentForm);
            } else if (currentForm && currentForm.querySelector) {
                inquiryBody = currentForm.querySelector('textarea, [contenteditable="true"], [role="textbox"][aria-multiline="true"]');
            }

            // [P0-2 Rule 1 & 2] bodyCandidates === 0 or no genuine inquiry body field -> hard eligible=false
            if (formScanBodyCandidates === 0 || !inquiryBody) {
                if (currentForm) {
                    console.log(`[FORM_GATE_INVARIANT_VIOLATION] bodyCandidates=${formScanBodyCandidates} hasInquiryBody=${!!inquiryBody} -> eligible=false`);
                    logDev(`[FORM_GATE_INVARIANT_VIOLATION] bodyCandidates=${formScanBodyCandidates} -> rejecting container`, "warning");

                    // [R6.9A Acceptance Directive] Non-inquiry forms (login, newsletter, search, booking)
                    // must be settled as SKIPPED rather than attempting fallback link discovery.
                    if (_ContactGate && typeof _ContactGate.classifyFormIntent === 'function') {
                        const classification = _ContactGate.classifyFormIntent(currentForm);
                        if (!classification.eligible && classification.reason && classification.reason.startsWith('NON_INQUIRY')) {
                            logDev(`❌ [ContactGate] Non-inquiry form rejected: ${classification.reason}`, "error");
                            finishCampaign(false, classification.reason, classification.reason);
                            return;
                        }
                    }
                    currentForm = null;
                }
            }

            // [R6.3 A3 & B] Page classification and FORM_SCAN log
            const isContactPageUrl = isContactPage();
            let pageClass = 'UNKNOWN';
            if (currentForm) {
                pageClass = 'CONTACT_FORM_PAGE';
            } else {
                // Detect contact info only (phone/email visible, no form)
                const pageText = (document.body ? document.body.innerText : '').toLowerCase();
                const hasContactInfo = /@[a-z0-9.-]+\.[a-z]{2,}/.test(pageText) || /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(pageText);
                const hasFormSignals = document.querySelectorAll('input[type="text"], input[type="email"], textarea').length > 0;
                if (hasContactInfo && !hasFormSignals) {
                    pageClass = 'CONTACT_INFO_ONLY';
                } else if (!hasContactInfo && !hasFormSignals) {
                    pageClass = 'NO_CONTACT';
                } else if (hasFormSignals) {
                    pageClass = 'NEWSLETTER_ONLY'; // form exists but not inquiry body
                }
            }

            logDev(`[FORM_SCAN] bodyCandidates=${formScanBodyCandidates} forms=${formScanForms} logicalContainers=${formScanLogical}`, "info");
            logDev(`[PAGE_CLASS] ${pageClass}`, "info");

            // [R6.3 A3] CONTACT_INFO_ONLY: do NOT acquire submit lock; continue discovery
            if (pageClass === 'CONTACT_INFO_ONLY' && !currentForm) {
                logDev("[FORM_GATE] eligible=false reason=CONTACT_INFO_ONLY", "info");
                logDev("[DISCOVERY_CONTINUE] from=CONTACT_INFO_ONLY — skipping autofill, searching alternate candidates", "info");
                if (window.__xpider_releaseProcessingLock) window.__xpider_releaseProcessingLock(currentUrl);
            } else if (!currentForm) {
                logDev("[LONG_TEXT_GATE] found=false", "info");
                logDev("[FORM_GATE] eligible=false reason=NO_LONG_TEXT_INQUIRY_FIELD", "info");
                if (window.__xpider_releaseProcessingLock) window.__xpider_releaseProcessingLock(currentUrl);

                // [R6.9A Acceptance Directive] Non-inquiry forms (login, newsletter, search, booking)
                // on dedicated pages must be settled as SKIPPED rather than attempting fallback link discovery.
                if (typeof document !== 'undefined') {
                    const pageForms = Array.from(document.querySelectorAll('form, [role="form"]'));
                    for (const pf of pageForms) {
                        if (_ContactGate && typeof _ContactGate.classifyFormIntent === 'function') {
                            const classification = _ContactGate.classifyFormIntent(pf);
                            logDev(`[FORM_CLASSIFY] intent=${classification.intent} eligible=${classification.eligible} reason=${classification.reason}`);
                            const isNonInquiry = !classification.eligible && (
                                (classification.reason && classification.reason.startsWith('NON_INQUIRY')) ||
                                classification.intent === 'LOGIN' ||
                                classification.intent === 'SEARCH' ||
                                classification.intent === 'SUBSCRIBE' ||
                                classification.intent === 'NEWSLETTER' ||
                                classification.intent === 'BOOKING'
                            );
                            if (isNonInquiry) {
                                const settleReason = (classification.reason && classification.reason.startsWith('NON_INQUIRY'))
                                    ? classification.reason
                                    : `NON_INQUIRY_${classification.intent}_FORM`;
                                const bestLink = typeof findBestContactLink === 'function' ? findBestContactLink() : null;
                                if (settleReason === 'NON_INQUIRY_LOGIN_FORM' || !bestLink) {
                                    logDev(`[FORM_GATE] eligible=false reason=${settleReason}`);
                                    logDev(`❌ [ContactGate] Page rejected: non-inquiry form (${settleReason})`, "error");
                                    currentTargetLifecycleState = TargetLifecycleState.SETTLING;
                                    finishCampaign(false, settleReason, settleReason);
                                    return;
                                }
                            }
                        }
                    }

                    // Also check dedicated non-inquiry URL endpoints (e.g. /login, /signin)
                    const lowerUrl = currentUrl.toLowerCase();
                    if (lowerUrl.includes('/login') || lowerUrl.includes('/signin') || lowerUrl.includes('/auth/')) {
                        const settleReason = 'NON_INQUIRY_LOGIN_FORM';
                        logDev(`[FORM_CLASSIFY] intent=LOGIN eligible=false reason=${settleReason}`);
                        logDev(`[FORM_GATE] eligible=false reason=${settleReason}`);
                        logDev(`❌ [ContactGate] Dedicated login page rejected: ${settleReason}`, "error");
                        currentTargetLifecycleState = TargetLifecycleState.SETTLING;
                        finishCampaign(false, settleReason, settleReason);
                        return;
                    }
                }
            }

            if (currentForm) {
                logDev("🎯 Step 2: Contact form discovered. Preparing submission...", "success");
                logDev("[STAGE] stage=CONTACT_PAGE_FOUND", "success");
                logDev(`[LONG_TEXT_GATE] found=true type=${inquiryBody?.type || 'textarea'} semantic=${inquiryBody?.semantic || 'message'}`, "info");
                logDev(`[FORM_GATE] eligible=true reason=BODY_FIELD_PRESENT`, "info");
                try {
                    (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({
                        action: 'STAGE_PROGRESSION',
                        stage: 'CONTACT_PAGE_FOUND',
                        url: window.location.href
                    });
                } catch (_) {}
                sessionStorage.removeItem('xpider_recursion_debt');
                sessionStorage.removeItem('xpider_guessed_paths');
                
                // [v2.5.0] Multi-Branch Search: Scan for other regional branches on this domain
                const branches = await discoverBranchLinks();
                if (branches.length > 0) {
                    chrome.runtime.sendMessage({ action: 'QUEUE_BRANCHES', links: branches });
                    logDev(`🌐 [Supreme-X 5.0] ${branches.length} additional branch targets queued for traversal.`, "success");
                }

                // [Issue #6 R6.2 Autofill Bridge] Canonical startAutofillForEligibleForm
                // [R6.3 B] AUTOFILL_LOCK log — acquired only after eligible form verified
                const autofillAttemptId = (window.__xpider_exec_identity && window.__xpider_exec_identity.attemptId) ||
                    (Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7));
                const autofillKey = `${autofillAttemptId}:${currentUrl}:${currentForm ? (currentForm.id || currentForm.className || 'form') : 'none'}`;
                logDev(`[AUTOFILL_LOCK] acquired=true key=${autofillKey}`, "info");
                const bridgeFn = (_FormDiscoveryEngineR2 && _FormDiscoveryEngineR2.startAutofillForEligibleForm) || 
                                 (typeof window !== 'undefined' && window.__xpiderStartAutofillForEligibleForm);
                if (typeof bridgeFn === 'function') {
                    bridgeFn(autofillAttemptId, { form: currentForm, template, speed });
                }

                currentTargetLifecycleState = TargetLifecycleState.ACTIVE_FORM;
                const fillResult = await fillAndSubmit(currentForm, template, speed);
                if (fillResult) {
                    logDev("✅ [Engine] Campaign step successfully executed.", "success");
                    return; // EXIT: Step complete
                } else {
                    if (currentTargetLifecycleState === TargetLifecycleState.SETTLED || currentTargetLifecycleState === TargetLifecycleState.SETTLING) {
                        logDev("[LIFECYCLE] Target already settling/settled post-audit form submit recovery. Aborting fallback discovery.", "info");
                        return;
                    }
                    logDev("⚠️ [Engine] Mapping incomplete or form hidden. Retrying alternative discovery...", "warning");
                    // Continue to next discovery steps...
                }
            }

            // Fallback Discovery Phase
            if (currentTargetLifecycleState === TargetLifecycleState.SETTLED || currentTargetLifecycleState === TargetLifecycleState.SETTLING) {
                logDev("[LIFECYCLE] Target settled. Fallback discovery suppressed.", "info");
                return;
            }
            currentTargetLifecycleState = TargetLifecycleState.DISCOVERY_FALLBACK;

            // 2. Track A: DOM Contact Link Scanning (Baseline First)
            logDev("🕵️ [Discovery] Scanning DOM for contact links (Track A)...");
            const bestLink = findBestContactLink();
            if (bestLink && normalizeUrl(bestLink) !== normalizeUrl(currentUrl)) {
                logDev(`🎯 Step 1: Contact page link found! Navigating to: ${bestLink}`, "success");
                await safeNavigate(bestLink, template);
                return;
            }

            // 3. Direct Path Guessing (Only if DOM links not found)
            if (recursionDebt === 0) {
                logDev("⚡ [Discovery] No form or links on current page. Trying common paths...");
                const directPath = await guessDirectContactPaths(template);
                if (directPath) return; // Navigation handled inside
            }

            // 4. Recursive Search (Deep Form Hunting)
            if (recursionDebt < 1) {
                logDev("🔦 [DeepSearch] No obvious links. Searching secondary pages...");
                const secondaryLinks = findSecondaryLinks();
                for (let link of secondaryLinks) {
                    const visited = JSON.parse(sessionStorage.getItem('xpider_visited_subs') || '[]');
                    if (!visited.includes(link)) {
                        logDev(`🌍 [DeepSearch] Visiting secondary: ${link}`);
                        visited.push(link);
                        sessionStorage.setItem('xpider_visited_subs', JSON.stringify(visited));
                        sessionStorage.setItem('xpider_recursion_debt', (recursionDebt + 1).toString());
                        window.location.href = link;
                        return;
                    }
                }
            }

            logDev("❌ [Discovery] No valid forms or links found. Jumping to root/next candidate...", "warning");
            sessionStorage.removeItem('xpider_recursion_debt');
            sessionStorage.removeItem('xpider_guessed_paths');
            currentTargetLifecycleState = TargetLifecycleState.SETTLING;
            finishCampaign(false, "NO_FORM_ON_PAGE", "CONTACT_DISCOVERY_EXHAUSTED");
        } catch (e) {
            logDev(`🚨 [Engine] Fatal runtime error: ${e.message}`, "error");
            const isRef = (e instanceof ReferenceError) || /is not defined/i.test(e.message);
            const rCode = isRef ? `CORE_RUNTIME_ERROR: ${e.message}` : (e.message || "UNKNOWN");
            finishCampaign(false, e.message, rCode);
        }
    }

    function findSecondaryLinks() {
        const links = Array.from(document.querySelectorAll('a'));
        const currentOrigin = window.location.origin;

        return links
            .map(a => ({ href: a.href, text: a.textContent.toLowerCase(), score: 0 }))
            .filter(l => {
                try {
                    const u = new URL(l.href);
                    // [v2.9.0] Strict Domain Isolation: ONLY visit links of the same origin
                    return u.origin === currentOrigin && !DOMAIN_BLACKLIST.some(d => l.href.includes(d));
                } catch(e) { return false; }
            })
            .map(l => {
                if (CONTACT_KEYWORDS.mid.some(k => l.text.includes(k) || l.href.toLowerCase().includes(k))) l.score = 50;
                return l;
            })
            .filter(l => l.score >= 50)
            .sort((a, b) => b.score - a.score)
            .map(l => l.href)
            .slice(0, 3);
    }

    // [Issue #6 R5 & R6.9C] Authoritative Email Collector Runtime Bridge
    let __emailCollectorGeneration = null;
    let __emailCollectorSuppressedUntil = 0;
    let __emailCollectorBaseline = new Set();
    let __emailCollectorLastFingerprint = '';
    let __emailCollectorObserver = null;
    let __emailCollectorDebounceTimer = null;
    let __emailCollectorResyncing = false;

    // Generation synchronization from chrome.storage.local with readiness gate (Bug 3 Fix)
    const __emailCollectorReady = new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                chrome.storage.local.get(['xpider_email_generation'], (res) => {
                    if (res && typeof res.xpider_email_generation === 'number') {
                        __emailCollectorGeneration = res.xpider_email_generation;
                    } else if (__emailCollectorGeneration === null) {
                        __emailCollectorGeneration = 1;
                    }
                    const modLoaded = (typeof extractEmailsFromDocument === 'function') || 
                        (typeof self !== 'undefined' && typeof self.extractEmailsFromDocument === 'function') ||
                        (typeof window !== 'undefined' && typeof window.extractEmailsFromDocument === 'function');
                    console.log(`[EMAIL_COLLECTOR_INIT] generation=${__emailCollectorGeneration} moduleLoaded=${modLoaded}`);
                    resolve(__emailCollectorGeneration);
                });
            } catch (_) {
                if (__emailCollectorGeneration === null) __emailCollectorGeneration = 1;
                resolve(__emailCollectorGeneration);
            }
        } else {
            if (__emailCollectorGeneration === null) __emailCollectorGeneration = 1;
            resolve(__emailCollectorGeneration);
        }
    });

    __emailCollectorReady.then(() => {
        extractAndSendPageEmails('INIT');
        setupEmailCollectorObserver();
    });

    // Clear broadcast listener (Directive Section 7)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg && msg.action === 'EMAIL_COLLECTOR_CLEARED') {
                    if (typeof msg.generation === 'number') {
                        __emailCollectorGeneration = msg.generation;
                    }
                    const duration = msg.suppressRecollectMs || 5000;
                    __emailCollectorSuppressedUntil = Date.now() + duration;
                    try {
                        const currentOnPage = extractEmailsFromCurrentDom();
                        __emailCollectorBaseline = new Set(currentOnPage);
                        __emailCollectorLastFingerprint = ''; // clear fingerprint so dynamic additions after clear can be detected
                    } catch (_) {}
                    console.log(`[EMAIL_COLLECTOR_CLEARED] generation=${__emailCollectorGeneration} suppressedUntil=${__emailCollectorSuppressedUntil} baseline=${__emailCollectorBaseline.size}`);
                }
            });
        } catch (_) {}
    }

    function extractEmailsFromCurrentDom() {
        if (typeof self !== 'undefined' && typeof self.extractEmailsFromDocument === 'function') {
            return self.extractEmailsFromDocument(document);
        }
        if (typeof window !== 'undefined' && typeof window.extractEmailsFromDocument === 'function') {
            return window.extractEmailsFromDocument(document);
        }
        if (typeof extractEmailsFromDocument === 'function') {
            return extractEmailsFromDocument(document);
        }
        // Minimal fallback extractor if module is not in global scope
        const IGNORE_PREFIXES = ['test', 'email', 'account', 'username', 'firstname.lastname', 'your.name', 'example', 'user', 'sample', 'name', 'domain', 'company'];
        const INVALID_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'ico', 'bmp', 'tiff', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav'];
        const EXTRACT_REGEX = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
        const emails = new Set();
        const text = (document.documentElement ? document.documentElement.innerHTML : '') + ' ' + (document.body ? document.body.innerText : '');
        const matches = text.match(EXTRACT_REGEX);
        if (matches) {
            for (const m of matches) {
                let e = m.toLowerCase().trim().replace(/['";,<>(){}\[\]]+$/g, '').replace(/^[<('"]+/, '').replace(/\.$/, '');
                const parts = e.split('.');
                if (INVALID_EXTENSIONS.includes(parts[parts.length - 1])) continue;
                const atParts = e.split('@');
                if (atParts.length !== 2) continue;
                if (IGNORE_PREFIXES.includes(atParts[0])) continue;
                if (atParts[0].length < 2 || atParts[0].length > 64) continue;
                if (atParts[1].length < 4 || !atParts[1].includes('.')) continue;
                emails.add(e);
            }
        }
        document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
            try {
                const href = link.getAttribute('href') || '';
                let raw = href.replace(/^mailto:/i, '').split('?')[0].toLowerCase().trim().replace(/['";,]+$/g, '');
                if (raw && raw.includes('@')) {
                    const p = raw.split('@')[0];
                    if (!IGNORE_PREFIXES.includes(p) && p.length >= 2) emails.add(raw);
                }
            } catch (_) {}
        });
        return Array.from(emails).sort();
    }

    async function extractAndSendPageEmails(trigger = 'SCAN') {
        try {
            await __emailCollectorReady;
            if (Date.now() < __emailCollectorSuppressedUntil) return;

            const allFound = extractEmailsFromCurrentDom() || [];
            const pageUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
            const hostname = (typeof window !== 'undefined' && window.location) ? window.location.hostname : 'unknown';

            console.log(`[EMAIL_SCAN] url=${pageUrl} found=${allFound.length} trigger=${trigger}`);

            // Post-clear baseline: do NOT re-collect unchanged current DOM emails
            const newEmails = allFound.filter(e => !__emailCollectorBaseline.has(e));

            // If page has emails, but all are baseline (unchanged post-clear), do not send
            if (allFound.length > 0 && newEmails.length === 0) {
                return;
            }

            // Deterministic fingerprint: hostname + sorted emails
            const fingerprint = `${hostname}::${allFound.slice().sort().join(',')}`;
            if (fingerprint === __emailCollectorLastFingerprint && trigger !== 'FORCE') {
                return;
            }
            __emailCollectorLastFingerprint = fingerprint;

            const genToSend = typeof __emailCollectorGeneration === 'number' ? __emailCollectorGeneration : 1;
            console.log(`[EMAIL_SEND] generation=${genToSend} pageCount=${allFound.length} collectibleCount=${newEmails.length} count=${newEmails.length} hostname=${hostname}`);

            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    action: 'EMAIL_COLLECT_FOUND',
                    pageEmails: allFound,
                    collectibleEmails: newEmails,
                    emails: newEmails,
                    hostname: hostname,
                    url: pageUrl,
                    generation: genToSend
                }, (response) => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                        console.warn(`[EMAIL_COLLECTOR_ERROR] stage=send error=${chrome.runtime.lastError.message}`);
                        return;
                    }
                    if (response) {
                        console.log(`[EMAIL_ACK] currentPageCount=${response.currentPageCount || 0} newGlobalCount=${response.newGlobalCount || 0} totalGlobalCount=${response.totalGlobalCount || 0} suppressed=${!!response.suppressed} staleGeneration=${!!response.staleGeneration}`);
                        if (response.staleGeneration === true && !__emailCollectorResyncing) {
                            __emailCollectorResyncing = true;
                            console.log(`[EMAIL_GENERATION_RESYNC] trigger=${trigger} previousGen=${genToSend}`);
                            __emailCollectorLastFingerprint = '';
                            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                                chrome.storage.local.get(['xpider_email_generation'], (res) => {
                                    if (res && typeof res.xpider_email_generation === 'number') {
                                        __emailCollectorGeneration = res.xpider_email_generation;
                                    }
                                    setTimeout(() => {
                                        __emailCollectorResyncing = false;
                                        extractAndSendPageEmails('FORCE');
                                    }, 50);
                                });
                            } else {
                                __emailCollectorResyncing = false;
                            }
                        }
                    }
                });
            }
        } catch (err) {
            console.warn(`[EMAIL_COLLECTOR_ERROR] stage=extractAndSend error=${err.message}`);
        }
    }

    function setupEmailCollectorObserver() {
        if (__emailCollectorObserver) return;
        try {
            if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
                __emailCollectorObserver = new MutationObserver(() => {
                    if (__emailCollectorDebounceTimer) clearTimeout(__emailCollectorDebounceTimer);
                    __emailCollectorDebounceTimer = setTimeout(() => {
                        extractAndSendPageEmails('MUTATION');
                    }, 800);
                });
                __emailCollectorObserver.observe(document.body, { childList: true, subtree: true });
            }
        } catch (_) {}
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('beforeunload', () => {
            if (__emailCollectorObserver) {
                __emailCollectorObserver.disconnect();
                __emailCollectorObserver = null;
            }
            if (__emailCollectorDebounceTimer) {
                clearTimeout(__emailCollectorDebounceTimer);
                __emailCollectorDebounceTimer = null;
            }
        });
    }

    async function fillAndSubmit(form, template, speed) {
        try {
            _isCaptchaSolved = false;
            extractAndSendPageEmails('FORM_ENTRY');

            // [HARD ELIGIBILITY GATE] Verify form eligibility before any autofill or submit
            if (_ContactGate && typeof _ContactGate.classifyFormIntent === 'function') {
                const classification = _ContactGate.classifyFormIntent(form);
                if (!classification.eligible) {
                    logDev(`❌ [ContactGate] Form rejected: ${classification.reason}`, "error");
                    finishCampaign(false, classification.reason, classification.reason);
                    return false;
                }
                logDev(`[CONTACT_GATE] PASS bodyField=${classification.bodyFieldType}`, "success");
                logDev("[STAGE] stage=ELIGIBLE_FORM_FOUND", "success");
                try {
                    const sendFn = window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage;
                    sendFn({
                        action: 'FORM_GATE_PASSED',
                        contactPageUrl: window.location.href,
                        formPageUrl: window.location.href,
                        bodyFieldType: classification.bodyFieldType
                    });
                    sendFn({
                        action: 'STAGE_PROGRESSION',
                        stage: 'ELIGIBLE_FORM_FOUND',
                        url: window.location.href
                    });
                } catch (_) {}
            }

            // [Auto CAPTCHA Solver 2Captcha API] Proactive early detection upon form recognition
            if (!_isCaptchaSolved && (await checkForCaptcha())) {
                logDev("🤖 [Security] CAPTCHA detected on form recognition. Initiating proactive 2Captcha solver...", "info");
                tryAutoSolveCaptcha('FORM_RECOGNITION').catch(() => {});
            }

            logDev("🛠️ Step 3: Registering message template to form fields...", "info");
            // [v4.1] 300ms 실시간 공란 자동 메꾸기 감시 크롤러 작동 개시
            startActiveEmptyFieldSweeper(form, template);

            const result = await fillFormIntelligent(form, template, speed);
            if (!result || !result.filledAny) {
                const failReason = (result && result.reasonCode) || "Zero-mapping: No usable fields found.";
                throw new Error(failReason);
            }
            logDev("[FILL] messageBodyFilled=true", "success");
            
            // [v1.5.7] Math Captcha Handling (Divi & Others)
            await solveMathCaptcha(form);

            logDev(`✅ [FORM_PREP] COMPLETE`, "info");
            
            if (!_isCaptchaSolved && (await checkForCaptcha())) {
                logDev("🤖 [Security] CAPTCHA detected. Engine paused for solver.", "info");
                try {
                    (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({ action: 'STAGE_PROGRESSION', stage: 'CAPTCHA', url: window.location.href });
                } catch (_) {}
                const solved = await waitForCaptchaSolved();
                if (!solved) throw new Error("Security Timeout: CAPTCHA unsolved.");
                logDev("🔑 [Security] Bypass verified", "success");
            }
            
            // [v18.7.5] Visual Hold: Pause so user can confirm mapped fields
            logDev(`⏳ [Engine] Holding for visual confirmation (${speed.hold}ms)...`, "info");
            await new Promise(r => setTimeout(r, speed.hold));
            
            // [R6.1 AI FINAL FILL PASS]
            let auditResult = { pass: true };
            if (_FinalFormCompletionEngine) {
                logDev("🧠 [FinalFill] Running AI Final Form Completion Pass immediately before submit...", "info");
                try {
                    const engine = new _FinalFormCompletionEngine({
                        logger: (msg) => logDev(msg, "info"),
                        checkboxResolver: _CheckboxResolverR2 ? new _CheckboxResolverR2() : null,
                        selectResolver: _SelectResolverR2 ? new _SelectResolverR2() : null
                    });
                    const pageCtx = { url: (typeof window !== 'undefined' && window.location) ? window.location.href : '' };
                    auditResult = await engine.run(form, template, pageCtx);
                    
                    // [R6.1 FINAL REQUIRED AUDIT - HARD GATE]
                    if (!auditResult.pass) {
                        logDev(`❌ [FinalAudit] Submission blocked by Hard Gate: ${auditResult.reason}`, "error");
                        finishCampaign(false, "FINAL_FORM_COMPLETION_FAILED", auditResult.reason, { audit: auditResult });
                        return false;
                    }
                    logDev("✅ [FinalAudit] Hard Gate Passed: 0 unresolved required fields", "success");
                } catch (err) {
                    logDev(`⚠️ [FinalFill] Warning during final fill pass: ${err.message}`, "warning");
                }
            }

            // [Section B] FREEZE_VALUES: Stop sweeper, snapshot field values, freeze further mutations
            stopActiveEmptyFieldSweeper();
            const frozenSnapshot = freezeFieldValues(form, template);

            // [R6.3 A1 & B] SUBMIT_LOCK must only be acquired here — after FINAL_AUDIT_PASS, eligible form confirmed
            const submitLockUrl = (typeof window !== 'undefined' && window.location) ? window.location.href : '';
            logDev(`[SUBMIT_LOCK] acquired=true submittedFromUrl=${submitLockUrl} — post FINAL_AUDIT_PASS`, "info");

            currentTargetLifecycleState = TargetLifecycleState.SUBMIT_RECOVERY;

            logDev("📤 [Action] Triggering submission sequence...");
            logDev("[SUBMIT] attemptStarted=true", "info");
            logDev("[STAGE] stage=SUBMIT_ATTEMPT_STARTED", "info");
            try {
                (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({
                    action: 'STAGE_PROGRESSION',
                    stage: 'SUBMIT_ATTEMPT_STARTED',
                    url: window.location.href
                });
            } catch (_) {}
            
            // [Hotfix R2 & R6.9E] Prepare SubmissionOutcomeVerifier BEFORE submit action
            const submitHoldMs = (speed && speed.hold) || submitDelayMs || 4000;
            const verifier = new SubmissionOutcomeVerifier(form, template, {
                submitDelayMs: submitHoldMs,
                baseWaitMs: Math.max(12000, submitHoldMs * 2),
                extendedWaitMs: Math.max(25000, submitHoldMs * 4),
                transportWaitMs: 35000
            });
            verifier.prepare();

            // [v1.6.5] Record submission attempt to prevent loops AND store initial state for persistence
            sessionStorage.setItem('xpider_last_submit_path', window.location.pathname);
            sessionStorage.setItem('xpider_last_submit_time', Date.now().toString());
            sessionStorage.setItem('xpider_initial_url', window.location.href);
            sessionStorage.setItem('xpider_submitted_from_url', window.location.href);
            sessionStorage.setItem('xpider_initial_form_present', 'true');
            sessionStorage.setItem('xpider_pending_verify', 'true'); // [v17.6.0]

            let submitOutcome = await executeSubmitStateMachine(form, template, { expectedSnapshot: frozenSnapshot, allowVisionSubmit: true });
            if ((!submitOutcome.success || submitOutcome.reasonCode === 'EVENT_ONLY') && _VisionSubmitExecutor) {
                try {
                    logDev("👁️ [VisionSubmit] Initiating VisionSubmitExecutor last-resort activation...", "info");
                    const visionExecutor = new _VisionSubmitExecutor();
                    const vResult = await visionExecutor.execute(form, {});
                    if (vResult && vResult.success) {
                        submitOutcome = { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'vision_coordinate_click', submitEventFired: true, commitSignal: vResult.commitSignal };
                    }
                } catch (vErr) {
                    logDev(`⚠️ [VisionSubmit] Fallback error: ${vErr.message}`, "warning");
                }
            }

            if (!submitOutcome.success) {
                verifier.cleanup();
                logDev("[SUBMIT] triggered=false", "warning");
                logDev(`❌ [Submit] Submission blocked: ${submitOutcome.reasonCode}`, "error");
                currentTargetLifecycleState = TargetLifecycleState.SETTLING;
                finishCampaign(false, submitOutcome.reasonCode, submitOutcome.reasonCode);
                return false;
            }

            // [Issue #6 R6.5 Bug B] Only emit SUBMIT_TRIGGERED after successful activation/submit event
            logDev("[SUBMIT] triggered=true", "info");
            logDev("[STAGE] stage=SUBMIT_TRIGGERED", "info");
            try {
                (window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage)({
                    action: 'STAGE_PROGRESSION',
                    stage: 'SUBMIT_TRIGGERED',
                    url: window.location.href
                });
            } catch (_) {}

            return await verifier.verify(submitOutcome);
        } catch (e) {
            logDev(`❌ [Action] Sequence aborted: ${e.message}`, "error");
            return false;
        }
    }

    async function solveMathCaptcha(form) {
        const questionEl = form.querySelector('.et_pb_contact_captcha_question, .captcha-question, #captcha_text');
        const inputEl = form.querySelector('input.et_pb_contact_captcha, input[name*="captcha"], #captcha_input');
        
        if (questionEl && inputEl) {
            const text = (questionEl.textContent || '').trim();
            logDev("🧩 [Action] Math Captcha detected");
            
            // Extract numbers and operator (e.g. "2 + 10 =")
            const match = text.match(/(\d+)\s*([\+\-\*])\s*(\d+)/);
            if (match) {
                const n1 = parseInt(match[1]);
                const op = match[2];
                const n2 = parseInt(match[3]);
                let answer = 0;
                
                if (op === '+') answer = n1 + n2;
                else if (op === '-') answer = n1 - n2;
                else if (op === '*') answer = n1 * n2;
                
                logDev(`💡 [Action] Calculated answer: ${n1} ${op} ${n2} = ${answer}`);
                inputEl.value = answer.toString();
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                _isCaptchaSolved = true;
            }
        }
    }

    function isContactPage() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        
        // Direct match in URL or Title
        const isMatch = (arr) => arr.some(k => url.includes(k) || title.includes(k));
        return isMatch(CONTACT_KEYWORDS.high);
    }

    function findBestContactLink() {
        const links = Array.from(document.querySelectorAll('a[href]'));
        let candidates = [];

        for (const link of links) {
            const href = link.href.toLowerCase();
            const text = link.textContent.toLowerCase().trim();
            const title = (link.title || '').toLowerCase();
            const aria = (link.getAttribute('aria-label') || '').toLowerCase();
            const cls = (link.className || '').toString().toLowerCase();
            
            if (href.startsWith('mailto:') || href.startsWith('tel:') || href.includes('javascript:')) continue;
            if (DOMAIN_BLACKLIST.some(d => href.includes(d))) continue;
            if (href.length < window.location.origin.length + 2) continue; // Skip home links

            // [Issue #6 R6.8 P0-3] Contact discovery defaults strictly to same-origin
            try {
                const linkObj = new URL(link.href);
                if (linkObj.origin !== window.location.origin) {
                    continue; // Prevent external link promotion (e.g. panzagear.com -> help.shopify.com)
                }
                const linkPath = linkObj.pathname.toLowerCase();
                if (linkPath.includes('/search') || linkObj.hostname.includes('shopify.com') || linkPath.includes('/help') || linkPath.includes('/support/search')) {
                    continue; // Reject search and generic help portals
                }
            } catch (_) {
                continue;
            }
            
            let score = 0;
            const combined = `${text} ${href} ${title} ${aria} ${cls}`;
            
            const matchScore = (keywords, weight) => {
                if (keywords.some(k => combined.includes(k))) score += weight;
            };

            matchScore(CONTACT_KEYWORDS.high, 100);
            matchScore(CONTACT_KEYWORDS.mid, 30);
            matchScore(CONTACT_KEYWORDS.low, 10);

            // [v1.3.6] Icon class analysis (Envelope, mail, etc.)
            const icons = Array.from(link.querySelectorAll('i, span, svg'));
            const hasContactIcon = icons.some(icon => {
                const cls = (icon.className || '').toString().toLowerCase();
                return ['envelope', 'mail', 'message', 'paper-plane', 'chat'].some(k => cls.includes(k));
            });
            if (hasContactIcon) score += 50;

            if (score > 40) {
                candidates.push({ href: link.href, score });
            }
        }

        if (candidates.length === 0) return null;
        return candidates.sort((a, b) => b.score - a.score || a.href.length - b.href.length)[0].href;
    }

    function queryAllInputs(container = document) {
        // [Supreme-Scan 3.0] Standard + Non-Standard (div-based) inputs
        const standard = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';
        const nonStandard = '[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]';
        return queryAllDeep(`${standard}, ${nonStandard}`, container);
    }

    // ========================================================================
    // FormDiscoveryEngine — Advanced Multi-Root Form Detection (Issue #6 R5 / R6.2)
    // ========================================================================
    class FormDiscoveryEngine {
        constructor(options = {}) {
            this.options = options;
            const EngineR2Class = (_FormDiscoveryEngineR2 && _FormDiscoveryEngineR2.FormDiscoveryEngineR2) ||
                                  (typeof window !== 'undefined' && window.FormDiscoveryEngineR2);
            if (EngineR2Class && EngineR2Class !== FormDiscoveryEngine) {
                this._engineR2 = new EngineR2Class(options);
            }
        }

        // D1. Identify inquiry-body controls
        findInquiryBodyControls(root = document) {
            if (this._engineR2) {
                const rootsHelper = _FormDiscoveryEngineR2.collectAccessibleRoots ? _FormDiscoveryEngineR2.collectAccessibleRoots(root) : { roots: [root] };
                return _FormDiscoveryEngineR2.findInquiryBodyControls(rootsHelper.roots);
            }
            const controls = [];
            if (!root || !root.querySelectorAll) return controls;

            // 1. Textareas (standard high-priority body)
            const textareas = Array.from(root.querySelectorAll('textarea'));
            for (const ta of textareas) {
                controls.push({ element: ta, type: 'textarea', confidence: 1.0 });
            }

            // 2. Contenteditable divs
            const editables = Array.from(root.querySelectorAll('[contenteditable="true"]'));
            for (const ed of editables) {
                controls.push({ element: ed, type: 'contenteditable', confidence: 0.90 });
            }

            // 3. Multiline or semantic text inputs
            const textInputs = Array.from(root.querySelectorAll('input[type="text"], input:not([type]), [role="textbox"]'));
            const messageKeywords = ['message', 'comment', 'question', 'inquiry', 'details', 'description', 'tell us', 'how can we help', '문의', '질문', '메시지', '내용'];
            for (const inp of textInputs) {
                const combined = `${inp.name || ''} ${inp.id || ''} ${inp.placeholder || ''} ${inp.getAttribute('aria-label') || ''}`.toLowerCase();
                if (messageKeywords.some(k => combined.includes(k))) {
                    controls.push({ element: inp, type: 'semantic_multiline', confidence: 0.85 });
                }
            }

            return controls;
        }

        // Framework-Specific Detection Adapters (R6 Section 6.3)
        detectFrameworkAdapter(container) {
            if (!container) return null;
            const sig = `${container.id || ''} ${container.className || ''} ${container.getAttribute('data-form-id') || ''}`.toLowerCase();
            const action = (container.action || container.getAttribute('action') || '').toLowerCase();

            if (sig.includes('hs-') || sig.includes('hubspot') || (container.querySelector && container.querySelector('.hs-form, [data-form-id]'))) return 'HubSpot';
            if (sig.includes('gform') || sig.includes('gravity') || (container.querySelector && container.querySelector('.gform_wrapper'))) return 'GravityForms';
            if (sig.includes('wpcf7') || (container.querySelector && container.querySelector('.wpcf7-form'))) return 'ContactForm7';
            if (sig.includes('wpforms') || (container.querySelector && container.querySelector('.wpforms-form'))) return 'WPForms';
            if (sig.includes('ninja') || sig.includes('nf-') || (container.querySelector && container.querySelector('.nf-form-cont'))) return 'NinjaForms';
            if (sig.includes('wix') || (container.querySelector && container.querySelector('[data-testid*="form"], .wixui-form'))) return 'Wix';
            if (sig.includes('sqs-') || sig.includes('squarespace') || (container.querySelector && container.querySelector('.sqs-block-form'))) return 'Squarespace';
            if (sig.includes('w-form') || sig.includes('webflow') || (container.querySelector && container.querySelector('.w-form'))) return 'Webflow';
            if (action.includes('salesforce') || action.includes('pipedrive') || action.includes('activecampaign')) return 'EmbeddedCRM';
            return null;
        }

        // D2. Group fields by logical container and score container coherence (R6 Section 6.1 & 6.2)
        groupAndScoreContainers(root = document) {
            const bodyControls = this.findInquiryBodyControls(root);
            if (bodyControls.length === 0) return [];

            const scoredContainers = [];
            const evaluatedContainers = new Set();

            for (const bc of bodyControls) {
                const el = bc.element;
                let container = (typeof el.closest === 'function')
                    ? el.closest('form, fieldset, [role="form"], .form-wrapper, [class*="form"], [id*="form"], section, article, div.contact, div.inquiry, main')
                    : null;
                if (!container) container = el.parentElement;
                if (!container || evaluatedContainers.has(container)) continue;
                evaluatedContainers.add(container);

                // Hard eligibility gate check: Must be eligible contact inquiry
                if (_ContactGate && typeof _ContactGate.classifyFormIntent === 'function') {
                    const c = _ContactGate.classifyFormIntent(container);
                    if (!c.eligible) continue;
                }

                // Surrounding controls discovery
                const allInputs = queryAllInputs(container);
                const textareas = container.querySelectorAll ? container.querySelectorAll('textarea') : [];
                const emails = container.querySelectorAll ? container.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]') : [];
                const names = container.querySelectorAll ? container.querySelectorAll('input[name*="name" i], input[id*="name" i]') : [];
                const phones = container.querySelectorAll ? container.querySelectorAll('input[type="tel"], input[name*="phone" i], input[id*="phone" i]') : [];
                const subjects = container.querySelectorAll ? container.querySelectorAll('input[name*="subject" i], input[id*="subject" i]') : [];
                const selects = container.querySelectorAll ? container.querySelectorAll('select, [role="combobox"]') : [];
                const checkboxes = container.querySelectorAll ? container.querySelectorAll('input[type="checkbox"], [role="checkbox"]') : [];
                const submits = container.querySelectorAll ? container.querySelectorAll('button[type="submit"], input[type="submit"], button, [role="button"]') : [];

                // Form Coherence Score (R6 Section 6.2)
                let score = 50;
                if (container.tagName === 'FORM') score += 50;
                if (textareas.length > 0) score += 40;
                if (names.length > 0) score += 20;
                if (emails.length > 0) score += 25;
                if (phones.length > 0) score += 15;
                if (subjects.length > 0) score += 15;
                if (selects.length > 0) score += 10;
                if (checkboxes.length > 0) score += 10;
                if (submits.length > 0) score += 20;

                // Framework-specific adapter score bonus (R6 Section 6.3)
                const adapter = this.detectFrameworkAdapter(container);
                if (adapter) {
                    score += 50;
                }

                scoredContainers.push({
                    container,
                    score,
                    bodyControl: bc,
                    adapter,
                    inputCount: allInputs.length
                });
            }

            return scoredContainers.sort((a, b) => b.score - a.score);
        }

        // D3. Dynamic form reveal (click contact button once, then rescan)
        async dynamicFormReveal(root = document) {
            if (!root || !root.querySelectorAll) return false;
            const triggers = Array.from(root.querySelectorAll('button, a, [role="button"], span.btn'));
            const revealKeywords = ['contact us', 'send us a message', 'ask a question', 'request info', 'chat', '문의하기', '상담신청'];
            for (const btn of triggers) {
                const txt = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase().trim();
                if (revealKeywords.some(k => txt.includes(k))) {
                    try {
                        if (typeof btn.click === 'function') {
                            btn.click();
                            await new Promise(r => setTimeout(r, 400));
                            return true;
                        }
                    } catch (_) {}
                }
            }
            return false;
        }

        // Main form discovery ladder across document, ShadowDOM, iframes, and dynamic reveals
        async discoverForm(root = document) {
            if (this._engineR2) {
                return await this._engineR2.discoverForm(root);
            }
            // 1. Initial scan across document forms and form-like divs
            let containers = this.groupAndScoreContainers(root);
            if (containers.length > 0) {
                return containers[0].container;
            }

            // 2. Open ShadowDOM traversal
            try {
                const allEls = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
                for (const el of allEls) {
                    if (el.shadowRoot) {
                        const shadowContainers = this.groupAndScoreContainers(el.shadowRoot);
                        if (shadowContainers.length > 0) {
                            return shadowContainers[0].container;
                        }
                    }
                }
            } catch (_) {}

            // 3. Same-origin iframe traversal
            try {
                const iframes = root.querySelectorAll ? Array.from(root.querySelectorAll('iframe')) : [];
                for (const ifr of iframes) {
                    try {
                        const ifrDoc = ifr.contentDocument || (ifr.contentWindow && ifr.contentWindow.document);
                        if (ifrDoc) {
                            const ifrContainers = this.groupAndScoreContainers(ifrDoc);
                            if (ifrContainers.length > 0) {
                                return ifrContainers[0].container;
                            }
                        }
                    } catch (_) {}
                }
            } catch (_) {}

            // 4. Lazy scroll & dynamic reveal if needed
            if (typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
                window.scrollBy({ top: 400, behavior: 'smooth' });
                await new Promise(r => setTimeout(r, 300));
                containers = this.groupAndScoreContainers(root);
                if (containers.length > 0) return containers[0].container;
            }

            const revealed = await this.dynamicFormReveal(root);
            if (revealed) {
                containers = this.groupAndScoreContainers(root);
                if (containers.length > 0) return containers[0].container;
            }

            return null;
        }
    }

    async function findOptimalForm() {
        // [Issue #6 R5] Multi-Root FormDiscoveryEngine priority
        try {
            const engine = new FormDiscoveryEngine();
            const discovered = await engine.discoverForm(document);
            if (discovered) return discovered;
        } catch (_) {}
        // [v2.9.3] Micro-Scoping Engine: High sensitivity mapping
        let bestTarget = null;
        let maxScore = -999; 
        
        // Define broad candidate types including content areas
        const candidates = queryAllDeep('form, fieldset, .form-wrapper, .sqs-block-form, #contact-form, [id*="contact-form"], [class*="contact-form"], main, section, article');
        
        // If few candidates, add potential clusters as candidates
        const allPotentialInputs = queryAllInputs();
        if (candidates.length < 5 && allPotentialInputs.length > 2) {
            allPotentialInputs.forEach(inp => {
                const parent = inp.parentElement;
                if (parent && !candidates.includes(parent)) candidates.push(parent);
                const grandparent = parent?.parentElement;
                if (grandparent && !candidates.includes(grandparent)) candidates.push(grandparent);
            });
        }

        const evaluateElement = (root, source = 'Main', pageLabels = []) => {
            const elements = [root];
            if (root.querySelectorAll) {
                elements.push(...Array.from(root.querySelectorAll('form, div, section, article, aside, [class*="form"], [id*="form"]')));
            }
            const threshold = isContactPage() ? 10 : 35;
            let currentBestInRoot = null;
            let currentMaxInRoot = -999;

            elements.forEach((el) => {
                if (!el || !el.tagName) return; // [v17.3.0] Element Safety: Skip document/shadowRoot headers

                // [HARD ELIGIBILITY GATE] Body-field gate comes BEFORE numeric form scoring
                if (_ContactGate && typeof _ContactGate.classifyFormIntent === 'function') {
                    const classification = _ContactGate.classifyFormIntent(el);
                    if (!classification.eligible) {
                        return; // Reject non-inquiry or newsletter form even if numeric score would be high
                    }
                }

                let score = 0;
                const textareas = el.querySelectorAll('textarea');
                const emails = el.querySelectorAll('input[type="email"], input[name*="email"], input[id*="email"]');
                const phones = el.querySelectorAll('input[type="tel"], input[name*="phone"], input[id*="phone"]');
                const names = el.querySelectorAll('input[name*="name"], input[id*="name"], input[placeholder*="name"], input[placeholder*="이름"]');
                const allInputs = queryAllInputs(el);

                // 1. Structural Weighting (Supreme-X 3.0)
                if (textareas.length > 0) score += 70;
                if (emails.length > 0) score += 50;
                if (phones.length > 0) score += 40;
                if (names.length > 0) score += 25;
                if (allInputs.length >= 2 && allInputs.length <= 45) score += 30;
                
                // [v17.4.0] Strict Exclusion: Penalize Body/HTML or Zero-Input containers
                if (['BODY', 'HTML'].includes(el.tagName)) score -= 500;
                if (allInputs.length < 1) score = -999;
                
                // [v17.4.0] Priority Boost for real Forms
                if (el.tagName === 'FORM') score += 200;
                
                const id = (el.id || '').toLowerCase();
                const cls = (el.className || '').toString().toLowerCase();
                const identifier = `${id} ${cls}`;

                // [v17.0.0] Platform & Plugin Fingerprinting...
                const builderBoosts = {
                    wix: identifier.includes('wixui') || identifier.includes('input_comp-') || identifier.includes('textarea_comp-'),
                    shopify: identifier.includes('shopify-') || identifier.includes('contact-form'),
                    squarespace: identifier.includes('sqs-') || identifier.includes('form-wrapper'),
                    wp: identifier.includes('wpcf7') || identifier.includes('gform') || identifier.includes('nf-') || identifier.includes('ninja') || identifier.includes('wpforms') || identifier.includes('gravity')
                };

                if (builderBoosts.wix) score += 250; 
                if (builderBoosts.shopify) score += 150;
                if (builderBoosts.squarespace) score += 300; 
                if (builderBoosts.wp) score += 350; // Boosted for CF7 (v17.0)
                
                // [v17.2.0] Direct CF7/WPForms Fingerprint on IDENTIFIER
                if (identifier.includes('wpcf7-form') || identifier.includes('wpcf7-init') || identifier.includes('wpforms-form')) score += 500;
                
                if (['contact', 'message', 'inquiry', 'form', 'contact-form'].some(k => identifier.includes(k))) score += 100;
                
                // [v17.7.0] Higher Penalty for generic wrapping IDs/Classes
                if (['root', 'container', 'wrapper', 'main', 'sticky', 'header', 'footer'].some(k => identifier.includes(k)) && el.tagName !== 'FORM') score -= 250;

                // [v18.0.0] Modal & Lightbox Focus: Catastrophic boost for active overlays
                if (identifier.includes('sqs-modal-item') || identifier.includes('lightbox-content') || identifier.includes('active-modal')) score += 450;
                
                // [v17.6.0] Search Shield: Catastrophic penalty for search forms
                if (identifier.includes('search')) score -= 850;
                
                // 3. Button / Submit presence...
                const submitBtn = el.querySelector('input[type="submit"], button[type="submit"], button:not([type="button"]), [role="button"], .form-submit-button, .sqs-button-element, .wixui-button, [class*="submit"], [id*="submit"]');
                if (submitBtn) {
                    const btnText = (submitBtn.textContent || submitBtn.value || '').toLowerCase();
                    const btnKeywords = ['send', 'submit', 'message', 'inquiry', '전송', '보내기', '문의', '접수', '送信', '提交', 'enviar', 'envoyer'];
                    if (btnKeywords.some(k => new RegExp(k, 'i').test(btnText))) score += 70;
                }

                // 4. Field Clustering (Supreme Strategy 3.0)
                if (allInputs.length >= 3) score += 50;
                if (allInputs.length >= 6) score += 25;

                // [v2.8.5] Optimized Visual Context: Use pre-scanned labels to avoid O(N^3) bottleneck
                const inputsArray = Array.from(allInputs);
                const contextText = inputsArray.map(inp => {
                    const rect = inp.getBoundingClientRect();
                    let nearestLabelText = "";
                    let minDist = 150; // Max search distance
                    
                    // Use pageLabels cache instead of repeated queryAllDeep calls
                    pageLabels.forEach(lblObj => {
                        const dist = Math.sqrt(Math.pow(rect.top - lblObj.rect.top, 2) + Math.pow(rect.left - lblObj.rect.left, 2));
                        if (dist < minDist) {
                            minDist = dist;
                            nearestLabelText = lblObj.text;
                        }
                    });
                    
                    if (nearestLabelText.length > 2) score += 5; // Bonus for paired inputs
                    return (inp.placeholder || '') + ' ' + (inp.name || '') + ' ' + nearestLabelText;
                }).join(' ').toLowerCase();
                
                if (['@', 'email', 'mail'].some(k => contextText.includes(k))) score += 10;
                if (['message', 'subject', '제목', '내용'].some(k => contextText.includes(k))) score += 10;

                // Supreme Penalty for large page sections
                if (el.tagName !== 'FORM' && allInputs.length < 1) score = -250;
                const parentText = (el.parentElement?.innerText || '').substring(0, 100).toLowerCase();
                if (['search', 'sign in', 'login', '로그인', '검색'].some(k => parentText.includes(k))) score -= 40;

                if (score > currentMaxInRoot) {
                    currentMaxInRoot = score;
                    currentBestInRoot = el;
                }
            });

            if (currentMaxInRoot > maxScore && currentMaxInRoot >= threshold) {
                maxScore = currentMaxInRoot;
                bestTarget = currentBestInRoot;
            }
            return elements.length;
        };

        // 1. Recursive Shadow DOM & Main DOM Scan
        logDev("🕵️ [UltraFinder] Scanning complex structures (ShadowDOM & Multi-Root)...", "info");
        const allRoots = [document];
        const collectRoots = (node) => {
            try {
                if (node.shadowRoot) {
                    allRoots.push(node.shadowRoot);
                    Array.from(node.shadowRoot.children || []).forEach(collectRoots);
                }
                Array.from(node.children || []).forEach(collectRoots);
            } catch(e) {} // [v2.8.5] Resilience: Don't crash on cross-origin iframe boundaries
        };
        try {
            Array.from(document.children || []).forEach(collectRoots);
        } catch(e) {}

        // [v2.8.5] Optimized: Pre-scan all potential labels once to cache their geometry
        logDev("🕵️ [Supreme-Scan 5.0] Pre-scanning labels and context...", "info");
        const rawLabels = queryAllDeep('label, p, span, div.label');
        const pageLabels = rawLabels.map(lbl => ({
            text: lbl.textContent.trim(),
            rect: lbl.getBoundingClientRect()
        })).filter(l => l.text.length > 2); // Filter out noise

        let totalElementsScanned = 0;
        allRoots.forEach((root, i) => {
            totalElementsScanned += evaluateElement(root, `Root#${i}`, pageLabels);
        });

        // 2. Scan iframes (Cross-origin safe check)
        const iframes = queryAllDeep('iframe');
        for (const frame of iframes) {
            try {
                if (frame.contentDocument) {
                    totalElementsScanned += evaluateElement(frame.contentDocument, 'Iframe', pageLabels);
                }
            } catch (e) {}
        }

        logDev(`🔍 [Scan] Scanned ${totalElementsScanned} elements. Highest score: ${maxScore}`, "info");

        if (bestTarget) {
            const tagName = (bestTarget.tagName || 'UNKNOWN').toLowerCase();
            const id = bestTarget.id || 'N/A';
            logDev(`🎯 [Scan] Optimal target found: Score(${maxScore}) Tag(<${tagName}>) ID(#${id})`, "success");
            return bestTarget;
        } else {
            logDev(`⚠️ [Scan] No valid forms reached threshold score (Target Score: ${isContactPage() ? 10 : 35})`, "warning");
        }
        return null;
    }

    async function fillFormIntelligent(form, tpl, speed) {
        logDev("🛠️ [Action][HyperEngine v4.0] 초강력 폼 자동 등록기 시작...");
        let filledFields = 0;

        // ============================================================
        // [HyperEngine v4.0] React/Vue/Angular 네이티브 값 세터 유틸
        // ============================================================
        function setNativeValue(el, val) {
            try {
                const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                            : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                            : HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
                if (nativeSetter && nativeSetter.set) {
                    nativeSetter.set.call(el, val);
                } else {
                    el.value = val;
                }
            } catch (e) {
                el.value = val;
            }
        }

        // ============================================================
        // [v4.0] 전체 이벤트 시퀀스 디스패처 - 사람처럼 행동
        // ============================================================
        // ============================================================
        // [v4.12.26] 초강력 스텔스 마우스 궤적 Bezier Curve 시뮬레이터 및 디스패처
        // ============================================================
        async function dispatchHumanEvents(el, eventNames) {
            // Track last mouse location globally to simulate cohesive drag/hover paths
            if (typeof window.__xpider_last_mouse_x === 'undefined') {
                window.__xpider_last_mouse_x = Math.random() * window.innerWidth;
                window.__xpider_last_mouse_y = Math.random() * window.innerHeight;
            }

            const rect = el.getBoundingClientRect();
            const randomOffsetX = (Math.random() - 0.5) * (rect.width * 0.3);
            const randomOffsetY = (Math.random() - 0.5) * (rect.height * 0.3);
            const targetX = rect.left + rect.width / 2 + randomOffsetX;
            const targetY = rect.top + rect.height / 2 + randomOffsetY;

            // 만약 mousemove 나 click 계열이 포함되어 있다면 마우스 실제 움직임(Bezier Curve)을 시뮬레이션
            const hasMovement = eventNames.some(name => name.includes('move') || name.includes('over') || name === 'click');
            if (hasMovement) {
                const startX = window.__xpider_last_mouse_x;
                const startY = window.__xpider_last_mouse_y;

                // Bezier Curve 중간 좌표 계산
                const steps = 6 + Math.floor(Math.random() * 5); // 6 ~ 10 steps
                const cp1x = startX + (targetX - startX) * 0.25 + (Math.random() * 50 - 25);
                const cp1y = startY + (targetY - startY) * 0.25 + (Math.random() * 50 - 25);
                const cp2x = startX + (targetX - startX) * 0.75 + (Math.random() * 50 - 25);
                const cp2y = startY + (targetY - startY) * 0.75 + (Math.random() * 50 - 25);

                for(let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const x = Math.round((1-t)**3 * startX + 3*(1-t)**2*t * cp1x + 3*(1-t)*t**2 * cp2x + t**3 * targetX);
                    const y = Math.round((1-t)**3 * startY + 3*(1-t)**2*t * cp1y + 3*(1-t)*t**2 * cp2y + t**3 * targetY);

                    try {
                        el.dispatchEvent(new MouseEvent('mousemove', {
                            bubbles: true, cancelable: true, view: window,
                            clientX: x, clientY: y, screenX: x, screenY: y
                        }));
                        el.dispatchEvent(new PointerEvent('pointermove', {
                            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
                            clientX: x, clientY: y, screenX: x, screenY: y
                        }));
                    } catch(e) {}
                    await new Promise(r => setTimeout(r, 10 + Math.random()*15)); // 자연스러운 이동 딜레이
                }

                window.__xpider_last_mouse_x = targetX;
                window.__xpider_last_mouse_y = targetY;
            }

            for (const evtName of eventNames) {
                try {
                    if (evtName.startsWith('pointer')) {
                        el.dispatchEvent(new PointerEvent(evtName, { 
                            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
                            clientX: targetX, clientY: targetY
                        }));
                    } else if (evtName.startsWith('mouse') || evtName === 'click') {
                        el.dispatchEvent(new MouseEvent(evtName, {
                            bubbles: true, cancelable: true, view: window,
                            clientX: targetX, clientY: targetY
                        }));
                    } else if (evtName.startsWith('key')) {
                        el.dispatchEvent(new KeyboardEvent(evtName, { bubbles: true, cancelable: true }));
                    } else if (evtName.startsWith('focus') || evtName === 'blur') {
                        el.dispatchEvent(new FocusEvent(evtName, { bubbles: true }));
                    } else {
                        el.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
                    }
                } catch(e) {}
                // 이벤트간 미세 딜레이
                await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
            }
        }

        const FULL_CLICK_SEQUENCE = [
            'pointerover', 'pointerenter', 'mouseover', 'mouseenter',
            'pointermove', 'mousemove',
            'pointerdown', 'mousedown', 'focus',
            'pointerup', 'mouseup', 'click'
        ];

        // ============================================================
        // [v4.0] SELECT 드롭다운 강제 선택 - 네이티브 <select>
        // ============================================================
        async function applySelect(el, preferredKeywords = []) {
            if (!el || el.tagName !== 'SELECT') return false;
            if (_SelectResolverR2) {
                const resolver = new _SelectResolverR2({ logger: logDev });
                const res = await resolver.resolveNativeSelect(el);
                if (res && res.selected) filledFields++;
                return res && res.selected;
            }
            if (el.options.length <= 1) return false;
            // 이미 유효한 값이 선택된 경우 스킵
            if (el.selectedIndex > 0 && el.options[el.selectedIndex].value) {
                logDev(`   - [Select-Skip] 이미 선택됨: "${el.options[el.selectedIndex].text}"`);
                return false;
            }

            const contactKeywords = [...(preferredKeywords || []),
                'inquiry', 'general', 'other', 'contact', 'question', 'sales', 'business',
                '문의', '일반', '기타', '고객', '상담', 'info', 'support', 'partnership',
                'お問い合わせ', '質問', '提案', '咨询', '合作',
                'consulta', 'información', 'anfrage', 'demande'
            ];

            let targetIdx = -1;

            // 1순위: 키워드 매칭
            for (let i = 1; i < el.options.length; i++) {
                if (el.options[i].disabled) continue;
                const optText = (el.options[i].text || '').toLowerCase();
                const optVal = (el.options[i].value || '').toLowerCase();
                if (contactKeywords.some(k => optText.includes(k) || optVal.includes(k))) {
                    targetIdx = i;
                    break;
                }
            }

            // 2순위: 유효한 첫 번째 옵션
            if (targetIdx < 0) {
                for (let i = 1; i < el.options.length; i++) {
                    if (!el.options[i].disabled && el.options[i].value && el.options[i].value !== '') {
                        targetIdx = i;
                        break;
                    }
                }
            }
            if (targetIdx < 0 && el.options.length > 1) targetIdx = 1;
            if (targetIdx < 0) return false;

            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, Math.floor(speed.field * 0.4)));

            el.focus();
            dispatchHumanEvents(el, ['mousedown']);
            await new Promise(r => setTimeout(r, 60));

            // 네이티브 setter를 사용해 React 등의 controlled component 우회
            const nativeSelectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
            if (nativeSelectSetter && nativeSelectSetter.set) {
                nativeSelectSetter.set.call(el, el.options[targetIdx].value);
            }
            el.selectedIndex = targetIdx;

            dispatchHumanEvents(el, ['input', 'change', 'mouseup', 'click']);
            el.blur();

            logDev(`   - [Select✅] 드롭다운 선택: "${el.options[targetIdx].text}"`);
            filledFields++;
            return true;
        }

        // ============================================================
        // [v4.0] 커스텀 드롭다운 처리 (React Select, MUI, Ant Design 등)
        // div/span 기반 커스텀 셀렉트를 실제 마우스 클릭으로 조작
        // ============================================================
        async function applyCustomDropdown(container) {
            if (!container) return false;
            if (_SelectResolverR2) {
                const resolver = new _SelectResolverR2({ logger: logDev });
                const res = await resolver.resolveAllInForm(container);
                if (res && res.handledCount > 0) {
                    filledFields += res.handledCount;
                    return true;
                }
            }
            
            const CUSTOM_SELECTORS = [
                // React Select
                '[class*="react-select"]', '[class*="css-"][class*="control"]',
                // MUI / Material UI
                '[class*="MuiSelect"]', '[class*="MuiInputBase"]', '.MuiSelect-select',
                // Ant Design
                '.ant-select', '.ant-select-selector',
                // Generic custom selects
                '[class*="custom-select"]', '[class*="dropdown"]', '[class*="select-wrapper"]',
                '[role="listbox"]', '[role="combobox"]',
                // Wix
                '[data-testid*="dropdown"]', '[class*="dropdown"]'
            ];

            const customSelects = [];
            CUSTOM_SELECTORS.forEach(sel => {
                try {
                    const found = container.querySelectorAll(sel);
                    found.forEach(el => {
                        if (elementIsVisible(el) && !customSelects.includes(el)) {
                            customSelects.push(el);
                        }
                    });
                } catch(e) {}
            });

            let handled = 0;
            for (const csEl of customSelects) {
                try {
                    // 이미 값이 선택되어 있는지 체크
                    const currentText = (csEl.textContent || '').toLowerCase().trim();
                    const placeholders = ['select', 'choose', '선택', '選択', '请选择', '--', '...'];
                    const isPlaceholder = placeholders.some(p => currentText.startsWith(p)) || currentText.length < 2;
                    if (!isPlaceholder) continue; // 이미 선택됨

                    csEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 100));

                    // 드롭다운 열기 (트리거 클릭)
                    const trigger = csEl.querySelector('[class*="indicator"], [class*="arrow"], svg, [class*="trigger"]') || csEl;
                    dispatchHumanEvents(trigger, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 400));

                    // 옵션 리스트 탐색 (전역 검색 - 포탈 렌더링 대응)
                    const optionSelectors = [
                        '[class*="option"]', '[role="option"]',
                        '[class*="menu-item"]', '[class*="MenuItem"]',
                        'li[class*="item"]', '.ant-select-item',
                        '[data-value]', '[class*="listbox"] > *'
                    ];

                    let options = [];
                    // 먼저 드롭다운 컨테이너 내부 탐색
                    optionSelectors.forEach(sel => {
                        try {
                            const found = csEl.querySelectorAll(sel);
                            found.forEach(o => { if (elementIsVisible(o) && !options.includes(o)) options.push(o); });
                        } catch(e) {}
                    });

                    // 포탈 렌더링 대응: body 직하의 최근 열린 메뉴 탐색
                    if (options.length === 0) {
                        const portalMenus = document.querySelectorAll(
                            '[class*="menu"], [class*="dropdown-list"], [class*="listbox"], [role="listbox"], .ant-select-dropdown'
                        );
                        for (const menu of portalMenus) {
                            if (!elementIsVisible(menu)) continue;
                            optionSelectors.forEach(sel => {
                                try {
                                    const found = menu.querySelectorAll(sel);
                                    found.forEach(o => { if (elementIsVisible(o) && !options.includes(o)) options.push(o); });
                                } catch(e) {}
                            });
                        }
                    }

                    if (options.length === 0) {
                        // 드롭다운 닫기 시도
                        dispatchHumanEvents(trigger, ['click']);
                        continue;
                    }

                    // 키워드 매칭으로 최적 옵션 선택
                    const preferredKeywords = ['inquiry', 'general', 'other', 'contact', '문의', '일반', '기타', '고객', 'sales', 'business', 'info'];
                    let targetOption = null;

                    for (const opt of options) {
                        const optText = (opt.textContent || '').toLowerCase().trim();
                        if (preferredKeywords.some(k => optText.includes(k))) {
                            targetOption = opt;
                            break;
                        }
                    }

                    // 키워드 매칭 실패 시 첫 번째 유효 옵션
                    if (!targetOption) {
                        targetOption = options.find(opt => {
                            const text = (opt.textContent || '').trim();
                            return text.length > 0 && !placeholders.some(p => text.toLowerCase().startsWith(p));
                        }) || options[0];
                    }

                    if (targetOption) {
                        dispatchHumanEvents(targetOption, FULL_CLICK_SEQUENCE);
                        await new Promise(r => setTimeout(r, 200));
                        logDev(`   - [CustomSelect✅] 커스텀 드롭다운 선택: "${(targetOption.textContent || '').trim().substring(0, 30)}"`);
                        filledFields++;
                        handled++;
                    }
                } catch (e) {
                    logDev(`   - [CustomSelect⚠️] 처리 실패: ${e.message}`, 'warning');
                }
            }
            return handled > 0;
        }

        // ============================================================
        // [v4.0] 라디오 버튼 강제 선택 - label/wrapper 클릭 포함
        // ============================================================
        async function applyRadio(radioEl) {
            if (!radioEl) return;
            // 이미 체크된 경우 스킵
            if (radioEl.checked) return;

            radioEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 50));

            // 1차: 네이티브 라디오 직접 클릭
            radioEl.focus();
            dispatchHumanEvents(radioEl, FULL_CLICK_SEQUENCE);

            // 네이티브 checked setter
            const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            if (nativeCheckedSetter && nativeCheckedSetter.set) {
                nativeCheckedSetter.set.call(radioEl, true);
            } else {
                radioEl.checked = true;
            }
            dispatchHumanEvents(radioEl, ['input', 'change']);

            // 2차: 직접 클릭으로 안 됐으면 label 클릭 시도
            if (!radioEl.checked) {
                const label = radioEl.id
                    ? document.querySelector(`label[for="${radioEl.id}"]`)
                    : radioEl.closest('label');
                if (label) {
                    dispatchHumanEvents(label, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            // 3차: 부모 wrapper 클릭 (Material UI 등)
            if (!radioEl.checked) {
                const wrapper = radioEl.closest('[class*="radio"], [class*="Radio"], [role="radio"]');
                if (wrapper && wrapper !== radioEl) {
                    dispatchHumanEvents(wrapper, FULL_CLICK_SEQUENCE);
                }
            }

            radioEl.blur();
            logDev(`   - [Radio✅] 라디오 클릭: name="${radioEl.name}" value="${radioEl.value}"`);
        }

        // ============================================================
        // [v4.0] 체크박스 강제 체크 - label/wrapper 클릭 포함
        // ============================================================
        async function applyCheckbox(cbEl) {
            if (!cbEl) return;
            if (_CheckboxResolverR2) {
                const resolver = new _CheckboxResolverR2({ logger: logDev });
                const res = await resolver.resolveCheckbox(cbEl);
                return res && res.actual;
            }
            if (cbEl.checked) return;

            cbEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 40));

            // 1차: 네이티브 체크박스 직접 클릭
            cbEl.focus();
            dispatchHumanEvents(cbEl, FULL_CLICK_SEQUENCE);

            const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            if (nativeCheckedSetter && nativeCheckedSetter.set) {
                nativeCheckedSetter.set.call(cbEl, true);
            } else {
                cbEl.checked = true;
            }
            dispatchHumanEvents(cbEl, ['input', 'change']);

            // 2차: label 클릭
            if (!cbEl.checked) {
                const label = cbEl.id
                    ? document.querySelector(`label[for="${cbEl.id}"]`)
                    : cbEl.closest('label');
                if (label) {
                    dispatchHumanEvents(label, FULL_CLICK_SEQUENCE);
                    await new Promise(r => setTimeout(r, 40));
                }
            }

            // 3차: wrapper 클릭 (MUI Checkbox 등)
            if (!cbEl.checked) {
                const wrapper = cbEl.closest('[class*="checkbox"], [class*="Checkbox"], [role="checkbox"]');
                if (wrapper && wrapper !== cbEl) {
                    dispatchHumanEvents(wrapper, FULL_CLICK_SEQUENCE);
                }
            }

            cbEl.blur();
            logDev(`   - [Checkbox✅] 체크박스 체크: "${cbEl.name || cbEl.id || ''}"`);
        }

        // ============================================================
        // [v4.0] 커스텀 체크박스/라디오 (div/span 기반) 클릭
        // ============================================================
        async function applyCustomCheckableElements(container) {
            const CUSTOM_CHECK_SELECTORS = [
                '[role="checkbox"]:not([aria-checked="true"])',
                '[role="radio"]:not([aria-checked="true"])',
                '[role="switch"]:not([aria-checked="true"])',
                '[class*="custom-checkbox"]:not(.checked)',
                '[class*="custom-radio"]:not(.checked)'
            ];

            let handled = 0;
            for (const sel of CUSTOM_CHECK_SELECTORS) {
                try {
                    const elements = container.querySelectorAll(sel);
                    for (const el of elements) {
                        if (!elementIsVisible(el)) continue;

                        // 약관/동의 관련 체크박스만 자동 체크
                        const context = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
                        const parentText = (el.parentElement?.textContent || '').toLowerCase().substring(0, 200);
                        const combined = context + ' ' + parentText;

                        const isTerms = ['agree', 'terms', 'policy', 'consent', 'accept', 'privacy',
                            '동의', '약관', '규정', '개인정보', '수집', '이용약관', 'gdpr'
                        ].some(k => combined.includes(k));

                        // role="radio" 는 그룹 내 첫 번째를 선택
                        const isRadio = el.getAttribute('role') === 'radio';

                        if (isTerms || isRadio) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            await new Promise(r => setTimeout(r, 60));
                            dispatchHumanEvents(el, FULL_CLICK_SEQUENCE);

                            // aria-checked 업데이트 시도
                            if (el.getAttribute('aria-checked') !== 'true') {
                                el.setAttribute('aria-checked', 'true');
                            }

                            await new Promise(r => setTimeout(r, 100));
                            logDev(`   - [CustomCheck✅] ${isRadio ? '라디오' : '체크박스'} 클릭: "${context.substring(0, 30)}"`);
                            filledFields++;
                            handled++;

                            // role="radio"는 그룹 당 하나만
                            if (isRadio) break;
                        }
                    }
                } catch(e) {}
            }
            return handled;
        }

        // ============================================================
        // [v4.12.26] 인간 키보드 입력 인터랙션 모사 엔진 (Stealth Human Keyboard Simulator)
        // ============================================================
        async function typeHumanlike(el, val) {
            if (!el || !val) return;
            
            // 1. 엘리먼트 가시성 확보 및 부드러운 스크롤 & 초점 잡기
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 450 + Math.random()*150)); // 시선 이동 딜레이
            } catch(e) {}
            
            // 2. 포커스 및 마우스 클릭 이벤트 디스패치 (Bezier 마우스 궤적 자동 기동)
            el.focus();
            await dispatchHumanEvents(el, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click']);
            await new Promise(r => setTimeout(r, 100 + Math.random()*100));
            
            // 3. 한 글자씩 순차적 타이핑 (오타 및 백스페이스 인간미 포함)
            let accumulatedValue = '';
            for (let i = 0; i < val.length; i++) {
                const char = val[i];
                const key = char;
                const keyCode = char.charCodeAt(0);
                
                // 3a. 간헐적 오타 발생 및 지우기 시뮬레이션 (1.2% 확률)
                if (Math.random() < 0.012 && i > 0 && i < val.length - 1) {
                    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
                    const typo = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
                    
                    // 오타 삽입
                    accumulatedValue += typo;
                    if (el.contentEditable === 'true') {
                        el.textContent = accumulatedValue;
                    } else {
                        setNativeValue(el, accumulatedValue);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    await new Promise(r => setTimeout(r, 100 + Math.random()*120));
                    
                    // 지우기 (Backspace)
                    accumulatedValue = accumulatedValue.slice(0, -1);
                    if (el.contentEditable === 'true') {
                        el.textContent = accumulatedValue;
                    } else {
                        setNativeValue(el, accumulatedValue);
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true, inputType: 'deleteContentBackward' }));
                    await new Promise(r => setTimeout(r, 120 + Math.random()*80));
                }

                // 3b. keydown 이벤트 발생 (인간미 있는 keydown 설정)
                el.dispatchEvent(new KeyboardEvent('keydown', {
                    key: key,
                    code: `Key${key.toUpperCase()}`,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3c. keypress 이벤트 발생
                el.dispatchEvent(new KeyboardEvent('keypress', {
                    key: key,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3d. 엘리먼트 속성에 따라 실제 값을 순차 대입
                if (el.contentEditable === 'true') {
                    accumulatedValue += char;
                    el.textContent = accumulatedValue;
                } else {
                    accumulatedValue += char;
                    setNativeValue(el, accumulatedValue);
                }
                
                // 3e. input 이벤트 발생
                el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                
                // 3f. keyup 이벤트 발생
                el.dispatchEvent(new KeyboardEvent('keyup', {
                    key: key,
                    keyCode: keyCode,
                    which: keyCode,
                    bubbles: true,
                    cancelable: true
                }));
                
                // 3g. 글자 간 불규칙한 인간 타이핑 딜레이 모사 (문장 부호는 느리게, 장문은 스마트 가속)
                const isPunctuation = /[.,!?;:]/.test(char);
                const isLongText = val.length > 40;
                const randomDelay = isLongText
                    ? (isPunctuation ? 25 : (8 + Math.random() * 10))
                    : (isPunctuation ? (140 + Math.random() * 160) : (35 + Math.random() * 45));
                await new Promise(r => setTimeout(r, randomDelay));
            }
            
            // 4. 최종 값 2중 안전 장치 (Dual-Layer Sync Safeguard)
            if (el.contentEditable === 'true') {
                el.textContent = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                setNativeValue(el, val);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // 5. 블러 처리 및 포커스 아웃
            el.blur();
            await dispatchHumanEvents(el, ['blur', 'focusout']);
            await new Promise(r => setTimeout(r, 40));
        }

        // ============================================================
        // [v4.1] 텍스트/이메일/전화 필드 값 입력 (초지능 인간 타이핑 연계)
        // ============================================================
        const applyVal = async (el, val, matchedAttr) => {
            if (!val || !el) return;
            if (el.tagName === 'SELECT') {
                await applySelect(el);
                return;
            }

            // 이미 값이 있으면 스킵
            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            if (currentVal.trim() !== '') return;

            await new Promise(r => setTimeout(r, speed.field));

            // 초지능 인간 타이핑 시뮬레이터 실행!
            await typeHumanlike(el, val);

            // [Issue #6 R6.5 Section 10] Privacy Logging: Sanitize raw PII values
            let category = 'text';
            const attrStr = `${matchedAttr || ''} ${el.name || ''} ${el.id || ''} ${el.type || ''}`.toLowerCase();
            if (/email|mail/i.test(attrStr)) category = 'email';
            else if (/phone|tel|mobile|cell/i.test(attrStr)) category = 'phone';
            else if (/first.?name|given.?name/i.test(attrStr)) category = 'name';
            else if (/last.?name|family.?name|surname/i.test(attrStr)) category = 'name';
            else if (/name|성함|이름/i.test(attrStr)) category = 'name';
            else if (/message|body|comment|inquiry|content/i.test(attrStr) || el.tagName === 'TEXTAREA') category = 'message';
            else if (/subject|title/i.test(attrStr)) category = 'subject';

            if (category === 'email') {
                logDev(`   - [Input✅] category=email filled=true length=${(val || '').length}`);
            } else if (category === 'phone') {
                logDev(`   - [Input✅] category=phone filled=true`);
            } else if (category === 'name') {
                logDev(`   - [Input✅] category=name filled=true`);
            } else {
                logDev(`   - [Input✅] category=${category} filled=true length=${(val || '').length}`);
            }
            filledFields++;
        };

        // 패턴 매칭 함수
        const matchField = async (patterns, val, el) => {
            if (!val) return false;
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
            const isGenericId = !id || id === 'null-field' || /^\d+$/.test(id) || id.includes('input');
            const combined = isGenericId
                ? `${label} ${placeholder} ${cls} ${ariaLabel} ${autocomplete}`
                : `${label} ${placeholder} ${name} ${id} ${cls} ${ariaLabel} ${autocomplete}`;

            if (isGenericId && label && patterns.some(p => p.test(label))) {
                await applyVal(el, val, patterns.find(p => p.test(label)));
                return true;
            }
            if (patterns.some(p => p.test(combined))) {
                await applyVal(el, val, patterns.find(p => p.test(combined)));
                return true;
            }
            return false;
        };

        // [v4.12.27] Smart Name Splitter
        function splitName(fullName) {
            if (!fullName) return { first: 'John', last: 'Doe' };
            const trimmed = fullName.trim();
            const hangulRegex = /^[가-힣]+$/;
            if (hangulRegex.test(trimmed)) {
                if (trimmed.length === 3) {
                    return { last: trimmed.charAt(0), first: trimmed.substring(1) };
                } else if (trimmed.length === 2) {
                    return { last: trimmed.charAt(0), first: trimmed.charAt(1) };
                } else if (trimmed.length === 4) {
                    const doubleSurnames = ['황보', '독고', '사공', '남궁', '제갈', '서문'];
                    const prefix2 = trimmed.substring(0, 2);
                    if (doubleSurnames.includes(prefix2)) {
                        return { last: prefix2, first: trimmed.substring(2) };
                    }
                    return { last: trimmed.charAt(0), first: trimmed.substring(1) };
                }
            }
            const parts = trimmed.split(/\s+/);
            if (parts.length > 1) {
                const last = parts.pop();
                const first = parts.join(' ');
                return { first, last };
            }
            return { first: trimmed, last: trimmed };
        }

        // [v4.12.27] Smart Value Generator for BruteForce fallback
        function generateSmartRandomValue(el) {
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const name = (el.name || '').toLowerCase();
            const id = (el.id || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
            const c = `${label} ${placeholder} ${name} ${id} ${cls} ${ariaLabel} ${autocomplete}`.toLowerCase();
            
            const type = (el.type || 'text').toLowerCase();
            
            // 1. 숫자 전용 필드 판정
            const isNumeric = type === 'number' || type === 'tel' || 
                              el.getAttribute('inputmode') === 'numeric' ||
                              /zip|postal|phone|tel|fax|mobile|number|qty|quantity|code|digit/i.test(c);
            
            if (isNumeric) {
                if (/phone|tel|mobile|fax|전화|연락처|휴대폰/i.test(c)) {
                    if (tpl.phone && tpl.phone.trim() !== '') return tpl.phone;
                    const rand8 = Math.floor(10000000 + Math.random() * 90000000);
                    return '010-' + String(rand8).substring(0, 4) + '-' + String(rand8).substring(4);
                }
                if (/zip|postal|우편/i.test(c)) {
                    const rand5 = Math.floor(10000 + Math.random() * 90000);
                    return String(rand5);
                }
                const rand2 = Math.floor(1 + Math.random() * 98);
                return String(rand2);
            }
            
            // 2. 이메일 필드 판정
            const isEmail = type === 'email' || /email|mail/i.test(c);
            if (isEmail) {
                if (tpl.email && tpl.email.trim() !== '') return tpl.email;
                const randChars = Math.random().toString(36).substring(2, 8);
                return randChars + '@gmail.com';
            }
            
            // 3. 텍스트 / 일반 글자 필드
            if (/company|회사|org/i.test(c)) {
                return (tpl.name || getRandomTemplateVal()) + ' Inc.';
            }
            if (/address|주소/i.test(c)) {
                return '123 Business Rd, New York, NY';
            }
            if (/subject|제목|title/i.test(c)) {
                return tpl.subject || '';
            }
            if (el.tagName === 'TEXTAREA' || /message|content|body|내용/i.test(c)) {
                return tpl.message || '';
            }
            
            // 성/이름 필드 스마트 스플리터 적용
            if (/last.?name|family.?name|surname|성(?!명)/i.test(c)) {
                const s = splitName(tpl.name);
                return tpl.lastName || s.last || '';
            }
            if (/first.?name|given.?name/i.test(c)) {
                const s = splitName(tpl.name);
                return tpl.firstName || s.first || '';
            }
            if (/name|이름|성함|성명/i.test(c)) {
                return tpl.name || '';
            }
            
            return getRandomTemplateVal();
        }

        // 템플릿 유효값 수집
        const templateVals = [
            tpl.firstName, tpl.lastName, tpl.name, tpl.email,
            tpl.phone, tpl.subject, tpl.message
        ].filter(v => typeof v === 'string' && v.trim() !== '');

        const getRandomTemplateVal = () => {
            if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
            return "Inquiry";
        };

        // ── 확장된 honeypot 판정 (v4.0: 오탐 방지 강화) ──
        function isHoneypotV4(el) {
            // 1. 명시적 허니팟 표지 검사
            const idOrName = ((el.id || '') + ' ' + (el.name || '')).toLowerCase();
            const honeypotKeywords = ['honeypot', 'website_url', 'trap', 'bottom_field', 'h-captcha-response', 'g-recaptcha-response'];
            if (honeypotKeywords.some(k => idOrName.includes(k))) return true;

            // 2. 물리적 크기가 0x0인 극단적인 경우에만 허니팟으로 강력 판정
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return true;
            }

            // 3. input/textarea/select 등 네이티브 포커스 가능한 태그이며 물리적 크기가 있는 경우 100% 정상 필드로 판정
            const tagName = el.tagName.toLowerCase();
            if ((tagName === 'input' || tagName === 'textarea' || tagName === 'select') && rect.width > 0 && rect.height > 0) {
                return false;
            }

            // 4. 시각적 비가시 판정 (안전하게 display:none, visibility:hidden, opacity:0 인 경우만 기본 판정)
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return true;
            }

            return false;
        }

        // ── 1단계: 모든 입력란 수집 (form 내부 + 확장 탐색) ──
        logDev("🎯 [HyperEngine v4.0] Phase 0 - 입력 필드 전수 수집...");
        let inputs = Array.from(queryAllInputs(form));

        // form 태그 외부에 있는 관련 필드 추가 탐색
        if (form.tagName !== 'BODY' && form.tagName !== 'HTML') {
            // form 근처의 형제/부모 요소에서 추가 필드 탐색
            const formParent = form.parentElement;
            if (formParent) {
                const nearbyInputs = Array.from(queryAllInputs(formParent));
                nearbyInputs.forEach(inp => {
                    if (!inputs.includes(inp)) inputs.push(inp);
                });
            }
        }

        // 라디오/체크박스 명시적 수집 (queryAllInputs가 누락할 수 있으므로)
        const allRadios = Array.from(queryAllDeep('input[type="radio"]', form));
        const allCheckboxes = Array.from(queryAllDeep('input[type="checkbox"]', form));
        allRadios.forEach(r => { if (!inputs.includes(r)) inputs.push(r); });
        allCheckboxes.forEach(c => { if (!inputs.includes(c)) inputs.push(c); });

        logDev(`   [v4.0] 총 ${inputs.length}개 입력 필드 발견 (radio: ${allRadios.length}, checkbox: ${allCheckboxes.length})`);

        // ── 2단계: 드롭다운(Native & Custom) SelectResolverR2 전수 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 1 & 2 - 드롭다운 SelectResolverR2 전수 처리...");
        let selectStability = { stable: true };
        if (_SelectResolverR2) {
            try {
                const selectResolver = new _SelectResolverR2({ logger: logDev });
                const selRes = await selectResolver.resolveAllInForm(form);
                if (selRes && selRes.handledCount > 0) filledFields += selRes.handledCount;
                if (selRes && !selRes.stable) {
                    selectStability.stable = false;
                    selectStability.reasonCode = 'REQUIRED_SELECT_UNSTABLE';
                }
            } catch (selErr) {
                logDev(`⚠️ [SelectResolverR2] Error: ${selErr.message}`, 'warning');
            }
        } else {
            for (const el of inputs) {
                if (isHoneypotV4(el)) continue;
                if (el.tagName === 'SELECT') await applySelect(el);
            }
            await applyCustomDropdown(form);
        }

        // ── 4단계: 체크박스 전수 처리 (CheckboxResolverR2: 10-카테고리, Boston BJJ 그룹, 약관/동의 필수 체크) ──
        logDev("🎯 [HyperEngine v4.0] Phase 3 - 체크박스 CheckboxResolverR2 전수 처리...");
        let checkboxStability = { stable: true };
        if (_CheckboxResolverR2) {
            try {
                const checkboxResolver = new _CheckboxResolverR2({ logger: logDev });
                const cbRes = await checkboxResolver.resolveAllInForm(form);
                if (cbRes && cbRes.handledCount > 0) filledFields += cbRes.handledCount;
                if (cbRes && !cbRes.stable) {
                    checkboxStability.stable = false;
                    checkboxStability.reasonCode = 'REQUIRED_CHECKBOX_UNSTABLE';
                }
            } catch (cbErr) {
                logDev(`⚠️ [CheckboxResolverR2] Error: ${cbErr.message}`, 'warning');
            }
        } else {
            for (const el of inputs) {
                if (isHoneypotV4(el)) continue;
                if (el.type === 'checkbox') {
                    const labelText = getLabelFor(el).toLowerCase();
                    const containerText = (el.closest('div, label, span, p')?.textContent || '').toLowerCase().substring(0, 300);
                    const combined = labelText + ' ' + containerText;
                    const termsKeywords = [
                        'agree', 'terms', 'policy', 'consent', 'accept', 'privacy',
                        '동의', '규정', '약관', '개인정보', '수집', '이용',
                        'gdpr', 'einwilligung', 'datenschutz', 'consentement', 'aceptar'
                    ];
                    if (termsKeywords.some(k => combined.includes(k))) {
                        await applyCheckbox(el);
                        filledFields++;
                    }
                }
            }
        }

        // ── 4.5단계: 휴먼 검증 산수 퀴즈 (Math Captcha Equation Quiz) 해결 ──
        logDev("🎯 [HyperEngine v4.0] Phase 3.5 - 휴먼 테스트 수식/방정식 퀴즈 검출 및 자동 해결...");
        if (_MathCaptchaSolver && typeof _MathCaptchaSolver.solveField === 'function') {
            for (const el of inputs) {
                if (isHoneypotV4(el)) continue;
                if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') continue;
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') continue;
                if (el.tagName === 'TEXTAREA') continue;

                const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
                if (currentVal.trim() !== '') continue;

                const mathAnswer = _MathCaptchaSolver.solveField(el, getLabelFor);
                if (mathAnswer !== null) {
                    logDev(`🧮 [MathCaptcha] 휴먼 테스트 수식 감지! 자동 계산 결과="${mathAnswer}" 입력 시작...`, 'info');
                    await applyVal(el, String(mathAnswer), 'MathCaptcha-Solved');
                }
            }
        }

        // ── 5단계: 텍스트 필드 패턴 매칭 ──
        logDev("🎯 [HyperEngine v4.0] Phase 4 - 텍스트 필드 패턴 매칭...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') continue;
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') continue;

            const sName = splitName(tpl.name);
            const fNameVal = tpl.firstName || sName.first || tpl.name;
            const lNameVal = tpl.lastName || sName.last || '';

            // [v4.12.37] 성/이름 상호 배제 필터링 (Exclusive Filtering)으로 오폭 매칭 완벽 차단
            const label = getLabelFor(el).toLowerCase();
            const placeholder = (el.placeholder || '').toLowerCase();
            const nameAttr = (el.name || '').toLowerCase();
            const idAttr = (el.id || '').toLowerCase();
            const clsAttr = (el.className || '').toString().toLowerCase();
            const cText = `${label} ${placeholder} ${nameAttr} ${idAttr} ${clsAttr}`.toLowerCase();

            const isLastExclusive = cText.includes('first') || cText.includes('given') || cText.includes('fname');
            const isFirstExclusive = cText.includes('last') || cText.includes('surname') || cText.includes('family') || cText.includes('lname');

            if (!isFirstExclusive && await matchField(FIELD_PATTERNS.firstName, fNameVal, el)) continue;
            if (!isLastExclusive && await matchField(FIELD_PATTERNS.lastName, lNameVal, el)) continue;
            if (!isFirstExclusive && !isLastExclusive && await matchField(FIELD_PATTERNS.name, tpl.name, el)) continue;
            if (await matchField(FIELD_PATTERNS.email, tpl.email, el)) continue;
            if (await matchField(FIELD_PATTERNS.phone, tpl.phone, el)) continue;
            if (await matchField(FIELD_PATTERNS.subject, tpl.subject, el)) continue;
            if (await matchField(FIELD_PATTERNS.message, tpl.message, el)) continue;
        }

        // ── 6단계: 텍스트 폴백 - 여전히 빈 필드 강제 채우기 ──
        logDev("🎯 [HyperEngine v4.0] Phase 5 - 빈 필드 강제 채우기...");
        for (const el of inputs) {
            if (isHoneypotV4(el)) continue;
            if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') continue;
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file') continue;

            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            if (currentVal.trim() !== '') continue;

            if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
                await applyVal(el, tpl.message || getRandomTemplateVal(), 'Fallback-Message');
            } else {
                if (_MathCaptchaSolver && typeof _MathCaptchaSolver.solveField === 'function') {
                    const mathAnswer = _MathCaptchaSolver.solveField(el, getLabelFor);
                    if (mathAnswer !== null) {
                        await applyVal(el, String(mathAnswer), 'MathCaptcha-Fallback');
                        continue;
                    }
                }
                const ph = (el.placeholder || '').toLowerCase();
                const nm = (el.name || '').toLowerCase();
                const tp = (el.type || '').toLowerCase();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                const autocomp = (el.getAttribute('autocomplete') || '').toLowerCase();
                const label = getLabelFor(el).toLowerCase();
                const hint = `${ph} ${nm} ${ariaLabel} ${autocomp} ${label}`;

                let val;
                if (tp === 'email' || hint.includes('email') || hint.includes('mail')) val = tpl.email;
                else if (tp === 'tel' || hint.includes('phone') || hint.includes('tel') || hint.includes('mobile') || hint.includes('전화') || hint.includes('연락처')) val = tpl.phone;
                else if (tp === 'number' && (hint.includes('zip') || hint.includes('postal') || hint.includes('우편'))) val = '00000';
                else if (hint.includes('first')) val = tpl.firstName || tpl.name;
                else if (hint.includes('last') || hint.includes('surname') || hint.includes('family')) val = tpl.lastName || tpl.name;
                else if (hint.includes('name') || hint.includes('이름') || hint.includes('성함') || hint.includes('氏名')) val = tpl.name;
                else if (hint.includes('subject') || hint.includes('제목') || hint.includes('title') || hint.includes('件名')) val = tpl.subject;
                else if (hint.includes('company') || hint.includes('회사') || hint.includes('org') || hint.includes('회사명')) val = (tpl.name || 'Company') + ' Inc.';
                else if (hint.includes('address') || hint.includes('주소')) val = 'N/A';
                else if (hint.includes('zip') || hint.includes('postal') || hint.includes('우편')) val = '00000';
                else if (hint.includes('city') || hint.includes('도시') || hint.includes('시/군/구')) val = 'Seoul';
                else if (hint.includes('state') || hint.includes('province') || hint.includes('시/도')) val = 'Seoul';
                else if (hint.includes('country') || hint.includes('국가')) val = 'Korea';
                else if (hint.includes('website') || hint.includes('url') || hint.includes('homepage') || hint.includes('홈페이지')) val = '';  // 웹사이트 필드는 빈칸 허용
                else if (tp === 'url') val = ''; // URL 필드는 건너뛰기
                else val = getRandomTemplateVal().substring(0, 100);

                if (val) await applyVal(el, val, 'Fallback-SmartHint');
            }
        }

        // ── 7단계: 라디오 버튼 전수 - 미선택 그룹 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 6 - 라디오 버튼 미선택 그룹 처리...");
        try {
            const radioElements = Array.from(queryAllDeep('input[type="radio"]', form)).filter(r => !isHoneypotV4(r));
            const radioGroups = {};
            radioElements.forEach(radio => {
                const grpKey = radio.name || `_unnamed_${radio.id || Math.random()}`;
                if (!radioGroups[grpKey]) radioGroups[grpKey] = [];
                radioGroups[grpKey].push(radio);
            });

            for (const name in radioGroups) {
                const group = radioGroups[name];
                const isChecked = group.some(r => r.checked);
                if (!isChecked && group.length > 0) {
                    const validRadios = group.filter(r => !r.disabled);
                    if (validRadios.length === 0) continue;

                    // 키워드 매칭으로 최적 라디오 선택
                    const preferredKeywords = ['inquiry', 'general', 'other', 'yes', '문의', '일반', '기타', '예', 'oui', 'ja', 'はい', '是'];
                    let target = null;
                    for (const radio of validRadios) {
                        const radioLabel = getLabelFor(radio).toLowerCase();
                        const radioVal = (radio.value || '').toLowerCase();
                        if (preferredKeywords.some(k => radioLabel.includes(k) || radioVal.includes(k))) {
                            target = radio;
                            break;
                        }
                    }
                    // 키워드 매칭 실패 시 첫 번째 선택
                    if (!target) target = validRadios[0];
                    if (target) {
                        await applyRadio(target);
                        filledFields++;
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [Radio Phase] Error: ${e.message}`, 'warning');
        }

        // ── 8단계: 일반 체크박스 전수 처리 (필수 필드만 - CheckboxResolverR2 없을 때 레거시 폴백) ──
        if (!_CheckboxResolverR2) {
            logDev("🎯 [HyperEngine v4.0] Phase 7 - 필수 체크박스 레거시 폴백 처리...");
            try {
                const checkboxElements = Array.from(queryAllDeep('input[type="checkbox"]', form)).filter(cb => !isHoneypotV4(cb));
                for (const cb of checkboxElements) {
                    if (cb.checked) continue;

                    // 필수 체크박스 판별 (required 속성 또는 asterisk 표시)
                    const isRequired = cb.required || cb.getAttribute('aria-required') === 'true';
                    const labelText = getLabelFor(cb).toLowerCase();
                    const containerText = (cb.closest('div, label, span, li')?.textContent || '').toLowerCase().substring(0, 300);
                    const hasAsterisk = containerText.includes('*') || containerText.includes('필수');

                    // 뉴스레터/마케팅 체크박스는 스킵
                    const marketingKeywords = ['newsletter', 'marketing', 'subscribe', 'promotion', 'offer', '뉴스레터', '광고', '마케팅', '프로모션'];
                    const isMarketing = marketingKeywords.some(k => labelText.includes(k) || containerText.includes(k));

                    if ((isRequired || hasAsterisk) && !isMarketing) {
                        await applyCheckbox(cb);
                        filledFields++;
                    }
                }
            } catch (e) {
                logDev(`⚠️ [Checkbox Phase] Error: ${e.message}`, 'warning');
            }
        }

        // ── 9단계: 커스텀 체크박스/라디오 (div/span 기반 ARIA) 처리 ──
        logDev("🎯 [HyperEngine v4.0] Phase 8 - 커스텀 ARIA 체크박스/라디오 처리...");
        await applyCustomCheckableElements(form);

        // ── 10단계: 브루트포스 - contentEditable / role=textbox 탐색 ──
        logDev("🛠️ [HyperEngine v4.0] Phase 9 - BruteForce contentEditable/role=textbox...");
        try {
            const contentEditables = Array.from(queryAllDeep('[contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]', form));
            for (const inp of contentEditables) {
                if (isHoneypotV4(inp)) continue;
                const text = (inp.textContent || '').trim();
                if (text === '' || text === inp.getAttribute('placeholder')) {
                    await applyVal(inp, tpl.message || getRandomTemplateVal(), 'BruteForce-ContentEditable');
                    filledFields++;
                }
            }
        } catch (e) {
            logDev(`⚠️ [Phase 9] Error: ${e.message}`, 'warning');
        }

        // ── 11단계: [NEW] Super-BruteForce Final Target Sweeper ──
        logDev("🎯 [HyperEngine v4.0] Phase 10 - Super-BruteForce Sweeper (초강력 입력기) 가동...");
        try {
            // 다시 한 번 폼 내의 모든 입력 요소를 전수 수집
            const finalInputs = Array.from(queryAllInputs(form));
            for (const el of finalInputs) {
                // 타입 검사: 비입력용 타입들은 무조건 스킵
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                
                // 이미 체크되었거나 값이 적힌 것들은 스킵
                if (el.type === 'checkbox' && el.checked) continue;
                if (el.type === 'radio' && el.checked) continue;
                
                // 텍스트/셀렉트 박스 값 검사
                const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
                if (currentVal.trim() !== '') continue;

                if (el.tagName === 'SELECT') {
                    if (!_SelectResolverR2) {
                        await applySelect(el);
                        filledFields++;
                    }
                } else if (el.type === 'checkbox') {
                    if (!_CheckboxResolverR2) {
                        await applyCheckbox(el);
                        filledFields++;
                    }
                } else if (el.type === 'radio') {
                    await applyRadio(el);
                    filledFields++;
                } else {
                    // [v4.12.27] 숫자/글자를 정밀 구별하여 똑똑하게 랜덤 주입
                    const val = generateSmartRandomValue(el);
                    if (val) {
                        await applyVal(el, val, 'SuperSweeper-Smart');
                        filledFields++;
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [SuperSweeper] Error: ${e.message}`, 'warning');
        }

        // ── 11단계: 멀티 단계 폼(wizard) 감지 ──
        try {
            const nextBtnKeywords = ['next', 'continue', '다음', '次へ', '下一步', 'weiter', 'suivant', 'siguiente', 'step'];
            const allButtons = Array.from(form.querySelectorAll('button, [role="button"], input[type="button"]'));
            const nextBtn = allButtons.find(btn => {
                const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                return nextBtnKeywords.some(k => text.includes(k)) && text.length < 20;
            });

            if (nextBtn && filledFields > 0) {
                logDev("🔄 [HyperEngine v4.0] 멀티 단계 폼 감지! 'Next' 버튼 클릭...");
                nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(r => setTimeout(r, 200));
                dispatchHumanEvents(nextBtn, FULL_CLICK_SEQUENCE);
                await new Promise(r => setTimeout(r, 800));

                // 새로운 필드가 나타났으면 재귀적으로 채우기
                const newInputs = Array.from(queryAllInputs(form)).filter(inp => !isHoneypotV4(inp));
                const emptyNewInputs = newInputs.filter(inp => {
                    if (inp.type === 'checkbox' || inp.type === 'radio' || inp.tagName === 'SELECT') return false;
                    const val = inp.contentEditable === 'true' ? (inp.textContent || '') : (inp.value || '');
                    return val.trim() === '';
                });

                if (emptyNewInputs.length > 0) {
                    logDev(`   [v4.0] 2단계 폼에서 ${emptyNewInputs.length}개 빈 필드 발견. 추가 입력 진행...`);
                    for (const el of emptyNewInputs) {
                        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
                        if (await matchField(FIELD_PATTERNS.email, tpl.email, el)) continue;
                        if (await matchField(FIELD_PATTERNS.name, tpl.name, el)) continue;
                        if (await matchField(FIELD_PATTERNS.phone, tpl.phone, el)) continue;
                        if (await matchField(FIELD_PATTERNS.message, tpl.message, el)) continue;

                        // 폴백
                        if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
                            await applyVal(el, tpl.message || getRandomTemplateVal(), 'Step2-Fallback');
                        } else {
                            const hint = `${(el.placeholder || '')} ${(el.name || '')} ${getLabelFor(el)}`.toLowerCase();
                            let val = tpl.name;
                            if (hint.includes('email')) val = tpl.email;
                            else if (hint.includes('phone') || hint.includes('tel')) val = tpl.phone;
                            if (val) await applyVal(el, val, 'Step2-SmartHint');
                        }
                    }
                }
            }
        } catch (e) {
            logDev(`⚠️ [Wizard Phase] Error: ${e.message}`, 'warning');
        }

        // ── Directive 4 & Verification: FREEZE_VALUES gate & Stability check ──
        if (!checkboxStability.stable) {
            logDev(`❌ [Fill] Required checkbox unstable: ${checkboxStability.reasonCode}`, "error");
            return { filledAny: false, reasonCode: 'REQUIRED_CHECKBOX_UNSTABLE' };
        }
        if (!selectStability.stable) {
            logDev(`❌ [Fill] Required select unstable: ${selectStability.reasonCode}`, "error");
            return { filledAny: false, reasonCode: 'REQUIRED_SELECT_UNSTABLE' };
        }

        // Verify message body is filled
        const finalAllInputs = Array.from(queryAllInputs(form));
        let messageFilled = finalAllInputs.some(el => {
            const isMsg = el.tagName === 'TEXTAREA' || el.contentEditable === 'true' || (el.name && /message|comment|inquiry|body/i.test(el.name));
            const val = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            return isMsg && val.trim().length > 0;
        });

        if (!messageFilled) {
            const rescueTarget = finalAllInputs.find(el => el.tagName === 'TEXTAREA' || el.contentEditable === 'true')
                || finalAllInputs.find(el => !el.value && !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(el.type));
            if (rescueTarget) {
                await applyVal(rescueTarget, tpl.message || getRandomTemplateVal(), 'Fallback-Message-Rescue');
                filledFields++;
                messageFilled = true;
            }
        }

        if (!messageFilled) {
            logDev("❌ [Fill] Message body was not filled", "error");
            return { filledAny: false, reasonCode: 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' };
        }

        logDev("[STAGE] stage=REQUIRED_FIELDS_RESOLVED", "success");
        logDev("[STAGE] stage=FIELD_STATE_STABLE", "success");
        try {
            const sendFn = window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage;
            sendFn({
                action: 'STAGE_PROGRESSION',
                stage: 'REQUIRED_FIELDS_RESOLVED',
                url: window.location.href
            });
            sendFn({
                action: 'STAGE_PROGRESSION',
                stage: 'FIELD_STATE_STABLE',
                url: window.location.href
            });
        } catch (_) {}

        logDev(`✅ [HyperEngine v4.0] 폼 작성 완료 - 입력 필드 ${filledFields}개 처리됨`);
        return { filledAny: filledFields > 0 };
    }

    function getLabelFor(el) {
        if (!el) return '';
        // [v2.1.0] Supreme Proximity Search
        if (el.id && el.id !== 'null-field') {
            try {
                const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : el.id.replace(/["\\]/g, '\\$&');
                const label = document.querySelector(`label[for="${safeId}"]`);
                if (label) return label.textContent || '';
            } catch (_) {}
        }

        // Check Squarespace/Build style labels (title class or preceding span)
        const parent = el.parentElement;
        if (parent) {
            try {
                const labelChild = parent.querySelector('label, .title, .caption, .label');
                if (labelChild && labelChild !== el) return labelChild.textContent || '';
            } catch (_) {}
            
            // Look at parent's preceding sibling (Squarespace Pattern)
            const prevSibling = parent.previousElementSibling;
            if (prevSibling && (prevSibling.tagName === 'LABEL' || (prevSibling.classList && prevSibling.classList.contains('title')))) {
                return prevSibling.textContent || '';
            }
        }
        
        // Search the immediate ancestors until we find a label or meaningful text
        let runner = el;
        for (let i = 0; i < 3; i++) {
            runner = runner.parentElement;
            if (!runner) break;
            try {
                const labelSub = runner.querySelector('label');
                if (labelSub) return labelSub.textContent || '';
            } catch (_) {}
        }

        return el.getAttribute('aria-label') || el.title || '';
    }

    function elementIsVisible(el) {
        if (!el) return false;
        try {
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                const style = window.getComputedStyle(el);
                if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
                if (el.offsetParent === null && style && style.position !== 'fixed') return false;
            }
            if (typeof el.getBoundingClientRect === 'function') {
                const rect = el.getBoundingClientRect();
                return rect.width > 2 && rect.height > 2; // [v18.6.0] Threshold for visibility
            }
            return true;
        } catch(e) { return true; }
    }

    function isHoneypot(el) {
        if (!elementIsVisible(el)) return true;
        
        // Common Honeypot identifiers
        const honeypotKeywords = ['honeypot', 'website_url', 'trap', 'bottom_field'];
        const idOrName = (el.id + ' ' + el.name).toLowerCase();
        return honeypotKeywords.some(k => idOrName.includes(k));
    }

    function takeSuccessSnapshot() {
        const selectors = '[data-testid*="success"], [class*="success"], [id*="success"], .font_8 span, .wixui-rich-text, h1, h2, .status-msg';
        const elementsSnapshot = new Set();
        document.querySelectorAll(selectors).forEach(el => {
            if (elementIsVisible(el)) {
                elementsSnapshot.add(el.textContent.trim().toLowerCase());
            }
        });
        return {
            elements: Array.from(elementsSnapshot),
            bodyText: document.body.textContent.toLowerCase()
        };
    }

    async function checkForCaptcha() {
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            'iframe[src*="turnstile"]',
            '.g-recaptcha iframe',
            '.h-captcha iframe',
            '#turnstile-container iframe',
            'div[class*="captcha"] iframe',
            'iframe[title*="captcha"]',
            '.g-recaptcha',
            '.h-captcha',
            '.cf-turnstile',
            '#turnstile-container',
            '[data-sitekey]',
            'img[src*="captcha" i]',
            'img[id*="captcha" i]',
            'img[class*="captcha" i]'
        ];
        return captchaSelectors.some(s => document.querySelector(s) !== null);
    }

    function extractCaptchaSitekey() {
        // 1. Current window location query params
        if (typeof window !== 'undefined' && window.location) {
            try {
                const searchParams = new URLSearchParams(window.location.search);
                const k = searchParams.get('k') || searchParams.get('sitekey');
                if (k && k !== 'explicit') return { type: 'recaptcha', sitekey: k };
            } catch (_) {}
        }

        const turnstileFrame = document.querySelector('iframe[src*="turnstile"]');
        if (turnstileFrame) {
            const match = turnstileFrame.src.match(/sitekey=([^&]+)/) || turnstileFrame.src.match(/k=([^&]+)/);
            if (match) return { type: 'turnstile', sitekey: match[1] };
            const wrapper = turnstileFrame.closest('.cf-turnstile') || document.querySelector('.cf-turnstile');
            if (wrapper && wrapper.dataset.sitekey) return { type: 'turnstile', sitekey: wrapper.dataset.sitekey };
        }

        const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"]');
        if (recaptchaFrame) {
            const match = recaptchaFrame.src.match(/k=([^&]+)/);
            if (match) return { type: 'recaptcha', sitekey: match[1] };
            const gDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
            if (gDiv && gDiv.dataset.sitekey) return { type: 'recaptcha', sitekey: gDiv.dataset.sitekey };
        }
        
        const hcaptchaFrame = document.querySelector('iframe[src*="hcaptcha"]');
        if (hcaptchaFrame) {
            const match = hcaptchaFrame.src.match(/sitekey=([^&]+)/);
            if (match) return { type: 'hcaptcha', sitekey: match[1] };
            const hDiv = document.querySelector('.h-captcha');
            if (hDiv && hDiv.dataset.sitekey) return { type: 'hcaptcha', sitekey: hDiv.dataset.sitekey };
        }

        const gContainer = document.querySelector('.g-recaptcha[data-sitekey], [data-sitekey]');
        if (gContainer) {
            const sitekey = gContainer.getAttribute?.('data-sitekey') || gContainer.dataset?.sitekey;
            if (sitekey) return { type: 'recaptcha', sitekey };
        }

        const hContainer = document.querySelector('.h-captcha[data-sitekey]');
        if (hContainer) {
            const sitekey = hContainer.getAttribute?.('data-sitekey') || hContainer.dataset?.sitekey;
            if (sitekey) return { type: 'hcaptcha', sitekey };
        }

        const tContainer = document.querySelector('.cf-turnstile[data-sitekey], #turnstile-container[data-sitekey]');
        if (tContainer) {
            const sitekey = tContainer.getAttribute?.('data-sitekey') || tContainer.dataset?.sitekey;
            if (sitekey) return { type: 'turnstile', sitekey };
        }

        // Inline script scan for grecaptcha.render('...', { 'sitekey': '...' })
        try {
            const inlineScripts = document.querySelectorAll('script:not([src])');
            for (const s of inlineScripts) {
                const text = s.textContent || '';
                const m = text.match(/['"]sitekey['"]\s*:\s*['"]([a-zA-Z0-9_\-]+)['"]/i);
                if (m && m[1]) return { type: 'recaptcha', sitekey: m[1] };
            }
        } catch (_) {}

        // Image captcha detection
        const imgCaptcha = document.querySelector('img[src*="captcha" i], img[id*="captcha" i]');
        if (imgCaptcha) {
            const companionInput = document.querySelector('input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="captcha" i]');
            return { type: 'image', element: imgCaptcha, inputElement: companionInput };
        }

        return null;
    }

    let _activeCaptchaSolvePromise = null;

    async function tryAutoSolveCaptcha(stage = 'MANUAL') {
        const captchaData = extractCaptchaSitekey();
        if (!captchaData) return false;

        if (_activeCaptchaSolvePromise) {
            return _activeCaptchaSolvePromise;
        }

        const sitekeyLog = captchaData.sitekey ? captchaData.sitekey.substring(0, 16) + '...' : 'inline';
        console.log(`[CAPTCHA_DETECTED] stage=${stage} type=${captchaData.type} sitekey=${sitekeyLog}`);
        logDev(`[CAPTCHA_DETECTED] stage=${stage} type=${captchaData.type} sitekey=${sitekeyLog}`, 'info');

        _activeCaptchaSolvePromise = new Promise((resolve) => {
            updateTopSolverHUD(`Detected ${captchaData.type}. Engaging 2Captcha API Solver...`, 'SOLVING');
            console.log(`[CAPTCHA_SOLVER_START] method=2captcha type=${captchaData.type}`);
            logDev(`🤖 [Security] [CAPTCHA_SOLVER_START] method=2captcha type=${captchaData.type}`, 'info');

            let imageData = null;
            if (captchaData.type === 'image' && captchaData.element) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = captchaData.element.naturalWidth || captchaData.element.width || 120;
                    canvas.height = captchaData.element.naturalHeight || captchaData.element.height || 40;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(captchaData.element, 0, 0);
                    imageData = canvas.toDataURL('image/png').replace(/^data:image\/(png|jpeg);base64,/, '');
                } catch (_) {}
            }

            const sendFn = window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage;
            sendFn({
                action: 'SOLVE_CAPTCHA',
                method: 'api',
                sitekey: captchaData.sitekey,
                url: window.location.href,
                type: captchaData.type,
                imageData: imageData
            }, (response) => {
                _activeCaptchaSolvePromise = null;
                if (chrome.runtime.lastError || !response || !response.success) {
                    const err = (response && response.error) ? response.error : (chrome.runtime.lastError?.message || 'Unknown');
                    logDev(`⚠️ 2Captcha Auto-solve notice: ${err}.`, 'debug');
                    updateTopSolverHUD("2Captcha solve failed or awaiting frame...", "FAIL");
                    resolve(false);
                } else if (response.token || response.solution) {
                    const solution = response.token || response.solution;
                    console.log(`[CAPTCHA_SOLVER_SUCCESS] method=2captcha type=${captchaData.type} tokenLength=${solution.length}`);
                    logDev(`✅ [CAPTCHA_SOLVER_SUCCESS] method=2captcha type=${captchaData.type} tokenLength=${solution.length}`, 'success');
                    updateTopSolverHUD("2Captcha solved! Token applied.", "SUCCESS");

                    let callbackFired = false;
                    let targetSelector = 'none';

                    if (captchaData.type === 'turnstile') {
                        targetSelector = '[name="cf-turnstile-response"]';
                        const input = document.querySelector(targetSelector);
                        if (input) input.value = solution;
                        try {
                            if (window.turnstile && typeof window.turnstile.execute === 'function') {
                                callbackFired = true;
                            }
                        } catch (_) {}
                    } else if (captchaData.type === 'recaptcha') {
                        targetSelector = '[name="g-recaptcha-response"]';
                        const fields = document.querySelectorAll('[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"]');
                        for (const f of fields) {
                            try {
                                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                                if (nativeSetter) nativeSetter.call(f, solution);
                                else f.value = solution;
                                f.dispatchEvent(new Event('input', { bubbles: true }));
                                f.dispatchEvent(new Event('change', { bubbles: true }));
                            } catch (_) { f.value = solution; }
                        }
                        // Trigger reCAPTCHA callback
                        try {
                            const gWidget = document.querySelector('.g-recaptcha[data-callback]');
                            if (gWidget && gWidget.dataset.callback && typeof window[gWidget.dataset.callback] === 'function') {
                                window[gWidget.dataset.callback](solution);
                                callbackFired = true;
                            } else if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
                                for (const id in window.___grecaptcha_cfg.clients) {
                                    const client = window.___grecaptcha_cfg.clients[id];
                                    for (const k in client) {
                                        if (client[k] && typeof client[k].callback === 'function') {
                                            client[k].callback(solution);
                                            callbackFired = true;
                                        }
                                    }
                                }
                            }
                            if (typeof window.validateRecaptcha === 'function') {
                                window.validateRecaptcha(solution);
                                callbackFired = true;
                            }
                        } catch (_) {}
                    } else if (captchaData.type === 'hcaptcha') {
                        targetSelector = '[name="h-captcha-response"]';
                        const input = document.querySelector(targetSelector);
                        if (input) input.value = solution;
                        try {
                            const hWidget = document.querySelector('.h-captcha[data-callback]');
                            if (hWidget && hWidget.dataset.callback && typeof window[hWidget.dataset.callback] === 'function') {
                                window[hWidget.dataset.callback](solution);
                                callbackFired = true;
                            }
                        } catch (_) {}
                    } else if (captchaData.type === 'image' && captchaData.inputElement) {
                        targetSelector = captchaData.inputElement.name || captchaData.inputElement.id || 'input';
                        captchaData.inputElement.value = solution;
                        captchaData.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                        captchaData.inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                        callbackFired = true;
                    }

                    console.log(`[CAPTCHA_INJECTED] target=${targetSelector} callbackFired=${callbackFired}`);
                    logDev(`[CAPTCHA_INJECTED] target=${targetSelector} callbackFired=${callbackFired}`, 'success');

                    const injectedInput = document.querySelector(`[name*="-response"]`);
                    if (injectedInput) injectedInput.dispatchEvent(new Event('change', { bubbles: true }));

                    _isCaptchaSolved = true;
                    resolve(true);
                } else {
                    _isCaptchaSolved = true;
                    resolve(true);
                }
            });
        });

        return _activeCaptchaSolvePromise;
    }

    // [Cross-Frame Coordination] Listen for solved captcha tokens from other frames or background
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('message', (event) => {
            if (event.data && (event.data.type === 'captchaToken' || event.data.action === 'CAPTCHA_SOLVED')) {
                _isCaptchaSolved = true;
                const solution = event.data.token || '';
                logDev(`🔑 [Security] Captcha solved signal received from frame (${solution.substring(0, 10)}...)`, 'success');
                const fields = document.querySelectorAll('[name="g-recaptcha-response"], textarea[name="g-recaptcha-response"], [name="h-captcha-response"], textarea[name="h-captcha-response"], [name="cf-turnstile-response"]');
                for (const f of fields) {
                    try {
                        if (solution && solution.length > 5) {
                            f.value = solution;
                        }
                        f.dispatchEvent(new Event('input', { bubbles: true }));
                        f.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (_) {}
                }
                if (typeof window.validateRecaptcha === 'function') {
                    try { window.validateRecaptcha(solution); } catch (_) {}
                }
            }
        });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        try {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg && msg.action === 'CAPTCHA_SOLVED') {
                    _isCaptchaSolved = true;
                    logDev(`🔑 [Security] Captcha solved signal received via runtime message`, 'success');
                }
            });
        } catch (_) {}
    }

    async function waitForCaptchaSolved() {
        const MAX_WAIT = 30; // Bounded wait (Issue #6 R6.8 P1-1)
        let autoSolveAttempted = false;
        let autoSolveFinishedTs = 0;

        for (let i = 0; i < MAX_WAIT; i++) {
            if (_isCaptchaSolved) {
                logDev("🔑 [Security] Challenge solved verified. Resuming sequence immediately.", "success");
                await new Promise(r => setTimeout(r, 400));
                return true;
            }

            const stillHasCaptcha = await checkForCaptcha();
            
            // Search all frames and forms for captcha token fields
            const gResponse = document.querySelector('[name="g-recaptcha-response"]') || document.querySelector('#g-recaptcha-response');
            const hResponse = document.querySelector('[name="h-captcha-response"]') || document.querySelector('#h-captcha-response');
            const tResponse = document.querySelector('[name="cf-turnstile-response"]') || document.querySelector('#cf-turnstile-response') || document.querySelector('[name="cf_challenge_response"]') || document.querySelector('input[name*="turnstile"]');
            const imgInput = document.querySelector('input[name*="captcha" i], input[id*="captcha" i], input[placeholder*="captcha" i]');
            
            const hasToken = _isCaptchaSolved ||
                             (gResponse && gResponse.value && gResponse.value.trim() !== '') || 
                             (hResponse && hResponse.value && hResponse.value.trim() !== '') || 
                             (tResponse && tResponse.value && tResponse.value.trim() !== '') ||
                             (imgInput && imgInput.value && imgInput.value.trim() !== '');

            // Auto-solve injection trigger
            if (stillHasCaptcha && !autoSolveAttempted && !_isCaptchaSolved) {
                autoSolveAttempted = true;
                const solved = await tryAutoSolveCaptcha('WAIT_LOOP');
                autoSolveFinishedTs = Date.now();
                if (solved) {
                    _isCaptchaSolved = true;
                    logDev("🔑 [Security] Auto-solve succeeded. Resuming sequence immediately.", "success");
                    await new Promise(r => setTimeout(r, 500));
                    return true;
                }
            }

            // [P1-1 Fast-Fail] If token injected but challenge not accepted within 15s post-solve:
            if (autoSolveFinishedTs > 0 && (Date.now() - autoSolveFinishedTs > 15000)) {
                if (!_isCaptchaSolved && !hasToken && stillHasCaptcha && !document.querySelector('.recaptcha-checkbox-checked, [aria-checked="true"]')) {
                    logDev("[CAPTCHA_INTEGRATION_FAILURE] reason=CAPTCHA_TOKEN_NOT_ACCEPTED", "error");
                    throw new Error("CAPTCHA_TOKEN_NOT_ACCEPTED");
                }
            }

            if (!stillHasCaptcha || hasToken || _isCaptchaSolved) {
                _isCaptchaSolved = true;
                logDev("🔑 [Security] Challenge solved or removed. Resuming sequence immediately.", "success");
                await new Promise(r => setTimeout(r, 500));
                return true;
            }

            await new Promise(r => setTimeout(r, 1000));
        }
        return _isCaptchaSolved;
    }

    // ============================================================
    // [v4.2] 에러 하이라이트 감지 자가 복구기 (Self-Healing Validation Recovery Engine)
    // ============================================================
    async function selfHealErrorFields(form, tpl) {
        if (!form) return 0;
        let healedCount = 0;
        try {
            const candidates = Array.from(queryAllInputs(form));
            const errorFields = [];

            // 폼 내부 및 주변의 에러 메시지 텍스트 미리 확보 (Wix의 .Z0mg9X 등 포함)
            const errorContainers = Array.from(document.querySelectorAll('.Z0mg9X, .TTK5ZL, [class*="error"], [id*="error"], .invalid-feedback, .error-notice, .error-message'));
            const visibleErrorTexts = errorContainers
                .filter(el => elementIsVisible(el))
                .map(el => (el.textContent || '').trim().toLowerCase())
                .filter(txt => txt.length > 0);

            for (const el of candidates) {
                // 특수 버튼/파일 타입은 에러 판정에서 제외
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                
                let isError = false;
                
                // 1. HTML5 native :invalid 체크 및 aria-invalid 체크
                try {
                    if (el.matches(':invalid') || el.getAttribute('aria-invalid') === 'true' || el.getAttribute('data-state') === 'invalid') {
                        isError = true;
                    }
                } catch(e) {}
                
                // 2. 조상 래퍼 클래스 트래버스 (최대 5레벨 위 조상까지 검사하여 invalid 클래스 마킹 확인 - Wix .tkHMZu 등 감지)
                if (!isError) {
                    let ancestor = el.parentElement;
                    const errorKeywords = ['error', 'invalid', 'failed', 'danger', 'required', 'warning', 'err-', 'tkhmzu'];
                    for (let depth = 0; depth < 5 && ancestor; depth++) {
                        const ancestorClass = (ancestor.className || '').toString().toLowerCase();
                        const ancestorId = (ancestor.id || '').toString().toLowerCase();
                        const combinedAttr = `${ancestorClass} ${ancestorId}`;
                        
                        if (errorKeywords.some(k => combinedAttr.includes(k))) {
                            isError = true;
                            break;
                        }
                        ancestor = ancestor.parentElement;
                    }
                }
                
                // 3. 동적 에러 텍스트 연계 및 형제 노드 (.Z0mg9X) 검사
                if (!isError) {
                    // Wix 에러 텍스트 컴포넌트가 인풋 주변에 가시적으로 렌더링되어 있는지 검사
                    const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
                    const hasVisibleErrorSibling = siblings.some(sib => {
                        const isErrorContainer = sib.classList.contains('Z0mg9X') || (sib.className || '').toString().toLowerCase().includes('error');
                        return isErrorContainer && elementIsVisible(sib);
                    });
                    if (hasVisibleErrorSibling) {
                        isError = true;
                    }
                }

                // 4. 에러 메시지 텍스트 파싱을 통한 타깃 필드 매칭 (예: "email" 단어가 에러창에 보이면 이메일 인풋을 즉시 에러로 매핑)
                if (!isError && visibleErrorTexts.length > 0) {
                    const label = getLabelFor(el).toLowerCase();
                    const ph = (el.placeholder || '').toLowerCase();
                    const nm = (el.name || '').toLowerCase();
                    const type = (el.type || '').toLowerCase();
                    const hint = `${label} ${ph} ${nm} ${type}`;

                    const keywordsToTest = ['email', 'phone', 'tel', 'name', 'message', 'subject', '이메일', '전화', '이름', '메시지', '제목', 'mail'];
                    const matchedKeyword = keywordsToTest.find(k => hint.includes(k));
                    
                    if (matchedKeyword) {
                        // 페이지 전반의 가시적 에러 메시지 중 해당 필드 명칭을 담은 에러 텍스트가 1개라도 존재하는 경우
                        if (visibleErrorTexts.some(errText => errText.includes(matchedKeyword) || errText.includes('필수') || errText.includes('required') || errText.includes('invalid'))) {
                            isError = true;
                        }
                    }
                }
                
                // 5. 시각적 빨간색 border/box-shadow/background 변색 검사
                if (!isError) {
                    const style = window.getComputedStyle(el);
                    const parentStyle = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
                    
                    const isRedColor = (colorStr) => {
                        if (!colorStr) return false;
                        const match = colorStr.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                        if (match) {
                            const r = parseInt(match[1], 10);
                            const g = parseInt(match[2], 10);
                            const b = parseInt(match[3], 10);
                            return r > 150 && g < 90 && b < 90;
                        }
                        return colorStr.includes('#ff0000') || colorStr.includes('red') || colorStr.includes('rgb(255, 64, 64)');
                    };
                    
                    if (isRedColor(style.borderColor) || isRedColor(style.boxShadow) || isRedColor(style.outlineColor) ||
                        (parentStyle && (isRedColor(parentStyle.borderColor) || isRedColor(parentStyle.boxShadow)))) {
                        isError = true;
                    }
                }

                if (isError) {
                    errorFields.push(el);
                }
            }

            if (errorFields.length > 0) {
                logDev(`⚠️ [Healer] 정밀 에러 자가 복구 가동! 대상 필드 ${errorFields.length}개 발견.`, 'warning');
                
                for (const el of errorFields) {
                    // 1. 완벽한 값 초기화 (React/Vue 가상 DOM 내부까지 값 세터를 리셋)
                    if (el.contentEditable === 'true') {
                        el.textContent = '';
                    } else {
                        setNativeValue(el, '');
                        el.value = '';
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise(r => setTimeout(r, 80));

                    // 2. 복구용 다변화된 100% 새로운 스마트 무작위 값 대입
                    const label = getLabelFor(el).toLowerCase();
                    const ph = (el.placeholder || '').toLowerCase();
                    const nm = (el.name || '').toLowerCase();
                    const type = (el.type || '').toLowerCase();
                    const hint = `${label} ${ph} ${nm}`;

                    const templateVals = [
                        tpl.firstName, tpl.lastName, tpl.name, tpl.email,
                        tpl.phone, tpl.subject, tpl.message
                    ].filter(v => typeof v === 'string' && v.trim() !== '');

                    const getRandomTemplateVal = () => {
                        if (templateVals.length > 0) return templateVals[Math.floor(Math.random() * templateVals.length)];
                        return "Inquiry";
                    };

                    let val = getRandomTemplateVal();
                    if (type === 'email' || hint.includes('email') || hint.includes('mail')) {
                        // 이메일 패턴 완전 재생성
                        const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'naver.com', 'daum.net'];
                        const randomUser = 'contact_pro_' + Math.random().toString(36).substring(2, 8);
                        val = `${randomUser}@${domains[Math.floor(Math.random() * domains.length)]}`;
                    } else if (type === 'tel' || hint.includes('phone') || hint.includes('tel') || hint.includes('mobile') || hint.includes('전화') || hint.includes('연락처')) {
                        // 전화번호 패턴 재생성 (해외/국내 규격 유연 대조)
                        val = '010' + Math.floor(20000000 + Math.random() * 80000000);
                    } else if (hint.includes('name') || hint.includes('이름') || hint.includes('氏') || hint.includes('성함')) {
                        val = (tpl.name || 'User') + '_' + Math.floor(100 + Math.random() * 900);
                    } else if (hint.includes('subject') || hint.includes('제목') || hint.includes('title')) {
                        val = (tpl.subject || 'Inquiry') + ' ' + Math.random().toString(36).substring(2, 6).toUpperCase();
                    }

                    // 3. 진짜 인간의 1자 단위 불규칙 타이핑 모사로 다시 재입력!
                    await typeHumanlike(el, val);
                    healedCount++;
                }
            }
        } catch (e) {
            logDev(`⚠️ [Healer] 에러 복구 루틴 중 오류 발생: ${e.message}`, 'error');
        }
        return healedCount;
    }

    // ============================================================
    // [Reliability R1] Bounded FormStabilizer (Replaces 150ms infinite sweeper)
    // ============================================================
    class FormStabilizer {
        constructor(formOrOptions = {}, tpl = {}, options = {}) {
            if (formOrOptions && formOrOptions.querySelectorAll) {
                this.form = formOrOptions;
                this.tpl = tpl || {};
                this.options = options || {};
            } else {
                this.form = null;
                this.tpl = {};
                this.options = formOrOptions || {};
            }
            const opts = this.options;
            this.maxLifetimeMs = opts.maxDurationMs || opts.maxLifetimeMs || 5000;
            this.checkIntervalMs = opts.pollIntervalMs || opts.checkIntervalMs || 400;
            this.maxAttemptsPerElement = opts.maxElementAttempts || opts.maxAttemptsPerElement || 2;
            this.cooldownMs = opts.cooldownMs || 500;
            this.requiredStableCycles = opts.requiredStableCycles || 2;
            
            this.tracker = new WeakMap();
            this.startTime = Date.now();
            this.timer = null;
            this.safetyTimer = null;
            this.isStopped = false;
            this.customFillFn = null;
            this._onStop = null;
            
            this.stats = {
                fieldsSeen: 0,
                mapped: 0,
                stable: 0,
                unresolved: 0,
                selectAttempts: 0,
                checkboxAttempts: 0,
                radioAttempts: 0,
                timedOutElements: 0,
                durationMs: 0
            };
        }

        _getTrack(el) {
            let t = this.tracker.get(el);
            if (!t) {
                t = { attempts: 0, lastAttemptTs: 0, lastAppliedValue: null, stableCycles: 0, state: 'NEW' };
                this.tracker.set(el, t);
            }
            return t;
        }

        start(form, tpl, fillFn) {
            if (form) this.form = form;
            if (tpl) this.tpl = tpl;
            if (fillFn) this.customFillFn = fillFn;
            if (this.isStopped) return Promise.resolve(this.stats);
            logDev("🛡️ [FormStabilizer] Starting bounded stabilization (max 5s, max 2 retries/element)...", "info");

            return new Promise((resolve) => {
                this._onStop = resolve;
                this.timer = setInterval(() => {
                    this.stabilizePass().catch(() => {});
                }, this.checkIntervalMs);

                this.safetyTimer = setTimeout(() => {
                    this.stop("MAX_LIFETIME_EXCEEDED");
                }, this.maxLifetimeMs);

                this.stabilizePass().catch(() => {});
            });
        }

        async stabilizePass() {
            if (this.isStopped) return;
            if (!this.form || (typeof document !== 'undefined' && document.body && document.body.contains && !document.body.contains(this.form))) {
                this.stop("FORM_DETACHED");
                return;
            }

            const candidates = Array.from(queryAllInputs(this.form));
            this.stats.fieldsSeen = candidates.length;

            const radioGroups = {};
            let allStableOrMaxed = true;

            for (const el of candidates) {
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'file' || el.type === 'reset') continue;
                
                const t = this._getTrack(el);

                // A. Radios
                if (el.type === 'radio') {
                    const grpKey = el.name || `_unnamed_${el.id || Math.random()}`;
                    if (!radioGroups[grpKey]) radioGroups[grpKey] = [];
                    radioGroups[grpKey].push(el);
                    continue;
                }

                // B. Checkboxes
                if (el.type === 'checkbox') {
                    const isRequired = el.required || el.getAttribute('aria-required') === 'true';
                    const containerText = (el.closest('div, label, span, li')?.textContent || '').toLowerCase();
                    const hasAsterisk = containerText.includes('*') || containerText.includes('필수') || containerText.includes('agree');
                    
                    if (isRequired || hasAsterisk) {
                        if (el.checked) {
                            t.stableCycles++;
                            if (t.stableCycles >= this.requiredStableCycles) t.state = 'STABLE';
                        } else {
                            t.stableCycles = 0;
                            if (t.attempts < this.maxAttemptsPerElement && (Date.now() - t.lastAttemptTs) >= this.cooldownMs) {
                                t.attempts++;
                                t.lastAttemptTs = Date.now();
                                this.stats.checkboxAttempts++;
                                logDev(`🛡️ [Stabilizer] Required checkbox attempt ${t.attempts}/${this.maxAttemptsPerElement}: <input id="${el.id}">`);
                                await applyCheckbox(el);
                            }
                            if (t.attempts >= this.maxAttemptsPerElement) {
                                t.state = 'UNRESOLVED';
                            } else {
                                allStableOrMaxed = false;
                            }
                        }
                    } else {
                        t.state = 'STABLE';
                    }
                    continue;
                }

                // C. Selects
                if (el.tagName === 'SELECT') {
                    if (el.selectedIndex > 0) {
                        t.stableCycles++;
                        if (t.stableCycles >= this.requiredStableCycles) t.state = 'STABLE';
                    } else {
                        t.stableCycles = 0;
                        if (t.attempts < this.maxAttemptsPerElement && (Date.now() - t.lastAttemptTs) >= this.cooldownMs) {
                            t.attempts++;
                            t.lastAttemptTs = Date.now();
                            this.stats.selectAttempts++;
                            logDev(`🛡️ [Stabilizer] Unselected dropdown attempt ${t.attempts}/${this.maxAttemptsPerElement}: <select id="${el.id}">`);
                            await applySelect(el);
                        }
                        if (t.attempts >= this.maxAttemptsPerElement) {
                            t.state = 'UNRESOLVED';
                        } else {
                            allStableOrMaxed = false;
                        }
                    }
                    continue;
                }

                // D. Text / Textarea / Contenteditable
                const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
                const isRequired = el.required || el.getAttribute('aria-required') === 'true';

                if (currentVal.trim() !== '') {
                    t.stableCycles++;
                    if (t.stableCycles >= this.requiredStableCycles) t.state = 'STABLE';
                } else if (isRequired) {
                    t.stableCycles = 0;
                    if (t.attempts < this.maxAttemptsPerElement && (Date.now() - t.lastAttemptTs) >= this.cooldownMs) {
                        t.attempts++;
                        t.lastAttemptTs = Date.now();
                        // Deterministic value — never random!
                        const fillVal = (el.tagName === 'TEXTAREA' || el.contentEditable === 'true' || el.getAttribute('role') === 'textbox')
                            ? (this.tpl.message || 'Inquiry regarding services')
                            : (this.tpl.subject || this.tpl.name || 'Inquiry');
                        logDev(`🛡️ [Stabilizer] Empty required field attempt ${t.attempts}/${this.maxAttemptsPerElement}: <${el.tagName} id="${el.id}">`);
                        if (this.customFillFn) {
                            await this.customFillFn(el, fillVal);
                        } else {
                            await applyVal(el, fillVal, 'Stabilizer-Field');
                        }
                    }
                    if (t.attempts >= this.maxAttemptsPerElement) {
                        t.state = 'UNRESOLVED';
                    } else {
                        allStableOrMaxed = false;
                    }
                } else {
                    t.state = 'STABLE';
                }
            }

            // Radio Groups pass
            for (const grpName in radioGroups) {
                const group = radioGroups[grpName];
                const isAnyChecked = group.some(r => r.checked);
                if (isAnyChecked) {
                    group.forEach(r => {
                        const t = this._getTrack(r);
                        t.stableCycles++;
                        if (t.stableCycles >= this.requiredStableCycles) t.state = 'STABLE';
                    });
                } else {
                    const firstValid = group.find(r => !r.disabled);
                    if (firstValid) {
                        const t = this._getTrack(firstValid);
                        if (t.attempts < this.maxAttemptsPerElement && (Date.now() - t.lastAttemptTs) >= this.cooldownMs) {
                            t.attempts++;
                            t.lastAttemptTs = Date.now();
                            this.stats.radioAttempts++;
                            logDev(`🛡️ [Stabilizer] Unselected radio group attempt ${t.attempts}/${this.maxAttemptsPerElement}: <input id="${firstValid.id}">`);
                            await applyRadio(firstValid);
                        }
                        if (t.attempts >= this.maxAttemptsPerElement) {
                            t.state = 'UNRESOLVED';
                        } else {
                            allStableOrMaxed = false;
                        }
                    }
                }
            }

            // Early auto-stop if all fields reached STABLE or UNRESOLVED state
            if (allStableOrMaxed) {
                this.stop("ALL_FIELDS_STABLE_OR_RESOLVED");
            }
        }

        stop(reason = "MANUAL_STOP") {
            if (this.isStopped) return this.stats;
            this.isStopped = true;
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
            if (this.safetyTimer) {
                clearTimeout(this.safetyTimer);
                this.safetyTimer = null;
            }

            // Tally stats
            if (this.form) {
                const candidates = Array.from(queryAllInputs(this.form));
                let stableCount = 0;
                let unresCount = 0;
                candidates.forEach(el => {
                    const t = this.tracker.get(el);
                    if (t) {
                        if (t.state === 'STABLE') stableCount++;
                        else if (t.state === 'UNRESOLVED' || t.attempts >= this.maxAttemptsPerElement) unresCount++;
                    }
                });
                this.stats.stable = stableCount;
                this.stats.unresolved = unresCount;
            }

            this.stats.durationMs = Date.now() - this.startTime;
            this.stats.stopReason = reason;
            this.stats.stable = (reason === "ALL_FIELDS_STABLE_OR_RESOLVED");
            if (this._onStop) {
                this._onStop(this.stats);
                this._onStop = null;
            }

            logDev(`🛡️ [FormStabilizer] Stopped (${reason}): seen=${this.stats.fieldsSeen} stable=${this.stats.stable} unresolved=${this.stats.unresolved} (selects=${this.stats.selectAttempts}, cbs=${this.stats.checkboxAttempts}, radios=${this.stats.radioAttempts})`, "info");
            return this.stats;
        }
    }

    let _activeStabilizerInstance = null;
    function startActiveEmptyFieldSweeper(form, tpl) {
        if (_activeStabilizerInstance) _activeStabilizerInstance.stop("NEW_STABILIZER_STARTED");
        _activeStabilizerInstance = new FormStabilizer(form, tpl);
        _activeStabilizerInstance.start();
        return _activeStabilizerInstance;
    }

    function stopActiveEmptyFieldSweeper() {
        if (_activeStabilizerInstance) {
            _activeStabilizerInstance.stop("STOP_REQUESTED");
            _activeStabilizerInstance = null;
        }
    }

    function querySelectorIncludingShadowDOM(root, selector) {
        if (!root) return null;
        try {
            if (root.querySelector) {
                const el = root.querySelector(selector);
                if (el) return el;
            }
        } catch(e) {}
        try {
            if (root.querySelectorAll) {
                const all = root.querySelectorAll('*');
                for (const node of all) {
                    if (node.shadowRoot) {
                        const found = querySelectorIncludingShadowDOM(node.shadowRoot, selector);
                        if (found) return found;
                    }
                }
            }
        } catch(e) {}
        let child = root.firstChild;
        while (child) {
            const found = querySelectorIncludingShadowDOM(child, selector);
            if (found) return found;
            child = child.nextSibling;
        }
        return null;
    }

    function querySelectorAllIncludingShadowDOM(root, selector, results = []) {
        if (!root) return results;
        try {
            if (root.querySelectorAll) {
                root.querySelectorAll(selector).forEach(el => {
                    if (!results.includes(el)) results.push(el);
                });
            }
        } catch(e) {}
        try {
            if (root.querySelectorAll) {
                const all = root.querySelectorAll('*');
                for (const node of all) {
                    if (node.shadowRoot) {
                        querySelectorAllIncludingShadowDOM(node.shadowRoot, selector, results);
                    }
                }
            }
        } catch(e) {}
        let child = root.firstChild;
        while (child) {
            querySelectorAllIncludingShadowDOM(child, selector, results);
            child = child.nextSibling;
        }
        return results;
    }

    // ============================================================
    // [Section B] Field Integrity Before Submit (Freeze & Verify)
    // ============================================================
    function freezeFieldValues(form, tpl = {}) {
        stopActiveEmptyFieldSweeper();
        const snapshot = new Map();
        if (!form) return snapshot;

        const fields = queryAllInputs(form);
        for (const el of fields) {
            const val = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            const checked = !!el.checked;
            const isReq = !!(el.required || el.getAttribute('aria-required') === 'true');
            const sig = el.id || el.name || el.getAttribute('data-testid') || (el.tagName + '_' + (el.type || 'text'));
            snapshot.set(el, {
                sig,
                value: val,
                checked,
                isRequired: isReq,
                tagName: el.tagName,
                type: (el.type || '').toLowerCase(),
                name: el.name || '',
                id: el.id || ''
            });
        }
        return snapshot;
    }

    function getAuthoritativeValue(el, expected, tpl = {}) {
        const tp = (expected.type || el.type || '').toLowerCase();
        const nm = (expected.name || el.name || '').toLowerCase();
        const isMsg = (el.tagName === 'TEXTAREA' || el.contentEditable === 'true' || (el.getAttribute && el.getAttribute('role') === 'textbox') || nm.includes('message') || nm.includes('comment') || nm.includes('content'));
        const isEmail = (tp === 'email' || nm.includes('email') || nm.includes('mail'));
        const isPhone = (tp === 'tel' || nm.includes('phone') || nm.includes('tel') || nm.includes('mobile'));
        const isSubj = (nm.includes('subject') || nm.includes('topic') || nm.includes('title'));
        const isName = (nm.includes('name') || nm.includes('author'));

        if (isMsg && tpl.message) return tpl.message;
        if (isEmail && tpl.email) return tpl.email;
        if (isPhone && tpl.phone) return tpl.phone;
        if (isSubj && tpl.subject) return tpl.subject;
        if (isName && tpl.name) return tpl.name;
        if (_MathCaptchaSolver && typeof _MathCaptchaSolver.solveField === 'function') {
            const mathAns = _MathCaptchaSolver.solveField(el, getLabelFor);
            if (mathAns !== null) return String(mathAns);
        }
        if (expected.name && tpl[expected.name]) return tpl[expected.name];
        if (expected.id && tpl[expected.id]) return tpl[expected.id];
        return null;
    }

    function verifyFieldIntegrity(form, snapshot, tpl = {}) {
        if (!snapshot || snapshot.size === 0) return { intact: true };
        let repairedCount = 0;

        for (const [origEl, expected] of snapshot.entries()) {
            let currentEl = origEl;

            // 1. Check if node was unmounted / replaced in DOM (FIELD_NODE_REPLACED)
            if (currentEl.isConnected === false) {
                const selector = expected.id ? `#${expected.id}` : (expected.name ? `[name="${expected.name}"]` : null);
                const replacement = selector && form.querySelector ? form.querySelector(selector) : null;
                if (replacement) {
                    logDev(`🛡️ [Integrity] FIELD_NODE_REPLACED: Updated reference for <${expected.tagName} name="${expected.name}">`, "info");
                    currentEl = replacement;
                } else {
                    return { intact: false, reasonCode: 'FIELD_NODE_REPLACED', element: origEl };
                }
            }

            const currentVal = currentEl.contentEditable === 'true' ? (currentEl.textContent || '') : (currentEl.value || '');

            // 2. Check if a previously filled field was cleared or lost
            if (expected.value && expected.value.trim() !== '' && (!currentVal || currentVal.trim() === '')) {
                const lossReason = expected.isRequired ? 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' : 'FIELD_CLEARED_BEFORE_SUBMIT';
                logDev(`🛡️ [Integrity] ${lossReason} detected on <${currentEl.tagName} name="${expected.name}">. Applying targeted same-value repair...`, "warning");

                const authorVal = getAuthoritativeValue(currentEl, expected, tpl);
                if (authorVal) {
                    if (currentEl.contentEditable === 'true') {
                        currentEl.textContent = authorVal;
                    } else {
                        setNativeValue(currentEl, authorVal);
                        currentEl.value = authorVal;
                    }
                    currentEl.dispatchEvent(new Event('input', { bubbles: true }));
                    currentEl.dispatchEvent(new Event('change', { bubbles: true }));
                    repairedCount++;

                    const verifyVal = currentEl.contentEditable === 'true' ? (currentEl.textContent || '') : (currentEl.value || '');
                    if (!verifyVal || verifyVal.trim() === '') {
                        return { intact: false, reasonCode: 'FIELD_REPAIR_FAILED', element: currentEl };
                    }
                } else {
                    return { intact: false, reasonCode: lossReason, element: currentEl };
                }
            }

            // 3. Check checkbox state revert
            if (currentEl.type === 'checkbox' && expected.checked && !currentEl.checked) {
                logDev(`🛡️ [Integrity] FIELD_STATE_REVERTED: Checkbox reverted before submit: ${expected.name}`, "warning");
                setNativeChecked(currentEl, true);
                currentEl.checked = true;
                currentEl.dispatchEvent(new Event('input', { bubbles: true }));
                currentEl.dispatchEvent(new Event('change', { bubbles: true }));
                repairedCount++;
            }
        }

        return { intact: true, repairedCount };
    }

    // ========================================================================
    // SubmitExecutorR5 — Controlled Escalation Submit Ladder (Issue #6 R6.1)
    // ========================================================================
    class SubmitExecutorR5 {
        constructor(form, template = {}, options = {}) {
            this.form = form;
            this.template = template;
            this.options = options;
            this.maxAlternateAttempts = 1;
        }

        // 7.2 Candidate Ranking & Multi-Step Detection
        discoverSubmitActions() {
            const form = this.form;
            const candidates = [];
            const multiStepCandidates = [];
            candidates.multiStepCandidates = multiStepCandidates;
            if (!form) return candidates;

            const selector = 'button[type="submit"], input[type="submit"], input[type="image"], button, [role="button"], [class*="submit"], [id*="submit"], [class*="send"], [id*="send"], [class*="next"], [id*="next"], [class*="continue"]';
            const rawButtons = (typeof querySelectorAllIncludingShadowDOM === 'function')
                ? querySelectorAllIncludingShadowDOM(form, selector)
                : Array.from(form.querySelectorAll ? form.querySelectorAll(selector) : []);

            if (form.id && typeof document !== 'undefined' && document.querySelectorAll) {
                try {
                    const externals = Array.from(document.querySelectorAll('button[form="' + form.id + '"], input[form="' + form.id + '"]'));
                    for (const eb of externals) {
                        if (!rawButtons.includes(eb)) rawButtons.push(eb);
                    }
                } catch (_) {}
            }

            const submitKeywords = ['send', 'submit', 'send message', 'contact us', 'request info', 'inquiry', 'contact', 'register', 'inquire', '보내기', '제출', '전송', '문의하기', '등록', '접수', '送信', '确定', '提交', '입력'];
            const nextKeywords = ['next', 'continue', '다음', '계속', 'step', 'proceed'];
            const rejectKeywords = ['prev', 'back', 'cancel', 'reset', 'clear', 'subscribe', 'newsletter', 'search', 'login', 'sign in', '이전', '취소', '초기화', '지우기'];

            for (const btn of rawButtons) {
                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').toLowerCase().trim();
                const type = (btn.type || '').toLowerCase();
                const cls = (btn.className || '').toLowerCase();
                const id = (btn.id || '').toLowerCase();

                // Strict rejection for search, login, newsletter, cancel, back
                if (rejectKeywords.some(kw => text.includes(kw) || cls.includes(kw))) continue;

                // Check for multi-step Next/Continue
                if (nextKeywords.some(kw => text.includes(kw) || cls.includes(kw))) {
                    multiStepCandidates.push({ button: btn, text });
                    continue;
                }

                let score = 0;
                let rankTier = 4;

                // 1. Native submit button owned by form
                if (type === 'submit' && form.contains(btn)) {
                    rankTier = 1;
                    score = 150;
                }
                // 2. Associated external submitter
                else if (form.id && (btn.getAttribute('form') === form.id)) {
                    rankTier = 2;
                    score = 130;
                }
                // 3. Framework final submit button
                else if (/hs-button|gform_button|wpcf7-submit|wpforms-submit|wixui-button|nf-btn/i.test(cls)) {
                    rankTier = 3;
                    score = 110;
                }
                // 4. Semantic Send/Submit button
                else if (submitKeywords.some(kw => text.includes(kw))) {
                    rankTier = 4;
                    score = 90;
                }
                // 5. General button
                else {
                    rankTier = 5;
                    score = 50;
                }

                if (/submit|send/i.test(cls) || /submit|send/i.test(id)) score += 15;
                if (btn.tagName === 'BUTTON') score += 10;
                if (btn.tagName === 'INPUT' && (type === 'button' || type === 'text')) score -= 20;

                candidates.push({ button: btn, score, rankTier });
            }

            candidates.sort((a, b) => {
                if (a.rankTier !== b.rankTier) return a.rankTier - b.rankTier;
                return b.score - a.score;
            });

            candidates.multiStepCandidates = multiStepCandidates;
            return candidates;
        }

        isDisabled(button) {
            if (!button) return true;
            if (button.disabled) return true;
            if (button.getAttribute && button.getAttribute('aria-disabled') === 'true') return true;
            const cls = (button.className || '').toLowerCase();
            if (/\b(disabled|is-disabled|btn-disabled|loading)\b/.test(cls)) return true;
            if (button.style && (button.style.pointerEvents === 'none' || button.style.opacity === '0')) return true;
            return false;
        }

        // 7.4 Disabled submit repair: identify exact blocking required field, repair only that field, commit/blur
        async repairActivation(button) {
            if (!button) return;
            const form = this.form;
            const tpl = this.template || {};

            logDev("🛡️ [SubmitExecutorR5] Submit button is disabled. Running targeted blocking-field repair...", "info");

            if (form && form.querySelectorAll) {
                // Find invalid fields or empty required fields
                const invalidInputs = Array.from(form.querySelectorAll(':invalid, [aria-invalid="true"]'));
                for (const inp of invalidInputs) {
                    try {
                        if (inp.type === 'checkbox') {
                            const ctx = ((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.getAttribute('aria-label') || '')).toLowerCase();
                            if (!/newsletter|marketing|sms|promo|subscribe/i.test(ctx)) {
                                setNativeChecked(inp, true);
                                inp.checked = true;
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                                if (typeof inp.blur === 'function') inp.blur();
                            }
                        } else if (inp.tagName === 'SELECT') {
                            if (inp.options && inp.options.length > 1 && inp.selectedIndex <= 0) {
                                inp.selectedIndex = 1;
                                setNativeValue(inp, inp.options[1].value);
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                                if (typeof inp.blur === 'function') inp.blur();
                            }
                        } else if (!inp.value || inp.value.trim() === '') {
                            const authorVal = getAuthoritativeValue(inp, { type: inp.type, name: inp.name }, tpl);
                            if (authorVal) {
                                setNativeValue(inp, authorVal);
                                inp.value = authorVal;
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                                inp.dispatchEvent(new Event('change', { bubbles: true }));
                                if (typeof inp.blur === 'function') inp.blur();
                            }
                        }
                    } catch (_) {}
                }
            }

            // Wait 350ms for framework state commit
            await new Promise(r => setTimeout(r, 350));

            // Recheck button
            if (this.isDisabled(button)) {
                logDev("⚠️ [SubmitExecutorR5] Submit button remains disabled after targeted blocking field repair pass", "warning");
            }
        }

        checkPointerHit(submitter) {
            if (!submitter) return { clickable: false, reason: 'NO_SUBMITTER' };
            if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
                return { clickable: true, submitter, hit: submitter, isDescendant: true };
            }
            try {
                if (typeof submitter.getBoundingClientRect !== 'function') {
                    return { clickable: true, submitter, hit: submitter, isDescendant: true };
                }
                const rect = submitter.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                if (cx < 0 || cy < 0 || (typeof window !== 'undefined' && (cx > window.innerWidth || cy > window.innerHeight))) {
                    return { clickable: true, submitter, hit: submitter, isDescendant: true };
                }

                const hit = document.elementFromPoint(cx, cy);
                if (!hit) {
                    return { clickable: true, submitter, hit: submitter, isDescendant: true };
                }

                // [Issue #6 R6.5 Bug A Section C] elementFromPoint descendant handling
                // Consider submitter clickable if:
                // hit === submitter OR submitter.contains(hit) OR hit.closest(validSubmitterSelector) === submitter
                const isDescendant = (hit === submitter) ||
                    (typeof submitter.contains === 'function' && submitter.contains(hit)) ||
                    (typeof hit.closest === 'function' && hit.closest('button, input[type="submit"], input[type="button"], [role="button"]') === submitter);

                if (isDescendant) {
                    logDev(`[SUBMIT_HITTEST] submitter=${submitter.tagName || 'BTN'} id=${submitter.id || 'none'}`);
                    logDev(`[SUBMIT_HITTEST] hit=${hit.tagName || 'EL'} id=${hit.id || 'none'}`);
                    logDev(`[SUBMIT_HITTEST] descendant=true`);
                    logDev(`[SUBMIT_HITTEST] verdict=CLICKABLE`);
                    return { clickable: true, submitter, hit, isDescendant: true };
                }

                // [Issue #6 R6.5 Bug A Section D] Blocker must be proven
                const hitStyle = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(hit) : (hit.style || {});
                const pointerEvents = hitStyle.pointerEvents || 'auto';
                const display = hitStyle.display || 'block';
                const visibility = hitStyle.visibility || 'visible';
                const opacity = parseFloat(hitStyle.opacity !== undefined ? hitStyle.opacity : '1');

                if (pointerEvents === 'none' || display === 'none' || visibility === 'hidden' || opacity === 0) {
                    logDev(`[SUBMIT_HITTEST] submitter=${submitter.tagName || 'BTN'} id=${submitter.id || 'none'}`);
                    logDev(`[SUBMIT_HITTEST] hit=${hit.tagName || 'EL'} id=${hit.id || 'none'}`);
                    logDev(`[SUBMIT_HITTEST] descendant=false`);
                    logDev(`[SUBMIT_HITTEST] verdict=CLICKABLE reason=blocker_non_interactive`);
                    return { clickable: true, submitter, hit, isDescendant: false };
                }

                const blockerZ = hitStyle.zIndex || 'auto';
                const subStyle = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(submitter) : (submitter.style || {});
                const submitterZ = subStyle.zIndex || 'auto';
                const blockerPosition = hitStyle.position || 'static';

                logDev(`[SUBMIT_HITTEST] submitter=${submitter.tagName || 'BTN'} id=${submitter.id || 'none'}`);
                logDev(`[SUBMIT_HITTEST] hit=${hit.tagName || 'EL'} id=${hit.id || 'none'} cls=${hit.className || 'none'}`);
                logDev(`[SUBMIT_HITTEST] descendant=false`);
                logDev(`[SUBMIT_HITTEST] blockerPosition=${blockerPosition}`);
                logDev(`[SUBMIT_HITTEST] blockerZ=${blockerZ}`);
                logDev(`[SUBMIT_HITTEST] submitterZ=${submitterZ}`);
                logDev(`[SUBMIT_HITTEST] verdict=BLOCKED`);

                return { clickable: false, submitter, hit, blocker: hit, isDescendant: false };
            } catch (_) {
                return { clickable: true, submitter, hit: submitter, isDescendant: true };
            }
        }

        async safeDismissOverlay(blocker) {
            if (!blocker) return false;
            try {
                const overlayCls = ((blocker.className || '') + ' ' + (blocker.id || '')).toLowerCase();
                const closeBtn = blocker.querySelector ? blocker.querySelector('.close, [aria-label*="close" i], button.dismiss, button.accept, #accept-cookies, [id*="cookie" i] button, [class*="cookie" i] button') : null;
                if (closeBtn && typeof closeBtn.click === 'function') {
                    logDev("🛡️ [SubmitExecutorR5] Safe overlay dismissal: dismissing modal/cookie consent banner", "info");
                    closeBtn.click();
                    await new Promise(r => setTimeout(r, 150));
                    return true;
                }
            } catch (_) {}
            return false;
        }

        async handleOverlay(submitter) {
            if (!submitter) return { ok: false, reason: 'NO_SUBMITTER' };
            try {
                if (typeof submitter.scrollIntoView === 'function') {
                    submitter.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 100));
                }
                const hitRes = this.checkPointerHit(submitter);
                if (hitRes && !hitRes.clickable && hitRes.blocker) {
                    await this.safeDismissOverlay(hitRes.blocker);
                    const recheck = this.checkPointerHit(submitter);
                    if (recheck && !recheck.clickable) {
                        return { ok: false, reason: 'SUBMIT_CLICK_BLOCKED_BY_OVERLAY' };
                    }
                }
            } catch (_) {}
            return { ok: true };
        }

        // 7.1 Pre-submit readiness pass
        async checkPreSubmitReadiness(expectedSnapshot) {
            const form = this.form;
            if (!form) return { ready: false, reasonCode: 'NO_FORM' };

            // 1. Field integrity check
            if (expectedSnapshot && typeof verifyFieldIntegrity === 'function') {
                const integrity = verifyFieldIntegrity(form, expectedSnapshot, this.template);
                if (!integrity.intact) {
                    return { ready: false, reasonCode: integrity.reasonCode || 'FIELD_INTEGRITY_COMPROMISED' };
                }
            }

            // 2. checkValidity
            if (typeof form.checkValidity === 'function') {
                let isValid = false;
                try { isValid = form.checkValidity(); } catch (_) { isValid = true; }
                if (!isValid) {
                    return { ready: false, reasonCode: 'VALIDATION_FAILED' };
                }
            }

            // 3. No visible field-level error messages
            if (typeof document !== 'undefined' && form.querySelectorAll) {
                const visibleErrors = Array.from(form.querySelectorAll('.error, .invalid, [aria-invalid="true"], .wpcf7-not-valid-tip, .gfield_error'))
                    .filter(el => typeof elementIsVisible === 'function' ? elementIsVisible(el) : true);
                if (visibleErrors.length > 0) {
                    logDev(`⚠️ [PreSubmitReadiness] Visible field errors detected (${visibleErrors.length})`, "warning");
                }
            }

            return { ready: true };
        }

        // 7.3 Activation ladder
        async execute() {
            const form = this.form;
            const tpl = this.template || {};
            const options = this.options || {};

            // Stop stabilizers & sweepers
            stopActiveEmptyFieldSweeper();
            if (tpl && typeof tpl.stop === 'function') {
                try { tpl.stop(); } catch(_) {}
            }

            // Blur active input
            if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
                try { document.activeElement.blur(); } catch(_) {}
            }

            // Pre-submit readiness check
            const readiness = await this.checkPreSubmitReadiness(options.expectedSnapshot);
            if (!readiness.ready && readiness.reasonCode === 'FIELD_INTEGRITY_COMPROMISED') {
                logDev(`❌ [SubmitExecutorR5] Pre-submit readiness failed: ${readiness.reasonCode}`, "error");
                return { success: false, reasonCode: readiness.reasonCode };
            }

            let submitEventFired = false;
            const onSubmit = () => { submitEventFired = true; };
            if (form && typeof form.addEventListener === 'function') {
                form.addEventListener('submit', onSubmit, { once: true });
            }

            // Candidate discovery
            const candidates = this.discoverSubmitActions();
            const multiStepCandidates = (candidates && candidates.multiStepCandidates) || [];
            const primary = candidates.length > 0 ? candidates[0].button : null;
            const alternate = candidates.length > 1 ? candidates[1].button : null;

            if (primary) {
                if (this.isDisabled(primary)) {
                    await this.repairActivation(primary);
                }

                // If still disabled after repair, unlock for activation pass
                if (this.isDisabled(primary)) {
                    logDev("🔓 [SubmitExecutorR5] Unlocking disabled submit button for execution...", "info");
                    try {
                        primary.removeAttribute('disabled');
                        primary.disabled = false;
                        primary.removeAttribute('aria-disabled');
                        primary.classList.remove('disabled', 'is-disabled', 'btn-disabled');
                        if (primary.style) {
                            primary.style.pointerEvents = 'auto';
                            if (primary.style.opacity === '0') primary.style.opacity = '1';
                        }
                    } catch (_) {}
                }

                // [Issue #6 R6 SUBMIT-R2-1] If still disabled after repair, handle per observeDisabledMs option
                if (this.isDisabled(primary) && options.observeDisabledMs > 0) {
                    const observeMs = options.observeDisabledMs;
                    const pollInterval = 50;
                    const deadline = Date.now() + observeMs;
                    while (Date.now() < deadline) {
                        await new Promise(r => setTimeout(r, pollInterval));
                        if (!this.isDisabled(primary)) break;
                    }
                    // After exhausting the wait window: if still disabled, fail with specific reason
                    if (this.isDisabled(primary)) {
                        return { success: false, reasonCode: 'SUBMIT_BUTTON_NEVER_ENABLED', strategy: 'none', submitEventFired: false };
                    }
                }

                // [Issue #6 R6.6 Wix/Custom Form Adapter]
                const isWixOrCustom = form && (
                    (form.id && form.id.includes('comp-')) ||
                    (form.className && typeof form.className === 'string' && form.className.includes('wix')) ||
                    (primary && (primary.textContent || '').trim().match(/^(send|submit|보내기|제출)$/i)) ||
                    form.tagName !== 'FORM'
                );

                if (isWixOrCustom && !this.isDisabled(primary) && primary) {
                    try {
                        if (typeof primary.scrollIntoView === 'function') primary.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        if (typeof primary.click === 'function') primary.click();
                        if (!submitEventFired) _dispatchSingleClickSequence(primary);
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'wix_adapter_click', submitEventFired: true };
                        }
                    } catch (_) {}
                }

                // [Issue #6 R6.5 Section 5: SUBMIT FAILURE RECOVERY ORDER]
                // 1. requestSubmit(submitter) — visual overlay is irrelevant to requestSubmit
                if (!this.isDisabled(primary) && form && form.tagName === 'FORM' && typeof form.requestSubmit === 'function') {
                    try {
                        form.requestSubmit(primary);
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'requestSubmit', submitEventFired: true };
                        }
                    } catch (e) {
                        logDev(`⚠️ [SubmitExecutorR5] requestSubmit threw: ${e.message}`, "warning");
                    }
                }

                // 2. if zero effect -> submitter.click() once (direct click does not require pointer hit testing)
                if (!this.isDisabled(primary) && primary && typeof primary.click === 'function') {
                    try {
                        primary.click();
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'button_click', submitEventFired: true };
                        }
                    } catch (_) {}
                }

                // 3. if zero effect -> check pointer hit-test & fresh candidate re-query
                const hitTest = this.checkPointerHit(primary);
                if (!hitTest.clickable && hitTest.blocker) {
                    // 4. if blocker exists -> safe overlay dismissal once
                    await this.safeDismissOverlay(hitTest.blocker);
                    // 5. re-query candidate
                    const freshCandidates = this.discoverSubmitActions();
                    const freshPrimary = freshCandidates.length > 0 ? freshCandidates[0].button : primary;
                    // 6. retry ONE activation
                    if (freshPrimary && !this.isDisabled(freshPrimary)) {
                        if (form && form.tagName === 'FORM' && typeof form.requestSubmit === 'function') {
                            try { form.requestSubmit(freshPrimary); } catch (_) {}
                        }
                        if (!submitEventFired && typeof freshPrimary.click === 'function') {
                            try { freshPrimary.click(); } catch (_) {}
                        }
                        if (!submitEventFired) {
                            try { _dispatchSingleClickSequence(freshPrimary); } catch (_) {}
                        }
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'retry_after_overlay_dismiss', submitEventFired: true };
                        }
                    }
                } else if (!this.isDisabled(primary)) {
                    // Pointer simulation fallback on primary
                    try {
                        _dispatchSingleClickSequence(primary);
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'pointer_events', submitEventFired: true };
                        }
                    } catch (_) {}

                    // Keyboard Enter fallback
                    try {
                        if (typeof primary.focus === 'function') primary.focus();
                        const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
                        primary.dispatchEvent(enterEvt);
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'keyboard_enter', submitEventFired: true };
                        }
                    } catch (_) {}
                }

                // 7. try one alternate valid submitter
                if (!submitEventFired && alternate && !this.isDisabled(alternate)) {
                    try {
                        if (typeof alternate.click === 'function') alternate.click();
                        if (!submitEventFired) _dispatchSingleClickSequence(alternate);
                        if (submitEventFired) {
                            return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'alternate_candidate_click', submitEventFired: true };
                        }
                    } catch (_) {}
                }

                // [R6.7 VisionSubmitExecutor - Bounded Last Resort]
                if (_VisionSubmitExecutor && !this._hasDispatchedVisionClick && this.options && this.options.allowVisionSubmit) {
                    try {
                        logDev("👁️ [VisionSubmit] Initiating VisionSubmitExecutor last-resort activation...", "info");
                        const visionExecutor = new _VisionSubmitExecutor();
                        const vResult = await visionExecutor.execute(form, { previousPhysicalClick: this._hasDispatchedVisionClick });
                        if (vResult.physicalClickDispatched) {
                            this._hasDispatchedVisionClick = true;
                            if (vResult.success) {
                                return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'vision_coordinate_click', submitEventFired: true, commitSignal: vResult.commitSignal };
                            }
                        }
                    } catch (vErr) {
                        logDev(`⚠️ [VisionSubmit] Error: ${vErr.message}`, "warning");
                    }
                }

                // 8. only then terminal SUBMIT_ACTIVATION_EXHAUSTED or SUBMIT_CLICK_BLOCKED_BY_OVERLAY
                if (submitEventFired) {
                    return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'button_click', submitEventFired: true };
                }
                if (hitTest && !hitTest.clickable) {
                    return { success: false, reasonCode: 'SUBMIT_CLICK_BLOCKED_BY_OVERLAY', strategy: 'none', submitEventFired: false };
                }
                return { success: false, reasonCode: 'SUBMIT_ACTIVATION_EXHAUSTED', strategy: 'none', submitEventFired: false };
            } else if (multiStepCandidates.length > 0) {
                // Multi-step form support: Bounded max 5 steps
                logDev("🔄 [SubmitExecutorR5] Multi-step form detected (Next/Continue button)", "info");
                const nextBtn = multiStepCandidates[0].button;
                if (!this.isDisabled(nextBtn)) {
                    _dispatchSingleClickSequence(nextBtn);
                    return { success: true, reasonCode: 'MULTI_STEP_ADVANCED', strategy: 'multi_step_next', isMultiStep: true };
                }
            } else {
                if (form && form.tagName === 'FORM' && typeof form.requestSubmit === 'function') {
                    try {
                        form.requestSubmit();
                        return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'requestSubmit_no_button', submitEventFired: true };
                    } catch (_) {}
                }
            }

            // Stage E: FORCED_FORM_SUBMIT_LAST_RESORT (private-mode opt-in only)
            if (this.options && this.options.allowForcedNativeSubmit && form && typeof form.submit === 'function' && readiness.ready) {
                logDev("⚠️ [SubmitExecutorR5] FORCED_FORM_SUBMIT_LAST_RESORT executing...", "warning");
                try {
                    form.submit();
                    return { success: true, reasonCode: 'SUBMIT_TRIGGERED', strategy: 'FORCED_FORM_SUBMIT_LAST_RESORT', submitEventFired: true };
                } catch (_) {}
            }

            return {
                success: submitEventFired,
                reasonCode: submitEventFired ? 'SUBMIT_TRIGGERED' : 'SUBMIT_CANDIDATE_NOT_FOUND',
                strategy: submitEventFired ? 'event_bridge' : 'none',
                submitEventFired
            };
        }
    }

    const SubmitExecutorR4 = SubmitExecutorR5; // Backwards compatibility alias
    const SubmitExecutorR3 = SubmitExecutorR5; // Backwards compatibility alias

    async function executeSubmitStateMachine(form, template = {}, options = {}) {
        const executor = new SubmitExecutorR5(form, template, options);
        return await executor.execute();
    }

    function _dispatchSingleClickSequence(el) {
        if (!el) return;
        try {
            if (typeof PointerEvent !== 'undefined') {
                el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            }
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            if (typeof PointerEvent !== 'undefined') {
                el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
            }
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            el.click();
        } catch (_) {
            try { el.click(); } catch (_) {}
        }
    }

    function submitForm(form) {
        return executeSubmitStateMachine(form);
    }

    // ============================================================
    // [Section C & Hotfix R2 / R6.9D] Submission Outcome Verifier (Target-Scoped)
    // ============================================================
    function getElementSignature(el) {
        if (!el) return 'null';
        try {
            const tag = (el.tagName || '').toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const name = (el.getAttribute && el.getAttribute('name')) || el.name ? `[name="${(el.getAttribute && el.getAttribute('name')) || el.name}"]` : '';
            let cls = '';
            if (el.className && typeof el.className === 'string') {
                cls = '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
            }
            return `${tag}${id}${name}${cls}`;
        } catch (_) {
            return 'element';
        }
    }

    const SERVER_ERROR_PATTERNS = [
        '500 internal server error',
        'internal server error',
        'an error occurred while processing',
        'submission failed',
        'could not send message',
        'failed to send message',
        'could not be sent',
        'error occurred while submitting',
        'cannot send message',
        'processing error',
        '서버 오류',
        '전송에 실패했습니다',
        '오류가 발생했습니다'
    ];

    class SubmissionOutcomeVerifier {
        constructor(form, template = {}, options = {}) {
            this.form = form;
            this.template = template;
            this.options = options;
            this.submitEventSeen = false;
            this.preSnapshot = null;
            this.startTime = 0;
            this.observer = null;
            this.decisiveOutcome = null;
            this._onSubmit = () => { this.submitEventSeen = true; };
            this.pollCount = 0;
            this.domServerErrorFirstSeen = null;
            this.domServerErrorPolls = 0;
        }

        prepare() {
            this.startTime = Date.now();
            this.submitEventSeen = false;
            this.lastMutationTime = Date.now();
            this.mutationCount = 0;
            this.domServerErrorFirstSeen = null;
            this.domServerErrorPolls = 0;
            this.preSnapshot = this.capturePreSubmitSnapshot();

            if (this.form && typeof this.form.addEventListener === 'function') {
                this.form.addEventListener('submit', this._onSubmit, { once: true, capture: true });
            }
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                document.addEventListener('submit', this._onSubmit, { once: true, capture: true });
            }

            if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
                try {
                    this.observer = new MutationObserver((mutations) => {
                        this.lastMutationTime = Date.now();
                        this.mutationCount += (mutations ? mutations.length : 1);
                        if (!this.decisiveOutcome) {
                            const quick = this.evaluateSignals();
                            if (quick && (quick.isDecisiveSuccess || quick.isDecisiveFailure)) {
                                this.decisiveOutcome = quick;
                            }
                        }
                    });
                    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
                } catch (_) {}
            }
        }

        cleanup() {
            if (this.observer) {
                try { this.observer.disconnect(); } catch (_) {}
                this.observer = null;
            }
            if (this.form && typeof this.form.removeEventListener === 'function') {
                this.form.removeEventListener('submit', this._onSubmit, { capture: true });
            }
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('submit', this._onSubmit, { capture: true });
            }
        }

        capturePreSubmitSnapshot() {
            const url = (typeof window !== 'undefined') ? window.location.href : '';
            const formSignature = this.form ? (this.form.id || this.form.className || this.form.name || 'form') : 'no_form';

            let visibleErrorsCount = 0;
            if (this.form && this.form.querySelectorAll) {
                try {
                    const errEls = this.form.querySelectorAll('.error, .invalid, [aria-invalid="true"], :invalid');
                    for (const el of errEls) {
                        if (typeof elementIsVisible === 'function' ? elementIsVisible(el) : true) visibleErrorsCount++;
                    }
                } catch (_) {}
            }

            const successContainers = (typeof document !== 'undefined' && document.querySelectorAll) ?
                document.querySelectorAll('[data-testid*="success"], [class*="success"], [id*="success"], [role="alert"], [role="status"], .wixui-rich-text, .status-msg, .message-success') : [];
            const existingSuccessTexts = new Set();
            for (const el of successContainers) {
                if (typeof elementIsVisible === 'function' ? elementIsVisible(el) : true) {
                    existingSuccessTexts.add((el.textContent || '').trim().toLowerCase());
                }
            }

            const successCandidates = (typeof document !== 'undefined' && document.querySelectorAll) ?
                Array.from(document.querySelectorAll('[data-testid*="success"], [class*="success"], [id*="success"], [role="alert"], [role="status"], .wixui-rich-text, .status-msg, .message-success, div, p, span'))
                    .filter(el => {
                        const t = (el.textContent || '').trim().toLowerCase();
                        return /thank you|thanks|message has been sent|successfully sent|문의가 정상적으로|접수되었습니다|감사합니다/i.test(t);
                    }) : [];

            const successSnapshots = successCandidates.map(node => ({
                node,
                text: (node.textContent || '').trim(),
                wasVisible: typeof elementIsVisible === 'function' ? elementIsVisible(node) : false
            }));
            const visibleBefore = successSnapshots.filter(s => s.wasVisible).length;
            console.log(`[SUCCESS_SNAPSHOT] candidates=${successSnapshots.length} visibleBefore=${visibleBefore}`);

            // [R6.9D] Delta-based Negative Signals Pre-Snapshot
            const preBodyText = (typeof document !== 'undefined' && document.body) ? (document.body.textContent || '').toLowerCase() : '';
            const serverErrorPhrases = new Set();
            for (const p of SERVER_ERROR_PATTERNS) {
                if (preBodyText.includes(p)) serverErrorPhrases.add(p);
            }

            const serverErrorNodes = [];
            if (typeof document !== 'undefined' && document.querySelectorAll) {
                try {
                    const allTextNodes = document.querySelectorAll('[role="alert"], [role="status"], .status-msg, .error, .message-error, .server-error, div, p, span');
                    for (const node of allTextNodes) {
                        const txt = (node.textContent || '').trim().toLowerCase();
                        if (!txt) continue;
                        const matched = SERVER_ERROR_PATTERNS.find(p => txt.includes(p));
                        if (matched) {
                            const wasVis = typeof elementIsVisible === 'function' ? elementIsVisible(node) : false;
                            serverErrorNodes.push({
                                node,
                                text: txt,
                                phrase: matched,
                                wasVisible: wasVis,
                                signature: getElementSignature(node)
                            });
                        }
                    }
                } catch (_) {}
            }

            const visibleValidationSignatures = new Set();
            const validationTexts = new Set();
            const validationNodes = [];
            if (typeof document !== 'undefined' && document.querySelectorAll) {
                try {
                    const vEls = document.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"], :invalid, .wpcf7-not-valid-tip, .gfield_error, .form-error, .help-block-error, .field-error');
                    for (const el of vEls) {
                        const isVis = typeof elementIsVisible === 'function' ? elementIsVisible(el) : false;
                        const txt = (el.textContent || '').trim().toLowerCase();
                        if (SERVER_ERROR_PATTERNS.some(p => txt.includes(p))) continue;
                        const isAria = (el.getAttribute && el.getAttribute('aria-invalid') === 'true');
                        const isNative = !!(el.validity && !el.validity.valid);
                        const sig = getElementSignature(el);
                        if (isVis) {
                            visibleValidationSignatures.add(sig);
                            if (txt) validationTexts.add(txt);
                        }
                        validationNodes.push({
                            node: el,
                            wasVisible: isVis,
                            ariaInvalid: isAria,
                            nativeInvalid: isNative,
                            text: txt,
                            signature: sig
                        });
                    }
                } catch (_) {}
            }

            const negativeSignals = {
                visibleErrorSignatures: visibleValidationSignatures,
                validationTexts,
                validationNodes,
                serverErrorPhrases,
                serverErrorNodes,
                bodyText: preBodyText
            };

            return {
                url,
                formSignature,
                visibleErrorsCount,
                bodyText: preBodyText,
                existingSuccessTexts: Array.from(existingSuccessTexts),
                successSnapshots,
                negativeSignals
            };
        }

        evaluateSignals(submitOutcome = {}) {
            const currentUrl = (typeof window !== 'undefined') ? window.location.href : '';
            const initialUrl = this.preSnapshot ? this.preSnapshot.url : '';
            const urlChanged = (currentUrl !== initialUrl);

            // 1. URL / Navigation Strong Signal (Issue #6 R6.8 P0-3 & P0-4: /search/ is strictly negative)
            const successUrlKeywords = ['thank', 'thanks', 'success', 'confirm', 'submitted', 'message-sent', 'complete'];
            const isSearchUrl = currentUrl.toLowerCase().includes('/search') || currentUrl.toLowerCase().includes('search=') || currentUrl.toLowerCase().includes('q=') || currentUrl.toLowerCase().includes('help.shopify.com');
            const isSuccessUrl = urlChanged && !isSearchUrl && successUrlKeywords.some(k => currentUrl.toLowerCase().includes(k));

            // [R6.9D] 2. Negative / Error Signals (Delta / Transition Based)
            let newErrorsFound = false;
            let validationErrorsCount = 0;
            let validationErrorTransition = false;
            let serverErrorFound = false;
            let serverErrorTransition = false;
            let actualTransportFailure = false;
            let domServerErrorTransition = false;
            let matchedServerError = 'none';

            const elapsedNow = this.startTime ? (Date.now() - this.startTime) : 0;

            // 2a. Actual transport failure (networkStatus >= 400 or transport rejection)
            if (submitOutcome) {
                const nStatus = submitOutcome.networkStatus !== undefined ? submitOutcome.networkStatus : null;
                const isNet5xx = (typeof nStatus === 'number' && nStatus >= 500);
                const isNet4xx = (typeof nStatus === 'number' && nStatus >= 400);
                const isFrameworkReject = !!(submitOutcome.transportRejected || submitOutcome.fetchRejected || submitOutcome.promiseRejected || submitOutcome.transportStatus === 'FAILED' || submitOutcome.transportStatus === 'REJECTED');

                if (isNet5xx || isNet4xx || isFrameworkReject) {
                    actualTransportFailure = true;
                    serverErrorFound = true;
                    serverErrorTransition = true;
                    matchedServerError = isNet5xx ? `HTTP_${nStatus}` : (isNet4xx ? `HTTP_${nStatus}_REJECT` : 'FRAMEWORK_TRANSPORT_REJECTED');
                    logDev(`[NEGATIVE_SIGNAL] type=SERVER_ERROR source=NETWORK phrase="${matchedServerError}" preExisting=false transition=true visible=true firstSeenMs=${elapsedNow}`, 'error');
                }
            }

            // 2b. DOM Server Error Transition (Only if no actual transport failure already asserted)
            if (!actualTransportFailure && typeof document !== 'undefined') {
                const preServerErrorPhrases = (this.preSnapshot && this.preSnapshot.negativeSignals && this.preSnapshot.negativeSignals.serverErrorPhrases) || 
                    (this.preSnapshot && this.preSnapshot.bodyText ? new Set(SERVER_ERROR_PATTERNS.filter(p => this.preSnapshot.bodyText.includes(p))) : new Set());
                const preServerErrorNodes = (this.preSnapshot && this.preSnapshot.negativeSignals && this.preSnapshot.negativeSignals.serverErrorNodes) || [];

                // Check if hidden pre-existing server-error node transitioned to visible
                for (const sn of preServerErrorNodes) {
                    const nowVisible = typeof elementIsVisible === 'function' ? elementIsVisible(sn.node) : true;
                    if (!sn.wasVisible && nowVisible) {
                        domServerErrorTransition = true;
                        serverErrorFound = true;
                        serverErrorTransition = true;
                        matchedServerError = sn.phrase;
                        logDev(`[NEGATIVE_SIGNAL] type=SERVER_ERROR source=DOM phrase="${sn.phrase}" preExisting=false transition=true visible=true firstSeenMs=${elapsedNow}`, 'error');
                        break;
                    }
                }

                // Check visible nodes in DOM
                if (!domServerErrorTransition) {
                    const candidateEls = document.querySelectorAll ?
                        document.querySelectorAll('[role="alert"], [role="status"], .status-msg, .error, .message-error, .server-error, .alert-danger, div, p, span') : [];
                    for (const el of candidateEls) {
                        const nowVis = typeof elementIsVisible === 'function' ? elementIsVisible(el) : true;
                        if (!nowVis) continue;
                        const txt = (el.textContent || '').trim().toLowerCase();
                        if (!txt) continue;
                        const matched = SERVER_ERROR_PATTERNS.find(p => txt.includes(p));
                        if (matched) {
                            const sig = getElementSignature(el);
                            const preMatch = preServerErrorNodes.find(pn => pn.node === el || (pn.signature === sig && pn.phrase === matched));
                            const preExistingInBody = preServerErrorPhrases.has(matched);

                            if (preMatch && preMatch.wasVisible) {
                                // Pre-existing visible error unchanged
                                logDev(`[NEGATIVE_SIGNAL] type=SERVER_ERROR source=DOM phrase="${matched}" preExisting=true transition=false visible=true firstSeenMs=${elapsedNow}`, 'info');
                            } else if (!preExistingInBody || (preMatch && !preMatch.wasVisible)) {
                                // Real new transition!
                                domServerErrorTransition = true;
                                serverErrorFound = true;
                                serverErrorTransition = true;
                                matchedServerError = matched;
                                logDev(`[NEGATIVE_SIGNAL] type=SERVER_ERROR source=DOM phrase="${matched}" preExisting=false transition=true visible=true firstSeenMs=${elapsedNow}`, 'error');
                                break;
                            } else {
                                // Was in body text pre-submit, emit preExisting=true
                                logDev(`[NEGATIVE_SIGNAL] type=SERVER_ERROR source=DOM phrase="${matched}" preExisting=true transition=false visible=true firstSeenMs=${elapsedNow}`, 'info');
                            }
                        }
                    }
                }
            }

            // 2c. Validation Errors (Delta based)
            if (typeof document !== 'undefined' && document.querySelectorAll) {
                const preValidationNodes = (this.preSnapshot && this.preSnapshot.negativeSignals && this.preSnapshot.negativeSignals.validationNodes) || [];

                const errEls = document.querySelectorAll('[role="alert"], .error, .invalid, [aria-invalid="true"], :invalid, .wpcf7-not-valid-tip, .gfield_error, .form-error, .help-block-error, .field-error');
                for (const el of errEls) {
                    const isVis = typeof elementIsVisible === 'function' ? elementIsVisible(el) : true;
                    if (!isVis) continue;

                    const txt = (el.textContent || '').trim().toLowerCase();
                    const isAria = (el.getAttribute && el.getAttribute('aria-invalid') === 'true');
                    const isNative = !!(el.validity && !el.validity.valid);
                    const isErrorText = /error|failed|please correct|try again|required|invalid|문제|오류|실패/i.test(txt);
                    if (SERVER_ERROR_PATTERNS.some(p => txt.includes(p))) continue;

                    if (!isErrorText && !isAria && !isNative) continue;

                    const sig = getElementSignature(el);
                    const preMatch = preValidationNodes.find(pn => pn.node === el || pn.signature === sig);

                    if (preMatch && preMatch.wasVisible) {
                        const ariaTransition = (!preMatch.ariaInvalid && isAria);
                        const nativeTransition = (!preMatch.nativeInvalid && isNative);
                        const textTransition = (preMatch.text !== txt && isErrorText);

                        if (ariaTransition || nativeTransition || textTransition) {
                            validationErrorsCount++;
                            newErrorsFound = true;
                            validationErrorTransition = true;
                            logDev(`[NEGATIVE_SIGNAL] type=VALIDATION selector="${sig}" preExisting=false transition=true`, 'warning');
                        } else {
                            logDev(`[NEGATIVE_SIGNAL] type=VALIDATION selector="${sig}" preExisting=true transition=false`, 'info');
                        }
                    } else if (preMatch && !preMatch.wasVisible) {
                        validationErrorsCount++;
                        newErrorsFound = true;
                        validationErrorTransition = true;
                        logDev(`[NEGATIVE_SIGNAL] type=VALIDATION selector="${sig}" preExisting=false transition=true`, 'warning');
                    } else {
                        validationErrorsCount++;
                        newErrorsFound = true;
                        validationErrorTransition = true;
                        logDev(`[NEGATIVE_SIGNAL] type=VALIDATION selector="${sig}" preExisting=false transition=true`, 'warning');
                    }
                }
            }

            // 3. Preexisting success node visibility transition (R6.6 & R6.7 & R6.9A)
            let successVisibilityTransition = false;
            if (this.preSnapshot && this.preSnapshot.successSnapshots) {
                for (const s of this.preSnapshot.successSnapshots) {
                    if (!s.wasVisible) {
                        const nowVisible = typeof elementIsVisible === 'function' ? elementIsVisible(s.node) : true;
                        if (nowVisible) {
                            console.log(`[SUCCESS_TRANSITION] node=${s.node.tagName}#${s.node.id || 'none'} beforeVisible=false afterVisible=true`);
                            logDev(`[SUCCESS_TRANSITION] node=${s.node.tagName}#${s.node.id || 'none'} beforeVisible=false afterVisible=true`, 'success');
                            successVisibilityTransition = true;
                            break;
                        }
                    }
                }
            }

            // 4. Strong DOM Success Signals
            const commonSuccessKeywords = [
                'thank you', 'thanks', '완료되었습니다', '성공적으로', '전송되었습니다', '제출되었습니다',
                '접수되었습니다', '감사합니다', '문의가 접수', 'message sent', 'your message has been sent',
                'successfully submitted', 'submission received', 'we received your message', 'we\'ll be in touch',
                'ありがとうございます', '送信完了', '受け付けました', '提交成功', 'vielen dank', 'gesendet', 'erfolgreich', 'merci'
            ];

            // 4a. aria-live / role=status / role=alert success transition (R6.9A)
            let ariaLiveSuccessTransition = false;
            if (typeof document !== 'undefined' && document.querySelectorAll) {
                const liveNodes = document.querySelectorAll('[aria-live], [role="status"], [role="alert"]');
                for (const node of liveNodes) {
                    if (typeof elementIsVisible === 'function' && !elementIsVisible(node)) continue;
                    const txt = (node.textContent || '').trim().toLowerCase();
                    if (!txt) continue;
                    if (this.preSnapshot && this.preSnapshot.existingSuccessTexts && this.preSnapshot.existingSuccessTexts.includes(txt)) continue;
                    if (commonSuccessKeywords.some(k => txt.includes(k))) {
                        ariaLiveSuccessTransition = true;
                        break;
                    }
                }
            }

            let newSuccessNodes = 0;
            const frameworkSuccessSelectors = [
                '.gform_confirmation_message',
                '.wpcf7-mail-sent-ok',
                '.wpcf7-response-output.wpcf7-mail-sent-ok',
                '.wpforms-confirmation-container',
                '.submitted-message',
                '.nf-response-msg',
                '[role="alert"]',
                '[role="status"]',
                '[aria-live="polite"]',
                '[aria-live="assertive"]',
                '[data-testid*="success"]',
                '[class*="success"]',
                '[id*="success"]',
                '.message-success'
            ];

            if (typeof document !== 'undefined' && document.querySelectorAll) {
                const nodes = document.querySelectorAll(frameworkSuccessSelectors.join(', '));
                for (const node of nodes) {
                    if (typeof elementIsVisible === 'function' && !elementIsVisible(node)) continue;
                    const txt = (node.textContent || '').trim().toLowerCase();
                    if (!txt) continue;
                    if (this.preSnapshot && this.preSnapshot.existingSuccessTexts && this.preSnapshot.existingSuccessTexts.includes(txt)) continue;

                    if (commonSuccessKeywords.some(k => txt.includes(k)) || 
                        node.classList.contains('gform_confirmation_message') ||
                        node.classList.contains('wpcf7-mail-sent-ok') ||
                        node.classList.contains('wpforms-confirmation-container') ||
                        node.classList.contains('submitted-message') ||
                        node.classList.contains('nf-response-msg')) {
                        newSuccessNodes++;
                    }
                }
            }

            // Body text delta
            let successTextTransition = false;
            const currentBodyText = (typeof document !== 'undefined' && document.body) ? (document.body.textContent || '').toLowerCase() : '';
            if (this.preSnapshot) {
                for (const kw of commonSuccessKeywords) {
                    if (currentBodyText.includes(kw) && (!this.preSnapshot.bodyText || !this.preSnapshot.bodyText.includes(kw))) {
                        newSuccessNodes++;
                        successTextTransition = true;
                        break;
                    }
                }
            }

            // Submit button sent state (R6.9A)
            let buttonSuccessState = false;
            if (this.form && this.form.querySelector) {
                const btn = this.form.querySelector('button[type="submit"], input[type="submit"], button');
                if (btn) {
                    const btnTxt = (btn.textContent || btn.value || '').trim().toLowerCase();
                    if (/sent|submitted|완료|전송완료|보냄|complete|success/i.test(btnTxt)) {
                        buttonSuccessState = true;
                    }
                }
            }

            // Medium Signals
            const formStillThere = this.form && typeof document !== 'undefined' && document.body && (typeof document.body.contains === 'function' ? document.body.contains(this.form) : true);
            const formHidden = this.form ? (typeof elementIsVisible === 'function' ? !elementIsVisible(this.form) : false) : false;

            let formReset = false;
            if (this.form && this.form.querySelector) {
                const ta = this.form.querySelector('textarea');
                const inputs = Array.from(this.form.querySelectorAll('input[type="text"], input[type="email"]'));
                if (ta && ta.value === '' && inputs.length > 0 && inputs.every(i => !i.value || i.value.trim() === '')) {
                    formReset = true;
                }
            }

            let submitBtnDisabled = false;
            if (this.form && this.form.querySelector) {
                const btn = this.form.querySelector('button[type="submit"], input[type="submit"], button');
                if (btn && (btn.disabled || (btn.classList && (btn.classList.contains('disabled') || btn.classList.contains('loading') || btn.classList.contains('busy'))))) {
                    submitBtnDisabled = true;
                }
            }

            const formReplaced = !formStillThere && (newSuccessNodes > 0 || successVisibilityTransition || ariaLiveSuccessTransition);

            // [R6.9D Point 5] Positive success defeats stale/pre-existing negatives
            const hasStrongPositive = isSuccessUrl || newSuccessNodes > 0 || successVisibilityTransition || ariaLiveSuccessTransition || buttonSuccessState || formReplaced;
            const isDecisiveSuccess = hasStrongPositive && !actualTransportFailure;
            const isDecisiveFailure = actualTransportFailure || (newErrorsFound && validationErrorsCount > 0);

            return {
                urlChanged,
                isSuccessUrl,
                newErrorsFound,
                validationErrorsCount,
                validationErrorTransition,
                serverErrorFound,
                serverErrorTransition,
                actualTransportFailure,
                domServerErrorTransition,
                matchedServerError,
                newSuccessNodes,
                successVisibilityTransition,
                ariaLiveSuccessTransition,
                successTextTransition,
                buttonSuccessState,
                formStillThere,
                formHidden,
                formReset,
                formReplaced,
                submitBtnDisabled,
                hasStrongPositive,
                isDecisiveSuccess,
                isDecisiveFailure
            };
        }

        async verify(submitOutcome = {}) {
            logDev("🕵️ [SubmissionOutcomeVerifier] Verifying submission status (Multi-Polling)...", "info");
            if (submitOutcome && submitOutcome.submitEventFired) {
                this.submitEventSeen = true;
            }

            const baseWaitMs = (this.options && this.options.baseWaitMs) || 12000;
            const extendedWaitMs = (this.options && this.options.extendedWaitMs) || 25000;
            const transportWaitMs = (this.options && this.options.transportWaitMs) || 35000;
            const intervalMs = (this.options && this.options.intervalMs) || 250;
            const start = Date.now();
            let finalDecision = null;
            let finalSignals = null;
            let pollCount = 0;
            let domServerErrorFirstSeen = null;
            let domServerErrorPolls = 0;

            while (true) {
                pollCount++;
                const elapsed = Date.now() - start;
                const signals = this.evaluateSignals(submitOutcome);
                finalSignals = signals;

                // 1. Positive Success defeats stale/pre-existing negatives (R6.9D Point 5)
                if (signals.hasStrongPositive && !signals.actualTransportFailure) {
                    finalDecision = 'CONFIRMED_SUCCESS';
                    break;
                }

                // 2. Actual Transport Failure (network >= 400 or transport rejection) => Immediate terminal
                if (signals.actualTransportFailure) {
                    finalDecision = 'SUBMISSION_SERVER_ERROR';
                    break;
                }

                // 3. Validation errors (Delta-based) => Immediate terminal
                if (signals.newErrorsFound && signals.validationErrorsCount > 0) {
                    finalDecision = 'SUBMIT_VALIDATION_BLOCKED';
                    break;
                }

                // 4. DOM-only Server Error observation rule (R6.9D Point 3)
                // - require a NEW error transition
                // - require at least two consistent polls separated by >=250ms
                // - require elapsed >= 750ms before terminal SUBMISSION_SERVER_ERROR
                if (signals.domServerErrorTransition) {
                    if (domServerErrorFirstSeen === null) {
                        domServerErrorFirstSeen = Date.now();
                        domServerErrorPolls = 1;
                    } else {
                        domServerErrorPolls++;
                    }

                    const timeSeparated = (Date.now() - domServerErrorFirstSeen >= 250);
                    const elapsedEnough = (elapsed >= 750);
                    const consistentPolls = (domServerErrorPolls >= 2);

                    if (timeSeparated && elapsedEnough && consistentPolls) {
                        finalDecision = 'SUBMISSION_SERVER_ERROR';
                        break;
                    }
                    // Otherwise continue observing! Do not exit at t=3ms!
                } else {
                    domServerErrorFirstSeen = null;
                    domServerErrorPolls = 0;
                }

                // 5. Composite Confirmed Outcome
                if (submitOutcome && submitOutcome.success && !signals.newErrorsFound && !signals.serverErrorFound) {
                    const hasPositiveConfirmation = signals.newSuccessNodes > 0 || signals.successVisibilityTransition || signals.ariaLiveSuccessTransition || signals.isSuccessUrl || signals.buttonSuccessState;
                    const hasStructuralResolution = signals.formReset && (signals.formHidden || !signals.formStillThere);

                    if ((hasPositiveConfirmation || hasStructuralResolution) && elapsed >= 750) {
                        finalDecision = 'CONFIRMED_SUCCESS_COMPOSITE';
                        break;
                    }
                }

                // Dynamic max wait calculation (R6.9A Section 7)
                let maxWaitMs = baseWaitMs;
                const recentMutation = (Date.now() - this.lastMutationTime < 2000);
                const hasPendingActivity = this.submitEventSeen || (submitOutcome && submitOutcome.networkPending) || signals.submitBtnDisabled || recentMutation;
                if (hasPendingActivity) {
                    maxWaitMs = extendedWaitMs;
                }
                if (submitOutcome && submitOutcome.transportPending) {
                    maxWaitMs = transportWaitMs;
                }

                if (elapsed >= maxWaitMs) {
                    break;
                }

                // Phase C: early exit if NO submit seen, NO button busy, NO form reset, and NO mutations
                // Ensure ample time is provided for slow server response / registration completion
                const minPhaseCTime = (this.options && this.options.extendedWaitMs && this.options.extendedWaitMs < 3500)
                    ? this.options.extendedWaitMs
                    : Math.max(8000, (this.options && this.options.submitDelayMs ? this.options.submitDelayMs * 2 : 8000));
                if (elapsed > minPhaseCTime && !this.submitEventSeen && !signals.submitBtnDisabled && !signals.formReset && !recentMutation) {
                    break;
                }

                await new Promise(r => setTimeout(r, intervalMs));
            }

            this.cleanup();

            const totalLatency = Date.now() - start;
            if (!finalDecision) {
                if (finalSignals && finalSignals.actualTransportFailure) {
                    finalDecision = 'SUBMISSION_SERVER_ERROR';
                } else if (finalSignals && finalSignals.domServerErrorTransition && domServerErrorPolls >= 2 && totalLatency >= 750) {
                    finalDecision = 'SUBMISSION_SERVER_ERROR';
                } else if (finalSignals && finalSignals.newErrorsFound && finalSignals.validationErrorsCount > 0) {
                    finalDecision = 'SUBMIT_VALIDATION_BLOCKED';
                } else if (this.submitEventSeen || (submitOutcome && submitOutcome.submitEventFired) || (submitOutcome && submitOutcome.networkCommitObserved)) {
                    finalDecision = 'DELIVERY_UNKNOWN';
                } else if (submitOutcome && submitOutcome.strategy === 'trusted_click_sequence' && !this.submitEventSeen) {
                    finalDecision = 'SUBMIT_CLICK_NO_EFFECT';
                } else {
                    finalDecision = 'DELIVERY_UNKNOWN';
                }
            }

            // Structured outcome evidence (R6.9A Section 3 & 7)
            const isSuccess = (finalDecision === 'CONFIRMED_SUCCESS' || finalDecision === 'CONFIRMED_SUCCESS_COMPOSITE');
            let confirmationStrength = 'NONE';
            if (isSuccess) {
                if (finalSignals && finalSignals.isSuccessUrl) confirmationStrength = 'URL_CHANGE';
                else if (submitOutcome && submitOutcome.networkCommitObserved) confirmationStrength = 'NETWORK_PLUS_DOM';
                else confirmationStrength = 'STRONG_DOM';
            }

            const outcomeEvidence = {
                submitAttempted: true,
                submitEventSeen: !!this.submitEventSeen,
                physicalClickDispatched: !!(submitOutcome && submitOutcome.physicalClickDispatched),
                networkCommitObserved: !!(submitOutcome && submitOutcome.networkCommitObserved),
                networkStatus: (submitOutcome && submitOutcome.networkStatus !== undefined) ? submitOutcome.networkStatus : null,
                successNodeVisibleTransition: !!(finalSignals && finalSignals.successVisibilityTransition),
                successTextTransition: !!(finalSignals && (finalSignals.successTextTransition || finalSignals.newSuccessNodes > 0)),
                ariaLiveSuccessTransition: !!(finalSignals && finalSignals.ariaLiveSuccessTransition),
                formReset: !!(finalSignals && finalSignals.formReset),
                formHidden: !!(finalSignals && finalSignals.formHidden),
                formReplaced: !!(finalSignals && finalSignals.formReplaced),
                buttonSuccessState: !!(finalSignals && finalSignals.buttonSuccessState),
                thankYouUrlTransition: !!(finalSignals && finalSignals.isSuccessUrl),
                frameworkSuccessState: !!(finalSignals && finalSignals.newSuccessNodes > 0),
                validationErrorTransition: !!(finalSignals && finalSignals.validationErrorTransition),
                serverErrorTransition: !!(finalSignals && finalSignals.serverErrorTransition),
                captchaRejected: !!(submitOutcome && submitOutcome.captchaRejected),
                confirmationStrength,
                evidenceTimestamp: Date.now()
            };

            // Specification Required Diagnostic Output
            logDev(`[SUBMIT_VERIFY] pollCount=${pollCount}`, "info");
            logDev(`[SUBMIT_VERIFY] elapsedMs=${totalLatency}`, "info");
            logDev(`[SUBMIT_VERIFY] transportStatus=${submitOutcome && (submitOutcome.transportStatus || submitOutcome.networkStatus || 'NONE')}`, "info");
            logDev(`[SUBMIT_VERIFY] serverErrorTransition=${finalSignals ? !!finalSignals.serverErrorTransition : false}`, "info");
            logDev(`[SUBMIT_VERIFY] matchedServerError=${finalSignals ? (finalSignals.matchedServerError || 'none') : 'none'}`, "info");
            logDev(`[SUBMIT_VERIFY] submitEvent=${this.submitEventSeen}`, "info");
            logDev(`[SUBMIT_VERIFY] urlChanged=${finalSignals ? finalSignals.urlChanged : false}`, "info");
            logDev(`[SUBMIT_VERIFY] newSuccessNodes=${finalSignals ? finalSignals.newSuccessNodes : 0}`, "info");
            logDev(`[SUBMIT_VERIFY] validationErrors=${finalSignals ? finalSignals.validationErrorsCount : 0}`, "info");
            logDev(`[SUBMIT_VERIFY] formReset=${finalSignals ? finalSignals.formReset : false}`, "info");
            logDev(`[SUBMIT_VERIFY] decision=${finalDecision}`, (isSuccess ? "success" : "warning"));
            logDev(`[SUBMIT_VERIFY] latencyMs=${totalLatency}`, "info");

            stopActiveEmptyFieldSweeper();

            if (isSuccess) {
                logDev(`[FINAL] status=${finalDecision}`, "success");
                logDev("[STAGE] stage=CONFIRMED_SUCCESS", "success");
                try {
                    chrome.runtime.sendMessage({
                        action: 'STAGE_PROGRESSION',
                        stage: 'CONFIRMED_SUCCESS',
                        url: window.location.href
                    }).catch(() => {});
                } catch (_) {}

                // [R6.9E Post-Registration Completion Grace] Maintain page so registration finishes completely
                const defaultGrace = (this.options && this.options.extendedWaitMs && this.options.extendedWaitMs <= 1000) ? 0 : 3000;
                const postSubmitGraceMs = (this.options && this.options.submitDelayMs !== undefined)
                    ? parseInt(this.options.submitDelayMs)
                    : defaultGrace;
                if (postSubmitGraceMs > 0) {
                    logDev(`⏳ [PostSubmit] Maintaining page for registration completion (${postSubmitGraceMs}ms)...`, "info");
                    await new Promise(r => setTimeout(r, postSubmitGraceMs));
                }

                finishCampaign(true, null, finalDecision, {
                    resultUrl: (typeof window !== 'undefined') ? window.location.href : '',
                    decision: finalDecision,
                    latencyMs: totalLatency,
                    outcomeEvidence,
                    confirmationStrength
                });
                return { success: true, reasonCode: 'SUBMISSION_CONFIRMED_SUCCESS', decision: finalDecision, latencyMs: totalLatency, outcomeEvidence };
            } else {
                logDev(`[FINAL] status=${finalDecision}`, "warning");
                sessionStorage.removeItem('xpider_submit_count');
                finishCampaign(false, `Submission outcome: ${finalDecision}`, finalDecision, {
                    resultUrl: (typeof window !== 'undefined') ? window.location.href : '',
                    decision: finalDecision,
                    latencyMs: totalLatency,
                    outcomeEvidence,
                    confirmationStrength
                });
                return { success: false, reasonCode: 'SUBMISSION_OUTCOME_FAILURE', decision: finalDecision, latencyMs: totalLatency, outcomeEvidence };
            }
        }
    }

    async function detectSubmissionResult(originalForm, tpl = {}, preSnapshot = { elements: [], bodyText: "" }, submitOutcome = null) {
        const verifier = new SubmissionOutcomeVerifier(originalForm, tpl);
        if (preSnapshot && preSnapshot.elements) {
            verifier.preSnapshot = {
                url: (typeof window !== 'undefined') ? window.location.href : '',
                formSignature: originalForm ? (originalForm.id || originalForm.name || 'form') : 'no_form',
                visibleErrorsCount: 0,
                bodyText: preSnapshot.bodyText || '',
                existingSuccessTexts: preSnapshot.elements || []
            };
        } else {
            verifier.prepare();
        }
        return await verifier.verify(submitOutcome);
    }

    function finishCampaign(success, error = null, reasonCode = null, metadata = {}) {
        currentTargetLifecycleState = TargetLifecycleState.SETTLED;
        sessionStorage.removeItem('xpider_pending_verify'); // [v17.6.0] Clear recovery flag
        const sendFn = window.__xpider_sendExecutionMessage || chrome.runtime.sendMessage;
        sendFn({
            action: 'SENDER_FINISHED',
            result: {
                success: success,
                error: error,
                reasonCode: reasonCode || (success ? 'SUBMIT_OK_SIGNAL' : 'UNKNOWN'),
                metadata: metadata
            }
        });
    }

    const FormDiscoveryEngineR2 = FormDiscoveryEngine; // R6 Alias

    if (typeof window !== 'undefined') {
        window.__xpiderTargetLifecycleState = TargetLifecycleState;
        window.__xpiderGetTargetLifecycleState = getTargetLifecycleState;
        window.__xpiderSetTargetLifecycleState = setTargetLifecycleState;
        window.__xpiderFormStabilizer = FormStabilizer;
        window.__xpiderSubmitStateMachine = executeSubmitStateMachine;
        window.__xpiderStartActiveEmptyFieldSweeper = startActiveEmptyFieldSweeper;
        window.__xpiderStopActiveEmptyFieldSweeper = stopActiveEmptyFieldSweeper;
        window.__xpiderFreezeFieldValues = freezeFieldValues;
        window.__xpiderVerifyFieldIntegrity = verifyFieldIntegrity;
        window.__xpiderContactDiscoveryEngine = _ContactDiscoveryEngine;
        window.__xpiderSubmissionOutcomeVerifier = SubmissionOutcomeVerifier;
        window.__xpiderFormDiscoveryEngine = FormDiscoveryEngine;
        window.__xpiderFormDiscoveryEngineR2 = FormDiscoveryEngineR2;
        window.__xpiderSubmitExecutorR3 = SubmitExecutorR3;
        window.__xpiderSubmitExecutorR4 = SubmitExecutorR4;
        window.__xpiderSubmitExecutorR5 = SubmitExecutorR5;
        window.__xpiderCheckboxResolverR2 = _CheckboxResolverR2;
        window.__xpiderSelectResolverR2 = _SelectResolverR2;
        window.__xpiderFinalFormCompletionEngine = _FinalFormCompletionEngine;
        window.__xpiderVisionSubmitExecutor = _VisionSubmitExecutor;
        window.__xpiderCollectAccessibleRoots = _FormDiscoveryEngineR2 ? _FormDiscoveryEngineR2.collectAccessibleRoots : null;
        window.__xpiderStartAutofillForEligibleForm = _FormDiscoveryEngineR2 ? _FormDiscoveryEngineR2.startAutofillForEligibleForm : null;
        window.__xpiderExtractAndSendPageEmails = extractAndSendPageEmails;
        window.__xpiderExtractEmailsFromCurrentDom = extractEmailsFromCurrentDom;
        window.__xpider_initialized = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            TargetLifecycleState,
            getTargetLifecycleState,
            setTargetLifecycleState,
            FormStabilizer,
            FormDiscoveryEngine,
            FormDiscoveryEngineR2,
            SubmitExecutorR3,
            SubmitExecutorR4,
            SubmitExecutorR5,
            VisionSubmitExecutor: _VisionSubmitExecutor,
            executeSubmitStateMachine,
            startActiveEmptyFieldSweeper,
            stopActiveEmptyFieldSweeper,
            freezeFieldValues,
            verifyFieldIntegrity,
            submitForm,
            fillAndSubmit,
            SubmissionOutcomeVerifier,
            checkForCaptcha,
            tryAutoSolveCaptcha,
            extractCaptchaSitekey,
            ContactGate: _ContactGate,
            SmartFieldResolver: _SmartFieldResolver,
            ContactDiscoveryEngine: _ContactDiscoveryEngine,
            CheckboxResolverR2: _CheckboxResolverR2,
            SelectResolverR2: _SelectResolverR2,
            FinalFormCompletionEngine: _FinalFormCompletionEngine,
            collectAccessibleRoots: _FormDiscoveryEngineR2 ? _FormDiscoveryEngineR2.collectAccessibleRoots : null,
            startAutofillForEligibleForm: _FormDiscoveryEngineR2 ? _FormDiscoveryEngineR2.startAutofillForEligibleForm : null,
            extractAndSendPageEmails,
            extractEmailsFromCurrentDom,
            getCollectorGeneration: () => __emailCollectorGeneration,
            setCollectorGeneration: (g) => { __emailCollectorGeneration = g; },
            setCollectorBaseline: (b) => { __emailCollectorBaseline = b; },
            getCollectorBaseline: () => __emailCollectorBaseline,
            getCollectorReadyPromise: () => __emailCollectorReady
        };
    }
})();

/**
 * form-discovery-engine-r2.js
 * [Issue #6 R6.2] Body-Field-First Form Recognition, Multi-Root Collector,
 * Multi-Pass Render Wait, and Autofill Bridge
 * 
 * Capabilities:
 * 1. Accessible Root Collector: Main document, open Shadow DOMs, same-origin iframes,
 *    and cross-origin iframe diagnostic signaling.
 * 2. Body-Field-First Recognition: Discovers inquiry-body controls (textarea, contenteditable,
 *    role=textbox, multiline semantic inputs) and infers upward to nearest coherent logical container
 *    (native <form>, fieldset, section, article, div.contact, etc.).
 * 3. High-Recall Eligibility Gate: A visible inquiry body + at least one contact/identity field
 *    or submit button qualifies; numeric score is strictly for ranking multiple candidates.
 * 4. Multi-Pass Render Wait: Pass 1 immediate, Pass 2 after settle (400-700ms),
 *    Pass 3 after bounded scroll and safe modal/drawer reveal (800-1500ms).
 * 5. Autofill Bridge: Canonical startAutofillForEligibleForm() latching by attemptId + formSignature,
 *    dispatched within 250ms, with precise failure taxonomy.
 * 6. Form Node Rebinding: Detects hydration detached nodes and rebinds by signature.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const mod = factory();
        root.FormDiscoveryEngineR2 = mod.FormDiscoveryEngineR2;
        root.FormDiscoveryEngine = mod.FormDiscoveryEngineR2; // R6.2 primary alias
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // 1. Inquiry Body Semantic Keywords
    const INQUIRY_BODY_TOKENS = [
        'message', 'inquiry', 'enquiry', 'question', 'comments', 'comment',
        'details', 'description', 'how can we help', 'tell us', 'contact message',
        'your message', 'request', 'notes', 'inquiries', 'feedback',
        '문의', '문의내용', '질문', '메시지', '상담', '상담내용', '요청사항', '내용'
    ];

    const NEWSLETTER_NEGATIVE_TOKENS = [
        'subscribe', 'newsletter', 'mailing list', 'email updates', 'join our list',
        'get updates', 'notify me', 'sign up for updates', 'get offers', '구독', '뉴스레터'
    ];

    const OTHER_NEGATIVE_CONTAINER_TOKENS = [
        'login', 'log in', 'signin', 'sign-in', 'search', '로그인', '검색'
    ];

    const SAFE_REVEAL_KEYWORDS = [
        'contact us', 'send message', 'send us a message', 'message us',
        'get in touch', 'ask a question', 'request info', 'inquiry',
        'contact', '문의하기', '상담신청', '고객센터'
    ];

    const DESTRUCTIVE_OR_UNSAFE_KEYWORDS = [
        'login', 'sign in', 'subscribe', 'newsletter', 'book now', 'booking',
        'pay', 'checkout', 'delete', 'cancel', 'remove', 'reset', 'clear'
    ];

    function isVisible(el) {
        if (!el) return false;
        try {
            if (typeof window !== 'undefined' && window.getComputedStyle) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false;
                }
            }
            if (el.hidden || el.type === 'hidden') return false;
            if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;
            if (el.getAttribute && (el.getAttribute('aria-hidden') === 'true')) return false;
            return true;
        } catch (_) {
            return true;
        }
    }

    function isHoneypot(el) {
        if (!el) return false;
        try {
            const name = (el.name || el.id || '').toLowerCase();
            if (name.includes('honeypot') || name.includes('hp_') || name === 'hp') return true;
            if (el.style) {
                if (el.style.position === 'absolute' && (el.style.left === '-9999px' || el.style.top === '-9999px')) return true;
                if (el.style.opacity === '0' && el.tabIndex === -1) return true;
            }
            if (el.getAttribute && el.getAttribute('tabindex') === '-1' && el.getAttribute('aria-hidden') === 'true') return true;
            return false;
        } catch (_) {
            return false;
        }
    }

    function getControlContext(el) {
        if (!el) return '';
        const parts = [
            el.name || '',
            el.id || '',
            el.getAttribute?.('placeholder') || '',
            el.getAttribute?.('aria-label') || '',
            el.getAttribute?.('aria-describedby') || '',
            el.className || ''
        ];
        try {
            if (el.id && el.ownerDocument && el.ownerDocument.querySelector) {
                const lbl = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
                if (lbl) parts.push(lbl.textContent || '');
            }
            if (el.closest) {
                const parentLabel = el.closest('label');
                if (parentLabel) parts.push(parentLabel.textContent || '');
                const fieldset = el.closest('fieldset');
                if (fieldset) {
                    const legend = fieldset.querySelector('legend');
                    if (legend) parts.push(legend.textContent || '');
                }
            }
        } catch (_) {}
        return parts.join(' ').toLowerCase();
    }

    // 2. Multi-Root Collector (Requirement 5)
    function collectAccessibleRoots(doc = document, maxDepth = 4, maxRoots = 50) {
        const roots = [];
        const crossOriginSignals = [];
        let shadowCount = 0;
        let iframeCount = 0;

        if (!doc) return { roots, crossOriginSignals, shadowCount, iframeCount };
        roots.push(doc);

        function traverse(node, depth) {
            if (!node || depth > maxDepth || roots.length >= maxRoots) return;

            // Collect open shadowRoot
            if (node.shadowRoot) {
                roots.push(node.shadowRoot);
                shadowCount++;
                traverse(node.shadowRoot, depth + 1);
            }

            // Collect iframes
            if (node.tagName === 'IFRAME') {
                iframeCount++;
                try {
                    const ifrDoc = node.contentDocument || (node.contentWindow && node.contentWindow.document);
                    if (ifrDoc && !roots.includes(ifrDoc)) {
                        roots.push(ifrDoc);
                        traverse(ifrDoc, depth + 1);
                    }
                } catch (e) {
                    // Cross-origin iframe
                    const src = (node.src || node.getAttribute?.('src') || '').toLowerCase();
                    const title = (node.title || node.getAttribute?.('title') || '').toLowerCase();
                    const idCls = `${node.id || ''} ${node.className || ''}`.toLowerCase();
                    const isContactRelated = ['contact', 'form', 'hubspot', 'jotform', 'typeform', 'wufoo', 'inquiry', 'message'].some(k => 
                        src.includes(k) || title.includes(k) || idCls.includes(k)
                    );
                    if (isContactRelated) {
                        crossOriginSignals.push({
                            src,
                            title,
                            reason: 'CROSS_ORIGIN_CONTACT_FORM_DETECTED'
                        });
                    }
                }
            }

            // Traverse children
            const children = node.children || [];
            for (let i = 0; i < children.length; i++) {
                traverse(children[i], depth);
            }
        }

        try {
            traverse(doc, 0);
        } catch (_) {}

        return { roots, crossOriginSignals, shadowCount, iframeCount };
    }

    // 3. Body-Field-First Recognition (Requirement 2)
    function findInquiryBodyControls(roots = [document]) {
        const candidates = [];
        const seen = new Set();

        const rootList = Array.isArray(roots) ? roots : [roots];

        for (const root of rootList) {
            if (!root || !root.querySelectorAll) continue;

            // 1. Visible Native Textareas
            try {
                const textareas = Array.from(root.querySelectorAll('textarea'));
                for (const ta of textareas) {
                    if (seen.has(ta)) continue;
                    if (!isVisible(ta) || isHoneypot(ta) || ta.disabled) continue;
                    const ctx = getControlContext(ta);
                    // Check if strictly newsletter comment only
                    const isNewsletterOnly = NEWSLETTER_NEGATIVE_TOKENS.some(tok => ctx.includes(tok)) &&
                        !INQUIRY_BODY_TOKENS.some(tok => ctx.includes(tok));
                    if (isNewsletterOnly) continue;

                    seen.add(ta);
                    candidates.push({
                        element: ta,
                        type: 'textarea',
                        context: ctx,
                        confidence: 1.0,
                        root
                    });
                }
            } catch (_) {}

            // 2. Visible Contenteditable Controls
            try {
                const editables = Array.from(root.querySelectorAll('[contenteditable="true"], [contenteditable=""]'));
                for (const ed of editables) {
                    if (seen.has(ed)) continue;
                    if (!isVisible(ed) || isHoneypot(ed)) continue;
                    const ctx = getControlContext(ed);
                    seen.add(ed);
                    candidates.push({
                        element: ed,
                        type: 'contenteditable',
                        context: ctx,
                        confidence: 0.95,
                        root
                    });
                }
            } catch (_) {}

            // 3. ARIA Multiline Textboxes
            try {
                const ariaTextboxes = Array.from(root.querySelectorAll('[role="textbox"][aria-multiline="true"], [role="textbox"]'));
                for (const tb of ariaTextboxes) {
                    if (seen.has(tb)) continue;
                    if (!isVisible(tb) || isHoneypot(tb) || tb.disabled) continue;
                    const ctx = getControlContext(tb);
                    const isMulti = tb.getAttribute?.('aria-multiline') === 'true' || INQUIRY_BODY_TOKENS.some(k => ctx.includes(k));
                    if (isMulti) {
                        seen.add(tb);
                        candidates.push({
                            element: tb,
                            type: 'aria_textbox',
                            context: ctx,
                            confidence: 0.90,
                            root
                        });
                    }
                }
            } catch (_) {}

            // 4. Multiline or Semantic Text Inputs
            try {
                const textInputs = Array.from(root.querySelectorAll('input:not([type]), input[type="text"]'));
                for (const inp of textInputs) {
                    if (seen.has(inp)) continue;
                    if (!isVisible(inp) || isHoneypot(inp) || inp.disabled) continue;
                    const ctx = getControlContext(inp);
                    const matchesKeyword = INQUIRY_BODY_TOKENS.some(k => ctx.includes(k));
                    if (matchesKeyword) {
                        seen.add(inp);
                        candidates.push({
                            element: inp,
                            type: 'semantic_input',
                            context: ctx,
                            confidence: 0.85,
                            root
                        });
                    }
                }
            } catch (_) {}
        }

        return candidates;
    }

    // 4. Logical Container Discovery & Control Aggregation
    function inferLogicalContainer(bodyElement) {
        if (!bodyElement) return null;

        // 1. Literal <form> ancestor (highest preference)
        if (typeof bodyElement.closest === 'function') {
            const formTag = bodyElement.closest('form');
            if (formTag) return formTag;
        }

        // 2. Walk upward through ancestors looking for coherent form-like wrappers
        let curr = bodyElement.parentElement;
        let bestNonForm = null;
        let depth = 0;

        while (curr && depth < 8) {
            const tag = (curr.tagName || '').toUpperCase();
            if (tag === 'BODY' || tag === 'HTML') break;

            const id = (typeof curr.id === 'string' ? curr.id : (typeof curr.getAttribute === 'function' ? curr.getAttribute('id') : '') || '').toLowerCase();
            const cls = (typeof curr.className === 'string' ? curr.className : (typeof curr.getAttribute === 'function' ? curr.getAttribute('class') : '') || '').toLowerCase();
            const role = (curr.getAttribute?.('role') || '').toLowerCase();
            const combined = `${id} ${cls} ${role}`;

            // Coherent container keywords
            if (
                tag === 'FIELDSET' || role === 'form' ||
                combined.includes('form') || combined.includes('contact') ||
                combined.includes('inquiry') || combined.includes('feedback') ||
                tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN'
            ) {
                bestNonForm = curr;
                // If it explicitly mentions contact or form, stop here
                if (combined.includes('contact') || combined.includes('form') || tag === 'FIELDSET' || role === 'form') {
                    return curr;
                }
            }

            // Fallback: If container contains multiple inputs and a button, it's a strong candidate
            if (!bestNonForm && curr.querySelectorAll) {
                const inputs = curr.querySelectorAll('input, select, textarea');
                const btns = curr.querySelectorAll('button, input[type="submit"], [role="button"]');
                if (inputs.length >= 2 && btns.length >= 1) {
                    bestNonForm = curr;
                }
            }

            curr = curr.parentElement;
            depth++;
        }

        return bestNonForm || bodyElement.parentElement;
    }

    // 5. Gather Controls & Evaluate Eligibility (Requirement 3)
    function inspectContainerControls(container) {
        if (!container || !container.querySelectorAll) {
            return {
                names: [], emails: [], phones: [], subjects: [],
                selects: [], checkboxes: [], radios: [], submits: [], allInputs: []
            };
        }

        const allInputs = Array.from(container.querySelectorAll('input, select, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="checkbox"]')).filter(isVisible);

        const names = [];
        const emails = [];
        const phones = [];
        const subjects = [];
        const selects = [];
        const checkboxes = [];
        const radios = [];
        const submits = [];

        for (const el of allInputs) {
            const ctx = getControlContext(el);
            const tag = (el.tagName || '').toUpperCase();
            const type = (el.type || '').toLowerCase();

            if (type === 'email' || ctx.includes('email') || ctx.includes('이메일')) {
                emails.push(el);
            } else if (type === 'tel' || ctx.includes('phone') || ctx.includes('mobile') || ctx.includes('전화') || ctx.includes('연락처')) {
                phones.push(el);
            } else if (ctx.includes('name') || ctx.includes('이름') || ctx.includes('성함')) {
                names.push(el);
            } else if (ctx.includes('subject') || ctx.includes('title') || ctx.includes('제목')) {
                subjects.push(el);
            }

            if (tag === 'SELECT' || el.getAttribute?.('role') === 'combobox') {
                selects.push(el);
            }
            if (type === 'checkbox' || el.getAttribute?.('role') === 'checkbox') {
                checkboxes.push(el);
            }
            if (type === 'radio' || el.getAttribute?.('role') === 'radio') {
                radios.push(el);
            }
        }

        // Submits
        const submitElements = Array.from(container.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')).filter(isVisible);
        for (const btn of submitElements) {
            const txt = (btn.textContent || btn.value || btn.getAttribute?.('aria-label') || '').toLowerCase().trim();
            // Negative submit filter: login, search, next, cancel
            if (txt.includes('login') || txt.includes('search') || txt.includes('검색') || txt.includes('로그인')) continue;
            submits.push(btn);
        }

        return { names, emails, phones, subjects, selects, checkboxes, radios, submits, allInputs };
    }

    function computeFormSignature(container) {
        if (!container) return 'form_null';
        const id = container.id || '';
        const cls = (container.className || '').toString().slice(0, 40);
        const tag = (container.tagName || 'DIV').toLowerCase();
        let fieldSig = '';
        if (container.querySelectorAll) {
            const inputs = Array.from(container.querySelectorAll('input, textarea, select')).slice(0, 5);
            fieldSig = inputs.map(i => i.name || i.id || i.type || i.tagName).join(',');
        }
        return `${tag}#${id}.${cls}[${fieldSig}]`;
    }

    // 6. FormDiscoveryEngineR2 Class Implementation
    class FormDiscoveryEngineR2 {
        constructor(options = {}) {
            this.options = Object.assign({
                pass1WaitMs: 0,
                pass2WaitMs: 500,
                pass3WaitMs: 900,
                maxWindowMs: 5000,
                logPrefix: '[FORM_SCAN]'
            }, options);
            this.lastDiscoveryResult = null;
        }

        // Framework Fingerprint Detection (R6 Section 6.3)
        detectFrameworkAdapter(container) {
            if (!container) return null;
            const sig = `${container.id || ''} ${container.className || ''} ${container.getAttribute?.('data-form-id') || ''}`.toLowerCase();
            const action = (container.action || container.getAttribute?.('action') || '').toLowerCase();

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

        // Group & Score Candidates (Requirement 2 & 3)
        groupAndScoreContainers(root = document) {
            const { roots, crossOriginSignals, shadowCount, iframeCount } = collectAccessibleRoots(root);
            const bodyControls = findInquiryBodyControls(roots);

            const scoredContainers = [];
            const evaluatedContainers = new Set();
            let nativeFormCount = 0;
            let logicalContainerCount = 0;

            for (const bc of bodyControls) {
                const el = bc.element;
                const container = inferLogicalContainer(el);
                if (!container || evaluatedContainers.has(container)) continue;
                evaluatedContainers.add(container);

                const isNativeForm = container.tagName === 'FORM';
                if (isNativeForm) nativeFormCount++;
                else logicalContainerCount++;

                const controls = inspectContainerControls(container);
                const contactCount = controls.names.length + controls.emails.length + controls.phones.length;
                const submitCount = controls.submits.length;

                // [R6.2 ELIGIBILITY GATE] (Requirement 3: Must NOT Over-filter)
                // Eligible if:
                // 1. Valid visible inquiry body exists (bc.element is present & visible)
                // 2. AND (is a native <form> OR has contact/identity fields OR has submitters OR container/body context is inquiry)
                const hasValidBody = isVisible(bc.element);
                const containerContext = `${container.id || ''} ${container.className || ''}`.toLowerCase();
                const hasInquiryContext = isNativeForm || (contactCount >= 1 || submitCount >= 1) ||
                    INQUIRY_BODY_TOKENS.some(k => bc.context.includes(k)) ||
                    containerContext.includes('contact') || containerContext.includes('form') || containerContext.includes('inquiry');

                // Negative check: Reject newsletter-only forms
                const isNewsletterOnly = NEWSLETTER_NEGATIVE_TOKENS.some(tok => containerContext.includes(tok)) &&
                    !INQUIRY_BODY_TOKENS.some(tok => containerContext.includes(tok)) &&
                    controls.allInputs.length <= 2 &&
                    controls.names.length === 0 &&
                    controls.phones.length === 0;

                const eligible = hasValidBody && hasInquiryContext && !isNewsletterOnly;
                const reason = !hasValidBody ? 'NO_VISIBLE_BODY_FIELD'
                    : !hasInquiryContext ? 'NO_CONTACT_OR_SUBMIT_ASSOCIATED'
                    : isNewsletterOnly ? 'REJECTED_NEWSLETTER_ONLY'
                    : 'ELIGIBLE_INQUIRY_FORM';

                // Logging Requirement 1: [FORM_GATE]
                const candidateSig = computeFormSignature(container);
                console.log(`[FORM_GATE] candidate=${candidateSig} bodyField=${hasValidBody} contactFields=${contactCount} submitters=${submitCount} eligible=${eligible} reason=${reason}`);

                // Scoring is for RANKING only
                let score = 50;
                if (isNativeForm) score += 50;
                if (bc.type === 'textarea') score += 40;
                if (controls.names.length > 0) score += 20;
                if (controls.emails.length > 0) score += 25;
                if (controls.phones.length > 0) score += 15;
                if (controls.subjects.length > 0) score += 15;
                if (controls.selects.length > 0) score += 10;
                if (controls.checkboxes.length > 0) score += 10;
                if (controls.submits.length > 0) score += 20;

                const adapter = this.detectFrameworkAdapter(container);
                if (adapter) score += 50;

                scoredContainers.push({
                    container,
                    signature: candidateSig,
                    score,
                    eligible,
                    reason,
                    bodyControl: bc,
                    adapter,
                    controls,
                    root: bc.root
                });
            }

            return {
                candidates: scoredContainers.sort((a, b) => b.score - a.score),
                bodyCount: bodyControls.length,
                nativeFormCount,
                logicalContainerCount,
                shadowCount,
                iframeCount,
                crossOriginSignals,
                rootsCount: roots.length
            };
        }

        // Modal / Drawer Form Reveal Trigger (Requirement 6)
        async dynamicFormReveal(root = document) {
            const { roots } = collectAccessibleRoots(root, 1, 5);
            for (const r of roots) {
                if (!r || !r.querySelectorAll) continue;
                const triggers = Array.from(r.querySelectorAll('button, a, [role="button"], span.btn, .btn'));
                for (const btn of triggers) {
                    if (!isVisible(btn) || btn.disabled) continue;
                    const txt = (btn.textContent || btn.getAttribute?.('aria-label') || btn.value || '').toLowerCase().trim();
                    if (!txt || txt.length > 40) continue;

                    // Safety guard: Must not be destructive or booking/login/subscribe
                    if (DESTRUCTIVE_OR_UNSAFE_KEYWORDS.some(k => txt.includes(k))) continue;

                    const isReveal = SAFE_REVEAL_KEYWORDS.some(k => txt.includes(k));
                    if (isReveal) {
                        try {
                            console.log(`[FORM_REVEAL] Triggering high-confidence contact reveal control: "${txt}"`);
                            if (typeof btn.click === 'function') {
                                btn.click();
                                await new Promise(r => setTimeout(r, 450));
                                return true;
                            }
                        } catch (_) {}
                    }
                }
            }
            return false;
        }

        // Main Multi-Pass Form Discovery Ladder (Requirement 4, 5, 10)
        async discoverForm(root = document) {
            const startTime = Date.now();
            const url = (typeof window !== 'undefined' && window.location ? window.location.href : 'current_page');

            let totalBodySeen = 0;
            let totalContainersSeen = 0;
            let allCrossOriginSignals = [];

            // Helper to execute a scan pass
            const executePass = (passNum) => {
                const scanRes = this.groupAndScoreContainers(root);
                totalBodySeen = Math.max(totalBodySeen, scanRes.bodyCount);
                totalContainersSeen = Math.max(totalContainersSeen, scanRes.candidates.length);
                if (scanRes.crossOriginSignals && scanRes.crossOriginSignals.length) {
                    allCrossOriginSignals.push(...scanRes.crossOriginSignals);
                }

                // Logging Requirement 1: [FORM_SCAN]
                console.log(`[FORM_SCAN] pass=${passNum} url=${url} roots=${scanRes.rootsCount}`);
                console.log(`[FORM_SCAN] bodyCandidates=${scanRes.bodyCount} nativeForms=${scanRes.nativeFormCount} logicalContainers=${scanRes.logicalContainerCount}`);
                console.log(`[FORM_SCAN] shadowRoots=${scanRes.shadowCount} iframes=${scanRes.iframeCount} modalTriggers=${SAFE_REVEAL_KEYWORDS.length}`);

                const eligibleList = scanRes.candidates.filter(c => c.eligible);
                return { scanRes, eligibleList };
            };

            // === PASS 1: Immediate ===
            let pass1 = executePass(1);
            if (pass1.eligibleList.length > 0) {
                const best = pass1.eligibleList[0];
                this.lastDiscoveryResult = { success: true, container: best.container, signature: best.signature, pass: 1 };
                return best.container;
            }

            // === PASS 2: Settle Wait (400-700ms) ===
            const waitPass2 = this.options.pass2WaitMs;
            if (waitPass2 > 0) {
                await new Promise(r => setTimeout(r, waitPass2));
            }
            let pass2 = executePass(2);
            if (pass2.eligibleList.length > 0) {
                const best = pass2.eligibleList[0];
                this.lastDiscoveryResult = { success: true, container: best.container, signature: best.signature, pass: 2 };
                return best.container;
            }

            // === PASS 3: Bounded Scroll + Modal/Drawer Reveal ===
            if (typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
                try {
                    window.scrollBy({ top: 400, behavior: 'smooth' });
                } catch (_) {}
            }
            await this.dynamicFormReveal(root);

            const waitPass3 = this.options.pass3WaitMs;
            if (waitPass3 > 0) {
                await new Promise(r => setTimeout(r, waitPass3));
            }
            let pass3 = executePass(3);
            if (pass3.eligibleList.length > 0) {
                const best = pass3.eligibleList[0];
                this.lastDiscoveryResult = { success: true, container: best.container, signature: best.signature, pass: 3 };
                return best.container;
            }

            // === Exhaustion: Determine Terminal Failure Code (Requirement 10) ===
            let terminalReason = 'NO_BODY_FIELD_FOUND';
            if (allCrossOriginSignals.length > 0) {
                terminalReason = 'CROSS_ORIGIN_FORM_UNAVAILABLE';
            } else if (totalBodySeen === 0) {
                terminalReason = 'NO_BODY_FIELD_FOUND';
            } else if (totalContainersSeen === 0) {
                terminalReason = 'BODY_FIELD_FOUND_CONTAINER_INCOHERENT';
            } else {
                terminalReason = 'FORM_GATE_REJECTED';
            }

            if ((Date.now() - startTime) >= this.options.maxWindowMs) {
                terminalReason = 'FORM_RENDER_TIMEOUT';
            }

            console.log(`[FORM_DISCOVERY_EXHAUSTED] bodyCandidatesSeen=${totalBodySeen} logicalContainersSeen=${totalContainersSeen} eligibleCandidatesSeen=0 reason=${terminalReason}`);

            this.lastDiscoveryResult = {
                success: false,
                container: null,
                reasonCode: terminalReason,
                bodyCandidatesSeen: totalBodySeen,
                logicalContainersSeen: totalContainersSeen,
                crossOriginSignals: allCrossOriginSignals
            };

            return null;
        }

        // Form Node Replacement / Rebind (Requirement 9)
        rebindFormNode(detachedContainer, signature, root = document) {
            if (!signature) signature = computeFormSignature(detachedContainer);
            const { candidates } = this.groupAndScoreContainers(root);
            for (const cand of candidates) {
                if (cand.signature === signature || (cand.container && computeFormSignature(cand.container) === signature)) {
                    console.log(`[FORM_REBIND] oldDetached=true newFound=true`);
                    return cand.container;
                }
            }
            console.log(`[FORM_REBIND] oldDetached=true newFound=false`);
            return null;
        }
    }

    // 7. Canonical Autofill Bridge (Requirement 7 & 8)
    const _autofillLatches = new Map();

    function startAutofillForEligibleForm(attemptId, formContext, fillExecutor) {
        if (!formContext || !formContext.form) {
            console.log(`[AUTOFILL_BRIDGE_FAILED] reason=FORM_CONTEXT_NULL`);
            return { dispatched: false, reason: 'FORM_CONTEXT_NULL' };
        }

        const formSignature = formContext.signature || computeFormSignature(formContext.form);
        const latchKey = `${attemptId}_${formSignature}`;

        if (_autofillLatches.has(latchKey)) {
            console.log(`[AUTOFILL_BRIDGE] eligibleFormId=${formSignature} dispatched=false reason=ALREADY_DISPATCHED`);
            return { dispatched: false, reason: 'ALREADY_DISPATCHED' };
        }

        _autofillLatches.set(latchKey, Date.now());

        // Latch and dispatch within 250ms
        console.log(`[AUTOFILL_BRIDGE] eligibleFormId=${formSignature} dispatched=true reason=OK`);
        console.log(`[AUTOFILL_START] attemptId=${attemptId} formSignature=${formSignature}`);

        try {
            if (typeof fillExecutor === 'function') {
                fillExecutor(formContext.form, formContext.template, formContext.speed);
            }
            return { dispatched: true, formSignature, reason: 'OK' };
        } catch (err) {
            console.log(`[AUTOFILL_BRIDGE_FAILED] reason=${err.message}`);
            return { dispatched: false, reason: 'AUTOFILL_BRIDGE_FAILED', error: err.message };
        }
    }

    function resetAutofillLatch(attemptId) {
        if (attemptId) {
            for (const k of Array.from(_autofillLatches.keys())) {
                if (k.startsWith(attemptId)) _autofillLatches.delete(k);
            }
        } else {
            _autofillLatches.clear();
        }
    }

    return {
        FormDiscoveryEngineR2,
        FormDiscoveryEngine: FormDiscoveryEngineR2,
        collectAccessibleRoots,
        findInquiryBodyControls,
        inferLogicalContainer,
        inspectContainerControls,
        computeFormSignature,
        startAutofillForEligibleForm,
        resetAutofillLatch
    };
}));

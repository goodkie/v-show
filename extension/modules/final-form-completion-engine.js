/**
 * final-form-completion-engine.js
 * [Issue #6 R6.1] FinalFormCompletionEngine: Live DOM Rescan, Unresolved Control Classification,
 * Tiered Resolution, Sensitive Fact Guard, and Final Required Audit Hard Gate
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./checkbox-resolver-r2', './select-resolver-r2', './math-captcha-solver'], factory);
    } else if (typeof module === 'object' && module.exports) {
        let cb, sel, mcs;
        try { cb = require('./checkbox-resolver-r2'); } catch (_) {}
        try { sel = require('./select-resolver-r2'); } catch (_) {}
        try { mcs = require('./math-captcha-solver'); } catch (_) {}
        module.exports = factory(cb, sel, mcs);
    } else {
        root.FinalFormCompletionEngine = factory(root.CheckboxResolverR2, root.SelectResolverR2, root.MathCaptchaSolver);
    }
}(typeof self !== 'undefined' ? self : this, function (CheckboxResolverR2, SelectResolverR2, MathCaptchaSolver) {
    'use strict';

    const _MathCaptchaSolver = (typeof MathCaptchaSolver !== 'undefined' && MathCaptchaSolver) ||
        (typeof self !== 'undefined' && self.MathCaptchaSolver) ||
        (typeof window !== 'undefined' && window.MathCaptchaSolver) ||
        (typeof require !== 'undefined' ? (function(){ try { return require('./math-captcha-solver'); } catch(_) { return null; } })() : null);

    // ------------------------------------------------------------------------
    // Lexical & Semantic Dictionaries
    // ------------------------------------------------------------------------

    const SENSITIVE_FACT_KEYWORDS = [
        'ssn', 'social security', 'ein', 'tax id', 'taxpayer', 'tax identification',
        'revenue', 'annual revenue', 'annual sales', 'turnover', 'income', 'profit',
        'employee count', 'number of employees', 'headcount', 'company size',
        'date of birth', 'dob', 'birthdate', 'birth date', 'age',
        'license number', 'driver license', 'passport', 'id number', 'national id',
        'credit card', 'debit card', 'card number', 'cvv', 'cvc', 'billing address',
        'bank account', 'routing number', 'account number', 'iban',
        'password', 'confirm password', 'pin', 'secret code',
        'legal declaration', 'under penalty of perjury', 'swear that', 'certify that',
        'ethnicity', 'race', 'religion', 'sexual orientation', 'gender identity'
    ];

    function matchesSensitiveFact(ctx) {
        if (!ctx) return false;
        const normalized = ctx.toLowerCase();
        for (const kw of SENSITIVE_FACT_KEYWORDS) {
            if (kw.length <= 4) {
                const rx = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'i');
                if (rx.test(normalized)) return true;
            } else {
                if (normalized.includes(kw)) return true;
            }
        }
        return false;
    }

    const NAME_KEYWORDS = ['name', 'full name', 'first name', 'last name', 'fname', 'lname', '이름', '성함', '성명', '성', '주문자'];
    const EMAIL_KEYWORDS = ['email', 'e-mail', 'mail', '이메일', '메일'];
    const PHONE_KEYWORDS = ['phone', 'tel', 'mobile', 'cell', 'telephone', '전화', '연락처', '휴대폰', '핸드폰'];
    const SUBJECT_KEYWORDS = ['subject', 'title', 'topic', 'regarding', '제목', '문의제목'];
    const MESSAGE_KEYWORDS = ['message', 'comment', 'inquiry', 'body', 'content', 'description', 'notes', 'details', '메시지', '문의내용', '내용'];

    const HONEYPOT_KEYWORDS = ['honeypot', 'hp_', 'hp-', 'trap', 'botcheck', 'leave_blank', 'do_not_fill', 'website_url_hp', 'url_check'];

    const SAFE_GENERIC_ANSWERS = {
        subject: 'General Inquiry',
        topic: 'General Inquiry',
        inquiry: 'General Inquiry',
        source: 'Website',
        referral: 'Website',
        preference: 'No Preference',
        experience: 'General',
        program: 'General Information',
        location: 'Main Location',
        service: 'General Services',
        other: 'General Inquiry'
    };

    // ------------------------------------------------------------------------
    // Helper Utilities
    // ------------------------------------------------------------------------

    function getElementContextText(el) {
        if (!el) return '';
        const parts = [];
        if (el.name) parts.push(el.name);
        if (el.id) parts.push(el.id);
        if (el.placeholder) parts.push(el.placeholder);
        if (el.getAttribute) {
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) parts.push(ariaLabel);
            const ariaDescribedBy = el.getAttribute('aria-describedby');
            if (ariaDescribedBy && typeof document !== 'undefined') {
                const descEl = document.getElementById(ariaDescribedBy);
                if (descEl && descEl.textContent) parts.push(descEl.textContent);
            }
        }

        // Associated label
        if (el.labels && el.labels.length > 0) {
            for (let i = 0; i < el.labels.length; i++) {
                if (el.labels[i].textContent) parts.push(el.labels[i].textContent);
            }
        } else if (el.id && typeof document !== 'undefined') {
            const labelFor = document.querySelector(`label[for="${el.id}"]`);
            if (labelFor && labelFor.textContent) parts.push(labelFor.textContent);
        }

        // Parent label or fieldset legend
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
            if (parent.tagName === 'LABEL') {
                parts.push(parent.textContent);
                break;
            }
            if (parent.tagName === 'FIELDSET') {
                const legend = parent.querySelector('legend');
                if (legend && legend.textContent) parts.push(legend.textContent);
            }
            // Nearby preceding text
            if (parent.previousElementSibling && parent.previousElementSibling.textContent) {
                const txt = parent.previousElementSibling.textContent.trim();
                if (txt.length < 80) parts.push(txt);
            }
            parent = parent.parentElement;
            depth++;
        }

        return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function isElementRequired(el) {
        if (!el) return false;
        if (el.required) return true;
        if (el.getAttribute && (el.getAttribute('aria-required') === 'true' || el.getAttribute('required') !== null)) return true;
        const cls = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
        if (/\b(required|mandatory|is-required|req)\b/.test(cls)) return true;
        // Check label asterisk
        const ctx = getElementContextText(el);
        if (/\*|필수|\(required\)/i.test(ctx)) return true;
        return false;
    }

    function isElementVisible(el) {
        if (!el) return false;
        if (el.type === 'hidden') return false;
        if (el.style) {
            if (el.style.display === 'none' || el.style.visibility === 'hidden' || el.style.opacity === '0') return false;
        }
        const isJSDOM = typeof window !== 'undefined' && (window.name === 'nodejs' || (window.navigator && /jsdom/i.test(window.navigator.userAgent)));
        if (!isJSDOM && typeof el.getBoundingClientRect === 'function' && typeof el.offsetParent !== 'undefined') {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) return false;
        }
        return true;
    }

    function isHoneypot(el) {
        if (!el) return false;
        const ctx = getElementContextText(el);
        if (HONEYPOT_KEYWORDS.some(k => ctx.includes(k))) return true;
        if (el.style && (el.style.opacity === '0' || el.style.position === 'absolute' && (parseInt(el.style.left) < -500 || parseInt(el.style.top) < -500))) return true;
        if (el.tabIndex === -1 && !isElementRequired(el)) {
            if (el.style && (el.style.width === '0px' || el.style.height === '0px')) return true;
        }
        return false;
    }

    function setNativeValue(el, value) {
        if (!el) return;
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) {
            desc.set.call(el, value);
        } else {
            el.value = value;
        }
        const EventCtor = (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.Event) || (typeof Event !== 'undefined' ? Event : null);
        if (EventCtor) {
            el.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true }));
        }
    }

    function setNativeChecked(el, checked) {
        if (!el) return;
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked');
        if (desc && desc.set) {
            desc.set.call(el, checked);
        } else {
            el.checked = checked;
        }
        const EventCtor = (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.Event) || (typeof Event !== 'undefined' ? Event : null);
        if (EventCtor) {
            el.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true }));
        }
    }

    // ------------------------------------------------------------------------
    // FinalFormCompletionEngine Class
    // ------------------------------------------------------------------------

    class FinalFormCompletionEngine {
        constructor(options = {}) {
            this.options = options;
            this.logger = options.logger || console.log;
            this.checkboxResolver = options.checkboxResolver || (CheckboxResolverR2 ? new CheckboxResolverR2() : null);
            this.selectResolver = options.selectResolver || (SelectResolverR2 ? new SelectResolverR2() : null);
            this.domainChoiceCache = new Map();
        }

        /**
         * Re-enumerates the live DOM from scratch to prevent stale references.
         */
        enumerateLiveControls(form) {
            const controls = [];
            if (!form) return controls;

            const selector = 'input, textarea, select, [contenteditable="true"], [role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], .ant-select, .MuiSelect-select';
            
            function collectFromRoot(root) {
                if (!root) return;
                const found = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [];
                for (const el of found) {
                    if (!controls.includes(el)) controls.push(el);
                }
                // Open ShadowDOM
                const allNodes = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
                for (const node of allNodes) {
                    if (node.shadowRoot) {
                        collectFromRoot(node.shadowRoot);
                    }
                }
                // Same-origin iframe
                const iframes = root.querySelectorAll ? Array.from(root.querySelectorAll('iframe')) : [];
                for (const iframe of iframes) {
                    try {
                        if (iframe.contentDocument && iframe.contentDocument.body) {
                            collectFromRoot(iframe.contentDocument.body);
                        }
                    } catch (_) {}
                }
            }

            collectFromRoot(form);
            return controls;
        }

        /**
         * Classifies control category.
         */
        classifyControl(el) {
            if (!el) return { category: 'unknown', isSensitive: false, isHoneypot: false };

            const tag = (el.tagName || '').toLowerCase();
            const type = (el.type || '').toLowerCase();
            const role = (el.getAttribute ? el.getAttribute('role') || '' : '').toLowerCase();
            const ctx = getElementContextText(el);

            if (isHoneypot(el)) {
                return { category: 'honeypot', isSensitive: false, isHoneypot: true };
            }

            // Checkbox takes precedence over general sensitive text matching
            if (type === 'checkbox' || role === 'checkbox' || role === 'switch') {
                let cat = 'inquiry_checkbox';
                if (this.checkboxResolver) {
                    if (typeof this.checkboxResolver.classify === 'function') {
                        cat = this.checkboxResolver.classify(el);
                    } else if (typeof this.checkboxResolver.classifyCheckbox === 'function') {
                        const cInfo = this.checkboxResolver.classifyCheckbox(el);
                        cat = typeof cInfo === 'string' ? cInfo : (cInfo.category || 'inquiry_checkbox');
                    }
                } else if (/terms|privacy|policy|agree|consent|동의/i.test(ctx)) {
                    cat = 'terms_privacy_checkbox';
                } else if (/newsletter|subscribe|marketing|sms|promo|광고/i.test(ctx)) {
                    cat = 'marketing_newsletter_checkbox';
                }
                return { category: cat, subcategory: cat, isSensitive: false, isHoneypot: false };
            }

            // Radio takes precedence over general sensitive text matching
            if (type === 'radio' || role === 'radio') {
                return { category: 'inquiry_radio', isSensitive: false, isHoneypot: false };
            }

            // Dropdown / Select
            if (tag === 'select' || role === 'combobox' || role === 'listbox' || /ant-select|muiselect/i.test(el.className || '')) {
                if (/program|service|experience|interest|topic|regarding|inquiry/i.test(ctx)) {
                    return { category: 'inquiry_dropdown', isSensitive: false, isHoneypot: false };
                }
                return { category: 'safe_dropdown', isSensitive: false, isHoneypot: false };
            }

            // Structural semantics take precedence over math captcha (CAP-02 contamination fix)
            if (tag === 'input' && type === 'email') return { category: 'email', isSensitive: false, isHoneypot: false };
            if (tag === 'input' && type === 'tel') return { category: 'phone', isSensitive: false, isHoneypot: false };
            if (tag === 'textarea') return { category: 'message', isSensitive: false, isHoneypot: false };

            // Math Captcha / Human Verification Equation Guard (field-local, exclusive)
            if (_MathCaptchaSolver && typeof _MathCaptchaSolver.solveField === 'function') {
                const mathVal = _MathCaptchaSolver.solveField(el, getElementContextText);
                if (mathVal !== null) {
                    return { category: 'math_captcha', value: String(mathVal), isSensitive: false, isHoneypot: false };
                }
            }

            // Sensitive Factual Guard
            if (matchesSensitiveFact(ctx)) {
                return { category: 'sensitive_factual', isSensitive: true, isHoneypot: false };
            }

            // Text / Textarea
            if (tag === 'textarea' || (tag === 'input' && (type === 'text' || type === 'email' || type === 'tel' || type === 'number' || type === 'url' || type === 'search' || !type))) {
                if (EMAIL_KEYWORDS.some(k => ctx.includes(k))) return { category: 'email', isSensitive: false, isHoneypot: false };
                if (PHONE_KEYWORDS.some(k => ctx.includes(k))) return { category: 'phone', isSensitive: false, isHoneypot: false };
                if (MESSAGE_KEYWORDS.some(k => ctx.includes(k)) || tag === 'textarea') return { category: 'message', isSensitive: false, isHoneypot: false };
                if (SUBJECT_KEYWORDS.some(k => ctx.includes(k))) return { category: 'subject', isSensitive: false, isHoneypot: false };
                if (NAME_KEYWORDS.some(k => ctx.includes(k))) return { category: 'name', isSensitive: false, isHoneypot: false };

                if (type === 'number' || /zip|postal|code|qty|count/i.test(ctx)) return { category: 'safe_number_text', isSensitive: false, isHoneypot: false };
                return { category: 'unknown_text', isSensitive: false, isHoneypot: false };
            }

            return { category: 'unknown', isSensitive: false, isHoneypot: false };
        }

        /**
         * Checks if control is already resolved.
         */
        isControlResolved(el, classification) {
            if (!el) return true;
            const tag = (el.tagName || '').toLowerCase();
            const type = (el.type || '').toLowerCase();

            if (type === 'checkbox' || el.getAttribute && el.getAttribute('role') === 'checkbox') {
                // If required, must be checked; if optional marketing, considered resolved as unchecked
                if (classification.category === 'marketing_newsletter_checkbox' || classification.category === 'marketing_optional' || classification.category === 'newsletter_optional' || classification.category === 'sms_marketing_optional') {
                    return true;
                }
                if (isElementRequired(el)) {
                    return el.checked === true;
                }
                return true;
            }

            if (type === 'radio' || el.getAttribute && el.getAttribute('role') === 'radio') {
                if (isElementRequired(el)) {
                    // Check if any radio in the same group is checked
                    if (el.name && el.form) {
                        const checked = el.form.querySelector(`input[type="radio"][name="${el.name}"]:checked`);
                        return !!checked;
                    }
                    return el.checked === true;
                }
                return true;
            }

            if (tag === 'select') {
                if (isElementRequired(el)) {
                    if (el.selectedIndex < 0) return false;
                    const opt = el.options[el.selectedIndex];
                    if (!opt) return false;
                    const val = (opt.value || '').trim();
                    const txt = (opt.text || '').trim();
                    if (!val && !txt) return false;
                    if (/^(select|choose|--|please select|선택)/i.test(txt) && !val) return false;
                    return true;
                }
                return true;
            }

            if (classification && classification.category === 'math_captcha') {
                const val = (el.value || '').trim();
                return val === classification.value || (val.length > 0 && !isNaN(Number(val)));
            }

            if (tag === 'input' || tag === 'textarea') {
                const val = (el.value || '').trim();
                if (isElementRequired(el)) {
                    return val.length > 0;
                }
                return true;
            }

            return true;
        }

        /**
         * Main Execution Pass: Runs AI Final Fill Pass immediately before submit.
         */
        async run(form, template = {}, pageContext = {}) {
            if (!form) return { pass: false, reason: 'NO_FORM' };

            const controls = this.enumerateLiveControls(form);
            let unresolvedBefore = 0;
            let checkboxResolved = 0;
            let radioResolved = 0;
            let selectResolved = 0;
            let textResolved = 0;

            const domainKey = (typeof window !== 'undefined' && window.location ? window.location.hostname : 'default');

            // 1. First Pass: Classification & Resolution
            for (const el of controls) {
                const required = isElementRequired(el);
                const classification = this.classifyControl(el);

                if (classification.category === 'honeypot') {
                    // Honeypots must never be touched
                    continue;
                }

                const resolved = this.isControlResolved(el, classification);
                if (!resolved) unresolvedBefore++;

                if (!resolved && required) {
                    // SENSITIVE FACT GUARD: Never fabricate sensitive facts
                    if (classification.category === 'sensitive_factual') {
                        // Check if template explicitly provided it
                        const tplVal = template[el.name] || template[el.id];
                        if (tplVal) {
                            setNativeValue(el, tplVal);
                            textResolved++;
                        } else {
                            this.logger(`[MISSED_FIELD] type=${el.tagName} label="${getElementContextText(el)}" reason=UNRESOLVED_REQUIRED_FACT`);
                            // Halt: Cannot resolve sensitive required fact
                            return {
                                pass: false,
                                reason: 'UNRESOLVED_REQUIRED_FACT',
                                unresolvedField: el,
                                context: getElementContextText(el)
                            };
                        }
                        continue;
                    }

                    // TIER 1: Template mapping & Math Captcha
                    const ctx = getElementContextText(el);
                    let handled = false;

                    if (classification.category === 'math_captcha') {
                        setNativeValue(el, classification.value);
                        textResolved++;
                        handled = true;
                    } else if (classification.category === 'name' && (template.name || template.fullName || template.firstName)) {
                        setNativeValue(el, template.name || template.fullName || template.firstName);
                        textResolved++;
                        handled = true;
                    } else if (classification.category === 'email' && template.email) {
                        setNativeValue(el, template.email);
                        textResolved++;
                        handled = true;
                    } else if (classification.category === 'phone' && (template.phone || template.telephone)) {
                        setNativeValue(el, template.phone || template.telephone);
                        textResolved++;
                        handled = true;
                    } else if (classification.category === 'subject' && template.subject) {
                        setNativeValue(el, template.subject);
                        textResolved++;
                        handled = true;
                    } else if (classification.category === 'message' && (template.message || template.content)) {
                        setNativeValue(el, template.message || template.content);
                        textResolved++;
                        handled = true;
                    }

                    // TIER 2 & 3 & 4: Control-specific resolutions
                    if (!handled) {
                        const tag = (el.tagName || '').toLowerCase();
                        const type = (el.type || '').toLowerCase();

                        // Checkbox
                        if (type === 'checkbox' || el.getAttribute && el.getAttribute('role') === 'checkbox') {
                            if (classification.category === 'terms_privacy_checkbox' || classification.category === 'privacy_required' || classification.category === 'terms_required' || classification.category === 'response_consent_required') {
                                const isConsentAuthorized = Boolean(
                                    this.options.ownerAuthorizedConsent ||
                                    template.ownerAuthorizedConsent ||
                                    template.allowAutoConsent
                                );
                                if (isConsentAuthorized) {
                                    setNativeChecked(el, true);
                                    checkboxResolved++;
                                } else {
                                    this.logger(`[LEGAL_CONSENT_GUARD] type=checkbox label="${getElementContextText(el)}" reason=OWNER_ACTION_REQUIRED`);
                                    return {
                                        pass: false,
                                        reason: 'OWNER_ACTION_REQUIRED',
                                        unresolvedField: el,
                                        context: getElementContextText(el)
                                    };
                                }
                            } else if (classification.category === 'marketing_newsletter_checkbox' || classification.category === 'marketing_optional' || classification.category === 'newsletter_optional' || classification.category === 'sms_marketing_optional') {
                                // Strictly remain unchecked
                            } else if (classification.category === 'inquiry_choice' || classification.category === 'inquiry_checkbox' || classification.category === 'unknown') {
                                // Cache choice per domain to avoid rerandomization
                                const groupKey = domainKey + '_' + (el.name || 'single_cb');
                                if (!this.domainChoiceCache.has(groupKey)) {
                                    this.domainChoiceCache.set(groupKey, el.id || el.name || 'checked');
                                    setNativeChecked(el, true);
                                    checkboxResolved++;
                                } else if (this.domainChoiceCache.get(groupKey) === (el.id || el.name || 'checked')) {
                                    setNativeChecked(el, true);
                                    checkboxResolved++;
                                }
                            }
                        }

                        // Radio Group
                        else if (type === 'radio' || el.getAttribute && el.getAttribute('role') === 'radio') {
                            const allRadios = el.form ? Array.from(el.form.querySelectorAll(`input[type="radio"][name="${el.name}"]`)) : [el];
                            let radios = allRadios.filter(r => !r.disabled && isElementVisible(r));
                            if (radios.length === 0) radios = allRadios.filter(r => !r.disabled);
                            if (radios.length === 0) radios = [el];
                            
                            // 1. Template match
                            const tplKeywords = [
                                template.priority, template.service, template.topic, template.category
                            ].filter(Boolean).map(s => String(s).toLowerCase());

                            let chosen = null;
                            if (tplKeywords.length > 0) {
                                chosen = radios.find(r => {
                                    const rCtx = getElementContextText(r).toLowerCase();
                                    const rVal = (r.value || '').toLowerCase();
                                    return tplKeywords.some(kw => rCtx.includes(kw) || rVal.includes(kw));
                                });
                            }

                            // 2. Neutral / Safe Inquiry Choice (Standard / Normal / General / Other / Inquiry)
                            if (!chosen) {
                                chosen = radios.find(r => {
                                    const rCtx = getElementContextText(r);
                                    const rVal = r.value || '';
                                    return /standard|normal|general|other|inquiry|none|기본|일반|보통|기타|문의/i.test(rCtx) ||
                                           /standard|normal|general|other|inquiry|none|기본|일반|보통|기타|문의/i.test(rVal);
                                });
                            }

                            if (chosen) {
                                setNativeChecked(chosen, true);
                                radioResolved++;
                            } else if (isElementRequired(el)) {
                                // P0 Truthfulness Guard: Do not fabricate an ungrounded business fact
                                this.logger(`[BUSINESS_CHOICE_GUARD] type=radio name="${el.name}" reason=UNRESOLVED_BUSINESS_CHOICE`);
                                return {
                                    pass: false,
                                    reason: 'UNRESOLVED_BUSINESS_CHOICE',
                                    unresolvedField: el,
                                    context: getElementContextText(el)
                                };
                            }
                        }

                        // Dropdown / Select
                        else if (tag === 'select') {
                            let resolvedSel = false;
                            if (this.selectResolver && typeof this.selectResolver.resolveNativeSelect === 'function') {
                                const res = await this.selectResolver.resolveNativeSelect(el, { template });
                                if (res && res.applied) resolvedSel = true;
                            }
                            if (!resolvedSel && el.options && el.options.length > 1) {
                                const tplKeywords = [
                                    template.service, template.department, template.category,
                                    template.topic, template.inquiryType, template.subject
                                ].filter(Boolean).map(s => String(s).toLowerCase());

                                let matchedOpt = null;
                                // 1. Look for option matching owner template
                                if (tplKeywords.length > 0) {
                                    for (let i = 1; i < el.options.length; i++) {
                                        const opt = el.options[i];
                                        if (opt.disabled) continue;
                                        const optText = (opt.text || '').toLowerCase();
                                        const optVal = (opt.value || '').toLowerCase();
                                        if (tplKeywords.some(kw => optText.includes(kw) || optVal.includes(kw))) {
                                            matchedOpt = { index: i, val: opt.value || opt.text };
                                            break;
                                        }
                                    }
                                }

                                // 2. Look for neutral / safe inquiry options
                                if (!matchedOpt) {
                                    for (let i = 1; i < el.options.length; i++) {
                                        const opt = el.options[i];
                                        if (opt.disabled) continue;
                                        const optText = (opt.text || '').toLowerCase();
                                        const optVal = (opt.value || '').toLowerCase();
                                        if (/general|inquiry|other|contact|support|consulting|일반|문의|기타|상담/i.test(optText) ||
                                            /general|inquiry|other|contact|support|consulting|일반|문의|기타|상담/i.test(optVal)) {
                                            matchedOpt = { index: i, val: opt.value || opt.text };
                                            break;
                                        }
                                    }
                                }

                                if (matchedOpt) {
                                    el.selectedIndex = matchedOpt.index;
                                    setNativeValue(el, matchedOpt.val);
                                    resolvedSel = true;
                                    selectResolved++;
                                } else if (isElementRequired(el)) {
                                    // P0 Truthfulness Guard: Do not blindly pick options[1] if no truthful/neutral match
                                    this.logger(`[BUSINESS_CHOICE_GUARD] type=select label="${getElementContextText(el)}" reason=UNRESOLVED_BUSINESS_CHOICE`);
                                    return {
                                        pass: false,
                                        reason: 'UNRESOLVED_BUSINESS_CHOICE',
                                        unresolvedField: el,
                                        context: getElementContextText(el)
                                    };
                                }
                            }
                        }

                        // Constraint-aware, template-grounded required input / textarea completion
                        else if (tag === 'input' || tag === 'textarea') {
                            // Preserve any already-populated value (e.g. solved math captcha answer or user template text)
                            // ONLY IF it passes native validity. If it is invalid (e.g. out of range, bad format), re-solve it.
                            if ((el.value || '').trim().length > 0) {
                                if (typeof el.checkValidity !== 'function' || el.checkValidity()) {
                                    continue;
                                }
                            }

                            let answer = '';

                            // 1. Number & Range Constraints (min, max, step)
                            if (type === 'number' || type === 'range') {
                                const min = (el.min !== '' && el.min !== null && !isNaN(Number(el.min))) ? Number(el.min) : null;
                                const max = (el.max !== '' && el.max !== null && !isNaN(Number(el.max))) ? Number(el.max) : null;
                                const step = (el.step !== '' && el.step !== null && el.step !== 'any' && !isNaN(Number(el.step))) ? Number(el.step) : 1;

                                let numVal = (min !== null) ? min : 1;
                                if (numVal <= 0 && min === null) numVal = 1;
                                if (max !== null && numVal > max) numVal = max;

                                // Ensure step alignment if min is defined
                                if (min !== null && step > 0) {
                                    const diff = numVal - min;
                                    const rem = diff % step;
                                    if (rem !== 0) numVal = numVal - rem + step;
                                    if (max !== null && numVal > max) numVal = max;
                                }
                                answer = String(numVal);
                            }
                            // 2. Date & Time Inputs
                            else if (type === 'date') {
                                const now = new Date();
                                const y = now.getFullYear();
                                const m = String(now.getMonth() + 1).padStart(2, '0');
                                const d = String(now.getDate()).padStart(2, '0');
                                let dateVal = `${y}-${m}-${d}`;
                                if (el.min && dateVal < el.min) dateVal = el.min;
                                if (el.max && dateVal > el.max) dateVal = el.max;
                                answer = dateVal;
                            }
                            else if (type === 'time') {
                                let timeVal = '10:00';
                                if (el.min && timeVal < el.min) timeVal = el.min;
                                if (el.max && timeVal > el.max) timeVal = el.max;
                                answer = timeVal;
                            }
                            else if (type === 'datetime-local') {
                                const now = new Date();
                                const y = now.getFullYear();
                                const m = String(now.getMonth() + 1).padStart(2, '0');
                                const d = String(now.getDate()).padStart(2, '0');
                                answer = `${y}-${m}-${d}T10:00`;
                            }
                            // 3. Specialized Web Form Types (URL, Email, Tel)
                            else if (type === 'url' || /\b(website|homepage|site|url)\b/i.test(ctx)) {
                                const truthfulUrl = (template.website || template.url || template.homepage || template.siteUrl || '').trim();
                                if (truthfulUrl) {
                                    answer = truthfulUrl;
                                } else {
                                    // P0 Truthfulness Guard: Do not fabricate https://example.com as an ungrounded business fact
                                    this.logger(`[BUSINESS_FACT_GUARD] type=url label="${ctx}" reason=UNRESOLVED_BUSINESS_FACT`);
                                    return {
                                        pass: false,
                                        reason: 'UNRESOLVED_BUSINESS_FACT',
                                        unresolvedField: el,
                                        context: ctx
                                    };
                                }
                            }
                            else if (type === 'email' || /\b(email|mail)\b/i.test(ctx)) {
                                answer = template.email || 'inquiry@example.com';
                            }
                            else if (type === 'tel' || /\b(phone|tel|mobile|cell)\b/i.test(ctx)) {
                                // [RC3.60 .90 Fix] Standard US 10-digit phone format, never Korean 010 on US/NANP forms
                    answer = template.phone || template.telephone || '202-555-0149';
                            }
                            // 4. Textarea / Multi-line Comments (strictly message, NEVER phone)
                            else if (tag === 'textarea' || /\b(message|inquiry|comment|details|description|body)\b/i.test(ctx)) {
                                answer = template.message || template.content || 'Thank you for your assistance. We are submitting a general inquiry regarding your services.';
                            }
                            // 5. Contextual semantic deductions for ordinary form fields
                            else {
                                if (/\b(company|organization|firm|corp|business)\b/i.test(ctx)) {
                                    answer = template.company || template.organization || 'XPIDER Solutions';
                                } else if (/\b(department|division|team|dept)\b/i.test(ctx)) {
                                    answer = 'Operations';
                                } else if (/\b(title|position|job)\b/i.test(ctx)) {
                                    answer = 'Manager';
                                } else if (/\b(city|town)\b/i.test(ctx)) {
                                    answer = template.city || 'Seoul';
                                } else if (/\b(state|province|region)\b/i.test(ctx)) {
                                    answer = template.state || 'Seoul';
                                } else if (/\b(zip|postal|postcode)\b/i.test(ctx)) {
                                    answer = template.zip || '12345';
                                } else if (/\b(country|nation)\b/i.test(ctx)) {
                                    answer = 'South Korea';
                                } else if (/\b(subject|topic|regarding)\b/i.test(ctx)) {
                                    answer = template.subject || 'General Inquiry';
                                } else {
                                    for (const [k, v] of Object.entries(SAFE_GENERIC_ANSWERS)) {
                                        if (ctx.includes(k)) {
                                            answer = v;
                                            break;
                                        }
                                    }
                                    if (!answer) answer = 'General Inquiry';
                                }
                            }

                            // 6. Enforce pattern & length constraints
                            if (el.maxLength && el.maxLength > 0 && answer.length > el.maxLength) {
                                answer = answer.substring(0, el.maxLength);
                            }
                            if (el.minLength && el.minLength > 0 && answer.length < el.minLength) {
                                while (answer.length < el.minLength) {
                                    answer += ' ';
                                }
                            }
                            if (el.pattern) {
                                try {
                                    const regex = new RegExp(`^(?:${el.pattern})$`);
                                    if (!regex.test(answer)) {
                                        if (/^\^?\\d\+\$?$/.test(el.pattern) || /^\^?\[0-9\]\+\$?$/.test(el.pattern)) {
                                            answer = '12345';
                                        } else if (/^\^?\[a-z\]\+\$?$/i.test(el.pattern)) {
                                            answer = 'Inquiry';
                                        } else if (/^\^?\\d{3}-\\d{3,4}-\\d{4}\$?$/.test(el.pattern)) {
                                            answer = '010-1234-5678';
                                        } else if (/^\^?\\d{5}\$?$/.test(el.pattern)) {
                                            answer = '12345';
                                        }
                                    }
                                } catch (_) {}
                            }

                            setNativeValue(el, answer);

                            // 7. Verify native validity
                            if (typeof el.checkValidity === 'function') {
                                if (!el.checkValidity() && el.validity) {
                                    if (el.validity.rangeUnderflow && el.min) setNativeValue(el, el.min);
                                    else if (el.validity.rangeOverflow && el.max) setNativeValue(el, el.max);
                                    else if (el.validity.tooLong && el.maxLength > 0) setNativeValue(el, answer.substring(0, el.maxLength));
                                }
                            }

                            textResolved++;
                        }
                    }
                }
            }

            // 2. Stability Verification Wait (150-300ms)
            await new Promise(r => setTimeout(r, 200));

            // 3. Final Required Audit (Hard Gate)
            const auditResult = await this.finalRequiredAudit(form, template, { controlsTotal: controls.length, unresolvedBefore, aiResolved: checkboxResolved + radioResolved + selectResolved + textResolved });

            this.logger(`[FINAL_FILL] controls=${controls.length} unresolvedBefore=${unresolvedBefore} checkboxResolved=${checkboxResolved} radioResolved=${radioResolved} selectResolved=${selectResolved} unresolvedAfter=${auditResult.unresolvedRequired}`);
            this.logger(`[FINAL_AUDIT] ${auditResult.pass ? 'PASS' : 'FAIL'}`);
            this.logger(`[FIELD_SUMMARY] text required ${auditResult.requiredTextResolved}/${auditResult.requiredTextTotal} | checkbox ${auditResult.requiredCheckboxResolved}/${auditResult.requiredCheckboxTotal} | radio ${auditResult.requiredRadioResolved}/${auditResult.requiredRadioTotal} | select ${auditResult.requiredSelectResolved}/${auditResult.requiredSelectTotal} | message ${auditResult.messageFieldFilled ? '1/1' : '0/1'} | unresolved ${auditResult.unresolvedRequired}`);

            return auditResult;
        }

        /**
         * Final Required Audit Hard Gate
         */
        async finalRequiredAudit(form, template = {}, stats = {}) {
            const controls = this.enumerateLiveControls(form);

            let requiredTotal = 0;
            let requiredResolved = 0;
            let unresolvedRequired = 0;
            let unstableCheckboxes = 0;
            let unstableRadios = 0;
            let unstableSelects = 0;
            let unstableText = 0;
            let nativeInvalidCount = 0;
            let customInvalidCount = 0;

            let requiredTextTotal = 0;
            let requiredTextResolved = 0;
            let requiredCheckboxTotal = 0;
            let requiredCheckboxResolved = 0;
            let requiredRadioTotal = 0;
            let requiredRadioResolved = 0;
            let requiredSelectTotal = 0;
            let requiredSelectResolved = 0;
            let messageFieldFilled = false;

            const unresolvedList = [];
            const invalidFields = [];

            for (const el of controls) {
                const required = isElementRequired(el);
                const classification = this.classifyControl(el);

                if (classification.category === 'honeypot') continue;

                const tag = (el.tagName || '').toLowerCase();
                const type = (el.type || '').toLowerCase();

                // Check message field
                if (classification.category === 'message' || tag === 'textarea') {
                    if ((el.value || '').trim().length > 0) messageFieldFilled = true;
                }

                if (required) {
                    requiredTotal++;
                    const resolved = this.isControlResolved(el, classification);

                    if (type === 'checkbox') {
                        requiredCheckboxTotal++;
                        if (resolved) requiredCheckboxResolved++;
                        else unstableCheckboxes++;
                    } else if (type === 'radio') {
                        requiredRadioTotal++;
                        if (resolved) requiredRadioResolved++;
                        else unstableRadios++;
                    } else if (tag === 'select') {
                        requiredSelectTotal++;
                        if (resolved) requiredSelectResolved++;
                        else unstableSelects++;
                    } else {
                        requiredTextTotal++;
                        if (resolved) requiredTextResolved++;
                        else unstableText++;
                    }

                    if (resolved) {
                        requiredResolved++;
                    } else {
                        unresolvedRequired++;
                        unresolvedList.push({
                            type: el.tagName,
                            label: getElementContextText(el),
                            reason: 'REQUIRED_UNRESOLVED'
                        });
                        this.logger(`[MISSED_FIELD] type=${el.tagName} label="${getElementContextText(el)}" reason=REQUIRED_UNRESOLVED`);
                    }
                }

                // Check native invalidity
                if (typeof el.checkValidity === 'function') {
                    try {
                        if (!el.checkValidity()) {
                            // [RC3.60 .90 Recovery] If field is OPTIONAL and invalid, safely clear it to restore valid empty state
                            if (!required) {
                                setNativeValue(el, '');
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.dispatchEvent(new Event('blur', { bubbles: true }));
                                if (typeof this.logger === 'function') {
                                    this.logger(`[OPTIONAL_RECOVERY] Cleared invalid optional field category=${classification.category} id=${el.id || el.name}`);
                                }
                            } else {
                                nativeInvalidCount++;
                                invalidFields.push({ tag, type: type || 'text', category: classification.category, kind: 'native' });
                            }
                        }
                    } catch (_) {}
                }
                if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') {
                    // [RC3.60 .90 Recovery] If field is OPTIONAL and custom invalid (e.g. Wix phone mask), safely clear it
                    if (!required) {
                        setNativeValue(el, '');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                        if (typeof this.logger === 'function') {
                            this.logger(`[OPTIONAL_RECOVERY] Cleared custom-invalid optional field category=${classification.category} id=${el.id || el.name}`);
                        }
                    } else {
                        customInvalidCount++;
                        invalidFields.push({ tag, type: type || 'text', category: classification.category, kind: 'custom' });
                    }
                }
            }

            // Fallback message check if template message exists and form has textareas
            if (!messageFieldFilled && (template.message || template.content)) {
                const textareas = form.querySelectorAll ? form.querySelectorAll('textarea') : [];
                for (const ta of textareas) {
                    if ((ta.value || '').trim().length > 0) {
                        messageFieldFilled = true;
                        break;
                    }
                }
            }

            const pass = (
                unresolvedRequired === 0 &&
                unstableCheckboxes === 0 &&
                unstableRadios === 0 &&
                unstableSelects === 0 &&
                unstableText === 0 &&
                nativeInvalidCount === 0 &&
                customInvalidCount === 0 &&
                messageFieldFilled === true
            );

            const emptySafeAfter = unresolvedRequired;
            const fillableTotal = stats.controlsTotal !== undefined ? stats.controlsTotal : controls.length;
            const filledByAI = stats.aiResolved !== undefined ? stats.aiResolved : 0;
            const filledBefore = stats.unresolvedBefore !== undefined ? (fillableTotal - stats.unresolvedBefore) : (fillableTotal - unresolvedRequired);
            const logMsg = `[AI_COMPLETE_FORM] fillableTotal=${fillableTotal} filledBefore=${filledBefore} filledByAI=${filledByAI} safeSkipped=0 sensitiveBlocked=${unresolvedRequired > 0 ? 1 : 0} emptySafeAfter=${emptySafeAfter}`;
            console.log(logMsg);
            if (typeof this.logger === 'function') this.logger(logMsg);

            let failReason = 'AUDIT_PASSED';
            if (!pass) {
                if (unresolvedRequired > 0 || unstableCheckboxes + unstableRadios + unstableSelects + unstableText > 0) failReason = 'REQUIRED_FIELDS_UNRESOLVED';
                else if (nativeInvalidCount > 0) failReason = 'FINAL_NATIVE_VALIDITY_FAILED';
                else if (customInvalidCount > 0) failReason = 'FINAL_CUSTOM_VALIDITY_FAILED';
                else if (!messageFieldFilled) failReason = 'FINAL_MESSAGE_FIELD_EMPTY';
                else failReason = 'FINAL_FORM_COMPLETION_FAILED';
                if (typeof this.logger === 'function') {
                    this.logger(`[FINAL_AUDIT_DETAIL] reason=${failReason} unresolvedRequired=${unresolvedRequired} nativeInvalidCount=${nativeInvalidCount} customInvalidCount=${customInvalidCount} invalid=${JSON.stringify(invalidFields.slice(0, 8))}`);
                }
            }

            return {
                pass,
                reason: failReason,
                invalidFields,
                emptySafeAfter,
                requiredTotal,
                requiredResolved,
                unresolvedRequired,
                unstableCheckboxes,
                unstableRadios,
                unstableSelects,
                unstableText,
                nativeInvalidCount,
                customInvalidCount,
                requiredTextTotal,
                requiredTextResolved,
                requiredCheckboxTotal,
                requiredCheckboxResolved,
                requiredRadioTotal,
                requiredRadioResolved,
                requiredSelectTotal,
                requiredSelectResolved,
                messageFieldFilled,
                unresolvedList
            };
        }
    }

    return FinalFormCompletionEngine;
}));

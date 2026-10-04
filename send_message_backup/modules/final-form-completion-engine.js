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
        if (typeof el.getBoundingClientRect === 'function') {
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
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
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
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
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

            // Math Captcha / Human Verification Equation Guard
            if (_MathCaptchaSolver && typeof _MathCaptchaSolver.solveField === 'function') {
                const mathVal = _MathCaptchaSolver.solveField(el, getElementContextText);
                if (mathVal !== null) {
                    return { category: 'math_captcha', value: String(mathVal), isSensitive: false, isHoneypot: false };
                }
            }

            // Sensitive Factual Guard
            if (SENSITIVE_FACT_KEYWORDS.some(kw => ctx.includes(kw))) {
                return { category: 'sensitive_factual', isSensitive: true, isHoneypot: false };
            }

            // Checkbox
            if (type === 'checkbox' || role === 'checkbox' || role === 'switch') {
                if (this.checkboxResolver && typeof this.checkboxResolver.classifyCheckbox === 'function') {
                    const cInfo = this.checkboxResolver.classifyCheckbox(el);
                    return { category: cInfo.category, subcategory: cInfo.category, isSensitive: false, isHoneypot: false };
                }
                if (/terms|privacy|policy|agree|consent|동의/i.test(ctx)) {
                    return { category: 'terms_privacy_checkbox', isSensitive: false, isHoneypot: false };
                }
                if (/newsletter|subscribe|marketing|sms|promo|광고/i.test(ctx)) {
                    return { category: 'marketing_newsletter_checkbox', isSensitive: false, isHoneypot: false };
                }
                return { category: 'inquiry_checkbox', isSensitive: false, isHoneypot: false };
            }

            // Radio
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
                                setNativeChecked(el, true);
                                checkboxResolved++;
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
                            const groupKey = domainKey + '_radio_' + (el.name || 'radio');
                            const radios = el.form ? Array.from(el.form.querySelectorAll(`input[type="radio"][name="${el.name}"]`)).filter(r => !r.disabled && isElementVisible(r)) : [el];
                            
                            if (radios.length > 0) {
                                // Prefer General / Other / Inquiry
                                let chosen = radios.find(r => /general|other|inquiry|none|기타|일반/i.test(getElementContextText(r)));
                                if (!chosen) chosen = radios[0]; // Stable first option
                                setNativeChecked(chosen, true);
                                radioResolved++;
                            }
                        }

                        // Dropdown / Select
                        else if (tag === 'select') {
                            if (this.selectResolver && typeof this.selectResolver.resolveNativeSelect === 'function') {
                                const res = this.selectResolver.resolveNativeSelect(el, getElementContextText(el));
                                if (res && res.applied) selectResolved++;
                            } else if (el.options && el.options.length > 1) {
                                // Fallback: pick first valid non-placeholder option
                                for (let i = 1; i < el.options.length; i++) {
                                    const opt = el.options[i];
                                    if (!opt.disabled && (opt.value || opt.text)) {
                                        el.selectedIndex = i;
                                        setNativeValue(el, opt.value || opt.text);
                                        selectResolved++;
                                        break;
                                    }
                                }
                            }
                        }

                        // Low-stakes required short-answer text
                        else if (tag === 'input' || tag === 'textarea') {
                            let answer = 'General Inquiry';
                            for (const [k, v] of Object.entries(SAFE_GENERIC_ANSWERS)) {
                                if (ctx.includes(k)) {
                                    answer = v;
                                    break;
                                }
                            }
                            if (type === 'number') answer = '1';
                            setNativeValue(el, answer);
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
                        if (!el.checkValidity()) nativeInvalidCount++;
                    } catch (_) {}
                }
                if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') {
                    customInvalidCount++;
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

            return {
                pass,
                reason: pass ? 'AUDIT_PASSED' : 'FINAL_FORM_COMPLETION_FAILED',
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

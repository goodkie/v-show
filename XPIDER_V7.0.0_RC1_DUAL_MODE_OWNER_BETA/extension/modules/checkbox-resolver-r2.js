/**
 * checkbox-resolver-r2.js
 * [Issue #6 R6] CheckboxEngine R2: Deterministic, Category-Classified & Framework-Verified
 * 
 * Features:
 * - Deterministic classification into 10 categories:
 *   1. inquiry_choice
 *   2. program/service_interest
 *   3. privacy_required
 *   4. terms_required
 *   5. response_consent_required
 *   6. marketing_optional
 *   7. newsletter_optional
 *   8. sms_marketing_optional
 *   9. honeypot
 *   10. unknown
 * - Boston BJJ-style inquiry choice group: selects ONE valid option per required group, caches choice across rerenders
 * - Mandatory Terms/Privacy/Consent: auto-checks when required for submission
 * - Marketing/Newsletter/SMS: NEVER auto-checks
 * - Native property descriptor setter + input/change dispatch + blur + post-render settle & verification
 * - 1 corrective retry max; emits REQUIRED_CHECKBOX_UNSTABLE on unrecoverable failure
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CheckboxResolverR2 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const PRIVACY_TERMS_KEYWORDS = [
        'privacy', 'terms', 'condition', 'policy', 'agree', 'consent', 'accurate',
        '개인정보', '이용약관', '동의', '방침', 'gdpr', 'datenschutz', 'einwilligung',
        'terms of service', 'terms of use', 'privacy policy'
    ];

    const RESPONSE_CONSENT_KEYWORDS = [
        'contact me', 'respond', 'reply', 'communicate', 'reach out', 'contact back',
        'contact regarding', 'allow us to contact', '연락 동의', '답변', '회신'
    ];

    const MARKETING_KEYWORDS = [
        'promot', 'offer', 'discount', 'special', 'deal', 'campaign', '광고', '혜택', '이벤트'
    ];

    const NEWSLETTER_KEYWORDS = [
        'newsletter', 'mailing list', 'subscribe to our newsletter', 'email list',
        'stay updated', 'receive updates', '뉴스레터', '구독', '소식받기'
    ];

    const SMS_MARKETING_KEYWORDS = [
        'sms', 'text message', 'text alerts', 'automated text', 'mobile marketing',
        '문자', 'sms 수신'
    ];

    const INQUIRY_INTEREST_KEYWORDS = [
        'program', 'interest', 'interested in', 'service', 'course', 'class', 'lesson',
        'training', 'bjj', 'jiu jitsu', 'martial arts', 'kickboxing', 'muay thai',
        'karate', 'fitness', 'adult', 'kids', 'youth', 'category', 'topic', 'reason',
        '관심', '프로그램', '종목', '수업', '과목', '분야'
    ];

    class CheckboxResolverR2 {
        constructor(options = {}) {
            this.logger = options.logger || console.log;
            this.options = options;
            this.cachedGroupChoices = new Map(); // groupKey -> chosenIdentifier
            this.maxRetries = 1;
        }

        /**
         * Classify checkbox into one of 10 categories
         */
        classify(cbEl, containerContext = '', form = null) {
            if (!cbEl) return 'unknown';

            // Check honeypot first
            if (this.isHoneypot(cbEl)) return 'honeypot';

            const labelText = this.getLabelText(cbEl).toLowerCase();
            const attrText = [
                cbEl.name || '',
                cbEl.id || '',
                cbEl.getAttribute ? (cbEl.getAttribute('aria-label') || '') : '',
                cbEl.getAttribute ? (cbEl.getAttribute('aria-describedby') || '') : '',
                cbEl.value || '',
                cbEl.className || ''
            ].join(' ').toLowerCase();

            const surrounding = (containerContext || this.getSurroundingText(cbEl)).toLowerCase();
            const combined = `${labelText} ${attrText} ${surrounding}`;

            // 1. SMS Marketing (most specific marketing)
            if (SMS_MARKETING_KEYWORDS.some(k => combined.includes(k))) {
                return 'sms_marketing_optional';
            }

            // 2. Newsletter (specific marketing)
            if (NEWSLETTER_KEYWORDS.some(k => combined.includes(k))) {
                return 'newsletter_optional';
            }

            // 3. General Marketing
            if (MARKETING_KEYWORDS.some(k => combined.includes(k))) {
                return 'marketing_optional';
            }

            // 4. Response Consent Necessary for Inquiry
            if (RESPONSE_CONSENT_KEYWORDS.some(k => combined.includes(k))) {
                return 'response_consent_required';
            }

            // 5. Privacy / Terms
            const hasTerms = PRIVACY_TERMS_KEYWORDS.some(k => combined.includes(k));
            if (hasTerms) {
                if (/privacy|개인정보|datenschutz|gdpr/i.test(combined)) {
                    return 'privacy_required';
                }
                return 'terms_required';
            }

            // 6. Program / Service Interest / Inquiry Choice
            const hasInterest = INQUIRY_INTEREST_KEYWORDS.some(k => combined.includes(k));
            if (hasInterest) {
                if (/program|course|class|training|종목|프로그램/i.test(combined)) {
                    return 'program/service_interest';
                }
                return 'inquiry_choice';
            }

            // Check if element belongs to a checkbox group in a fieldset/container with inquiry/interest header
            const parentGroupHeader = this.getParentGroupHeader(cbEl, form).toLowerCase();
            if (INQUIRY_INTEREST_KEYWORDS.some(k => parentGroupHeader.includes(k))) {
                return 'inquiry_choice';
            }

            // [V7-RC5] Any multi-checkbox choice group (>= 2 members) that is not consent/marketing is an inquiry_choice group
            const groupMembers = this.getGroupMembers(cbEl, form || cbEl.form || (cbEl.closest ? cbEl.closest('form') : null));
            if (groupMembers && groupMembers.length >= 2) {
                return 'inquiry_choice';
            }

            return 'unknown';
        }

        /**
         * Check if checkbox is a trap / honeypot
         */
        isHoneypot(el) {
            if (!el) return false;
            if (el.tabIndex === -1) return true;
            if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;

            const nameOrId = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
            if (/\bhoneypot\b|\btrap\b|\bwebsite_url\b|\bleave.*blank\b/i.test(nameOrId)) return true;

            try {
                if (typeof window !== 'undefined' && window.getComputedStyle) {
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                        // Check if it's visually hidden but has a real custom wrapper before calling honeypot
                        const hasCustomWrapper = el.closest && el.closest('[class*="custom-checkbox"], [class*="Checkbox"], .MuiCheckbox-root');
                        if (!hasCustomWrapper && (el.offsetWidth === 0 && el.offsetHeight === 0)) {
                            return true;
                        }
                    }
                }
            } catch (_) {}
            return false;
        }

        /**
         * Resolve and apply state to a single checkbox element with verification
         */
        async resolveCheckbox(cbEl, form = null, options = {}) {
            if (!cbEl) return { handled: false, reason: 'NO_ELEMENT' };
            if (this.isHoneypot(cbEl)) {
                return { handled: true, category: 'honeypot', action: 'skip', stable: true };
            }

            const category = this.classify(cbEl, '', form);
            const groupMembers = this.getGroupMembers(cbEl, form);
            const isChoiceGroup = groupMembers.length >= 2 && (category === 'inquiry_choice' || category === 'program/service_interest' || category === 'unknown');
            const isExplicitRequired = !!(cbEl.required || (cbEl.getAttribute && (cbEl.getAttribute('aria-required') === 'true' || cbEl.getAttribute('required') !== null)));
            const isGroupRequired = this.isGroupRequired(cbEl, form);
            const isRequired = isExplicitRequired || isGroupRequired;

            let shouldCheck = false;
            let groupKey = null;

            switch (category) {
                case 'inquiry_choice':
                case 'program/service_interest':
                    groupKey = this.getGroupIdentifier(cbEl, form);
                    shouldCheck = this.decideGroupSelection(cbEl, groupKey, isRequired, options, form);
                    break;

                case 'privacy_required':
                case 'terms_required':
                case 'response_consent_required':
                    // P0 Security / Legal Guard: Auto-check required terms/consent ONLY if explicitly authorized by Owner
                    const isConsentAuthorized = Boolean(
                        (options && (options.ownerAuthorizedConsent || options.allowAutoConsent)) ||
                        (this.options && (this.options.ownerAuthorizedConsent || this.options.allowAutoConsent))
                    );
                    if (isConsentAuthorized) {
                        shouldCheck = true;
                    } else {
                        // NEVER auto-consent without explicit owner authorization
                        shouldCheck = false;
                        if (isRequired) {
                            if (this.logger) this.logger(`[LEGAL_CONSENT_GUARD] type=checkbox category=${category} action=require_owner_authorization`);
                            return {
                                handled: false,
                                category,
                                action: 'require_owner_authorization',
                                reason: 'OWNER_ACTION_REQUIRED',
                                stable: false,
                                required: true
                            };
                        }
                    }
                    break;

                case 'marketing_optional':
                case 'newsletter_optional':
                case 'sms_marketing_optional':
                    // NEVER auto-check optional marketing
                    shouldCheck = false;
                    break;

                case 'unknown':
                default:
                    if (isChoiceGroup) {
                        groupKey = this.getGroupIdentifier(cbEl, form);
                        shouldCheck = this.decideGroupSelection(cbEl, groupKey, isRequired, options, form);
                    } else {
                        // Standalone checkbox: only check if explicitly required and not marketing
                        shouldCheck = isRequired;
                    }
                    break;
            }

            // [V7-RC5] If this checkbox is an unselected member of a choice group, clear native required attribute
            // so HTML5 checkValidity() does not treat every unchecked member of a choice group as individually required.
            if (isChoiceGroup && !shouldCheck && isRequired) {
                try {
                    cbEl.required = false;
                    if (cbEl.removeAttribute) cbEl.removeAttribute('required');
                } catch (_) {}
            }

            // Apply target state with native setter and verification
            const result = await this.applyAndVerify(cbEl, shouldCheck, category, 0, isChoiceGroup);
            return result;
        }

        /**
         * Resolves all checkboxes within a form container systematically
         */
        async resolveAllInForm(form, options = {}) {
            if (!form) return { handledCount: 0, stable: true, results: [] };

            const checkboxes = Array.from(form.querySelectorAll ? form.querySelectorAll('input[type="checkbox"]') : []);
            const results = [];
            let allStable = true;

            // Group discovery for inquiry checkboxes
            for (const cb of checkboxes) {
                if (this.isHoneypot(cb)) continue;
                const res = await this.resolveCheckbox(cb, form, options);
                results.push(res);
                if (res.required && !res.stable) {
                    allStable = false;
                }
            }

            return {
                handledCount: results.length,
                stable: allStable,
                results
            };
        }

        getCheckboxOptionId(cbEl, indexHint = 0) {
            if (!cbEl) return `opt_${indexHint}`;
            const explicitVal = cbEl.getAttribute && cbEl.getAttribute('value');
            const validVal = (explicitVal && explicitVal !== 'on') ? explicitVal : null;
            return cbEl.id || validVal || this.getLabelText(cbEl) || (cbEl.name ? `${cbEl.name}_${indexHint}` : `opt_${indexHint}`);
        }

        /**
         * Deterministically select one option for an inquiry checkbox group and cache choice
         */
        decideGroupSelection(cbEl, groupKey, isRequired, options = {}, form = null) {
            const members = this.getGroupMembers(cbEl, form);
            const memberIdx = Math.max(0, members.indexOf(cbEl));
            const thisId = this.getCheckboxOptionId(cbEl, memberIdx);

            let chosenId = this.cachedGroupChoices.get(groupKey);

            // [V7-RC5] If a member of this group is already checked (e.g. pre-selected or user/fixture selected) and enabled,
            // honor that valid selection rather than selecting a duplicate or different option.
            if (!chosenId && members.length >= 2) {
                const alreadyCheckedIdx = members.findIndex(m => m && m.checked === true && !m.disabled);
                if (alreadyCheckedIdx !== -1) {
                    chosenId = this.getCheckboxOptionId(members[alreadyCheckedIdx], alreadyCheckedIdx);
                    this.cachedGroupChoices.set(groupKey, chosenId);
                }
            }

            const hasRandomVariation = Boolean(
                (options && options.randomVariation) ||
                (this.options && this.options.randomVariation) ||
                (typeof window !== 'undefined' && window.__xpider_random_variation)
            );

            if (!chosenId) {
                if (isRequired || hasRandomVariation) {
                    // Prefer template match or first enabled option in the group
                    let selectedMember = cbEl;
                    let selectedIdx = memberIdx;
                    if (members.length >= 2) {
                        const enabledMembers = members.filter(m => !m.disabled);
                        const pool = enabledMembers.length > 0 ? enabledMembers : members;
                        const tpl = (options && options.template) || (this.options && this.options.template) || {};
                        const tplKeywords = [
                            tpl.service, tpl.program, tpl.interest, tpl.topic, tpl.category, tpl.inquiryType, tpl.subject
                        ].filter(Boolean).map(s => String(s).toLowerCase());

                        let match = null;
                        if (tplKeywords.length > 0) {
                            match = pool.find(m => {
                                const lbl = this.getLabelText(m).toLowerCase();
                                const val = ((m.getAttribute && m.getAttribute('value')) || '').toLowerCase();
                                return tplKeywords.some(kw => lbl.includes(kw) || val.includes(kw));
                            });
                        }
                        if (!match) {
                            match = pool[0] || cbEl;
                        }
                        selectedMember = match;
                        selectedIdx = Math.max(0, members.indexOf(selectedMember));
                    }
                    chosenId = this.getCheckboxOptionId(selectedMember, selectedIdx);
                    this.cachedGroupChoices.set(groupKey, chosenId);
                    if (this.logger) {
                        this.logger(`[CHECKBOX_GROUP_CHOICE] group="${groupKey}" chosen="${chosenId}" isRequired=${isRequired} randomVariation=${hasRandomVariation}`);
                    }
                }
            }

            if (!isRequired && !hasRandomVariation) {
                return Boolean(chosenId && chosenId === thisId);
            }

            return Boolean(chosenId && chosenId === thisId);
        }

        /**
         * Native-setter + event dispatch + bounded wait + verification + 1 corrective retry
         */
        async applyAndVerify(cbEl, expectedChecked, category, retryCount = 0, isChoiceGroup = false) {
            // Apply native checked property
            this.setNativeChecked(cbEl, expectedChecked);

            // Dispatch input and change events
            this.dispatchChangeEvents(cbEl);

            // Short bounded settle wait for React / Vue / Wix component state
            await this.sleep(40);

            // Re-check actual state after rerender
            let actualChecked = !!cbEl.checked;
            let stable = (actualChecked === expectedChecked);

            if (!stable && retryCount < this.maxRetries) {
                // Corrective retry: attempt click on label / wrapper
                this.correctiveClick(cbEl);
                this.setNativeChecked(cbEl, expectedChecked);
                this.dispatchChangeEvents(cbEl);
                await this.sleep(60);
                actualChecked = !!cbEl.checked;
                stable = (actualChecked === expectedChecked);
                retryCount++;
            }

            const logLine = `[CHECKBOX] category=${category} expected=${expectedChecked} actual=${actualChecked} stable=${stable} retry=${retryCount}`;
            if (this.logger) this.logger(logLine);

            // [V7-RC5] In a choice group, an unchecked member (expectedChecked=false) is NOT individually required
            const isRequired = isChoiceGroup
                ? expectedChecked
                : (category === 'privacy_required' || category === 'terms_required' || category === 'response_consent_required' || !!cbEl.required);

            return {
                handled: true,
                element: cbEl,
                category,
                expected: expectedChecked,
                actual: actualChecked,
                stable,
                retry: retryCount,
                required: isRequired,
                reasonCode: (!stable && isRequired) ? 'REQUIRED_CHECKBOX_UNSTABLE' : (stable ? 'STABLE' : 'UNSTABLE_OPTIONAL')
            };
        }

        /**
         * Safely set checked via HTMLInputElement prototype descriptor
         */
        setNativeChecked(cbEl, checked) {
            try {
                const descriptor = Object.getOwnPropertyDescriptor(
                    (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : cbEl),
                    'checked'
                );
                if (descriptor && descriptor.set) {
                    descriptor.set.call(cbEl, checked);
                } else {
                    cbEl.checked = checked;
                }
            } catch (_) {
                cbEl.checked = checked;
            }
        }

        /**
         * Dispatch synthetic input, change, and pointer events
         */
        dispatchChangeEvents(cbEl) {
            try {
                if (typeof Event !== 'undefined') {
                    cbEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    cbEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                }
                if (typeof cbEl.blur === 'function') {
                    cbEl.blur();
                }
            } catch (_) {}
        }

        /**
         * Corrective fallback clicking label or wrapper element
         */
        correctiveClick(cbEl) {
            try {
                let target = null;
                if (cbEl.id && typeof document !== 'undefined' && document.querySelector) {
                    target = document.querySelector(`label[for="${cbEl.id}"]`);
                }
                if (!target && cbEl.closest) {
                    target = cbEl.closest('label') || cbEl.closest('[class*="checkbox"], [role="checkbox"]');
                }
                if (target && typeof target.click === 'function') {
                    target.click();
                } else if (typeof cbEl.click === 'function') {
                    cbEl.click();
                }
            } catch (_) {}
        }

        getLabelText(el) {
            if (!el) return '';
            let text = '';
            if (el.labels && el.labels.length > 0) {
                text = Array.from(el.labels).map(l => l.textContent || '').join(' ');
            }
            if (!text && el.id && typeof document !== 'undefined' && document.querySelector) {
                try {
                    const lbl = document.querySelector(`label[for="${CSS && CSS.escape ? CSS.escape(el.id) : el.id}"]`);
                    if (lbl) text = lbl.textContent || '';
                } catch (_) {
                    const lbl = document.querySelector(`label[for="${el.id}"]`);
                    if (lbl) text = lbl.textContent || '';
                }
            }
            if (!text && el.closest) {
                const parentLbl = el.closest('label');
                if (parentLbl) text = parentLbl.textContent || '';
            }
            if (!text && el.getAttribute) {
                text = el.getAttribute('aria-label') || el.getAttribute('title') || '';
            }
            return (text || '').trim();
        }

        getSurroundingText(el) {
            if (!el || !el.closest) return '';
            // Only inspect immediate single-item container so sibling checkboxes in a 13-option group do not cross-contaminate classification
            const itemContainer = el.closest('label, li, p, .checkbox-item, .form-check, .gchoice');
            if (itemContainer && itemContainer.querySelectorAll) {
                const cbs = itemContainer.querySelectorAll('input[type="checkbox"]');
                if (cbs.length <= 1) {
                    return (itemContainer.textContent || '').substring(0, 200).trim();
                }
            }
            const parent = el.parentElement;
            if (parent && parent.querySelectorAll && parent.querySelectorAll('input[type="checkbox"]').length <= 1) {
                return (parent.textContent || '').substring(0, 200).trim();
            }
            return '';
        }

        /**
         * Locate dedicated multi-checkbox group container (fieldset, role="group", or dedicated checkbox list container)
         */
        getGroupContainer(el, form = null) {
            if (!el) return null;
            if (el.closest) {
                const explicit = el.closest('fieldset, [role="group"], .checkbox-group, .gfield_checkbox, .wpforms-field-checkbox, .wpcf7-checkbox, [class*="checkbox-group"], [class*="check-group"], [class*="checkbox-list"], [class*="choices"]');
                if (explicit && explicit.querySelectorAll) {
                    const cbs = explicit.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
                    if (cbs.length >= 2) return explicit;
                }
            }
            let curr = el.parentElement;
            let depth = 0;
            while (curr && depth < 4) {
                const tag = (curr.tagName || '').toUpperCase();
                if (tag === 'FORM' || tag === 'BODY' || tag === 'HTML') break;
                if (curr.querySelectorAll) {
                    const cbs = curr.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
                    const nonCheckboxInputs = curr.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select');
                    if (cbs.length >= 2 && nonCheckboxInputs.length === 0) {
                        return curr;
                    }
                    if (nonCheckboxInputs.length > 0) {
                        break;
                    }
                }
                curr = curr.parentElement;
                depth++;
            }
            return null;
        }

        isStandalonePolicyCheckbox(el) {
            if (!el) return false;
            const text = `${this.getLabelText(el)} ${el.name || ''} ${el.id || ''}`.toLowerCase();
            return PRIVACY_TERMS_KEYWORDS.some(k => text.includes(k)) ||
                RESPONSE_CONSENT_KEYWORDS.some(k => text.includes(k)) ||
                MARKETING_KEYWORDS.some(k => text.includes(k)) ||
                NEWSLETTER_KEYWORDS.some(k => text.includes(k)) ||
                SMS_MARKETING_KEYWORDS.some(k => text.includes(k));
        }

        /**
         * Returns all checkboxes belonging to the same logical choice group as cbEl.
         */
        getGroupMembers(cbEl, form = null) {
            if (!cbEl) return [];
            const root = form || cbEl.form || (cbEl.closest && cbEl.closest('form')) || cbEl.ownerDocument || (typeof document !== 'undefined' ? document : null);

            // 1. Same name attribute across form (>= 2 checkboxes)
            if (cbEl.name && root && root.querySelectorAll) {
                const allCbs = Array.from(root.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
                const sameName = allCbs.filter(c => c.name === cbEl.name && !this.isHoneypot(c));
                if (sameName.length >= 2) return sameName;
            }

            // 2. Shared group container (handles distinct names like opt_1..opt_13 or unnamed checkboxes)
            const container = this.getGroupContainer(cbEl, form);
            if (container && container.querySelectorAll) {
                const cbs = Array.from(container.querySelectorAll('input[type="checkbox"], [role="checkbox"]'))
                    .filter(c => !this.isHoneypot(c));
                if (cbs.length >= 2) {
                    if (!this.isStandalonePolicyCheckbox(cbEl)) {
                        const choiceMembers = cbs.filter(c => !this.isStandalonePolicyCheckbox(c));
                        if (choiceMembers.length >= 2) return choiceMembers;
                    }
                    return cbs;
                }
            }

            return [cbEl];
        }

        getParentGroupHeader(el, form = null) {
            if (!el || !el.closest) return '';
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) return legend.textContent || '';
            }
            const container = this.getGroupContainer(el, form);
            if (container) {
                // Direct header inside the group container that is not an individual checkbox's own label
                const headerCandidates = container.querySelectorAll
                    ? Array.from(container.querySelectorAll('legend, h1, h2, h3, h4, h5, h6, .group-label, .field-label, .gfield_label, .wpforms-field-label, [class*="group-title"], [class*="field-title"]'))
                    : [];
                for (const h of headerCandidates) {
                    if (!h.querySelector || !h.querySelector('input[type="checkbox"]')) {
                        return h.textContent || '';
                    }
                }
                // Check direct preceding sibling header of the group container (e.g. <label>Services *</label><div class="checkbox-group">...</div>)
                if (container.previousElementSibling) {
                    const prev = container.previousElementSibling;
                    const hasInputs = prev.querySelector && prev.querySelector('input, select, textarea');
                    if (!hasInputs && prev.textContent) {
                        return prev.textContent || '';
                    }
                }
                // Check parent wrapper if parent wrapper only wraps this checkbox group + a label/header
                const parent = container.parentElement;
                if (parent && parent.tagName !== 'FORM' && parent.tagName !== 'BODY' && parent.querySelectorAll) {
                    const otherInputs = parent.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select');
                    if (otherInputs.length === 0) {
                        const firstChild = parent.firstElementChild;
                        if (firstChild && firstChild !== container && (!firstChild.querySelector || !firstChild.querySelector('input[type="checkbox"]'))) {
                            return firstChild.textContent || '';
                        }
                    }
                }
            }
            return '';
        }

        getGroupIdentifier(cbEl, form = null) {
            const members = this.getGroupMembers(cbEl, form);
            if (members.length >= 2) {
                if (cbEl.name && members.every(m => m.name === cbEl.name)) {
                    return `name:${cbEl.name}`;
                }
                const container = this.getGroupContainer(cbEl, form);
                const firstMember = members[0];
                const firstKey = firstMember.id || firstMember.name || this.getLabelText(firstMember) || 'idx0';
                if (container && container.id) {
                    return `container:${container.id}`;
                }
                return `group_members:${firstKey}_count${members.length}`;
            }
            if (cbEl.name) return `name:${cbEl.name}`;
            const fieldset = cbEl.closest ? cbEl.closest('fieldset') : null;
            if (fieldset && fieldset.id) return `fieldset:${fieldset.id}`;
            return `single_${cbEl.id || this.getLabelText(cbEl) || 'anonymous'}`;
        }

        isGroupRequired(cbEl, form = null) {
            if (!cbEl) return false;
            // 1. Check explicit checkbox requirement on element itself
            if (cbEl.required || (cbEl.getAttribute && (cbEl.getAttribute('aria-required') === 'true' || cbEl.getAttribute('required') !== null))) {
                return true;
            }
            const ownLabel = this.getLabelText(cbEl);
            if (ownLabel && /\*|필수|\(required\)/i.test(ownLabel) && !/\boptional\b|선택사항|선택/i.test(ownLabel)) {
                return true;
            }

            // 2. Check immediate fieldset (explicit group element)
            const fieldset = cbEl.closest ? cbEl.closest('fieldset') : null;
            if (fieldset) {
                if (fieldset.getAttribute && fieldset.getAttribute('aria-required') === 'false') return false;
                if (fieldset.getAttribute && (fieldset.getAttribute('aria-required') === 'true' || (fieldset.hasAttribute && fieldset.hasAttribute('required')))) return true;
                const legend = fieldset.querySelector ? fieldset.querySelector('legend') : null;
                if (legend) {
                    const legendTxt = legend.textContent || '';
                    if (/\boptional\b|선택사항/i.test(legendTxt) && !/\*|필수/i.test(legendTxt)) return false;
                    if (/\*|required|필수/i.test(legendTxt)) return true;
                }
            }

            // 3. Check if part of a multi-checkbox choice group
            const members = this.getGroupMembers(cbEl, form);
            if (members.length < 2) {
                // Standalone checkbox: do NOT inherit requirement from unrelated sibling/ancestor labels
                return false;
            }

            // 4. Multi-checkbox group requirement semantics
            if (members.some(m => m.required || (m.getAttribute && (m.getAttribute('aria-required') === 'true' || m.getAttribute('required') !== null)))) {
                return true;
            }

            const container = this.getGroupContainer(cbEl, form);
            if (container) {
                if (container.getAttribute && container.getAttribute('aria-required') === 'false') return false;
                if (container.getAttribute && (container.getAttribute('aria-required') === 'true' || container.hasAttribute('required'))) return true;
                if (/\b(required|gfield_contains_required|wpforms-field-required|is-required)\b/i.test(container.className || '')) return true;
            }

            const groupHeader = this.getParentGroupHeader(cbEl, form);
            if (groupHeader) {
                if (/\boptional\b|선택사항/i.test(groupHeader) && !/\*|필수/i.test(groupHeader)) return false;
                if (/\*|required|필수/i.test(groupHeader)) return true;
            }

            return false;
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    return CheckboxResolverR2;
}));

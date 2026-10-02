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
            this.cachedGroupChoices = new Map(); // groupKey -> chosenIdentifier
            this.maxRetries = 1;
        }

        /**
         * Classify checkbox into one of 10 categories
         */
        classify(cbEl, containerContext = '') {
            if (!cbEl) return 'unknown';

            // Check honeypot first
            if (this.isHoneypot(cbEl)) return 'honeypot';

            const labelText = this.getLabelText(cbEl).toLowerCase();
            const attrText = [
                cbEl.name || '',
                cbEl.id || '',
                cbEl.getAttribute('aria-label') || '',
                cbEl.getAttribute('aria-describedby') || '',
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
            const parentGroupHeader = this.getParentGroupHeader(cbEl).toLowerCase();
            if (INQUIRY_INTEREST_KEYWORDS.some(k => parentGroupHeader.includes(k))) {
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
            if (el.getAttribute('aria-hidden') === 'true') return true;

            const nameOrId = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
            if (/\bhoneypot\b|\btrap\b|\bwebsite_url\b|\bleave.*blank\b/i.test(nameOrId)) return true;

            try {
                if (typeof window !== 'undefined' && window.getComputedStyle) {
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                        // Check if it's visually hidden but has a real custom wrapper before calling honeypot
                        const hasCustomWrapper = el.closest('[class*="custom-checkbox"], [class*="Checkbox"], .MuiCheckbox-root');
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

            const category = this.classify(cbEl);
            const isExplicitRequired = !!(cbEl.required || cbEl.getAttribute('aria-required') === 'true');
            const isGroupRequired = this.isGroupRequired(cbEl, form);
            const isRequired = isExplicitRequired || isGroupRequired;

            let shouldCheck = false;
            let groupKey = null;

            switch (category) {
                case 'inquiry_choice':
                case 'program/service_interest':
                    groupKey = this.getGroupIdentifier(cbEl, form);
                    shouldCheck = this.decideGroupSelection(cbEl, groupKey, isRequired);
                    break;

                case 'privacy_required':
                case 'terms_required':
                case 'response_consent_required':
                    // Auto-check required terms/consent
                    shouldCheck = true;
                    break;

                case 'marketing_optional':
                case 'newsletter_optional':
                case 'sms_marketing_optional':
                    // NEVER auto-check optional marketing
                    shouldCheck = false;
                    break;

                case 'unknown':
                default:
                    // Only check if explicitly required and not marketing
                    shouldCheck = isRequired;
                    break;
            }

            // Apply target state with native setter and verification
            const result = await this.applyAndVerify(cbEl, shouldCheck, category, 0);
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

        /**
         * Deterministically select one option for an inquiry checkbox group and cache choice
         */
        decideGroupSelection(cbEl, groupKey, isRequired) {
            if (!isRequired) {
                // If group is not required at all, optionally pick the first or leave
                return false;
            }

            let chosenId = this.cachedGroupChoices.get(groupKey);
            const thisId = cbEl.value || cbEl.id || cbEl.name || this.getLabelText(cbEl) || 'opt_1';

            if (!chosenId) {
                // First valid element in required group becomes the locked choice for this attempt
                chosenId = thisId;
                this.cachedGroupChoices.set(groupKey, chosenId);
            }

            return (chosenId === thisId);
        }

        /**
         * Native-setter + event dispatch + bounded wait + verification + 1 corrective retry
         */
        async applyAndVerify(cbEl, expectedChecked, category, retryCount = 0) {
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

            const isRequired = (category === 'privacy_required' || category === 'terms_required' || category === 'response_consent_required' || cbEl.required);

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
            if (el.id && typeof document !== 'undefined' && document.querySelector) {
                const lbl = document.querySelector(`label[for="${el.id}"]`);
                if (lbl) text = lbl.textContent || '';
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
            const container = el.closest('fieldset, div, p, li, tr') || el.parentElement;
            return (container?.textContent || '').substring(0, 300).trim();
        }

        getParentGroupHeader(el) {
            if (!el || !el.closest) return '';
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) return legend.textContent || '';
            }
            const container = el.closest('[role="group"], [class*="group"], [class*="field"]');
            if (container) {
                const header = container.querySelector('h1, h2, h3, h4, h5, h6, label, .label, [class*="title"]');
                if (header) return header.textContent || '';
            }
            return '';
        }

        getGroupIdentifier(cbEl, form) {
            if (cbEl.name) return `name:${cbEl.name}`;
            const fieldset = cbEl.closest ? cbEl.closest('fieldset') : null;
            if (fieldset && fieldset.id) return `fieldset:${fieldset.id}`;
            const parent = cbEl.parentElement;
            if (parent && parent.className) return `parent:${parent.className.slice(0, 30)}`;
            return `group_${cbEl.id || 'anonymous'}`;
        }

        isGroupRequired(cbEl, form) {
            const surrounding = this.getSurroundingText(cbEl) + ' ' + this.getParentGroupHeader(cbEl);
            return /\*|required|필수|please select/i.test(surrounding);
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    return CheckboxResolverR2;
}));

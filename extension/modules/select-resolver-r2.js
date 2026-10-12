/**
 * select-resolver-r2.js
 * [Issue #6 R6] SelectEngine R2: Native & Custom Dropdown Resolver with Post-Render Verification
 * 
 * Features:
 * - Full support for:
 *   1. Native HTML <select> elements
 *   2. Custom ARIA combobox / listbox / option menus
 *   3. Button-triggered dropdowns (Bootstrap, Tailwind, custom UI)
 *   4. React Select / Material-UI (MUI) / Ant Design / Wix custom select components
 * - Semantic option ranking (Inquiry > General > Contact > Services > Other)
 * - Strict placeholder exclusion (Select..., Choose..., --, etc.)
 * - Strict factual/sensitive field guard (Never fabricate revenue, age, SSN, legal status)
 * - Native prototype descriptor setter + input/change dispatch + blur + post-render settle & verification
 * - 1 corrective retry max; emits REQUIRED_SELECT_UNSTABLE on unrecoverable failure
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SelectResolverR2 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const SENSITIVE_FACT_KEYWORDS = [
        'revenue', 'annual sales', 'income', 'profit', 'turnover',
        'employee count', 'headcount', 'company size', 'number of employees',
        'age', 'date of birth', 'dob', 'ssn', 'tax id', 'ein', 'social security',
        'budget', 'invest', 'funding', 'years in business', 'credit score', 'bank'
    ];

    const INQUIRY_OPTION_RANK = [
        'general inquiry', 'general question', 'general', 'contact us', 'inquiry',
        'other', 'sales inquiry', 'sales', 'business inquiry', 'partnership',
        'customer service', 'support', 'service inquiry', 'request information',
        '일반 문의', '문의', '기타', '상담', '서비스 문의'
    ];

    const PLACEHOLDER_PREFIXES = [
        'select', 'choose', 'please select', 'please choose', '--', '...', 'none',
        '선택', '선택하세요', '옵션 선택', '선택해주세요', '请选择', '選択してください'
    ];

    const NEGATIVE_OPTION_KEYWORDS = [
        'newsletter', 'subscribe', 'career', 'job', 'employment', 'investor',
        'promot', '채용', '구독'
    ];

    class SelectResolverR2 {
        constructor(options = {}) {
            this.logger = options.logger || console.log;
            this.maxRetries = 1;
            this.customSelectors = [
                '[role="combobox"]',
                '[role="listbox"]',
                '.ant-select',
                '.MuiSelect-select',
                '[class*="react-select"]',
                '[class*="Select-control"]',
                '[class*="custom-select"]',
                '[data-testid*="dropdown"]',
                '[data-testid*="select"]'
            ];
        }

        /**
         * Resolves any dropdown container (native <select> or custom element)
         */
        async resolveDropdown(element, options = {}) {
            if (!element) return { handled: false, reason: 'NO_ELEMENT' };

            const isNative = (element.tagName === 'SELECT');
            if (isNative) {
                return await this.resolveNativeSelect(element, options);
            } else {
                return await this.resolveCustomDropdown(element, options);
            }
        }

        /**
         * Resolves native HTML <select> element
         */
        async resolveNativeSelect(selectEl, options = {}) {
            const purpose = this.identifyPurpose(selectEl);
            const isFactual = this.isSensitiveFactual(purpose, selectEl);

            if (isFactual) {
                // Sensitive factual question without verified template input => abort selection
                const logLine = `[SELECT] type=native purpose=${purpose} options=${selectEl.options?.length || 0} strategy=blocked_sensitive`;
                if (this.logger) this.logger(logLine);
                return {
                    handled: true,
                    type: 'native',
                    purpose,
                    stable: false,
                    required: !!selectEl.required,
                    reasonCode: 'UNRESOLVED_FACTUAL_DROPDOWN'
                };
            }

            const rawOptions = Array.from(selectEl.options || []);
            const validOptions = rawOptions.filter((opt, idx) => {
                if (opt.disabled) return false;
                const text = (opt.text || '').trim().toLowerCase();
                const val = (opt.value !== undefined ? String(opt.value) : '').trim().toLowerCase();
                if (!val && !text) return false;
                if (PLACEHOLDER_PREFIXES.some(p => text.startsWith(p) || val === p)) return false;
                if (val === '' || val === '0' || val === '-1') {
                    if (PLACEHOLDER_PREFIXES.some(p => text.includes(p))) return false;
                }
                return true;
            });

            if (validOptions.length === 0) {
                return {
                    handled: true,
                    type: 'native',
                    purpose,
                    stable: true,
                    reasonCode: 'NO_VALID_OPTIONS'
                };
            }

            // Rank options: Semantic Match > Safe Random
            let targetOpt = null;
            let strategy = 'semantic';

            // 1. Semantic match
            for (const rankWord of INQUIRY_OPTION_RANK) {
                targetOpt = validOptions.find(opt => {
                    const text = (opt.text || '').toLowerCase();
                    const val = (opt.value || '').toLowerCase();
                    return text.includes(rankWord) || val.includes(rankWord);
                });
                if (targetOpt) break;
            }

            // 2. Safe non-negative fallback
            if (!targetOpt) {
                const safeOptions = validOptions.filter(opt => {
                    const text = (opt.text || '').toLowerCase();
                    return !NEGATIVE_OPTION_KEYWORDS.some(k => text.includes(k));
                });
                targetOpt = safeOptions[0] || validOptions[0];
                strategy = 'random';
            }

            const optCount = validOptions.length;
            const targetVal = targetOpt.value !== undefined ? targetOpt.value : targetOpt.text;
            const targetIdx = rawOptions.indexOf(targetOpt);

            const initialLog = `[SELECT] type=native purpose=${purpose} options=${optCount} strategy=${strategy}`;
            if (this.logger) this.logger(initialLog);

            // Apply via native descriptor setter and verify stability
            return await this.applyNativeAndVerify(selectEl, targetIdx, targetVal, purpose, 0);
        }

        /**
         * Resolves custom ARIA / React / MUI dropdown container
         */
        async resolveCustomDropdown(container, options = {}) {
            const purpose = this.identifyPurpose(container);
            const isFactual = this.isSensitiveFactual(purpose, container);

            if (isFactual) {
                const logLine = `[SELECT] type=custom purpose=${purpose} options=0 strategy=blocked_sensitive`;
                if (this.logger) this.logger(logLine);
                return {
                    handled: true,
                    type: 'custom',
                    purpose,
                    stable: false,
                    reasonCode: 'UNRESOLVED_FACTUAL_DROPDOWN'
                };
            }

            // 1. Open dropdown (Trigger click)
            const trigger = container.querySelector('[class*="indicator"], [class*="arrow"], svg, [class*="trigger"], button') || container;
            this.dispatchPointerClick(trigger);
            await this.sleep(150);

            // 2. Collect visible enabled options (including portal-rendered options in body)
            const optionElements = this.collectCustomOptions(container);

            if (optionElements.length === 0) {
                // Close trigger if open
                this.dispatchPointerClick(trigger);
                return { handled: false, type: 'custom', reasonCode: 'NO_CUSTOM_OPTIONS_FOUND' };
            }

            // Filter out placeholders
            const validOptions = optionElements.filter(el => {
                const text = (el.textContent || '').trim().toLowerCase();
                return text.length > 0 && !PLACEHOLDER_PREFIXES.some(p => text.startsWith(p));
            });

            if (validOptions.length === 0) {
                return { handled: true, type: 'custom', stable: true, reasonCode: 'ONLY_PLACEHOLDER_OPTIONS' };
            }

            // Rank options: Semantic > Safe first
            let targetOption = null;
            let strategy = 'semantic';

            for (const rankWord of INQUIRY_OPTION_RANK) {
                targetOption = validOptions.find(opt => {
                    const text = (opt.textContent || '').toLowerCase();
                    return text.includes(rankWord);
                });
                if (targetOption) break;
            }

            if (!targetOption) {
                targetOption = validOptions[0];
                strategy = 'random';
            }

            const initialLog = `[SELECT] type=custom purpose=${purpose} options=${validOptions.length} strategy=${strategy}`;
            if (this.logger) this.logger(initialLog);

            // Click option and verify
            this.dispatchPointerClick(targetOption);
            await this.sleep(100);

            const selectedText = (targetOption.textContent || '').trim();
            const currentContainerText = (container.textContent || '').trim();
            let stable = currentContainerText.includes(selectedText) || container.getAttribute('aria-expanded') === 'false';

            let retryCount = 0;
            if (!stable && retryCount < this.maxRetries) {
                // Corrective retry
                this.dispatchPointerClick(trigger);
                await this.sleep(100);
                this.dispatchPointerClick(targetOption);
                await this.sleep(100);
                stable = (container.textContent || '').trim().includes(selectedText);
                retryCount++;
            }

            const verifyLog = `[SELECT] selected=true stable=${stable} retry=${retryCount}`;
            if (this.logger) this.logger(verifyLog);

            return {
                handled: true,
                type: 'custom',
                purpose,
                selected: true,
                stable,
                retry: retryCount,
                reasonCode: stable ? 'STABLE' : 'REQUIRED_SELECT_UNSTABLE'
            };
        }

        /**
         * Resolves all native and custom dropdowns in a form
         */
        async resolveAllInForm(form, options = {}) {
            if (!form) return { handledCount: 0, stable: true, results: [] };

            const nativeSelects = Array.from(form.querySelectorAll ? form.querySelectorAll('select') : []);
            const results = [];
            let allStable = true;

            // 1. Native Selects
            for (const sel of nativeSelects) {
                const res = await this.resolveNativeSelect(sel, options);
                results.push(res);
                if (sel.required && !res.stable) allStable = false;
            }

            // 2. Custom Selects
            for (const selQuery of this.customSelectors) {
                try {
                    const customEls = form.querySelectorAll ? form.querySelectorAll(selQuery) : [];
                    for (const el of customEls) {
                        if (el.tagName === 'SELECT') continue;
                        const res = await this.resolveCustomDropdown(el, options);
                        results.push(res);
                        if (!res.stable) allStable = false;
                    }
                } catch (_) {}
            }

            return {
                handledCount: results.length,
                stable: allStable,
                results
            };
        }

        async applyNativeAndVerify(selectEl, targetIdx, targetVal, purpose, retryCount = 0) {
            // Focus & mouse events
            selectEl.focus();
            this.dispatchPointerClick(selectEl);

            // Native prototype setter to bypass React/Vue controlled component overrides
            try {
                const proto = (typeof HTMLSelectElement !== 'undefined' ? HTMLSelectElement.prototype : selectEl);
                const setter = Object.getOwnPropertyDescriptor(proto, 'value');
                if (setter && setter.set) {
                    setter.set.call(selectEl, targetVal);
                } else {
                    selectEl.value = targetVal;
                }
            } catch (_) {
                selectEl.value = targetVal;
            }

            selectEl.selectedIndex = targetIdx;

            // Dispatch input, change, and blur
            this.dispatchChangeEvents(selectEl);
            selectEl.blur();

            await this.sleep(40);

            // Re-verify after framework rerender
            let actualIdx = selectEl.selectedIndex;
            let actualVal = selectEl.value;
            let stable = (actualIdx === targetIdx || actualVal === targetVal);

            if (!stable && retryCount < this.maxRetries) {
                // Corrective retry
                selectEl.selectedIndex = targetIdx;
                this.dispatchChangeEvents(selectEl);
                await this.sleep(60);
                stable = (selectEl.selectedIndex === targetIdx || selectEl.value === targetVal);
                retryCount++;
            }

            const verifyLog = `[SELECT] selected=true stable=${stable} retry=${retryCount}`;
            if (this.logger) this.logger(verifyLog);

            const isRequired = !!selectEl.required;
            return {
                handled: true,
                type: 'native',
                purpose,
                selected: true,
                selectedIndex: targetIdx,
                value: targetVal,
                stable,
                retry: retryCount,
                required: isRequired,
                reasonCode: (!stable && isRequired) ? 'REQUIRED_SELECT_UNSTABLE' : (stable ? 'STABLE' : 'UNSTABLE_OPTIONAL')
            };
        }

        collectCustomOptions(container) {
            const optionSelectors = [
                '[role="option"]',
                '[class*="option"]',
                '[class*="menu-item"]',
                '.ant-select-item',
                'li[role="option"]',
                '[data-value]'
            ];
            const options = [];

            // 1. Inside container
            for (const sel of optionSelectors) {
                try {
                    const found = container.querySelectorAll(sel);
                    found.forEach(o => { if (!options.includes(o)) options.push(o); });
                } catch (_) {}
            }

            // 2. Portal-rendered in document body
            if (options.length === 0 && typeof document !== 'undefined') {
                const portals = document.querySelectorAll('[role="listbox"], [class*="dropdown-menu"], [class*="listbox"], .ant-select-dropdown');
                portals.forEach(portal => {
                    for (const sel of optionSelectors) {
                        try {
                            const found = portal.querySelectorAll(sel);
                            found.forEach(o => { if (!options.includes(o)) options.push(o); });
                        } catch (_) {}
                    }
                });
            }

            return options;
        }

        identifyPurpose(el) {
            const text = [
                el.name || '',
                el.id || '',
                el.getAttribute('aria-label') || '',
                el.closest ? el.closest('label, div, fieldset')?.textContent || '' : ''
            ].join(' ').toLowerCase().trim();

            if (/inquiry|contact|subject|topic|reason|문의|유형|목적/i.test(text)) return 'inquiry_topic';
            if (/service|program|product|course|서비스|프로그램/i.test(text)) return 'service_choice';
            if (/country|nation|region|국가|지역/i.test(text)) return 'location';
            if (/state|province|city|도시/i.test(text)) return 'state_city';
            return 'general_dropdown';
        }

        isSensitiveFactual(purpose, el) {
            const text = [
                purpose || '',
                el.name || '',
                el.id || '',
                el.getAttribute('aria-label') || '',
                el.closest ? el.closest('label, div')?.textContent || '' : ''
            ].join(' ').toLowerCase();

            return SENSITIVE_FACT_KEYWORDS.some(k => text.includes(k));
        }

        dispatchChangeEvents(el) {
            try {
                if (typeof Event !== 'undefined') {
                    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                }
            } catch (_) {}
        }

        dispatchPointerClick(el) {
            if (!el) return;
            try {
                if (typeof MouseEvent !== 'undefined') {
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                } else if (typeof el.click === 'function') {
                    el.click();
                }
            } catch (_) {}
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    return SelectResolverR2;
}));

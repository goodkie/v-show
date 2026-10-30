const fs = require('fs');
const path = require('path');

function patchFile(filePath, searchStr, replaceStr, desc) {
    const fullPath = path.resolve(filePath);
    let content = fs.readFileSync(fullPath, 'utf8');
    const normContent = content.replace(/\r\n/g, '\n');
    const normSearch = searchStr.replace(/\r\n/g, '\n');
    
    if (!normContent.includes(normSearch)) {
        throw new Error(`Failed to find target in ${filePath} for: ${desc}`);
    }
    
    const newNorm = normContent.replace(normSearch, replaceStr.replace(/\r\n/g, '\n'));
    // Preserve CRLF
    fs.writeFileSync(fullPath, newNorm.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`✅ Patched: ${filePath} (${desc})`);
}

console.log('=== APPLYING RC3.60 .90 CONSOLIDATED RECOVERY FIXES ===');

// 1. Patch CheckboxResolverR2
patchFile(
    'extension/modules/checkbox-resolver-r2.js',
    `            let chosenId = this.cachedGroupChoices.get(groupKey);
            const thisId = cbEl.value || cbEl.id || cbEl.name || this.getLabelText(cbEl) || 'opt_1';

            if (!chosenId) {
                // First valid element in required group becomes the locked choice for this attempt
                chosenId = thisId;
                this.cachedGroupChoices.set(groupKey, chosenId);
            }

            return (chosenId === thisId);`,
    `            let chosenId = this.cachedGroupChoices.get(groupKey);
            // [RC3.60 .90 Fix] In HTML, checkbox.value defaults to "on" when attribute is unset.
            // Do NOT use default "on" as unique identifier; check id first, then non-"on" attribute, then label text.
            const explicitVal = cbEl.getAttribute && cbEl.getAttribute('value');
            const validVal = (explicitVal && explicitVal !== 'on') ? explicitVal : null;
            const thisId = cbEl.id || validVal || this.getLabelText(cbEl) || (cbEl.name ? \`\${cbEl.name}_\${cbEl.id || 'opt'}\` : 'opt_1');

            const hasRandomVariation = Boolean(
                (options && options.randomVariation) ||
                (this.options && this.options.randomVariation) ||
                (typeof window !== 'undefined' && window.__xpider_random_variation)
            );

            if (!chosenId) {
                if (isRequired || hasRandomVariation) {
                    chosenId = thisId;
                    this.cachedGroupChoices.set(groupKey, chosenId);
                    if (this.logger) {
                        this.logger(\`[CHECKBOX_GROUP_CHOICE] group="\${groupKey}" chosen="\${chosenId}" isRequired=\${isRequired} randomVariation=\${hasRandomVariation}\`);
                    }
                }
            }

            if (!isRequired && !hasRandomVariation) {
                return false;
            }

            return Boolean(chosenId && chosenId === thisId);`,
    'CheckboxResolverR2 unique thisId and Random Variation wiring'
);

patchFile(
    'extension/modules/checkbox-resolver-r2.js',
    `        isGroupRequired(cbEl, form) {
            const surrounding = this.getSurroundingText(cbEl) + ' ' + this.getParentGroupHeader(cbEl);
            return /\\*|required|필수|please select/i.test(surrounding);
        }`,
    `        isGroupRequired(cbEl, form) {
            // [RC3.60 .90 Fix] Check explicit checkbox requirement
            if (cbEl.required || (cbEl.getAttribute && cbEl.getAttribute('aria-required') === 'true')) return true;
            
            // Check immediate fieldset
            const fieldset = cbEl.closest ? cbEl.closest('fieldset') : null;
            if (fieldset) {
                if (fieldset.getAttribute('aria-required') === 'false') return false;
                if (fieldset.getAttribute('aria-required') === 'true' || fieldset.hasAttribute('required')) return true;
                const legend = fieldset.querySelector('legend');
                if (legend && /\\*|required|필수/i.test(legend.textContent || '')) return true;
            }

            // Check immediate group header only (not distant parent divs containing other required inputs)
            const groupHeader = this.getParentGroupHeader(cbEl);
            if (groupHeader && /\\*|required|필수/i.test(groupHeader)) return true;
            return false;
        }`,
    'CheckboxResolverR2 precise isGroupRequired without false-positives from parent divs'
);

// 2. Patch final-form-completion-engine.js
patchFile(
    'extension/modules/final-form-completion-engine.js',
    `                // Check native invalidity
                if (typeof el.checkValidity === 'function') {
                    try {
                        if (!el.checkValidity()) {
                            nativeInvalidCount++;
                            invalidFields.push({ tag, type: type || 'text', category: classification.category, kind: 'native' });
                        }
                    } catch (_) {}
                }
                if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') {
                    customInvalidCount++;
                    invalidFields.push({ tag, type: type || 'text', category: classification.category, kind: 'custom' });
                }`,
    `                // Check native invalidity
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
                                    this.logger(\`[OPTIONAL_RECOVERY] Cleared invalid optional field category=\${classification.category} id=\${el.id || el.name}\`);
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
                            this.logger(\`[OPTIONAL_RECOVERY] Cleared custom-invalid optional field category=\${classification.category} id=\${el.id || el.name}\`);
                        }
                    } else {
                        customInvalidCount++;
                        invalidFields.push({ tag, type: type || 'text', category: classification.category, kind: 'custom' });
                    }
                }`,
    'final-form-completion-engine optional field validity recovery'
);

patchFile(
    'extension/modules/final-form-completion-engine.js',
    `answer = template.phone || template.telephone || '010-1234-5678';`,
    `// [RC3.60 .90 Fix] Standard US 10-digit phone format, never Korean 010 on US/NANP forms
                    answer = template.phone || template.telephone || '202-555-0149';`,
    'final-form-completion-engine standard US phone format'
);

// 3. Patch content-script.js
patchFile(
    'extension/content-script.js',
    `        if (!messageFilled) {
            logDev("❌ [Fill] Message body was not filled", "error");
            return { filledAny: false, reasonCode: 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' };
        }`,
    `        const hasGenuineMessageField = finalAllInputs.some(el => isMsgElement(el) || el.tagName === 'TEXTAREA' || el.contentEditable === 'true');
        if (!messageFilled) {
            if (!hasGenuineMessageField) {
                logDev("ℹ️ [Fill] No genuine message field on form — legitimate non-inquiry skip", "info");
                return { filledAny: false, reasonCode: 'NO_LONG_TEXT_INQUIRY_FIELD', terminalStatus: 'SKIPPED' };
            }
            logDev("❌ [Fill] Message body was not filled", "error");
            return { filledAny: false, reasonCode: 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' };
        }`,
    'content-script legitimate skip on forms without genuine message field'
);

// 4. Patch background.js
patchFile(
    'extension/background.js',
    `    // 2. Strict exact target tab verification
    let effectiveTabId = sTabId;
    if (options.allowBodyTabId && request?.tabId) {
        effectiveTabId = request.tabId;
    }
    if (!effectiveTabId || !curTabId || effectiveTabId !== curTabId) {
        logBg(null, \`[STALE_TARGET_EVENT] action=\${action} senderTab=\${effectiveTabId || 'none'} expectedTab=\${curTabId} result=REJECTED reason=tab_mismatch\`, 'warning');
        return { valid: false, reason: 'tab_mismatch' };
    }`,
    `    // 2. Strict exact target tab verification
    // [RC3.60 .90 Fix] Sender tab may be absent from internal worker or iframe contexts; allow fallback to request.tabId
    let effectiveTabId = sTabId || (request?.tabId ? request.tabId : null);
    if (!effectiveTabId || !curTabId || effectiveTabId !== curTabId) {
        logBg(null, \`[STALE_TARGET_EVENT] action=\${action} senderTab=\${effectiveTabId || 'none'} expectedTab=\${curTabId} result=REJECTED reason=tab_mismatch\`, 'warning');
        return { valid: false, reason: 'tab_mismatch' };
    }`,
    'background.js effectiveTabId fallback to request.tabId preventing tab_mismatch'
);

patchFile(
    'extension/background.js',
    `} else if (finalReason === 'REQUIRED_SELECT_UNSTABLE' || finalReason === 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' || finalReason === 'AUTOFILL_FAILED' || finalReason === 'FORM_FILL_FAILED') {
            terminalStatus = 'AUTOMATION_FAILED';`,
    `} else if (finalReason === 'REQUIRED_SELECT_UNSTABLE' || finalReason === 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' || finalReason === 'AUTOFILL_FAILED' || finalReason === 'FORM_FILL_FAILED' || finalReason === 'FINAL_CUSTOM_VALIDITY_FAILED' || finalReason === 'FINAL_NATIVE_VALIDITY_FAILED' || finalReason === 'FINAL_FORM_COMPLETION_FAILED') {
            terminalStatus = 'AUTOMATION_FAILED';`,
    'background.js canonical AUTOMATION_FAILED status mapping for pre-submit audit failures'
);

// 5. Patch popup.js
patchFile(
    'extension/popup.js',
    `        const startPayload = {
            queue: campaignQueue,
            template: currentTpl,
            delayMs,
            fillDelayMs,
            submitDelayMs,
            fillMode,`,
    `        const randomVariationToggle = document.getElementById('random-delay-toggle');
        const randomVariationActive = randomVariationToggle ? randomVariationToggle.checked : false;

        const startPayload = {
            queue: campaignQueue,
            template: currentTpl,
            delayMs,
            fillDelayMs,
            submitDelayMs,
            fillMode,
            randomVariation: randomVariationActive,`,
    'popup.js randomVariation wiring into startPayload'
);

console.log('=== ALL RC3.60 .90 CODE PATCHES SUCCESSFULLY APPLIED ===');

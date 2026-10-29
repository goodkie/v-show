const fs = require('fs');
const path = require('path');

console.log('=== XPIDER RC3.60 P0 LIVE SITE RECOVERY SPRINT PATCH (NORMALIZED) ===');

function patchFile(filePath, transforms) {
    let raw = fs.readFileSync(filePath, 'utf8');
    const isCrlf = raw.includes('\r\n');
    let normalized = raw.replace(/\r\n/g, '\n');

    let modified = false;
    for (const { name, from, to } of transforms) {
        const fromNorm = typeof from === 'string' ? from.replace(/\r\n/g, '\n') : from;
        const toNorm = typeof to === 'string' ? to.replace(/\r\n/g, '\n') : to;

        if (typeof fromNorm === 'string' ? normalized.includes(fromNorm) : fromNorm.test(normalized)) {
            normalized = normalized.replace(fromNorm, toNorm);
            console.log(`✔ [${path.basename(filePath)}] ${name}`);
            modified = true;
        } else {
            console.warn(`⚠ [${path.basename(filePath)}] Pattern NOT found: ${name}`);
        }
    }

    if (modified) {
        const output = isCrlf ? normalized.replace(/\n/g, '\r\n') : normalized;
        fs.writeFileSync(filePath, output, 'utf8');
    }
}

// 1. content-script.js
patchFile(path.resolve('extension/content-script.js'), [
    {
        name: 'Replace isHoneypotV4 with comprehensive offscreen & parent check',
        from: `        // ── 확장된 honeypot 판정 (v4.0: 오탐 방지 강화) ──
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
        }`,
        to: `        // ── 확장된 honeypot 판정 (v4.1: 완벽한 허니팟 차단 및 오탐 방지) ──
        function isHoneypotV4(el) {
            if (!el) return false;
            // 1. 명시적 허니팟 ID, Name, Class 검사 (Elementor, Gravity, WPForms, Wix 등 전수 차단)
            const idNameClass = [
                String(el.id || ''),
                String(el.name || ''),
                String(el.className || ''),
                String(el.getAttribute('class') || '')
            ].join(' ').toLowerCase();

            const honeypotKeywords = [
                'honeypot', 'form-field-honeypot', 'elementor-field-type-honeypot', 'w-honeypot',
                'website_url', 'trap', 'bottom_field', 'h-captcha-response', 'g-recaptcha-response',
                'antispam', 'anti-spam', 'nobot', 'sweet_honey', 'hp_field', '_hp_'
            ];
            if (honeypotKeywords.some(k => idNameClass.includes(k))) return true;

            // 2. 부모 래퍼에 명시된 허니팟 컨테이너 검사
            try {
                if (el.closest && el.closest('.form-field-honeypot, [class*="honeypot"], [id*="honeypot"], [class*="antispam"]')) {
                    return true;
                }
            } catch (_) {}

            // 3. 시각적 / 물리적 은닉 여부 검사 (display:none, visibility:hidden, opacity:0, tabindex=-1 with autocomplete=off)
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return true;
            }

            // 4. 오프스크린 숨김 검사 (position: absolute with left: -9999px or top: -9999px or clip: rect(0,0,0,0))
            const rect = el.getBoundingClientRect();
            if (rect.left < -100 || rect.top < -100) return true;
            if (style.position === 'absolute' && (parseInt(style.left, 10) < -100 || parseInt(style.top, 10) < -100)) return true;
            if (style.clip && style.clip.includes('rect(0')) return true;
            if (rect.width === 0 && rect.height === 0) return true;

            // 5. 숨겨진 접근성 속성
            if (el.getAttribute('aria-hidden') === 'true' && el.tabIndex === -1) return true;

            return false;
        }`
    },
    {
        name: 'Update message verification in content-script',
        from: `        // Verify message body is filled
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
        }`,
        to: `        // [RC3.60 P0 Live Site Recovery] Canonical Message Body Verification across Classifier/Filler/Verifier
        const isMsgElement = (el) => {
            if (!el) return false;
            if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') return true;
            const attrStr = [
                el.name || '',
                el.id || '',
                el.getAttribute('placeholder') || '',
                el.getAttribute('aria-label') || '',
                el.className || ''
            ].join(' ').toLowerCase();
            if (/message|comment|inquiry|body|content|notes|details|문의내용|내용/i.test(attrStr)) return true;
            if (window.__xpider_current_field_mapping) {
                const k = el.id || el.name || el.getAttribute('name') || el.getAttribute('id');
                if (k && window.__xpider_current_field_mapping[k] && window.__xpider_current_field_mapping[k].category === 'message') {
                    return true;
                }
            }
            return false;
        };

        const finalAllInputs = Array.from(queryAllInputs(form));
        let messageFilled = finalAllInputs.some(el => {
            if (!isMsgElement(el)) return false;
            const val = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            return val.trim().length > 0;
        });

        // Also check if field mapping already recorded a filled message with length > 0
        if (!messageFilled && window.__xpider_current_field_mapping) {
            for (const [k, meta] of Object.entries(window.__xpider_current_field_mapping)) {
                if (meta && meta.category === 'message' && meta.valLength > 0) {
                    messageFilled = true;
                    break;
                }
            }
        }

        if (!messageFilled) {
            const rescueTarget = finalAllInputs.find(el => isMsgElement(el))
                || finalAllInputs.find(el => el.tagName === 'TEXTAREA' || el.contentEditable === 'true')
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
        }`
    },
    {
        name: 'Add label pairing for fields[XXXX] in resolveFieldSemantic',
        from: `        function resolveFieldSemantic(el) {`,
        to: `        function resolveFieldSemantic(el) {
            // [RC3.60 P0 locksandchokes.com] Associate label for inputs with name="fields[XXXX]" lacking id
            if (el && !el.id && el.name && el.name.startsWith('fields[')) {
                const parentPair = el.closest ? el.closest('.labelpair, .form-group, .field-area, div') : null;
                const lbl = parentPair ? parentPair.querySelector('label') : (typeof document !== 'undefined' ? document.querySelector(\`label[for="\${el.name}"]\`) : null);
                if (lbl && lbl.textContent) {
                    const lt = lbl.textContent.toLowerCase();
                    if (/inquiring\\s+about|subject|topic|reason/i.test(lt)) return { semantic: 'subject', matchedPattern: 'label_for_name_pair' };
                    if (/experience\\s+level|level|program|class/i.test(lt)) return { semantic: 'text', matchedPattern: 'label_for_name_pair' };
                }
            }`
    }
]);

// 2. background.js
patchFile(path.resolve('extension/background.js'), [
    {
        name: 'Update canonical terminal status in background.js',
        from: `        // [R6.9A Canonical Terminal Status Determination]
        let terminalStatus;
        if (isSuccess) {
            terminalStatus = 'CONFIRMED_SUCCESS';
        } else if (isDeliveryUnknown) {
            terminalStatus = 'DELIVERY_UNKNOWN';
        } else if (finalReason === 'TIMEOUT_LOCAL' || finalReason === 'TIMEOUT_GLOBAL') {
            terminalStatus = finalReason;
        } else if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass) {
            terminalStatus = 'SKIPPED';
        } else {
            terminalStatus = 'FAILURE';
        }`,
        to: `        // [RC3.60 P0 Canonical Terminal Status Determination]
        let terminalStatus;
        if (isSuccess) {
            terminalStatus = 'CONFIRMED_SUCCESS';
        } else if (isDeliveryUnknown) {
            terminalStatus = 'DELIVERY_UNKNOWN';
        } else if (finalReason === 'TIMEOUT_LOCAL' || finalReason === 'TIMEOUT_GLOBAL') {
            terminalStatus = finalReason;
        } else if (finalReason === 'SKIPPED' || finalReason === 'WOULD_SUBMIT' || finalReason?.includes('SKIPPED') || finalReason?.includes('NON_INQUIRY') || finalReason?.startsWith('NON_INQUIRY') || finalReason === 'EXPECTED_FAIL_PASS' || finalReason?.includes('EXPECTED_FAIL_PASS') || res?.isExpectedFailPass || finalReason === 'NO_LONG_TEXT_INQUIRY_FIELD' || finalReason === 'NO_FORM_FOUND' || finalReason === 'NO_REACHABLE_CONTACT_PAGE') {
            terminalStatus = 'SKIPPED';
        } else if (finalReason === 'REQUIRED_SELECT_UNSTABLE' || finalReason === 'REQUIRED_FIELD_LOST_BEFORE_SUBMIT' || finalReason === 'AUTOFILL_FAILED' || finalReason === 'FORM_FILL_FAILED') {
            terminalStatus = 'AUTOMATION_FAILED';
        } else if (finalReason === 'CAPTCHA_PROVIDER_ERROR' || finalReason === 'CAPTCHA_TIMEOUT') {
            terminalStatus = 'CAPTCHA_PROVIDER_ERROR';
        } else if (finalReason?.includes('CONNREFUSED') || finalReason?.includes('NETWORK_ERROR') || finalReason?.includes('NET_TRANSIENT')) {
            terminalStatus = 'RETRYABLE';
        } else {
            terminalStatus = 'FAILURE';
        }`
    },
    {
        name: 'Update NopeCHA error 10 handling in background.js',
        from: `                    if (getData && getData.error) {
                        if (getData.error === 14 || getData.error === 100) {
                            continue;
                        }
                        throw new Error(\`NopeCHA Poll Error (\${getData.error}): \${getData.message || 'Unknown'}\`);
                    }`,
        to: `                    if (getData && getData.error) {
                        // [RC3.60 P0 Live Site Recovery] Error 10 on early polls is task-initialization in NopeCHA worker queue.
                        if (getData.error === 14 || getData.error === 100 || (getData.error === 10 && pollCount <= 3)) {
                            continue;
                        }
                        throw new Error(\`NopeCHA Poll Error (\${getData.error}): \${getData.message || 'Unknown'}\`);
                    }`
    }
]);

console.log('=== NORMALIZED PATCH COMPLETE ===');

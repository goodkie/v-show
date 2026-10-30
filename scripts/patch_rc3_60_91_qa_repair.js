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
    fs.writeFileSync(fullPath, newNorm.replace(/\n/g, '\r\n'), 'utf8');
    console.log(`✅ Patched: ${filePath} (${desc})`);
}

console.log('=== APPLYING RC3.60 .91 QA DEFECT REPAIR FIXES ===');

// 1. Content Script: Remove 'required' from Healer errorKeywords & enforce bounded fill attempts & honeypot guard in applyVal
patchFile(
    'extension/content-script.js',
    `                    let ancestor = el.parentElement;
                    const errorKeywords = ['error', 'invalid', 'failed', 'danger', 'required', 'warning', 'err-', 'tkhmzu'];
                    for (let depth = 0; depth < 5 && ancestor; depth++) {`,
    `                    let ancestor = el.parentElement;
                    // [RC3.60 .91 Fix] REMOVE 'required' from error keywords!
                    // 'required' is a standard container class (e.g. form-group required) indicating a mandatory field, NOT a validation error!
                    const errorKeywords = ['has-error', 'field-error', 'invalid', 'form-error', 'danger', 'err-', 'tkhmzu'];
                    for (let depth = 0; depth < 5 && ancestor; depth++) {`,
    'Healer errorKeywords fix: do not treat "required" as an error'
);

patchFile(
    'extension/content-script.js',
    `        const applyVal = async (el, val, matchedAttr) => {
            if (!val || !el) return;
            if (el.tagName === 'SELECT') {
                await applySelect(el);
                return;
            }`,
    `        // [RC3.60 .91] Per-element fill attempt tracking for bounded retries (max 1 rewrite per element)
        if (!window.__xpider_field_fill_attempts) window.__xpider_field_fill_attempts = new WeakMap();

        const applyVal = async (el, val, matchedAttr) => {
            if (!val || !el) return;
            // [RC3.60 .91 Defect 3 Guard] Never modify hidden or honeypot controls
            if (isHoneypotV4(el) || el.type === 'hidden' || el.hidden || (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden'))) {
                logDev(\`   - [HONEYPOT_GUARD] Protected honeypot/hidden field skipped: \${el.id || el.name || 'unnamed'}\`, 'debug');
                return;
            }
            if (el.tagName === 'SELECT') {
                await applySelect(el);
                return;
            }`,
    'applyVal honeypot/hidden protection guard'
);

patchFile(
    'extension/content-script.js',
    `            // [P0-A Fix] 이미 값이 있으면 스킵하되, 이미 유효하게 입력된 필드로 카운트 및 등록
            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            if (currentVal.trim() !== '') {
                logDev(\`   - [FIELD_SKIP] field=\${el.id || el.name || 'unnamed'} tag=\${el.tagName} reason=ALREADY_FILLED\`);`,
    `            // [RC3.60 .91 Defect 1 Fix] Bounded Retries: If field already has non-empty value, never clear or rewrite it repeatedly
            const currentVal = el.contentEditable === 'true' ? (el.textContent || '') : (el.value || '');
            const attempts = window.__xpider_field_fill_attempts.get(el) || 0;
            if (currentVal.trim() !== '' && attempts >= 1) {
                logDev(\`   - [FIELD_SKIP] field=\${el.id || el.name || 'unnamed'} tag=\${el.tagName} reason=ALREADY_FILLED_AND_STABLE\`);`,
    'applyVal bounded retry check'
);

patchFile(
    'extension/content-script.js',
    `        function isHoneypotV4(el) {
            if (!el) return false;
            // 1. 명시적 허니팟 ID, Name, Class 검사 (Elementor, Gravity, WPForms, Wix 등 전수 차단)`,
    `        function isHoneypotV4(el) {
            if (!el) return false;
            // [RC3.60 .91 Defect 3 Fix] Type="hidden" and hidden attributes are strictly protected
            if (el.type === 'hidden' || el.hidden === true || el.getAttribute('hidden') !== null) return true;
            // 1. 명시적 허니팟 ID, Name, Class 검사 (Elementor, Gravity, WPForms, Wix 등 전수 차단)`,
    'isHoneypotV4 explicit hidden attribute protection'
);

// 2. Background Script: Contact path discovery optimization & Sniper timeout reduction
patchFile(
    'extension/background.js',
    `    const pool = PROACTIVE_PATHS.slice(0, 50); // Limit to top 50 for speed

    // Concurrent scanning in small batches to prevent blocking
    const batchSize = 10;
    for (let i = 0; i < pool.length; i += batchSize) {
        if (discoveryCtx?.aborted || campaignState.isPaused) {
            logBg(tabId, "⏸️ [Scan] In-flight scan aborted due to pause/cancel.", "info");
            break;
        }
        logBg(tabId, \`🔦 Scanning paths \${i + 1}-\${Math.min(i + batchSize, pool.length)}...\`, "info");
        const batch = pool.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (path) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2500); // 2.5s per probe`,
    `    // [RC3.60 .91 Defect 4 Fix] Tightly bound contact path scan: top 10 most common paths, 1.2s timeout per probe
    // Prevents excessive contact-link discovery delay (finishes in < 1.5s total)
    const pool = PROACTIVE_PATHS.slice(0, 10);

    const batchSize = 10;
    for (let i = 0; i < pool.length; i += batchSize) {
        if (discoveryCtx?.aborted || campaignState.isPaused) {
            logBg(tabId, "⏸️ [Scan] In-flight scan aborted due to pause/cancel.", "info");
            break;
        }
        logBg(tabId, \`🔦 Fast-scanning candidate paths (1-\${Math.min(i + batchSize, pool.length)})...\`, "info");
        const batch = pool.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (path) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1200); // 1.2s fast probe`,
    'background.js fast sniper path discovery (10 paths, 1.2s timeout)'
);

// 3. Background Script: CAPTCHA_RUNTIME_EXCEPTION identity & TopSolverHUD error message
patchFile(
    'extension/background.js',
    `        case 'CAPTCHA_RUNTIME_EXCEPTION':
            // [RC3.33 P0-C / Sprint Fix F1 / C1] Validate active execution identity before immediate settlement
            (() => {
                const validation = validateActiveExecution(request, sender, 'CAPTCHA_RUNTIME_EXCEPTION', { checkEpoch: true });`,
    `        case 'CAPTCHA_RUNTIME_EXCEPTION':
            // [RC3.33 P0-C / Sprint Fix F1 / C1] Validate active execution identity before immediate settlement
            (() => {
                // [RC3.60 .91 Defect 5 Fix] Allow bodyTabId fallback so tab identity is preserved during terminal solver error
                const validation = validateActiveExecution(request, sender, 'CAPTCHA_RUNTIME_EXCEPTION', { checkEpoch: true, allowBodyTabId: true });`,
    'background.js CAPTCHA_RUNTIME_EXCEPTION allowBodyTabId fix'
);

// 4. Privacy Gateway: Single-flight mutex for verifyAuthoritativeEgressEnforcement
patchFile(
    'extension/modules/privacy-gateway.js',
    `        async verifyAuthoritativeEgressEnforcement(context = 'GENERAL') {
            if (context === 'OWNER_FUNCTION_TEST' || (typeof campaignState !== 'undefined' && campaignState.ownerFunctionTestMode)) {
                return { ready: true, mode: PRIVACY_MODES.DIRECT, ownerFunctionTestMode: true };
            }`,
    `        async verifyAuthoritativeEgressEnforcement(context = 'GENERAL') {
            // [RC3.60 .91 Defect 7 Fix] Single-flight promise deduplication to prevent duplicate concurrent health check jobs
            if (this._inFlightEgressVerification) {
                return this._inFlightEgressVerification;
            }
            this._inFlightEgressVerification = (async () => {
                try {
                    return await this._executeAuthoritativeEgressEnforcement(context);
                } finally {
                    this._inFlightEgressVerification = null;
                }
            })();
            return this._inFlightEgressVerification;
        }

        async _executeAuthoritativeEgressEnforcement(context = 'GENERAL') {
            if (context === 'OWNER_FUNCTION_TEST' || (typeof campaignState !== 'undefined' && campaignState.ownerFunctionTestMode)) {
                return { ready: true, mode: PRIVACY_MODES.DIRECT, ownerFunctionTestMode: true };
            }`,
    'privacy-gateway.js single-flight mutex for authoritative egress verification'
);

console.log('=== ALL RC3.60 .91 CODE PATCHES SUCCESSFULLY APPLIED ===');


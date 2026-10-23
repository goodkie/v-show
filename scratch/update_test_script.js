const fs = require('fs');

let content = fs.readFileSync('test/run_edge_p0_rc3_44_live_fix_validation.js', 'utf8');

// Replace static check
content = content.replace(
    "assert(cgContent.includes('text-input-inquiry'), 'contact-gate.js must contain text-input-inquiry type');",
    "assert(cgContent.includes('text-input-inquiry'), 'contact-gate.js must contain text-input-inquiry type');\n    assert(cgContent.includes('lead-inquiry-form'), 'contact-gate.js must contain lead-inquiry-form type');"
);

// Replace lines 263-317 with accurate extraction
const targetStart = '// Collect background console logs to check for LONG_TEXT_GATE / FORM_CLASSIFY';
const targetEnd = "log('================ RC3.44 LIVE FIX VALIDATION COMPLETE ================');";

const replacement = `// Collect diagnostic and blackbox logs for stage timeline reconstruction
    const diagData = await cdpSend(swWs, 'Runtime.evaluate', {
        expression: \`(async () => {
            const store = await chrome.storage.local.get(['xpider_current_run_diagnostics', 'xpider_blackbox_logs', 'xpider_diagnostic_logs']);
            const diagEvents = (store.xpider_current_run_diagnostics && store.xpider_current_run_diagnostics.events) || [];
            const bbLogs = (store.xpider_blackbox_logs || []).map(b => typeof b === 'string' ? b : ('[' + b.timestamp + '][' + b.type + '] ' + b.message));
            const logs = [...diagEvents, ...bbLogs];
            const hs = await getHistoryStoreInstance();
            const attempts = hs ? hs.attempts.filter(a => a.campaignRunId === campaignState.campaignRunId).map(a => ({
                target: a.sourceUrl,
                status: a.status,
                reason: a.reasonCode,
                metadata: a.metadata || {}
            })) : [];
            return { logs, attempts };
        })()\`,
        awaitPromise: true,
        returnByValue: true
    });

    const fin = diagData.result.value || { logs: [], attempts: [] };
    const rawLogs = fin.logs.map(x => typeof x === 'string' ? x : JSON.stringify(x));
    log(\`Captured \${rawLogs.length} diagnostic log entries.\`);

    const STAGES = [
        ['START/PREFLIGHT', /PRIVACY|PREFLIGHT|Starting campaign|START_CAMPAIGN|BUILD_HANDSHAKE|START_STEP/i],
        ['EGRESS', /EGRESS|PROXY|RELAY|PRIVATE_EGRESS|DIRECT/i],
        ['CONTACT_DISCOVERY', /CONTACT|SNIPER|candidate|discover|Scanning paths/i],
        ['FORM_CLASSIFICATION', /classif|FORM_FOUND|findOptimalForm|inquiry form|NO_ACCESSIBLE|ELIGIBLE_FORM|LONG_TEXT_GATE|lead-inquiry/i],
        ['FIELD_MAPPING', /mapp|field|FIELD_CLASSIFY|FIELD_ASSIGN/i],
        ['AUTOFILL', /autofill|fill|typed|AUTOFILL_READY|HyperEngine/i],
        ['CAPTCHA_DETECT', /captcha|turnstile|recaptcha|hcaptcha|CAPTCHA_STATE/i],
        ['PROVIDER_REQUEST/TERMINAL', /provider|solver|2captcha|capsolver|nopecha/i],
        ['MANUAL_FALLBACK', /manual|MANUAL_ASSIST/i],
        ['SUBMIT', /submit|WOULD_SUBMIT|visionSubmit/i],
        ['OUTCOME', /outcome|SETTLED|finishCampaign|terminal|TARGET_COMPLETE|RESULT/i],
        ['LEDGER', /ledger|LEDGER_INIT|LEDGER_RECORD|history/i]
    ];

    log('--- STAGE MATRIX ---');
    const matrix = [];
    targets2.forEach((url, i) => {
        const host = new URL(url).hostname;
        const attempt = fin.attempts.find(a => a.target && a.target.includes(host));
        const rel = rawLogs.filter(x => x.includes(host));
        const hit = {};
        const stageTimestamps = {};
        STAGES.forEach(([n, re]) => {
            const matchLine = rel.find(x => re.test(x)) || (['START/PREFLIGHT', 'EGRESS', 'LEDGER'].includes(n) ? rawLogs.find(x => re.test(x)) : null);
            if (matchLine) {
                hit[n] = true;
                const tsMatch = matchLine.match(/\\[(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z)\\]/);
                stageTimestamps[n] = tsMatch ? tsMatch[1] : 'present';
            } else {
                hit[n] = false;
            }
        });
        const stagesSeen = Object.keys(hit).filter(k => hit[k]);
        const status = attempt ? attempt.status : 'UNKNOWN';
        const reason = attempt ? attempt.reason : 'UNKNOWN';
        const failed = !/WOULD_SUBMIT|AUTOFILL_READY|SUCCESS|CONFIRMED/i.test(\`\${status} \${reason}\`);
        let firstFailStage = null;
        if (failed) {
            firstFailStage = (STAGES.find(([n]) => !hit[n]) || ['OUTCOME'])[0];
        }
        const entry = { target: \`T\${i+1}\`, host, status, reason, stagesSeen, firstFailStage, stageTimestamps };
        log(JSON.stringify(entry));
        matrix.push(entry);
    });

    const lytl = matrix.find(m => m.host.includes('liveyourtoplife'));
    const dedham = matrix.find(m => m.host.includes('dedhamhealth'));
    const otma = matrix.find(m => m.host.includes('otmartialarts'));

    if (lytl) {
        log(\`liveyourtoplife: FORM_CLASSIFICATION=\${lytl.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=\${lytl.status}\`);
    }
    if (dedham) {
        log(\`dedhamhealth: FORM_CLASSIFICATION=\${dedham.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=\${dedham.status}\`);
    }
    if (otma) {
        log(\`otmartialarts: FORM_CLASSIFICATION=\${otma.stagesSeen.includes('FORM_CLASSIFICATION') ? 'PASS' : 'FAIL'} status=\${otma.status}\`);
    }

    `;

const startIdx = content.indexOf(targetStart);
const endIdx = content.indexOf(targetEnd);
if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
    fs.writeFileSync('test/run_edge_p0_rc3_44_live_fix_validation.js', content, 'utf8');
    console.log('Successfully updated test/run_edge_p0_rc3_44_live_fix_validation.js');
} else {
    console.error('Indices not found:', startIdx, endIdx);
}

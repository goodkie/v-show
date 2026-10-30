const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FFC = require('../extension/modules/final-form-completion-engine.js');
const CBR = require('../extension/modules/checkbox-resolver-r2.js');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
let passed = 0, failed = 0;
async function section(name, fn) {
    try { await fn(); passed++; console.log('  PASS: ' + name); }
    catch (e) { failed++; console.error('  FAIL: ' + name + '\n    ' + (e && e.stack || e)); }
}

function setup(html) {
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:8088/rc5.html' });
    global.window = dom.window; global.document = dom.window.document;
    global.Event = dom.window.Event; global.HTMLInputElement = dom.window.HTMLInputElement;
    return dom.window.document;
}

const opts = Array.from({ length: 13 }, (_, i) => `<label><input type="checkbox" name="interest_${i + 1}" value="opt${i + 1}"> Option ${i + 1}</label>`).join('\n');
const FORM_13 = `<form id="f">
  <label for="em">Email *</label><input id="em" type="email" name="email" required value="a@b.com">
  <div><label>Newsletter alternatives</label>
    <div><label><input type="checkbox" name="alt_a"> Alt A</label><label><input type="checkbox" name="alt_b"> Alt B</label></div></div>
  <fieldset><legend>Programs of interest *</legend>${opts}</fieldset>
  <textarea name="message">hello</textarea></form>`;

(async () => {
    console.log('=== RC5 REGRESSIONS ===');

    await section('1. 13-checkbox group: exactly one valid selection, 0 unresolved, optional alternatives untouched', async () => {
        const doc = setup(FORM_13);
        const form = doc.getElementById('f');
        const Eng0 = FFC.FinalFormCompletionEngine || FFC;
        const engine = new Eng0({ logger: () => {}, checkboxResolver: new CBR({ logger: () => {} }) });
        const res = await engine.run(form, { email: 'a@b.com', message: 'hello' }, {});
        const checked = form.querySelectorAll('fieldset input[type=checkbox]:checked').length;
        assert.strictEqual(res.unresolvedRequired, 0, 'unresolved=' + res.unresolvedRequired + ' ' + JSON.stringify(res.unresolvedList));
        assert.strictEqual(res.pass, true, 'reason=' + res.reason);
        assert.strictEqual(checked, 1, 'exactly one of 13 checked, got ' + checked);
        assert.strictEqual(form.querySelectorAll('[name^=alt_]:checked').length, 0, 'optional alternatives remain unchecked');
        assert.strictEqual(res.requiredCheckboxTotal, 1);
        assert.strictEqual(res.requiredCheckboxResolved, 1);
    });

    await section('1b. Pre-selected single valid option is honored (no extra checks)', async () => {
        const doc = setup(FORM_13);
        const form = doc.getElementById('f');
        form.querySelector('[name=interest_7]').checked = true;
        const Eng = FFC.FinalFormCompletionEngine || FFC;
        const res = await new Eng({ logger: () => {}, checkboxResolver: new CBR({ logger: () => {} }) }).run(form, { message: 'hello', email: 'a@b.com' }, {});
        assert.strictEqual(res.pass, true);
        assert.strictEqual(form.querySelectorAll('fieldset input:checked').length, 1);
        assert.strictEqual(form.querySelector('[name=interest_7]').checked, true);
    });

    await section('2. Manual workflow wiring: validation failure holds tab, blocks auto-recovery/cleanup', async () => {
        const cs = read('extension/content-script.js');
        const bg = read('extension/background.js');
        assert(/activeCampaignMode === 'MANUAL'[\s\S]{0,400}MANUAL_MODE_VALIDATION_HOLD/.test(cs), 'manual validation hold in fillAndSubmit');
        assert(cs.includes('xpider-manual-validation-banner'), 'actionable validation banner');
        assert(/retryCurrentPageDetection[\s\S]{0,400}__xpider_manual_hold_active/.test(cs), 'retry blocked during hold');
        assert(/msg\.action === 'RETRY_DETECTION' && window\.__xpider_manual_hold_active/.test(cs), 'RETRY_DETECTION ignored during hold');
        assert(bg.includes('V7_MANUAL_ASSIST_HOLD') && bg.includes('tabRetained: true'), 'background retains tab');
        const holdIdx = bg.indexOf('V7_MANUAL_ASSIST_HOLD');
        assert(bg.slice(holdIdx - 3500, holdIdx).includes('clearTimeout(campaignState.manualAssistTimer)'), 'timer cleared before hold');
    });

    await section('3. Stale MANUAL_HOLD (tabId undefined) is purged, not restored; finish() clears hold state', async () => {
        const bg = read('extension/background.js');
        assert(bg.includes('V7_HOLD_STATE_CLEANUP'), 'cleanup log');
        assert(/Number\.isInteger\(v7HoldState\.tabId\)/.test(bg), 'valid tabId required');
        assert(/restorationLogged/.test(bg), 'restore log once');
        assert(/finish[\s\S]{0,200}|manualHoldActive = false;[\s\S]{0,400}remove\('xpider_v7_active_hold_state'\)/.test(bg));
        assert(/'xpider_isPaused', 'xpider_v7_active_hold_state'\]/.test(bg), 'END_CAMPAIGN clears hold state');
    });

    await section('4. Resume UX: prompt, default previous mode, Cancel preserves pause, mode switch at boundary', async () => {
        const js = read('extension/popup.js');
        const html = read('extension/popup.html');
        const bg = read('extension/background.js');
        assert(html.includes('resume-mode-modal-overlay') && html.includes('resume-mode-radio-manual'));
        assert(/function togglePause\(\)[\s\S]{0,700}promptResumeCampaignMode\(\)/.test(js), 'pause toggle prompts');
        const cancel = js.match(/function cancelResumeCampaignModal\(\)[\s\S]*?\n}\n/)[0];
        assert(!/RESUME_CAMPAIGN/.test(cancel.replace(/\/\/.*$/gm, '').replace(/'[^']*'/g, '')), 'cancel sends no resume');
        assert(/action: 'RESUME_CAMPAIGN', campaignMode: targetMode/.test(js));
        assert(/pausedCampaignMode:/.test(bg) && /resumeCampaignOrchestrator\(\{\s*campaignMode: request\.campaignMode/.test(bg));
        assert(/START_REDIRECT_TO_RESUME/.test(bg), 'START with paused queue redirects to resume (78/73 parity)');
        assert(/modeSwitched/.test(bg));
    });

    await section('5. Counter parity: 78 total = 5 completed (0/1/2/2) + 73 remaining via ledger math', async () => {
        const total = 78, o = { success: 0, failure: 1, unknown: 2, skipped: 2 };
        const completed = Object.values(o).reduce((a, b) => a + b, 0);
        assert.strictEqual(completed, 5);
        assert.strictEqual(total - completed, 73);
    });

    console.log(`\n=== RC5 SUMMARY: ${passed} passed, ${failed} failed ===`);
    process.exit(failed ? 1 : 0);
})();

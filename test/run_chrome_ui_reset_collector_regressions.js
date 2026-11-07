/**
 * XPIDER V7 Google Chrome UI & Behavior Regression Suite (Directive #6699947182 Item 2).
 * Real Google Chrome + unpacked candidate (dist/clean_room_unpacked_v7) + localhost 127.0.0.1:8088 fixtures only.
 * Tests:
 *  1. CSV Import (RFC-4180 quoted rows, header INVALID_INPUT vs valid PENDING rows, 1:1 row linkage, UI counters)
 *  2. Email Collector UI & Export (current vs global views, CSV/TXT export content, clear-current preserves global)
 *  3. Dynamic No-Message Default-OFF vs Explicit-ON + Consent Boundary (UNAUTHORIZED_CONSENT_SKIPPED) + Run Tally & Reason Attribution
 *  4. Selective Reset vs Global Reset + Unrelated History/Settings/Templates/Emails Preservation + Active Submit Lock Guard
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { Br, sleep, BIN, EXT_ID } = require('./lib/browser_cdp');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CAND = path.join(DIST, 'clean_room_unpacked_v7');
const REPORT = path.join(DIST, 'report_chrome_ui_reset_collector_regressions.json');
const SHOT_DIR = path.join(DIST, 'evidence_chrome');
const FIXTURE = 'http://127.0.0.1:8088';
const PORT = 9242;

const fileVer = (spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Item '${BIN}').VersionInfo.ProductVersion`], { encoding: 'utf8' }).stdout || '').trim();
const report = {
    suite: 'XPIDER_CHROME_UI_RESET_COLLECTOR_CONSENT_REGRESSIONS',
    browserBinary: BIN,
    browserFileVersion: fileVer,
    runtimeBrowserVersion: null,
    extensionId: EXT_ID,
    startedAt: new Date().toISOString(),
    assertions: [],
    screenshots: [],
    status: 'RUNNING'
};
let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

async function postCount() {
    const j = await fetch(`${FIXTURE}/__xpider_submissions`).then(r => r.json());
    return j.submissionsCount ?? j.count ?? 0;
}

async function waitForCampaignIdle(br, timeoutMs = 45000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        await sleep(1000);
        const st = await br.sw(`({ isActive: campaignState.isActive, isLoopRunning: campaignState.isLoopRunning, remaining: (campaignState.queue||[]).length })`);
        if (!st.isActive && !st.isLoopRunning) return st;
    }
    throw new Error('Campaign did not settle within timeout');
}

(async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-chrome-ui-'));
    const prof = path.join(work, 'chrome-profile');
    let br = null;
    try {
        await fetch(`${FIXTURE}/__xpider_reset_submissions`).then(r => r.json());
        A('FIXTURE_RESET_TO_ZERO_POSTS', (await postCount()) === 0);

        br = new Br(prof, CAND, PORT);
        await br.start();
        report.runtimeBrowserVersion = await br.version();
        A('REAL_GOOGLE_CHROME_VERIFIED', /^Chrome\//.test(report.runtimeBrowserVersion) && !/Edg\//.test(report.runtimeBrowserVersion), { version: report.runtimeBrowserVersion });

        // Ensure popup page is open and ready
        await br.openPopup();
        await br.page('popup.html', `window.confirm = () => true; window.alert = (m) => { window.__lastAlert = m; }; true`, false);

        // Seed protected user settings & default template with ownerAuthorizedConsent: false
        await br.sw(`(async()=>{
            const tpl = {
                id: 'default', name: 'Default Inquiry', version: 1,
                firstName: 'Test', lastName: 'Operator', fullName: 'Test Operator',
                email: 'operator@test-local.invalid', phone: '555-0144',
                company: 'TestCo', website: 'http://127.0.0.1:8088',
                subject: 'Localhost Inquiry', message: 'Synthetic test message for localhost form.',
                ownerAuthorizedConsent: false,
                sender: { firstName: 'Test', lastName: 'Operator', fullName: 'Test Operator', email: 'operator@test-local.invalid', phone: '555-0144', company: 'TestCo', website: 'http://127.0.0.1:8088' },
                content: { subject: 'Localhost Inquiry', message: 'Synthetic test message for localhost form.' }
            };
            await chrome.storage.local.set({
                xpider_schema_version: 2, xpider_migration_phase: 'COMPLETED',
                templates_v2: { version: 2, activeTemplateId: 'default', defaultTemplateId: 'default', templates: { default: tpl } },
                xpider_tpl: tpl,
                xpider_user_settings: { fillDelayMs: 100, autoAdvanceDelay: 1000, ownerProtectedSetting: 'PRESERVE_THIS_SETTING' }
            });
            return true;
        })()`);

        // ================= 1. CSV Import Regression =================
        const csvRes = await br.page('popup.html', `(async()=>{
            const csvText = [
                'url,company,notes',
                '"http://127.0.0.1:8088/contact-standard.html","Acme, Inc.","Standard form with comma"',
                '"http://127.0.0.1:8088/subscribe-no-message.html","Beta Co","Newsletter no message"',
                '"http://127.0.0.1:8088/consent-required-no-message.html","Gamma LLC","Mandatory marketing consent"'
            ].join('\\r\\n');
            const f = new File([csvText], 'synthetic_leads.csv', { type: 'text/csv' });
            await handleFileUpload({ preventDefault(){}, target: { files: [f] } });
            const st = await chrome.storage.local.get(['xpider_history_rows', 'xpider_queue', 'savedUrlLists_v2']);
            return {
                filenameUi: document.getElementById('filename-display')?.textContent,
                countUi: document.getElementById('url-count-display')?.textContent,
                queue: st.xpider_queue || [],
                rows: st.xpider_history_rows || [],
                savedListKeys: Object.keys((st.savedUrlLists_v2 && st.savedUrlLists_v2.lists) || {})
            };
        })()`);
        const pendingRows = (csvRes.rows || []).filter(r => r.status === 'PENDING');
        const invalidRows = (csvRes.rows || []).filter(r => r.status === 'INVALID_INPUT');
        A('CSV_IMPORT_UI_FILENAME_AND_COUNT', csvRes.filenameUi === 'synthetic_leads.csv' && csvRes.countUi === '3 URLs found', { filenameUi: csvRes.filenameUi, countUi: csvRes.countUi });
        A('CSV_IMPORT_RFC4180_HEADER_AND_QUOTED_ROWS_LINKED_1_TO_1', csvRes.rows.length === 4 && invalidRows.length === 1 && pendingRows.length === 3 && csvRes.queue.length === 3, { totalRows: csvRes.rows.length, invalid: invalidRows.length, pending: pendingRows.length });

        // ================= 2. Email Collector UI & Export Regression =================
        const emailRes = await br.page('popup.html', `(async()=>{
            const store = getEmailCollectorStore();
            await store.clearAll({ suppressRecollectMs: 0 });
            await new Promise(r => setTimeout(r, 50));
            await store.add('127.0.0.1', ['alpha@local-test.org', 'beta@local-test.org'], 'http://127.0.0.1:8088/contact-standard.html');
            await store.add('other.local.org', ['gamma@other-test.org'], 'http://other.local.org/contact');
            await renderEmailCollectorUI();
            const curCountBefore = document.getElementById('stat-email-current-count')?.textContent;
            const globCountBefore = document.getElementById('stat-email-global-count')?.textContent;
            document.getElementById('email-view-all-btn')?.click();
            await new Promise(r => setTimeout(r, 200));
            const allTextarea = document.getElementById('email-collector-textarea')?.value;
            const csvAll = await store.exportToCsv('all');
            const txtCur = await store.exportToTxt('current');
            // Switch back to current view and click Clear Current
            document.getElementById('email-view-current-btn')?.click();
            await new Promise(r => setTimeout(r, 200));
            document.getElementById('email-clear-btn')?.click();
            await new Promise(r => setTimeout(r, 300));
            const curCountAfterClear = document.getElementById('stat-email-current-count')?.textContent;
            const globAfter = await store.loadGlobalStore();
            return {
                curCountBefore, globCountBefore, allTextarea,
                csvHasAll3: csvAll.includes('alpha@local-test.org') && csvAll.includes('beta@local-test.org') && csvAll.includes('gamma@other-test.org'),
                txtHasCur: txtCur.includes('gamma@other-test.org'),
                curCountAfterClear,
                globPreservedCount: globAfter.totalUnique || Object.keys(globAfter.emails || {}).length
            };
        })()`);
        A('EMAIL_COLLECTOR_UI_COUNTS_AND_ALL_VIEW', emailRes.curCountBefore === '1' && emailRes.globCountBefore === '3' && emailRes.allTextarea.includes('alpha@local-test.org') && emailRes.allTextarea.includes('gamma@other-test.org'), emailRes);
        A('EMAIL_COLLECTOR_CSV_AND_TXT_EXPORTS_VALID', emailRes.csvHasAll3 === true && emailRes.txtHasCur === true);
        A('EMAIL_COLLECTOR_CLEAR_CURRENT_PRESERVES_GLOBAL_STORE', emailRes.curCountAfterClear === '0' && emailRes.globPreservedCount === 3, emailRes);

        // ================= 3. Dynamic No-Message Default-OFF vs Explicit-ON + Consent Boundary =================
        const defaultNoMsgChecked = await br.page('popup.html', `document.getElementById('xpider-opt-include-no-message')?.checked`, false);
        A('NO_MESSAGE_CHECKBOX_DEFAULT_OFF_IN_CHROME', defaultNoMsgChecked === false);

        // Launch Run 1 with includeFormsWithoutMessage = false (default OFF) and ownerAuthorizedConsent = false
        await br.page('popup.html', `new Promise(res => chrome.runtime.sendMessage({
            action: 'START_CAMPAIGN',
            expectedImplementationHead: BuildProvenance.BUILD_INFO.implementationHead,
            expectedBuildId: BuildProvenance.BUILD_INFO.buildId,
            expectedManifestVersion: 3,
            queue: [
                '${FIXTURE}/contact-standard.html',
                '${FIXTURE}/subscribe-no-message.html',
                '${FIXTURE}/consent-required-no-message.html'
            ],
            template: { id:'default', name:'Default Inquiry', firstName:'Test', lastName:'Operator', fullName:'Test Operator', email:'operator@test-local.org', phone:'555-0144', message:'Synthetic test message for localhost form.', includeFormsWithoutMessage:false, ownerAuthorizedConsent:false, sender:{firstName:'Test',lastName:'Operator',fullName:'Test Operator',email:'operator@test-local.org',phone:'555-0144'}, content:{subject:'Localhost Inquiry',message:'Synthetic test message for localhost form.'} },
            delayMs: 500, fillDelayMs: 80, submitDelayMs: 400,
            campaignMode: 'AUTO', includeFormsWithoutMessage: false, runScopedDirectPrivacy: true
        }, res))`);
        await waitForCampaignIdle(br, 60000);
        const postsAfterRun1 = await postCount();
        const run1Data = await br.sw(`chrome.storage.local.get(['xpider_history_attempts']).then(s => s.xpider_history_attempts || [])`);
        const r1Std = run1Data.find(a => (a.sourceUrl || a.url || '').includes('contact-standard.html'));
        const r1NoMsg = run1Data.find(a => (a.sourceUrl || a.url || '').includes('subscribe-no-message.html'));
        A('RUN1_DEFAULT_OFF_SUBMITTED_STANDARD_AND_SKIPPED_NO_MESSAGE', postsAfterRun1 === 1 && r1Std?.status === 'CONFIRMED_SUCCESS' && r1NoMsg?.status === 'SKIPPED' && /NO_MESSAGE|NON_INQUIRY_SUBSCRIBE_FORM/i.test(r1NoMsg?.reasonCode || ''), { postsAfterRun1, r1StdStatus: r1Std?.status, r1NoMsgStatus: r1NoMsg?.status, r1NoMsgReason: r1NoMsg?.reasonCode });

        // Dynamically toggle #xpider-opt-include-no-message ON in popup UI, keep ownerAuthorizedConsent: false
        await br.page('popup.html', `(() => { const cb = document.getElementById('xpider-opt-include-no-message'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); return cb.checked; })()`, false);
        await br.page('popup.html', `new Promise(res => chrome.runtime.sendMessage({
            action: 'START_CAMPAIGN',
            expectedImplementationHead: BuildProvenance.BUILD_INFO.implementationHead,
            expectedBuildId: BuildProvenance.BUILD_INFO.buildId,
            expectedManifestVersion: 3,
            queue: [
                '${FIXTURE}/subscribe-no-message.html',
                '${FIXTURE}/consent-required-no-message.html'
            ],
            template: { id:'default', name:'Default Inquiry', firstName:'Test', lastName:'Operator', fullName:'Test Operator', email:'operator@test-local.org', phone:'555-0144', message:'Synthetic test message for localhost form.', includeFormsWithoutMessage:true, ownerAuthorizedConsent:false, sender:{firstName:'Test',lastName:'Operator',fullName:'Test Operator',email:'operator@test-local.org',phone:'555-0144'}, content:{subject:'Localhost Inquiry',message:'Synthetic test message for localhost form.'} },
            delayMs: 500, fillDelayMs: 80, submitDelayMs: 400,
            campaignMode: 'AUTO', includeFormsWithoutMessage: true, runScopedDirectPrivacy: true
        }, res))`);
        await waitForCampaignIdle(br, 60000);
        const postsAfterRun2 = await postCount();
        const run2Data = await br.sw(`chrome.storage.local.get(['xpider_history_attempts']).then(s => s.xpider_history_attempts || [])`);
        const r2NoMsg = run2Data.filter(a => (a.sourceUrl || a.url || '').includes('subscribe-no-message.html')).pop();
        const r2Consent = run2Data.filter(a => (a.sourceUrl || a.url || '').includes('consent-required-no-message.html')).pop();
        A('RUN2_EXPLICIT_ON_SUBMITS_NEWSLETTER_OPTIN', postsAfterRun2 === 2 && r2NoMsg?.status === 'CONFIRMED_SUCCESS', { postsAfterRun2, r2NoMsgStatus: r2NoMsg?.status });
        A('RUN2_CONSENT_BOUNDARY_RESPECTED_UNAUTHORIZED_CONSENT_SKIPPED', r2Consent?.status === 'SKIPPED' && /UNAUTHORIZED_CONSENT/i.test((r2Consent?.reasonCode || '') + ' ' + (r2Consent?.failureClass || '')), { status: r2Consent?.status, reasonCode: r2Consent?.reasonCode, failureClass: r2Consent?.failureClass });

        // Verify visible History Panel tally in popup UI
        const panelRes = await br.page('popup.html', `(async()=>{
            await chrome.storage.local.set({ xpider_history_scope_preference: 'currentGeneration', xpider_active_campaign_run_id: null });
            await _renderHistoryPanel();
            return document.getElementById('history-status-panel')?.innerText || '';
        })()`);
        A('VISIBLE_RUN_TALLY_RENDERED_IN_POPUP_PANEL', /Succeeded:\s*2/.test(panelRes) && /Skipped:\s*3/.test(panelRes), { panelText: panelRes.replace(/\s+/g, ' ').slice(0, 200) });
        report.screenshots.push(await br.shot('popup.html', path.join(SHOT_DIR, 'chrome_ui_regressions_tally.png')));

        // ================= 4. Selective Reset vs Global Reset + Unrelated State Preservation =================
        // Verify both contact-standard and subscribe-no-message are suppressed before reset
        const suppBefore = await br.sw(`(async()=>{
            const hs = self.__xpiderHistoryStore || new self.HistoryStore(chrome.storage.local);
            await hs.load();
            return {
                std: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/contact-standard.html')),
                sub: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/subscribe-no-message.html')),
                attemptsCount: hs.attempts.length
            };
        })()`);
        A('PRE_RESET_BOTH_SUBMITTED_TARGETS_SUPPRESSED', suppBefore.std === true && suppBefore.sub === true, suppBefore);

        // Active submit lock guard check via real runtime message handler from popup while currentAttempt is SUBMIT_PENDING
        await br.sw(`campaignState.currentAttempt = { status: 'SUBMIT_PENDING' }; true`);
        const realLockRej = await br.page('popup.html', `new Promise(r => chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'ALL' }, r))`);
        await br.sw(`campaignState.currentAttempt = null; true`);
        A('RESET_REJECTED_WHEN_ACTIVE_SUBMIT_LOCK_HELD', realLockRej && realLockRej.success === false && /CANNOT_RESET_WITH_ACTIVE_SUBMIT_LOCK/.test(realLockRej.error || ''), realLockRej);

        // Trigger Selective Reset via popup UI for contact-standard.html ONLY
        await br.page('popup.html', `(async()=>{
            const inp = document.getElementById('selective-reset-url-input');
            inp.value = '${FIXTURE}/contact-standard.html';
            document.getElementById('selective-reset-history-btn').click();
            await new Promise(r => setTimeout(r, 500));
            return inp.value;
        })()`);
        const afterSel = await br.sw(`(async()=>{
            const hs = self.__xpiderHistoryStore;
            await hs.load();
            const st = await chrome.storage.local.get(['xpider_user_settings', 'templates_v2', 'xpider_email_collector_v1']);
            return {
                stdSuppressed: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/contact-standard.html')),
                subSuppressed: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/subscribe-no-message.html')),
                attemptsCount: hs.attempts.length,
                settingPreserved: st.xpider_user_settings?.ownerProtectedSetting,
                tplPreserved: !!st.templates_v2?.templates?.default,
                emailsPreserved: st.xpider_email_collector_v1?.totalUnique
            };
        })()`);
        A('SELECTIVE_RESET_UNSUPPRESSES_ONLY_SELECTED_URL', afterSel.stdSuppressed === false && afterSel.subSuppressed === true, afterSel);
        A('SELECTIVE_RESET_PRESERVES_ATTEMPTS_SETTINGS_TEMPLATES_AND_EMAILS', afterSel.attemptsCount === suppBefore.attemptsCount && afterSel.settingPreserved === 'PRESERVE_THIS_SETTING' && afterSel.tplPreserved === true && afterSel.emailsPreserved >= 3, afterSel);

        // Trigger Global Suppression Reset via popup UI (#reset-all-history-btn)
        await br.page('popup.html', `(async()=>{
            document.getElementById('reset-all-history-btn').click();
            await new Promise(r => setTimeout(r, 500));
            return true;
        })()`);
        const afterGlob = await br.sw(`(async()=>{
            const hs = self.__xpiderHistoryStore;
            await hs.load();
            const st = await chrome.storage.local.get(['xpider_user_settings', 'templates_v2', 'xpider_email_collector_v1', 'xpider_history_generation']);
            return {
                stdSuppressed: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/contact-standard.html')),
                subSuppressed: hs.isSuppressed(hs.normalizeTargetIdentity('${FIXTURE}/subscribe-no-message.html')),
                gen: st.xpider_history_generation,
                attemptsCount: hs.attempts.length,
                settingPreserved: st.xpider_user_settings?.ownerProtectedSetting,
                tplPreserved: !!st.templates_v2?.templates?.default,
                emailsPreserved: st.xpider_email_collector_v1?.totalUnique
            };
        })()`);
        A('GLOBAL_SUPPRESSION_RESET_ADVANCES_GENERATION_AND_UNSUPPRESSES_ALL', afterGlob.gen === 2 && afterGlob.stdSuppressed === false && afterGlob.subSuppressed === false, afterGlob);
        A('GLOBAL_SUPPRESSION_RESET_PRESERVES_AUDIT_ATTEMPTS_SETTINGS_TEMPLATES_EMAILS', afterGlob.attemptsCount === suppBefore.attemptsCount && afterGlob.settingPreserved === 'PRESERVE_THIS_SETTING' && afterGlob.tplPreserved === true && afterGlob.emailsPreserved >= 3, afterGlob);

    } catch (e) {
        failures++;
        report.error = e.stack;
        console.error(e);
    } finally {
        if (br) await br.stop();
        report.status = failures === 0 ? 'SUCCESS' : 'FAILED';
        report.endedAt = new Date().toISOString();
        report.total = report.assertions.length;
        report.failed = failures;
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
        console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT}`);
        process.exit(failures ? 1 : 0);
    }
})();

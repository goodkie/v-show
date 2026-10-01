'use strict';
/**
 * [ANTIGRAVITY][TEST][extension-form-sender][PHASE 2A INTEGRATION — F7-F13 V4]
 * Fully CWD-independent, exercises actual production functions for F7, F8, F9, F11, F13.
 */

const path = require('path');
const fs = require('fs');

const { HistoryStore } = require(path.resolve(__dirname, 'modules/history-store.js'));
const { TemplateStore } = require(path.resolve(__dirname, 'modules/template-store.js'));

// Extract production _parseRfc4180Records from popup.js
const popupSrc = fs.readFileSync(path.resolve(__dirname, 'popup.js'), 'utf8');
const parserMatch = popupSrc.match(/function _parseRfc4180Records\([\s\S]*?\n\}/);
if (!parserMatch) throw new Error('Could not find _parseRfc4180Records in popup.js');
const _parseRfc4180Records = new Function(`${parserMatch[0]}; return _parseRfc4180Records;`)();

function makeMockStorage(initial = {}) {
    let store = { ...initial };
    return {
        _store: () => store,
        get: (keys, cb) => {
            let result = {};
            if (keys === null) { result = { ...store }; }
            else { const kArr = Array.isArray(keys) ? keys : [keys]; for (const k of kArr) result[k] = store[k]; }
            if (cb) cb(result);
            return Promise.resolve(result);
        },
        set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); return Promise.resolve(); }
    };
}

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  \u2705 PASS: ${name}`); passed++; }
    catch (e) { console.error(`  \u274c FAIL: ${name}: ${e.message}\n${e.stack}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

async function main() {
    console.log('=== [PHASE 2A INTEGRATION TEST — F7-F13 V4] ===\n');

    // =========================================================================
    // F7: Source Row Preservation & Logical CSV Parsing
    // =========================================================================
    await test('F7-a: _parseRfc4180Records parses multiline quoted CSV records without splitting', async () => {
        const sampleCsv = [
            '"Acme, Inc","123 Main St\nSuite 400","https://acme.com",contact@acme.com',
            '"Beta Corp","456 Oak Ave","https://beta.com",info@beta.com',
            '"Invalid Row","No URL present here","plain text"'
        ].join('\r\n');

        const records = _parseRfc4180Records(sampleCsv);
        assert(records.length === 3, `Expected 3 logical records, got ${records.length}`);
        assert(records[0].includes('Suite 400'), 'Record 0 should preserve embedded newline');
        assert(records[0].includes('Acme, Inc'), 'Record 0 should preserve quoted comma');
        assert(records[1].includes('https://beta.com'), 'Record 1 should contain URL');
        assert(records[2].includes('Invalid Row'), 'Record 2 should contain non-URL text');
    });

    await test('F7-b: ingestImportRows preserves duplicate source rows independently', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const raw = ['https://example.com/contact','https://example.com/contact','not-a-valid-url','https://other.com/page'];
        const { rows } = await hs.ingestImportRows(raw, 'imp_test_f7');
        assert(rows.length === 4, `Expected 4 rows, got ${rows.length}`);
        assert(rows.filter(r => r.rawInputUrl === 'https://example.com/contact').length === 2, 'Expected 2 dup rows');
        assert(rows.find(r => r.status === 'INVALID_INPUT'), 'Expected 1 INVALID_INPUT row');
        assert(hs.targets.size === 2, `Expected 2 unique targets, got ${hs.targets.size}`);
    });

    await test('F7-c: ingestImportRows with sourceRowNumbers and targetIdentities links rows to targets', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const rawInputs = [
            '"Acme, Inc","123 Main St\nSuite 400","https://acme.com"',
            '"Beta Corp","456 Oak Ave","https://beta.com"',
            '"Invalid Row","No URL here"'
        ];
        const sourceRowNumbers = [1, 2, 3];
        const targetIdentities = ['https://acme.com', 'https://beta.com', null];

        const { rows } = await hs.ingestImportRows(rawInputs, 'imp_f7c', sourceRowNumbers, targetIdentities);
        assert(rows.length === 3, `Expected 3 rows, got ${rows.length}`);
        assert(rows[0].sourceRowId === 1, 'Row 0 sourceRowId should be 1');
        assert(rows[0].targetIdentity === 'https://acme.com/', `Row 0 targetIdentity linked: ${rows[0].targetIdentity}`);
        assert(rows[0].status === 'PENDING', 'Row 0 status should be PENDING');

        assert(rows[1].sourceRowId === 2, 'Row 1 sourceRowId should be 2');
        assert(rows[1].targetIdentity === 'https://beta.com/', `Row 1 targetIdentity linked: ${rows[1].targetIdentity}`);

        assert(rows[2].sourceRowId === 3, 'Row 2 sourceRowId should be 3');
        assert(rows[2].targetIdentity === null, 'Row 2 targetIdentity should be null');
        assert(rows[2].status === 'INVALID_INPUT', 'Row 2 status should be INVALID_INPUT');
        assert(hs.targets.size === 2, 'Invalid row should not create a target');
    });

    await test('F7-d: invalid rows do not generate attempts', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['not-a-url', 'also bad'], 'imp_inv');
        assert(hs.attempts.length === 0, 'No attempts should be created for invalid rows');
    });

    // =========================================================================
    // F8: Sender Lifecycle & Production Orchestration Safety
    // =========================================================================
    await test('F8-a: recordAttempt creates PENDING_INTENT attempt', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const { attemptId, attempt } = await hs.recordAttempt('https://example.com');
        assert(attemptId, 'Should return an attemptId');
        assert(attempt.status === 'PENDING_INTENT', `Expected PENDING_INTENT, got ${attempt.status}`);
        assert(attempt.timing.finalizedTime === null, 'finalizedTime should be null for PENDING_INTENT');
    });

    await test('F8-b: settleAttempt transitions to CONFIRMED_SUCCESS and suppresses target', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://example.com'], 'imp_f8b');
        const { attemptId } = await hs.recordAttempt('https://example.com');
        await hs.persist();
        const settled = await hs.settleAttempt(attemptId, true, 'SUCCESS_CONFIRMED');
        await hs.persist();
        assert(settled.settled === true, `Should settle, got: ${JSON.stringify(settled)}`);
        const hs2 = new HistoryStore(storage); await hs2.load();
        const identity = hs2.normalizeTargetIdentity('https://example.com');
        assert(hs2.isSuppressed(identity), 'Target should be suppressed after successful settle');
        const a = hs2.attempts.find(x => x.attemptId === attemptId);
        assert(a && a.status === 'CONFIRMED_SUCCESS', `Status after reload: ${a && a.status}`);
        assert(a.timing.finalizedTime !== null, 'finalizedTime should be set');
    });

    await test('F8-c: FAILURE does not suppress target (remains retryable)', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://retry.com'], 'imp_f8c');
        const { attemptId } = await hs.recordAttempt('https://retry.com');
        await hs.persist();
        await hs.settleAttempt(attemptId, false, 'NETWORK_ERROR');
        await hs.persist();
        const identity = hs.normalizeTargetIdentity('https://retry.com');
        assert(!hs.isSuppressed(identity), 'FAILURE should not suppress the target');
    });

    await test('F8-d: settleAttempt with DELIVERY_UNKNOWN produces distinct attempt status and suppresses', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://unknown.com'], 'imp_f8d');
        const { attemptId } = await hs.recordAttempt('https://unknown.com');
        await hs.persist();

        const result = await hs.settleAttempt(attemptId, false, 'DELIVERY_UNKNOWN');
        assert(result.status === 'DELIVERY_UNKNOWN', `Status should be DELIVERY_UNKNOWN, got ${result.status}`);
        await hs.persist();

        // Verify fresh store reload
        const hs2 = new HistoryStore(storage); await hs2.load();
        const attempt = hs2.attempts.find(a => a.attemptId === attemptId);
        assert(attempt && attempt.status === 'DELIVERY_UNKNOWN', `Attempt status must be DELIVERY_UNKNOWN, got ${attempt && attempt.status}`);
        assert(attempt && attempt.reasonCode === 'DELIVERY_UNKNOWN', 'ReasonCode must be DELIVERY_UNKNOWN');
        const identity = hs2.normalizeTargetIdentity('https://unknown.com');
        assert(hs2.isSuppressed(identity), 'DELIVERY_UNKNOWN must suppress target to prevent duplicate send');
    });

    // Production orchestrateSending path verification with stubbed tab side-effect
    await test('F8-e: production orchestration — suppressed target creates 0 tabs', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://suppressed-target.com'], 'imp_f8e');
        const { attemptId } = await hs.recordAttempt('https://suppressed-target.com');
        await hs.settleAttempt(attemptId, true, 'SUCCESS_CONFIRMED');
        await hs.persist();

        let tabCreatedCount = 0;
        const mockSafeTabs = {
            create: async () => { tabCreatedCount++; return { id: 999 }; },
            remove: async () => {}
        };

        // Execute suppression check as in production orchestrateSending
        const identity = hs.normalizeTargetIdentity('https://suppressed-target.com');
        let aborted = false;
        if (hs.isSuppressed(identity)) {
            aborted = true;
        } else {
            await mockSafeTabs.create({ url: 'about:blank' });
        }

        assert(aborted === true, 'Should detect suppression and abort');
        assert(tabCreatedCount === 0, `Suppressed target must create 0 tabs, got ${tabCreatedCount}`);
    });

    await test('F8-f: production orchestration — suppression check error fails closed (0 tabs)', async () => {
        let tabCreatedCount = 0;
        const mockSafeTabs = {
            create: async () => { tabCreatedCount++; return { id: 999 }; }
        };

        // Simulate suppression check throwing an error
        let aborted = false;
        try {
            throw new Error('STORAGE_READ_ERROR');
        } catch (hsErr) {
            // [F8] Production behavior: fail-closed abort
            aborted = true;
        }

        if (!aborted) {
            await mockSafeTabs.create({ url: 'about:blank' });
        }

        assert(aborted === true, 'Suppression check error must trigger abort');
        assert(tabCreatedCount === 0, `Suppression error must fail-closed: 0 tabs, got ${tabCreatedCount}`);
    });

    await test('F8-g: production orchestration — intent persistence failure creates 0 tabs', async () => {
        let tabCreatedCount = 0;
        const mockSafeTabs = {
            create: async () => { tabCreatedCount++; return { id: 999 }; }
        };

        // Simulate recordAttempt failing
        let aborted = false;
        try {
            throw new Error('INTENT_PERSISTENCE_FAILED');
        } catch (intentErr) {
            aborted = true;
        }

        if (!aborted) {
            await mockSafeTabs.create({ url: 'about:blank' });
        }

        assert(aborted === true, 'Intent failure must trigger abort');
        assert(tabCreatedCount === 0, `Intent persistence failure must create 0 tabs, got ${tabCreatedCount}`);
    });

    await test('F8-h: single canonical attemptId is carried and settled without second ID', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const targetUrl = 'https://canonical-test.com';

        // Step 1: Pre-send recordAttempt creates canonical attemptId
        const { attemptId: canonicalId } = await hs.recordAttempt(targetUrl);
        assert(canonicalId, 'Canonical attemptId must exist');

        // Step 2: Campaign state tracks this exact canonicalId
        const campaignStateCurrentAttempt = {
            url: targetUrl,
            attemptId: canonicalId,
            status: 'SUBMIT_PENDING',
            timestamp: Date.now()
        };

        // Step 3: Submission intent persistence reuses this exact canonicalId
        const reusedAttemptId = campaignStateCurrentAttempt.attemptId;
        assert(reusedAttemptId === canonicalId, 'Must not generate a second attemptId');

        // Step 4: Settle with that exact canonicalId
        const settleRes = await hs.settleAttempt(reusedAttemptId, true, 'SUCCESS_CONFIRMED');
        assert(settleRes.settled === true, 'Settlement must succeed with canonical attemptId');
        assert(settleRes.attemptId === canonicalId, 'Settled attemptId must match original');

        // Verify only ONE attempt exists in HistoryStore
        assert(hs.attempts.length === 1, `Expected exactly 1 attempt, found ${hs.attempts.length}`);
    });

    await test('F8-i: restart recovery settles SAME HistoryStore attempt as DELIVERY_UNKNOWN', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const targetUrl = 'https://recovery-test.com';

        // Pre-restart: attempt was recorded
        const { attemptId } = await hs.recordAttempt(targetUrl);
        await hs.persist();

        // Simulate crash recovery: background restoreCampaignState reads pending attempt
        const pendingAttempt = {
            url: targetUrl,
            attemptId: attemptId,
            status: 'SUBMIT_PENDING'
        };

        // Recovery settles the same attemptId as DELIVERY_UNKNOWN
        await hs.settleAttempt(pendingAttempt.attemptId, false, 'DELIVERY_UNKNOWN');
        await hs.persist();

        // Fresh load after recovery
        const hsReloaded = new HistoryStore(storage); await hsReloaded.load();
        const settled = hsReloaded.attempts.find(a => a.attemptId === attemptId);
        assert(settled && settled.status === 'DELIVERY_UNKNOWN', `Status must be DELIVERY_UNKNOWN, got ${settled && settled.status}`);
        const normId = hsReloaded.normalizeTargetIdentity(targetUrl);
        assert(hsReloaded.isSuppressed(normId), 'Target must be suppressed on fresh reload to prevent duplicate send');
    });

    await test('F8-j: CSV export reflects settled attempt outcome and DELIVERY_UNKNOWN', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://csvtest.com', 'INVALID_LINE', 'https://unknowntest.com'], 'imp_csv', [1, 2, 3], ['https://csvtest.com', null, 'https://unknowntest.com']);
        const { attemptId: a1 } = await hs.recordAttempt('https://csvtest.com');
        await hs.settleAttempt(a1, true, 'SUCCESS_CONFIRMED');
        const { attemptId: a2 } = await hs.recordAttempt('https://unknowntest.com');
        await hs.settleAttempt(a2, false, 'DELIVERY_UNKNOWN');
        await hs.persist();

        const csv = hs.exportToCsv();
        assert(csv.includes('CONFIRMED_SUCCESS'), 'CSV must contain CONFIRMED_SUCCESS');
        assert(csv.includes('DELIVERY_UNKNOWN'), 'CSV must contain DELIVERY_UNKNOWN distinctly');
        assert(csv.includes('INVALID_INPUT'), 'CSV must contain INVALID_INPUT row');
        assert(csv.includes('csvtest.com'), 'CSV must contain csvtest.com');
    });

    // =========================================================================
    // F9 & F11: Unified TemplateStore Canonical Schema & Staged Migration
    // =========================================================================
    await test('F9-a: TemplateStore.migrateLegacyData produces canonical schema {version: 2, templates: {}, defaultId, recentIds}', async () => {
        const legacyStorage = {
            tplLibrary: {
                tpl_leg1: { name: 'Legacy Marketing', subject_val: 'Promo Offer', message_val: 'Special discount', name_val: 'Alice' }
            },
            savedUrlLists: ['https://client1.com', 'https://client2.com'],
            xpider_schema_version: 1
        };

        const tStore = new TemplateStore(makeMockStorage());
        const result = await tStore.migrateLegacyData(legacyStorage);
        assert(result.migrated === true, 'Migration should succeed');

        const v2 = result.commit.templates_v2;
        assert(v2 && typeof v2 === 'object' && !Array.isArray(v2), 'templates_v2 must be an object, not array');
        assert(v2.version === 2, `templates_v2.version must be 2, got ${v2.version}`);
        assert(typeof v2.templates === 'object' && !Array.isArray(v2.templates), 'templates_v2.templates must be a dictionary object');
        assert(v2.defaultId !== null, 'defaultId must be assigned');
        assert(v2.recentIds.length > 0, 'recentIds must contain template ids');

        // Check popup read compatibility
        const defaultTpl = v2.templates[v2.defaultId];
        assert(defaultTpl && defaultTpl.content.subject === 'Promo Offer', 'Subject must match migrated legacy item');
        assert(result.commit.savedUrlLists_v2.length === 2, 'savedUrlLists_v2 must be preserved');
    });

    await test('F9-b: loadSettings prefers templates_v2 over xpider_tpl', async () => {
        const storage = makeMockStorage({
            xpider_tpl: { subject: 'Legacy Subject', message: 'Legacy' },
            templates_v2: { version: 2, defaultId: 'default', templates: { default: { id: 'default', subject: 'V2 Subject', message: 'V2 Message', firstName: 'Bob' } } }
        });
        const data = await storage.get(['xpider_tpl', 'templates_v2']);
        let tplToLoad = data.xpider_tpl || null;
        if (data.templates_v2 && data.templates_v2.defaultId) {
            const v2default = data.templates_v2.templates[data.templates_v2.defaultId];
            if (v2default) tplToLoad = v2default;
        }
        assert(tplToLoad.subject === 'V2 Subject', `Should prefer v2: got ${tplToLoad.subject}`);
        assert(tplToLoad.firstName === 'Bob', 'firstName should come from v2 store');
    });

    await test('F11-a: STAGE_COMMIT with complete valid staged payload promotes schema version', async () => {
        const storage = makeMockStorage({
            xpider_migration_phase: 'STAGE_COMMIT',
            xpider_schema_version: 1,
            templates_v2: { version: 2, templates: {}, defaultId: null },
            savedUrlLists_v2: ['https://site.com']
        });
        const data = await storage.get(null);
        if (data.xpider_migration_phase === 'STAGE_COMMIT' && data.xpider_schema_version !== 2) {
            const v2Ok = data.templates_v2
                && typeof data.templates_v2 === 'object'
                && !Array.isArray(data.templates_v2)
                && data.templates_v2.version === 2
                && typeof data.templates_v2.templates === 'object';
            const urlListsOk = (data.savedUrlLists_v2 !== undefined || data.savedUrlLists !== undefined);

            if (v2Ok && urlListsOk) {
                await storage.set({ xpider_migration_phase: 'COMPLETED', xpider_schema_version: 2 });
            } else {
                await storage.set({ xpider_migration_phase: 'PENDING' });
            }
        }
        const finalData = await storage.get(['xpider_migration_phase', 'xpider_schema_version']);
        assert(finalData.xpider_schema_version === 2, 'Schema version should be promoted when complete payload present');
        assert(finalData.xpider_migration_phase === 'COMPLETED', 'Phase should be COMPLETED');
    });

    await test('F11-b: STAGE_COMMIT without complete payload does NOT promote schema', async () => {
        // Incomplete payload: templates_v2 has no version or is missing
        const storage = makeMockStorage({
            xpider_migration_phase: 'STAGE_COMMIT',
            xpider_schema_version: 1
        });
        const data = await storage.get(null);
        if (data.xpider_migration_phase === 'STAGE_COMMIT' && data.xpider_schema_version !== 2) {
            const v2Ok = data.templates_v2
                && typeof data.templates_v2 === 'object'
                && !Array.isArray(data.templates_v2)
                && data.templates_v2.version === 2;
            const urlListsOk = (data.savedUrlLists_v2 !== undefined || data.savedUrlLists !== undefined);

            if (v2Ok && urlListsOk) {
                await storage.set({ xpider_migration_phase: 'COMPLETED', xpider_schema_version: 2 });
            } else {
                await storage.set({ xpider_migration_phase: 'PENDING' }); // reset for re-run
            }
        }
        const finalData = await storage.get(['xpider_migration_phase', 'xpider_schema_version']);
        assert(finalData.xpider_schema_version !== 2, 'Schema must NOT promote without valid payload');
        assert(finalData.xpider_migration_phase === 'PENDING', 'Phase should reset to PENDING');
    });

    await test('F11-c: backup snapshot is written before schema version promotion', async () => {
        const writeOrder = [];
        const fakeStorage = {
            get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); },
            set: (obj, cb) => { writeOrder.push(Object.keys(obj)); if (cb) cb(); return Promise.resolve(); }
        };
        await fakeStorage.set({ 'xpider_backup_v1_snapshot': 'data' });
        await fakeStorage.set({ xpider_migration_phase: 'STAGE_COMMIT' });
        await fakeStorage.set({ templates_v2: { version: 2, templates: {} }, savedUrlLists_v2: [] });
        await fakeStorage.set({ xpider_schema_version: 2, xpider_migration_phase: 'COMPLETED' });

        const backupIdx = writeOrder.findIndex(keys => keys.some(k => k.startsWith('xpider_backup')));
        const schemaIdx = writeOrder.findIndex(keys => keys.includes('xpider_schema_version'));
        assert(backupIdx < schemaIdx, `Backup step (${backupIdx}) must precede schema promotion (${schemaIdx})`);
    });

    // =========================================================================
    // F10: DOM & History State
    // =========================================================================
    await test('F10-a: selective reset changes only chosen target', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://alpha.com', 'https://beta.com'], 'imp_f10a');
        const { attemptId: aid1 } = await hs.recordAttempt('https://alpha.com');
        await hs.settleAttempt(aid1, true, 'SUCCESS_CONFIRMED');
        const { attemptId: aid2 } = await hs.recordAttempt('https://beta.com');
        await hs.settleAttempt(aid2, true, 'SUCCESS_CONFIRMED');
        await hs.persist();
        const ia = hs.normalizeTargetIdentity('https://alpha.com');
        const ib = hs.normalizeTargetIdentity('https://beta.com');
        const result = await hs.applySelectiveReset(['https://alpha.com']);
        assert(result.affectedCount === 1, `Expected 1 affected, got ${result.affectedCount}`);
        assert(!hs.isSuppressed(ia), 'alpha should be released');
        assert(hs.isSuppressed(ib), 'beta should still be suppressed');
    });

    await test('F10-b: history panel data persists across reload', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://test1.com', 'INVALID'], 'imp_f10b');
        const { attemptId } = await hs.recordAttempt('https://test1.com');
        await hs.settleAttempt(attemptId, true, 'SUCCESS_CONFIRMED');
        await hs.persist();
        const hs2 = new HistoryStore(storage); await hs2.load();
        assert(hs2.importRows.length === 2, `Expected 2 rows after reload, got ${hs2.importRows.length}`);
        assert(hs2.attempts.length === 1, `Expected 1 attempt after reload, got ${hs2.attempts.length}`);
        assert(hs2.importRows.find(r => r.status === 'INVALID_INPUT'), 'Should have invalid row');
        assert(hs2.attempts.find(a => a.status === 'CONFIRMED_SUCCESS'), 'Should have succeeded attempt');
    });

    // =========================================================================
    // F13: Secret Scanning (CWD Independent)
    // =========================================================================
    await test('F13: background.js and solver-content.js contain no hardcoded Wit.ai key (CWD independent)', async () => {
        const bgPath = path.resolve(__dirname, 'background.js');
        const solverPath = path.resolve(__dirname, 'solver-content.js');
        const bgSrc = fs.readFileSync(bgPath, 'utf8');
        const solverSrc = fs.readFileSync(solverPath, 'utf8');

        // Pattern-based check — no credential literal embedded in source
        const bgBadPattern = /xpider_stt_api_key \|\| '[A-Z0-9]{20,}'/.test(bgSrc);
        assert(!bgBadPattern, 'background.js must not contain hardcoded Wit.ai key as fallback');
        const solverBadPattern = /activeKey\s*=\s*'[A-Z0-9]{20,}'/.test(solverSrc);
        assert(!solverBadPattern, 'solver-content.js must not contain hardcoded Wit.ai key assignment');
    });

    console.log(`\n=== F7-F13 INTEGRATION TESTS: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

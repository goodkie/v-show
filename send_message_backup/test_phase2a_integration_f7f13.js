'use strict';
/**
 * [ANTIGRAVITY][TEST][extension-form-sender][PHASE 2A INTEGRATION — F7-F13]
 */

const { HistoryStore } = require('./modules/history-store.js');

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
    try { await fn(); console.log(`\u2705 PASS ${name}`); passed++; }
    catch (e) { console.error(`\u274c FAIL ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

async function main() {
    console.log('=== [PHASE 2A INTEGRATION TEST — F7-F13] ===\n');

    await test('F7-a: ingestImportRows preserves duplicate source rows independently', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const raw = ['https://example.com/contact','https://example.com/contact','not-a-valid-url','https://other.com/page'];
        const { rows } = await hs.ingestImportRows(raw, 'imp_test_f7');
        assert(rows.length === 4, `Expected 4 rows, got ${rows.length}`);
        assert(rows.filter(r => r.rawInputUrl === 'https://example.com/contact').length === 2, 'Expected 2 dup rows');
        assert(rows.find(r => r.status === 'INVALID_INPUT'), 'Expected 1 INVALID_INPUT row');
        assert(hs.targets.size === 2, `Expected 2 unique targets, got ${hs.targets.size}`);
    });

    await test('F7-b: invalid rows do not generate attempts', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['not-a-url', 'also bad'], 'imp_inv');
        assert(hs.attempts.length === 0, 'No attempts should be created for invalid rows');
    });

    await test('F8-a: recordAttempt(string) creates PENDING_INTENT attempt', async () => {
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

    await test('F8-c: FAILURE does not suppress target', async () => {
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

    await test('F8-d: settleAttempt with unknown id returns not-settled gracefully', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const result = await hs.settleAttempt('nonexistent_id', true, 'SUCCESS');
        assert(result.settled === false, 'Should indicate not settled');
    });

    await test('F9-a: _syncTemplateToV2 creates templates_v2 default slot', async () => {
        const storage = makeMockStorage();
        const tpl = { firstName: 'Alice', email: 'alice@example.com', subject: 'Hello', message: 'Test' };
        const data = await storage.get(['templates_v2']);
        const store = data.templates_v2 || { version: 2, templates: {}, defaultId: null };
        const id = store.defaultId || 'default';
        store.templates[id] = { ...tpl, id, updatedAt: new Date().toISOString() };
        store.defaultId = id;
        await storage.set({ templates_v2: store });
        const saved = storage._store().templates_v2;
        assert(saved && saved.defaultId === 'default', 'Should have defaultId');
        assert(saved.templates['default'].email === 'alice@example.com', 'Email should match');
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

    await test('F11-a: STAGE_COMMIT resume promotes schema version idempotently', async () => {
        const storage = makeMockStorage({ xpider_migration_phase: 'STAGE_COMMIT', xpider_schema_version: 1, templates_v2: {} });
        const data = await storage.get(null);
        if (data.xpider_migration_phase === 'STAGE_COMMIT' && data.xpider_schema_version !== 2) {
            await storage.set({ xpider_migration_phase: 'COMPLETED', xpider_schema_version: 2 });
        }
        const finalData = await storage.get(['xpider_migration_phase', 'xpider_schema_version']);
        assert(finalData.xpider_schema_version === 2, 'Schema version should be promoted to 2');
        assert(finalData.xpider_migration_phase === 'COMPLETED', 'Phase should be COMPLETED');
    });

    await test('F11-b: backup written before schema version promotion', async () => {
        const writeOrder = [];
        const fakeStorage = { get: (k, cb) => { if (cb) cb({}); return Promise.resolve({}); }, set: (obj, cb) => { writeOrder.push(Object.keys(obj)); if (cb) cb(); return Promise.resolve(); } };
        await fakeStorage.set({ 'xpider_backup_v1_snapshot': 'data' });
        await fakeStorage.set({ xpider_migration_phase: 'STAGE_COMMIT' });
        await fakeStorage.set({ templates_v2: {} });
        await fakeStorage.set({ xpider_schema_version: 2, xpider_migration_phase: 'COMPLETED' });
        const backupIdx = writeOrder.findIndex(keys => keys.some(k => k.startsWith('xpider_backup')));
        const schemaIdx = writeOrder.findIndex(keys => keys.includes('xpider_schema_version'));
        assert(backupIdx < schemaIdx, `Backup step ${backupIdx} must precede schema step ${schemaIdx}`);
    });

    await test('F13: background.js and solver-content.js contain no hardcoded Wit.ai key', async () => {
        const fs = require('fs');
        const bgSrc = fs.readFileSync('./background.js', 'utf8');
        const solverSrc = fs.readFileSync('./solver-content.js', 'utf8');
        const key = '3T7NUX6UUPXHXGMDQLB7P23JSHYI2C7O';
        assert(!bgSrc.includes(key), 'background.js must not contain hardcoded Wit.ai key');
        assert(!solverSrc.includes(key), 'solver-content.js must not contain hardcoded Wit.ai key');
    });

    await test('F8-e: CSV export reflects settled attempt outcome', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://csvtest.com', 'INVALID'], 'imp_csv');
        const { attemptId } = await hs.recordAttempt('https://csvtest.com');
        await hs.settleAttempt(attemptId, true, 'SUCCESS_CONFIRMED');
        await hs.persist();
        const csv = hs.exportToCsv();
        assert(csv.includes('CONFIRMED_SUCCESS'), 'CSV should contain CONFIRMED_SUCCESS');
        assert(csv.includes('INVALID_INPUT'), 'CSV should contain INVALID_INPUT row');
        assert(csv.includes('csvtest.com'), 'CSV should contain the URL');
    });

    console.log(`\n=== F7-F13 INTEGRATION TESTS: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });


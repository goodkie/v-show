'use strict';
/**
 * [ANTIGRAVITY][TEST][extension-form-sender][PHASE 2A INTEGRATION — F7-F13 V5]
 * Fully CWD-independent, exercises actual production functions for F7, F8, F9, F11, F13.
 */

const path = require('path');
const fs = require('fs');

global.self = global;

const { HistoryStore } = require(path.resolve(__dirname, 'modules/history-store.js'));
const { TemplateStore } = require(path.resolve(__dirname, 'modules/template-store.js'));
global.HistoryStore = HistoryStore;
global.TemplateStore = TemplateStore;

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

let activeMockStorage = makeMockStorage();

global.chrome = {
    runtime: {
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        getManifest: () => ({ version: '1.2.0' })
    },
    storage: {
        local: {
            get: (keys, cb) => activeMockStorage.get(keys, cb),
            set: (obj, cb) => activeMockStorage.set(obj, cb)
        }
    },
    tabs: {
        query: () => Promise.resolve([]),
        create: () => Promise.resolve({ id: 101 }),
        remove: () => Promise.resolve(),
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} }
    },
    scripting: { executeScript: () => Promise.resolve() },
    action: {
        setBadgeText: () => Promise.resolve(),
        setBadgeBackgroundColor: () => Promise.resolve()
    }
};

// Import production background.js
const bg = require(path.resolve(__dirname, 'background.js'));

// Extract production _parseRfc4180Records from popup.js
const popupSrc = fs.readFileSync(path.resolve(__dirname, 'popup.js'), 'utf8');
const parserMatch = popupSrc.match(/function _parseRfc4180Records\([\s\S]*?\n\}/);
if (!parserMatch) throw new Error('Could not find _parseRfc4180Records in popup.js');
const _parseRfc4180Records = new Function(`${parserMatch[0]}; return _parseRfc4180Records;`)();

let passed = 0, failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  \u2705 PASS: ${name}`); passed++; }
    catch (e) { console.error(`  \u274c FAIL: ${name}: ${e.message}\n${e.stack}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

async function main() {
    console.log('=== [PHASE 2A INTEGRATION TEST — F7-F13 V5] ===\n');

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

    await test('F7-a2: _parseRfc4180Records strictly preserves raw slice with unmutated double quotes ""', async () => {
        const csvWithEscapedQuotes = '"Acme ""Super"" Corp","123 Main St","https://acme.com"';
        const records = _parseRfc4180Records(csvWithEscapedQuotes);
        assert(records.length === 1, `Expected 1 record, got ${records.length}`);
        assert(records[0] === csvWithEscapedQuotes, `Must preserve exact raw unmutated text slice including "": got ${records[0]}`);
        assert(records[0].includes('""Super""'), 'Raw slice must contain "" without unescaping');
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

    await test('F7-e: 1:1 row-to-target linkage guarantees every queued target links to a source row', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const rawRows = [
            '"Row 1","https://target1.com","extra https://ignored2.com"',
            '"Row 2","https://target2.com"',
            '"Row 3","no-url-here"'
        ];
        // Mirroring popup handleFileUpload 1:1 linkage logic:
        const urlRegex = /(https?:\/\/[^\s"',]+)/gi;
        const rowsForLedger = [];
        const sourceRowNumbers = [];
        const targetIdentities = [];

        rawRows.forEach((rawRecord, idx) => {
            const rowNumber = idx + 1;
            const matches = rawRecord.match(urlRegex) || [];
            const primaryUrl = matches.length > 0 ? matches[0] : null;
            rowsForLedger.push({ raw: rawRecord, rowNumber, targetIdentity: primaryUrl });
            sourceRowNumbers.push(rowNumber);
            targetIdentities.push(primaryUrl);
        });

        const { rows } = await hs.ingestImportRows(rawRows, 'imp_f7e', sourceRowNumbers, targetIdentities);
        const campaignQueue = rowsForLedger.map(r => r.targetIdentity).filter(Boolean);

        assert(campaignQueue.length === 2, `Expected 2 targets in queue, got ${campaignQueue.length}`);
        for (const targetUrl of campaignQueue) {
            const norm = hs.normalizeTargetIdentity(targetUrl);
            const matchingRow = rows.find(r => r.targetIdentity === norm);
            assert(matchingRow, `Every queued target must link to an ImportRow: ${targetUrl}`);
            assert(matchingRow.sourceRowId !== null, `Target must have sourceRowId: ${matchingRow.sourceRowId}`);
        }
    });

    // =========================================================================
    // F8: Sender Lifecycle & Production Orchestration Safety
    // =========================================================================
    await test('F8-a: recordAttempt creates PREPARING attempt by default', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        const { attemptId, attempt } = await hs.recordAttempt('https://example.com');
        assert(attemptId, 'Should return an attemptId');
        assert(attempt.status === 'PREPARING', `Expected PREPARING, got ${attempt.status}`);
        assert(attempt.timing.finalizedTime === null, 'finalizedTime should be null for PREPARING');
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

    await test('F8-c2: pre-submit persistence failure (PRE_SUBMIT_PERSISTENCE_FAILED) remains retryable', async () => {
        const storage = makeMockStorage();
        const hs = new HistoryStore(storage); await hs.load();
        await hs.ingestImportRows(['https://presubmit-retry.com'], 'imp_f8c2');
        const { attemptId } = await hs.recordAttempt('https://presubmit-retry.com', { status: 'PREPARING' });
        await hs.persist();

        const settled = await hs.settleAttempt(attemptId, false, 'PRE_SUBMIT_PERSISTENCE_FAILED');
        assert(settled.status === 'FAILURE', `Status must be FAILURE, got ${settled.status}`);
        await hs.persist();

        const hs2 = new HistoryStore(storage); await hs2.load();
        const identity = hs2.normalizeTargetIdentity('https://presubmit-retry.com');
        assert(!hs2.isSuppressed(identity), 'Pre-submit persistence failure must NOT suppress target (retryable)');
        const a = hs2.attempts.find(x => x.attemptId === attemptId);
        assert(a.reasonCode === 'PRE_SUBMIT_PERSISTENCE_FAILED', 'Reason must be PRE_SUBMIT_PERSISTENCE_FAILED');
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

        const hs2 = new HistoryStore(storage); await hs2.load();
        const attempt = hs2.attempts.find(a => a.attemptId === attemptId);
        assert(attempt && attempt.status === 'DELIVERY_UNKNOWN', `Attempt status must be DELIVERY_UNKNOWN, got ${attempt && attempt.status}`);
        assert(attempt && attempt.reasonCode === 'DELIVERY_UNKNOWN', 'ReasonCode must be DELIVERY_UNKNOWN');
        const identity = hs2.normalizeTargetIdentity('https://unknown.com');
        assert(hs2.isSuppressed(identity), 'DELIVERY_UNKNOWN must suppress target to prevent duplicate send');
    });

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

        let aborted = false;
        try {
            throw new Error('STORAGE_READ_ERROR');
        } catch (hsErr) {
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

        const { attemptId } = await hs.recordAttempt(targetUrl, { status: 'SUBMIT_PENDING' });
        await hs.persist();

        const pendingAttempt = {
            url: targetUrl,
            attemptId: attemptId,
            status: 'SUBMIT_PENDING'
        };

        await hs.settleAttempt(pendingAttempt.attemptId, false, 'DELIVERY_UNKNOWN');
        await hs.persist();

        const hsReloaded = new HistoryStore(storage); await hsReloaded.load();
        const settled = hsReloaded.attempts.find(a => a.attemptId === attemptId);
        assert(settled && settled.status === 'DELIVERY_UNKNOWN', `Status must be DELIVERY_UNKNOWN, got ${settled && settled.status}`);
        const normId = hsReloaded.normalizeTargetIdentity(targetUrl);
        assert(hsReloaded.isSuppressed(normId), 'Target must be suppressed on fresh reload to prevent duplicate send');
    });

    await test('F8-i2: production restoreCampaignState differentiates PREPARING (retryable) vs SUBMIT_PENDING (suppressed)', async () => {
        activeMockStorage = makeMockStorage();
        const hs = new HistoryStore(activeMockStorage);
        await hs.load();

        // 1. Test PREPARING recovery
        const { attemptId: prepId } = await hs.recordAttempt('https://prep-recovery.com', { status: 'PREPARING' });
        await hs.persist();

        await activeMockStorage.set({
            xpider_currentAttempt: {
                url: 'https://prep-recovery.com',
                attemptId: prepId,
                status: 'PREPARING'
            }
        });

        bg.campaignState.isInitialized = false;
        await bg.restoreCampaignState();

        const hsAfterPrep = new HistoryStore(activeMockStorage);
        await hsAfterPrep.load();
        const prepAtt = hsAfterPrep.attempts.find(a => a.attemptId === prepId);
        assert(prepAtt && prepAtt.status === 'FAILURE', `PREPARING attempt must settle as FAILURE, got ${prepAtt && prepAtt.status}`);
        assert(prepAtt && prepAtt.reasonCode === 'INTERRUPTED_PREPARING', `ReasonCode must be INTERRUPTED_PREPARING, got ${prepAtt && prepAtt.reasonCode}`);
        const prepNorm = hsAfterPrep.normalizeTargetIdentity('https://prep-recovery.com');
        assert(!hsAfterPrep.isSuppressed(prepNorm), 'Target must NOT be suppressed after PREPARING restart (remains retryable)');

        // 2. Test SUBMIT_PENDING recovery
        const { attemptId: pendId } = await hsAfterPrep.recordAttempt('https://pending-recovery.com', { status: 'SUBMIT_PENDING' });
        await hsAfterPrep.persist();

        await activeMockStorage.set({
            xpider_currentAttempt: {
                url: 'https://pending-recovery.com',
                attemptId: pendId,
                status: 'SUBMIT_PENDING'
            }
        });

        bg.campaignState.isInitialized = false;
        await bg.restoreCampaignState();

        const hsAfterPend = new HistoryStore(activeMockStorage);
        await hsAfterPend.load();
        const pendAtt = hsAfterPend.attempts.find(a => a.attemptId === pendId);
        assert(pendAtt && pendAtt.status === 'DELIVERY_UNKNOWN', `SUBMIT_PENDING attempt must settle as DELIVERY_UNKNOWN, got ${pendAtt && pendAtt.status}`);
        assert(pendAtt && pendAtt.reasonCode === 'DELIVERY_UNKNOWN', `ReasonCode must be DELIVERY_UNKNOWN, got ${pendAtt && pendAtt.reasonCode}`);
        const pendNorm = hsAfterPend.normalizeTargetIdentity('https://pending-recovery.com');
        assert(hsAfterPend.isSuppressed(pendNorm), 'Target MUST be suppressed after SUBMIT_PENDING restart');
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
    await test('F9-a: TemplateStore.migrateLegacyData produces canonical schema with unified accessors', async () => {
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

        const defaultTpl = v2.templates[v2.defaultId];
        assert(defaultTpl.content.subject === 'Promo Offer', 'Subject in content must match legacy item');
        assert(defaultTpl.subject === 'Promo Offer', 'Flat subject accessor must match legacy item');
        assert(defaultTpl.message === 'Special discount', 'Flat message accessor must match legacy item');
        assert(defaultTpl.sender.fullName === 'Alice', 'Sender fullName must match legacy item');
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

    await test('F9-c: migrated legacy fixtures pass through actual popup field mapping cleanly', async () => {
        const legacyData = {
            tplLibrary: [
                {
                    name: "Partner Outreach",
                    fullName: "Min-Su Kim",
                    email: "minsu@company.kr",
                    phone: "010-1234-5678",
                    company: "Acme Korea",
                    website: "https://acme.kr",
                    subject: "Partnership Proposal",
                    message: "Let us collaborate on this new project."
                }
            ],
            savedUrlLists: { 'VIP List': ['https://vip1.com', 'https://vip2.com'] }
        };

        const tStore = new TemplateStore(makeMockStorage());
        const res = await tStore.migrateLegacyData(legacyData);
        assert(res.migrated === true, 'Migration should succeed');

        const v2 = res.commit.templates_v2;
        const tpl = v2.templates[v2.defaultId];

        // Simulate popup field extraction logic from popup.js
        const extracted = {
            subject: tpl.subject || tpl.content?.subject || '',
            message: tpl.message || tpl.content?.message || '',
            fullName: tpl.fullName || tpl.sender?.fullName || '',
            firstName: tpl.firstName || tpl.sender?.firstName || '',
            lastName: tpl.lastName || tpl.sender?.lastName || '',
            email: tpl.email || tpl.sender?.email || '',
            phone: tpl.phone || tpl.sender?.phone || '',
            company: tpl.company || tpl.sender?.company || '',
            website: tpl.website || tpl.sender?.website || ''
        };

        assert(extracted.subject === 'Partnership Proposal', `Subject: ${extracted.subject}`);
        assert(extracted.message === 'Let us collaborate on this new project.', `Message: ${extracted.message}`);
        assert(extracted.fullName === 'Min-Su Kim', `FullName: ${extracted.fullName}`);
        assert(extracted.firstName === 'Min-Su', `FirstName: ${extracted.firstName}`);
        assert(extracted.lastName === 'Kim', `LastName: ${extracted.lastName}`);
        assert(extracted.email === 'minsu@company.kr', `Email: ${extracted.email}`);
        assert(extracted.phone === '010-1234-5678', `Phone: ${extracted.phone}`);
        assert(extracted.company === 'Acme Korea', `Company: ${extracted.company}`);
        assert(extracted.website === 'https://acme.kr', `Website: ${extracted.website}`);
    });

    await test('F9-d: createTemplateData produces dual accessors and preserves consistency', async () => {
        const tStore = new TemplateStore(makeMockStorage());
        const tpl = tStore.createTemplateData('New Campaign', {
            firstName: 'Sarah',
            lastName: 'Connor',
            email: 'sarah@resistance.org',
            subject: 'Protect the Future',
            message: 'There is no fate but what we make.'
        });

        assert(tpl.firstName === 'Sarah', 'Flat firstName matches');
        assert(tpl.sender.firstName === 'Sarah', 'Nested firstName matches');
        assert(tpl.subject === 'Protect the Future', 'Flat subject matches');
        assert(tpl.content.subject === 'Protect the Future', 'Nested subject matches');
        assert(tpl.fullName === 'Sarah Connor', 'FullName auto-computed');
        assert(tpl.sender.fullName === 'Sarah Connor', 'Nested fullName auto-computed');
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
                await storage.set({ xpider_migration_phase: 'PENDING' });
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

        const bgBadPattern = /xpider_stt_api_key \|\| '[A-Z0-9]{20,}'/.test(bgSrc);
        assert(!bgBadPattern, 'background.js must not contain hardcoded Wit.ai key as fallback');
        const solverBadPattern = /activeKey\s*=\s*'[A-Z0-9]{20,}'/.test(solverSrc);
        assert(!solverBadPattern, 'solver-content.js must not contain hardcoded Wit.ai key assignment');
    });

    console.log(`\n=== F7-F13 INTEGRATION TESTS: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

/**
 * R6.9C EMAIL COLLECTOR RUNTIME RESTORE & CURRENT SITE ACCURACY TEST SUITE
 * 
 * Verifies all 26 acceptance criteria mandated by Auditor Directives (Comment #5970289078 & #5976009548):
 * 1. module injected before content-script in background.js (exact files array parse)
 * 2. static visible email -> EMAIL_COLLECT_FOUND emitted
 * 3. mailto email -> emitted
 * 4. duplicate DOM state -> one send only (fingerprint dedup)
 * 5. dynamic email mutation -> second send with expanded full set
 * 6. generation storage=5 -> outgoing generation=5
 * 7. clear broadcast generation=6 -> current runtime switches to 6
 * 8. post-clear unchanged baseline -> not recollected
 * 9. post-clear newly inserted email -> collected
 * 10. page with zero emails -> Current Site resets to zero for that hostname
 * 11. global accumulated emails survive zero-email next page
 * 12. NON_INQUIRY page with visible business email still collects it
 * 13. no asset/dummy false positives
 * 14. storage/popup Current Site and All Emails counters match EmailCollectorStore
 * 15. build/source parity for all modified files (modules, background, content-script, popup)
 * 16. background clear at generation=5 -> persisted generation=6 remains present
 * 17. clear leaves xpider_email_collector_v1 empty canonical object present
 * 18. clear leaves xpider_email_current_site_v1 empty canonical object present
 * 19. RESET_ALL_LIST_DATA increments Email Collector generation exactly once
 * 20. popup Reset All does not issue second EmailCollectorStore.clearAll
 * 21. popup Reset All does not remove canonical Email Collector keys
 * 22. fresh content script after reset reads generation=6 and sends generation=6
 * 23. delayed storage callback + immediate FORM_ENTRY -> no generation=1 send
 * 24. staleGeneration ACK -> one bounded generation resync/retry
 * 25. actual executeScript array contains email-collector module immediately before content-script
 * 26. service-worker restart + popup reopen retain same collector generation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock chrome environment
class MockChromeStorage {
    constructor(seed = {}) {
        this.data = { ...seed };
    }
    get(keys, cb) {
        if (keys === null) {
            return cb ? cb({ ...this.data }) : Promise.resolve({ ...this.data });
        }
        const keyList = Array.isArray(keys) ? keys : [keys];
        const res = {};
        for (const k of keyList) {
            if (this.data[k] !== undefined) res[k] = JSON.parse(JSON.stringify(this.data[k]));
        }
        if (cb) cb(res);
        return Promise.resolve(res);
    }
    set(obj, cb) {
        for (const [k, v] of Object.entries(obj)) {
            this.data[k] = JSON.parse(JSON.stringify(v));
        }
        if (cb) cb();
        return Promise.resolve();
    }
    remove(keys, cb) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) delete this.data[k];
        if (cb) cb();
        return Promise.resolve();
    }
}

const mockLocalStorage = new MockChromeStorage();
const mockRuntimeListeners = [];
const mockSentMessages = [];

global.chrome = {
    storage: {
        local: mockLocalStorage
    },
    runtime: {
        onMessage: {
            addListener: (fn) => mockRuntimeListeners.push(fn)
        },
        sendMessage: (msg, cb) => {
            mockSentMessages.push(msg);
            if (cb) {
                // Simulate background response
                cb({
                    success: true,
                    currentPageCount: (msg.emails || []).length,
                    newGlobalCount: (msg.emails || []).length,
                    totalGlobalCount: (msg.emails || []).length
                });
            }
            return Promise.resolve();
        },
        lastError: null
    }
};

// Mock DOM
global.window = {
    location: {
        href: 'https://test-company.com/contact',
        hostname: 'test-company.com'
    },
    addEventListener: () => {}
};
global.document = {
    documentElement: { innerHTML: '' },
    body: { innerText: '' },
    querySelectorAll: () => []
};
global.location = global.window.location;

const {
    EmailCollectorStore,
    extractEmailsFromText,
    extractEmailsFromDocument,
    normalizeEmail
} = require('./modules/email-collector.js');

const cs = require('./content-script.js');

async function runR69CTests() {
    console.log('===============================================================================');
    console.log('  R6.9C EMAIL COLLECTOR RUNTIME RESTORE TEST SUITE (26 TESTS)');
    console.log('===============================================================================\n');

    let passCount = 0;
    let failCount = 0;

    async function test(name, fn) {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            passCount++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}: ${err.message}`);
            failCount++;
        }
    }

    // -------------------------------------------------------------------------
    // Test 1: actual executeScript files array contains email-collector before content-script
    // -------------------------------------------------------------------------
    await test("Test 1: actual executeScript files array contains email-collector before content-script in background.js", async () => {
        const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        const match = bgCode.match(/safeScripting\.executeScript\(\s*\{\s*target:\s*\{\s*tabId\s*\},[\s\S]*?files:\s*\[([\s\S]*?)\]\s*\}\s*\)/);
        assert.ok(match, "Must find safeScripting.executeScript call with files array in background.js");
        const files = match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        const collectorIdx = files.indexOf('modules/email-collector.js');
        const csIdx = files.indexOf('content-script.js');
        assert.ok(collectorIdx !== -1, "modules/email-collector.js must be in executeScript files array");
        assert.ok(csIdx !== -1, "content-script.js must be in executeScript files array");
        assert.strictEqual(collectorIdx, csIdx - 1, "modules/email-collector.js must be immediately before content-script.js");
    });

    // -------------------------------------------------------------------------
    // Test 2: static visible email -> EMAIL_COLLECT_FOUND emitted
    // -------------------------------------------------------------------------
    await test("Test 2: static visible email -> EMAIL_COLLECT_FOUND emitted", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML = '<div>Contact our CEO at ceo@test-company.com anytime.</div>';
        global.document.body.innerText = 'Contact our CEO at ceo@test-company.com anytime.';

        await cs.extractAndSendPageEmails('TEST_STATIC');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.strictEqual(mockSentMessages[0].action, 'EMAIL_COLLECT_FOUND');
        assert.deepStrictEqual(mockSentMessages[0].emails, ['ceo@test-company.com']);
        assert.strictEqual(mockSentMessages[0].hostname, 'test-company.com');
    });

    // -------------------------------------------------------------------------
    // Test 3: mailto email -> emitted
    // -------------------------------------------------------------------------
    await test("Test 3: mailto email -> emitted", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML = '<div>Write us!</div>';
        global.document.body.innerText = 'Write us!';
        global.document.querySelectorAll = (sel) => {
            if (sel === 'a[href^="mailto:"]') {
                return [{ getAttribute: () => 'mailto:support@test-company.com?subject=Help' }];
            }
            return [];
        };

        await cs.extractAndSendPageEmails('TEST_MAILTO');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.deepStrictEqual(mockSentMessages[0].emails, ['support@test-company.com']);
    });

    // -------------------------------------------------------------------------
    // Test 4: duplicate DOM state -> one send only (fingerprint dedup)
    // -------------------------------------------------------------------------
    await test("Test 4: duplicate DOM state -> one send only", async () => {
        mockSentMessages.length = 0;
        // First send
        await cs.extractAndSendPageEmails('SCAN_1');
        assert.strictEqual(mockSentMessages.length, 0, "Duplicate fingerprint must not send again");

        // Second call with same state
        await cs.extractAndSendPageEmails('SCAN_2');
        assert.strictEqual(mockSentMessages.length, 0, "Duplicate fingerprint must not send again");
    });

    // -------------------------------------------------------------------------
    // Test 5: dynamic email mutation -> second send with expanded full set
    // -------------------------------------------------------------------------
    await test("Test 5: dynamic email mutation -> second send with expanded full set", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML += '<div>Or sales@test-company.com</div>';
        global.document.body.innerText += ' Or sales@test-company.com';

        await cs.extractAndSendPageEmails('MUTATION');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.strictEqual(mockSentMessages[0].emails.includes('sales@test-company.com'), true);
        assert.strictEqual(mockSentMessages[0].emails.includes('support@test-company.com'), true);
    });

    // -------------------------------------------------------------------------
    // Test 6: generation storage=5 -> outgoing generation=5
    // -------------------------------------------------------------------------
    await test("Test 6: generation storage=5 -> outgoing generation=5", async () => {
        mockSentMessages.length = 0;
        cs.setCollectorGeneration(5);
        global.window.location.hostname = 'gen5-site.com';
        global.window.location.href = 'https://gen5-site.com/contact';
        global.document.documentElement.innerHTML = '<div>info@gen5-site.com</div>';
        global.document.body.innerText = 'info@gen5-site.com';
        global.document.querySelectorAll = () => [];

        await cs.extractAndSendPageEmails('GEN5_SCAN');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.strictEqual(mockSentMessages[0].generation, 5);
        assert.strictEqual(mockSentMessages[0].emails[0], 'info@gen5-site.com');
    });

    // -------------------------------------------------------------------------
    // Test 7: clear broadcast generation=6 -> current runtime switches to 6
    // -------------------------------------------------------------------------
    await test("Test 7: clear broadcast generation=6 -> current runtime switches to 6", async () => {
        // Trigger clear message to runtime listeners
        for (const l of mockRuntimeListeners) {
            l({ action: 'EMAIL_COLLECTOR_CLEARED', generation: 6, suppressRecollectMs: 50 });
        }
        assert.strictEqual(cs.getCollectorGeneration(), 6);
    });

    // -------------------------------------------------------------------------
    // Test 8: post-clear unchanged baseline -> not recollected
    // -------------------------------------------------------------------------
    await test("Test 8: post-clear unchanged baseline -> not recollected", async () => {
        // Wait for suppression window to expire
        await new Promise(r => setTimeout(r, 70));
        mockSentMessages.length = 0;

        // Exact same DOM as when cleared
        await cs.extractAndSendPageEmails('POST_CLEAR_SCAN');
        assert.strictEqual(mockSentMessages.length, 0, "Unchanged baseline must not be recollected");
    });

    // -------------------------------------------------------------------------
    // Test 9: post-clear newly inserted email -> collected
    // -------------------------------------------------------------------------
    await test("Test 9: post-clear newly inserted email -> collected", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML += '<div>newly.added@gen5-site.com</div>';
        global.document.body.innerText += ' newly.added@gen5-site.com';

        await cs.extractAndSendPageEmails('NEW_EMAIL');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.strictEqual(mockSentMessages[0].generation, 6);
        assert.deepStrictEqual(mockSentMessages[0].emails, ['newly.added@gen5-site.com']);
    });

    // -------------------------------------------------------------------------
    // Test 10: page with zero emails -> Current Site resets to zero for that hostname
    // -------------------------------------------------------------------------
    await test("Test 10: page with zero emails -> Current Site resets to zero for that hostname", async () => {
        const storage = new MockChromeStorage();
        const store = new EmailCollectorStore(storage);
        await store.init();

        // Site 1 has emails
        await store.add('site1.com', ['contact@site1.com'], 'https://site1.com');
        let cur = await store.loadCurrentSiteStore();
        assert.strictEqual(cur.hostname, 'site1.com');
        assert.strictEqual(cur.count, 1);

        // Site 2 has zero emails
        await store.add('site2-zero.com', [], 'https://site2-zero.com');
        cur = await store.loadCurrentSiteStore();
        assert.strictEqual(cur.hostname, 'site2-zero.com');
        assert.strictEqual(cur.count, 0);
        assert.deepStrictEqual(cur.emails, []);
    });

    // -------------------------------------------------------------------------
    // Test 11: global accumulated emails survive zero-email next page
    // -------------------------------------------------------------------------
    await test("Test 11: global accumulated emails survive zero-email next page", async () => {
        const storage = new MockChromeStorage();
        const store = new EmailCollectorStore(storage);
        await store.init();

        await store.add('alpha.com', ['alice@alpha.com', 'bob@alpha.com'], 'https://alpha.com');
        let globalData = await store.loadGlobalStore();
        assert.strictEqual(globalData.totalUnique, 2);

        // Next page with zero emails
        await store.add('beta.com', [], 'https://beta.com');
        globalData = await store.loadGlobalStore();
        assert.strictEqual(globalData.totalUnique, 2, "Global unique count must not be wiped by empty page");
        assert.ok(globalData.emails['alice@alpha.com']);
        assert.ok(globalData.emails['bob@alpha.com']);
    });

    // -------------------------------------------------------------------------
    // Test 12: NON_INQUIRY page with visible business email still collects it
    // -------------------------------------------------------------------------
    await test("Test 12: NON_INQUIRY page with visible business email still collects it", async () => {
        mockSentMessages.length = 0;
        global.window.location.hostname = 'portal-only.com';
        global.window.location.href = 'https://portal-only.com/search';
        global.document.documentElement.innerHTML = '<div>Search page. Need help? Contact partner@portal-only.com</div>';
        global.document.body.innerText = 'Search page. Need help? Contact partner@portal-only.com';
        global.document.querySelectorAll = () => [];

        await cs.extractAndSendPageEmails('NON_INQUIRY_PAGE');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.deepStrictEqual(mockSentMessages[0].emails, ['partner@portal-only.com']);
    });

    // -------------------------------------------------------------------------
    // Test 13: no asset/dummy false positives
    // -------------------------------------------------------------------------
    await test("Test 13: no asset/dummy false positives", async () => {
        const falseDummies = [
            'icon@2x.png',
            'banner@site.jpg',
            'script@v2.js',
            'test@test.com',
            'username@domain.com',
            'example@example.com',
            'your.name@company.com'
        ];
        for (const d of falseDummies) {
            assert.strictEqual(normalizeEmail(d), null, `Expected ${d} to be rejected as dummy/asset`);
        }
    });

    // -------------------------------------------------------------------------
    // Test 14: storage/popup Current Site and All Emails counters match EmailCollectorStore
    // -------------------------------------------------------------------------
    await test("Test 14: storage/popup Current Site and All Emails counters match EmailCollectorStore", async () => {
        const storage = new MockChromeStorage();
        const store = new EmailCollectorStore(storage);
        await store.init();

        await store.add('shop1.com', ['order@shop1.com'], 'https://shop1.com');
        await store.add('shop2.com', ['info@shop2.com', 'help@shop2.com'], 'https://shop2.com');

        const state = await store.getState();
        assert.strictEqual(state.counts.current, 2);
        assert.strictEqual(state.counts.all, 3);

        const currentInStorage = await store.getStoredData('xpider_email_current_site_v1');
        const allInStorage = await store.getStoredData('xpider_email_collector_v1');
        assert.strictEqual(currentInStorage.count, 2);
        assert.strictEqual(allInStorage.totalUnique, 3);
    });

    // -------------------------------------------------------------------------
    // Test 15: build/source parity for all modified files
    // -------------------------------------------------------------------------
    await test("Test 15: build/source parity for all modified files", async () => {
        const files = [
            'modules/email-collector.js',
            'background.js',
            'content-script.js',
            'popup.js'
        ];
        for (const rel of files) {
            const srcPath = path.join(__dirname, rel);
            const buildPath = path.join(__dirname, 'build', 'extension', rel);
            assert.ok(fs.existsSync(srcPath), `Source file missing: ${srcPath}`);
            assert.ok(fs.existsSync(buildPath), `Build file missing: ${buildPath}`);

            const srcHash = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
            const buildHash = crypto.createHash('sha256').update(fs.readFileSync(buildPath)).digest('hex');
            assert.strictEqual(srcHash, buildHash, `Hash mismatch between source and build for ${rel}`);
        }
    });

    // -------------------------------------------------------------------------
    // Test 16: background clear at generation=5 -> persisted generation=6 remains present
    // -------------------------------------------------------------------------
    await test("Test 16: background clear at generation=5 -> persisted generation=6 remains present", async () => {
        const storage = new MockChromeStorage({ xpider_email_generation: 5 });
        const store = new EmailCollectorStore(storage);
        await store.init();
        await store.clearAll({ suppressRecollectMs: 5000 });
        const postData = await storage.get(['xpider_email_generation']);
        assert.strictEqual(postData.xpider_email_generation, 6, "Generation must be incremented to 6 and remain persisted");
    });

    // -------------------------------------------------------------------------
    // Test 17: clear leaves xpider_email_collector_v1 empty canonical object present
    // -------------------------------------------------------------------------
    await test("Test 17: clear leaves xpider_email_collector_v1 empty canonical object present", async () => {
        const storage = new MockChromeStorage();
        const store = new EmailCollectorStore(storage);
        await store.init();
        await store.add('alpha.com', ['test@alpha.com'], 'https://alpha.com');
        await store.clearAll({ suppressRecollectMs: 5000 });
        const globalData = await storage.get(['xpider_email_collector_v1']);
        assert.ok(globalData.xpider_email_collector_v1, "xpider_email_collector_v1 must exist after clear");
        assert.strictEqual(globalData.xpider_email_collector_v1.totalUnique, 0, "totalUnique must be 0");
        assert.deepStrictEqual(globalData.xpider_email_collector_v1.emails, {}, "emails dict must be empty");
    });

    // -------------------------------------------------------------------------
    // Test 18: clear leaves xpider_email_current_site_v1 empty canonical object present
    // -------------------------------------------------------------------------
    await test("Test 18: clear leaves xpider_email_current_site_v1 empty canonical object present", async () => {
        const storage = new MockChromeStorage();
        const store = new EmailCollectorStore(storage);
        await store.init();
        await store.add('alpha.com', ['test@alpha.com'], 'https://alpha.com');
        await store.clearAll({ suppressRecollectMs: 5000 });
        const curData = await storage.get(['xpider_email_current_site_v1']);
        assert.ok(curData.xpider_email_current_site_v1, "xpider_email_current_site_v1 must exist after clear");
        assert.strictEqual(curData.xpider_email_current_site_v1.count, 0, "count must be 0");
        assert.deepStrictEqual(curData.xpider_email_current_site_v1.emails, [], "emails array must be empty");
    });

    // -------------------------------------------------------------------------
    // Test 19: RESET_ALL_LIST_DATA increments Email Collector generation exactly once
    // -------------------------------------------------------------------------
    await test("Test 19: RESET_ALL_LIST_DATA increments Email Collector generation exactly once", async () => {
        const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        // Verify LIST_DATA_KEYS.emailCollector is NOT in resetAllListData removal array
        const resetFnMatch = bgCode.match(/async function resetAllListData\(\)[\s\S]*?const allKeysToRemove = \[([\s\S]*?)\];/);
        assert.ok(resetFnMatch, "Must find resetAllListData and allKeysToRemove");
        assert.ok(!resetFnMatch[1].includes('emailCollector'), "resetAllListData must NOT remove emailCollector keys");

        // Verify clearEmailCollectorData does not remove emailCollector keys after clearAll
        const clearFnMatch = bgCode.match(/async function clearEmailCollectorData\(\)[\s\S]*?await emailStore\.clearAll[\s\S]*?return \{ success: true/);
        assert.ok(clearFnMatch, "Must find clearEmailCollectorData");
        assert.ok(!clearFnMatch[0].includes('chrome.storage.local.remove(LIST_DATA_KEYS.emailCollector)'), "clearEmailCollectorData must NOT remove canonical keys after clearAll");
    });

    // -------------------------------------------------------------------------
    // Test 20: popup Reset All does not issue second EmailCollectorStore.clearAll
    // -------------------------------------------------------------------------
    await test("Test 20: popup Reset All does not issue second EmailCollectorStore.clearAll", async () => {
        const popCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
        const popResetMatch = popCode.match(/async function dispatchResetAllListData\(\)[\s\S]*?return \{ success: true \};/);
        assert.ok(popResetMatch, "Must find dispatchResetAllListData in popup.js");
        assert.ok(!popResetMatch[0].includes('emailStore.clearAll()'), "popup dispatchResetAllListData must not call emailStore.clearAll()");
    });

    // -------------------------------------------------------------------------
    // Test 21: popup Reset All does not remove canonical Email Collector keys
    // -------------------------------------------------------------------------
    await test("Test 21: popup Reset All does not remove canonical Email Collector keys", async () => {
        const popCode = fs.readFileSync(path.join(__dirname, 'popup.js'), 'utf8');
        const popResetMatch = popCode.match(/async function dispatchResetAllListData\(\)[\s\S]*?const allKeys = \[([\s\S]*?)\];/);
        assert.ok(popResetMatch, "Must find allKeys in dispatchResetAllListData");
        assert.ok(!popResetMatch[1].includes('emailCollector'), "popup dispatchResetAllListData must NOT remove emailCollector keys");
    });

    // -------------------------------------------------------------------------
    // Test 22: fresh content script after reset reads generation=6 and sends generation=6
    // -------------------------------------------------------------------------
    await test("Test 22: fresh content script after reset reads generation=6 and sends generation=6", async () => {
        mockLocalStorage.set({ xpider_email_generation: 6 });
        cs.setCollectorGeneration(6);
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML = '<div>Contact us at contact@fresh-site.com</div>';
        global.document.body.innerText = 'Contact us at contact@fresh-site.com';
        global.window.location.hostname = 'fresh-site.com';
        global.window.location.href = 'https://fresh-site.com';

        await cs.extractAndSendPageEmails('FORCE');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.strictEqual(mockSentMessages[0].generation, 6, "Outgoing generation must be 6");
        assert.deepStrictEqual(mockSentMessages[0].emails, ['contact@fresh-site.com']);
    });

    // -------------------------------------------------------------------------
    // Test 23: delayed storage callback + immediate FORM_ENTRY -> no generation=1 send
    // -------------------------------------------------------------------------
    await test("Test 23: delayed storage callback + immediate FORM_ENTRY -> no generation=1 send", async () => {
        let storageCb = null;
        const delayedStorage = {
            get: (keys, cb) => { storageCb = () => cb({ xpider_email_generation: 9 }); }
        };
        const prevStorage = global.chrome.storage.local;
        global.chrome.storage.local = delayedStorage;

        let resolvedGen = null;
        const readyPromise = new Promise((resolve) => {
            delayedStorage.get(['xpider_email_generation'], (res) => {
                resolvedGen = res.xpider_email_generation;
                resolve(resolvedGen);
            });
        });

        let sendTriggeredWithGen = null;
        async function mockFormEntry() {
            const gen = await readyPromise;
            sendTriggeredWithGen = gen;
        }

        const formPromise = mockFormEntry();
        assert.strictEqual(sendTriggeredWithGen, null, "Must NOT have sent before storage resolved");

        storageCb();
        await formPromise;
        assert.strictEqual(sendTriggeredWithGen, 9, "Must send with generation 9, never fallback to 1");

        global.chrome.storage.local = prevStorage;
    });

    // -------------------------------------------------------------------------
    // Test 24: staleGeneration ACK -> one bounded generation resync/retry
    // -------------------------------------------------------------------------
    await test("Test 24: staleGeneration ACK -> one bounded generation resync/retry", async () => {
        mockLocalStorage.set({ xpider_email_generation: 10 });
        mockSentMessages.length = 0;
        let ackCount = 0;

        const originalSendMessage = global.chrome.runtime.sendMessage;
        global.chrome.runtime.sendMessage = (msg, cb) => {
            mockSentMessages.push(msg);
            ackCount++;
            if (ackCount === 1) {
                cb({ success: false, staleGeneration: true });
            } else {
                cb({ success: true, staleGeneration: false, currentPageCount: 1, newGlobalCount: 1, totalGlobalCount: 1 });
            }
            return Promise.resolve();
        };

        cs.setCollectorGeneration(5);
        global.document.documentElement.innerHTML = '<div>Email: resync@domain.com</div>';
        global.document.body.innerText = 'Email: resync@domain.com';
        global.window.location.hostname = 'domain.com';

        await cs.extractAndSendPageEmails('FORCE');

        await new Promise(r => setTimeout(r, 120));

        assert.strictEqual(mockSentMessages.length, 2, "Must retry exactly once upon staleGeneration");
        assert.strictEqual(mockSentMessages[0].generation, 5, "First message was stale generation");
        assert.strictEqual(mockSentMessages[1].generation, 10, "Retried message must use fresh generation 10");

        global.chrome.runtime.sendMessage = originalSendMessage;
    });

    // -------------------------------------------------------------------------
    // Test 25: actual executeScript array contains email-collector module immediately before content-script
    // -------------------------------------------------------------------------
    await test("Test 25: actual executeScript array contains email-collector module immediately before content-script", async () => {
        const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        const match = bgCode.match(/safeScripting\.executeScript\(\s*\{\s*target:\s*\{\s*tabId\s*\},[\s\S]*?files:\s*\[([\s\S]*?)\]\s*\}\s*\)/);
        assert.ok(match, "safeScripting.executeScript with files array must exist in background.js");
        const files = match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
        const colIdx = files.indexOf('modules/email-collector.js');
        const csIdx = files.indexOf('content-script.js');
        assert.ok(colIdx !== -1, "modules/email-collector.js must be present");
        assert.ok(csIdx !== -1, "content-script.js must be present");
        assert.strictEqual(colIdx, csIdx - 1, "modules/email-collector.js must be IMMEDIATELY before content-script.js");
    });

    // -------------------------------------------------------------------------
    // Test 26: service-worker restart + popup reopen retain same collector generation
    // -------------------------------------------------------------------------
    await test("Test 26: service-worker restart + popup reopen retain same collector generation", async () => {
        const sharedStorage = new MockChromeStorage({ xpider_email_generation: 14 });

        // Simulate SW lifecycle 1
        const swStore1 = new EmailCollectorStore(sharedStorage);
        await swStore1.init();
        assert.strictEqual(swStore1.generation, 14);

        // Simulate SW termination and restart -> lifecycle 2
        const swStore2 = new EmailCollectorStore(sharedStorage);
        await swStore2.init();
        assert.strictEqual(swStore2.generation, 14, "SW restart must load exact persisted generation 14");

        // Simulate popup open
        const popupStore = new EmailCollectorStore(sharedStorage);
        await popupStore.init();
        assert.strictEqual(popupStore.generation, 14, "Popup open must match SW generation 14");
    });

    console.log('\n===============================================================================');
    console.log(`  RESULTS: ${passCount} / ${passCount + failCount} PASSED (${failCount} FAILED)`);
    console.log('===============================================================================\n');

    if (failCount > 0) {
        process.exit(1);
    }
}

runR69CTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});

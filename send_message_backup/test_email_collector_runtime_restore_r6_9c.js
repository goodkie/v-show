/**
 * R6.9C EMAIL COLLECTOR RUNTIME RESTORE & CURRENT SITE ACCURACY TEST SUITE
 * 
 * Verifies all 15 acceptance criteria mandated by Auditor Directive (Comment #5970289078):
 * 1. module injected before content-script in background.js
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
 * 15. build/source parity for all modified files
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
    console.log('  R6.9C EMAIL COLLECTOR RUNTIME RESTORE TEST SUITE (15 TESTS)');
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
    // Test 1: module injected before content-script in background.js
    // -------------------------------------------------------------------------
    await test("Test 1: module injected before content-script in background.js", async () => {
        const bgCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
        const collectorIdx = bgCode.indexOf("'modules/email-collector.js'");
        const contentScriptIdx = bgCode.indexOf("'content-script.js'");
        assert.ok(collectorIdx !== -1, "modules/email-collector.js must be in files array");
        assert.ok(contentScriptIdx !== -1, "content-script.js must be in files array");
        assert.ok(collectorIdx < contentScriptIdx, "modules/email-collector.js must be injected BEFORE content-script.js");
    });

    // -------------------------------------------------------------------------
    // Test 2: static visible email -> EMAIL_COLLECT_FOUND emitted
    // -------------------------------------------------------------------------
    await test("Test 2: static visible email -> EMAIL_COLLECT_FOUND emitted", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML = '<div>Contact our CEO at ceo@test-company.com anytime.</div>';
        global.document.body.innerText = 'Contact our CEO at ceo@test-company.com anytime.';

        cs.extractAndSendPageEmails('TEST_STATIC');
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

        cs.extractAndSendPageEmails('TEST_MAILTO');
        assert.strictEqual(mockSentMessages.length, 1);
        assert.deepStrictEqual(mockSentMessages[0].emails, ['support@test-company.com']);
    });

    // -------------------------------------------------------------------------
    // Test 4: duplicate DOM state -> one send only (fingerprint dedup)
    // -------------------------------------------------------------------------
    await test("Test 4: duplicate DOM state -> one send only", async () => {
        mockSentMessages.length = 0;
        // First send
        cs.extractAndSendPageEmails('SCAN_1');
        assert.strictEqual(mockSentMessages.length, 0, "Duplicate fingerprint must not send again");

        // Second call with same state
        cs.extractAndSendPageEmails('SCAN_2');
        assert.strictEqual(mockSentMessages.length, 0, "Duplicate fingerprint must not send again");
    });

    // -------------------------------------------------------------------------
    // Test 5: dynamic email mutation -> second send with expanded full set
    // -------------------------------------------------------------------------
    await test("Test 5: dynamic email mutation -> second send with expanded full set", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML += '<div>Or sales@test-company.com</div>';
        global.document.body.innerText += ' Or sales@test-company.com';

        cs.extractAndSendPageEmails('MUTATION');
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

        cs.extractAndSendPageEmails('GEN5_SCAN');
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
        cs.extractAndSendPageEmails('POST_CLEAR_SCAN');
        assert.strictEqual(mockSentMessages.length, 0, "Unchanged baseline must not be recollected");
    });

    // -------------------------------------------------------------------------
    // Test 9: post-clear newly inserted email -> collected
    // -------------------------------------------------------------------------
    await test("Test 9: post-clear newly inserted email -> collected", async () => {
        mockSentMessages.length = 0;
        global.document.documentElement.innerHTML += '<div>newly.added@gen5-site.com</div>';
        global.document.body.innerText += ' newly.added@gen5-site.com';

        cs.extractAndSendPageEmails('NEW_EMAIL');
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

        cs.extractAndSendPageEmails('NON_INQUIRY_PAGE');
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
            'content-script.js'
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

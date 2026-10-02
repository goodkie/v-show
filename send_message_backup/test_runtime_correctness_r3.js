/**
 * Acceptance Test Suite: Runtime Correctness Hotfix R3
 * Verifies:
 * 1. Download Prevention: Strict rejection of .vcf, .ics, .pdf, .zip, etc. in candidate resolution, navigation guard, and DOM triggers
 * 2. Non-Business Domain Exclusion: Skipping .gov, .go.kr, .mil, .edu, .ac.kr, major search/social platforms, and mega shopping malls
 * 3. History Ledger Discovered Contact URL Persistence: Proper saving, storage retrieval, and CSV export of contact URLs
 * 4. Production Build Parity: 100% binary & SHA-256 equivalence between send_message_backup/ and build/extension/
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock global environment
global.self = global;
global.window = global;
global.self.addEventListener = () => {};

// Setup Chrome API Mocks
const storageData = {};
global.chrome = {
    storage: {
        local: {
            data: storageData,
            get: function(keys, cb) {
                const res = {};
                (Array.isArray(keys) ? keys : [keys]).forEach(k => {
                    if (this.data[k] !== undefined) res[k] = this.data[k];
                });
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: function(obj, cb) {
                Object.assign(this.data, obj);
                if (cb) cb();
                return Promise.resolve();
            }
        }
    },
    runtime: {
        sendMessage: async (msg, cb) => {
            if (cb) cb({ success: true });
            return { success: true };
        },
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        lastError: null
    },
    tabs: {
        create: async (opts) => ({ id: 101, url: opts.url, active: opts.active }),
        update: async (tabId, opts) => ({ id: tabId, url: opts.url, active: opts.active }),
        get: async (tabId) => ({ id: tabId, url: 'https://example.com/contact' }),
        remove: async (tabId) => true,
        onUpdated: { addListener: () => {}, removeListener: () => {} }
    },
    windows: {
        getCurrent: async () => ({ id: 1, focused: true }),
        update: async (winId, props) => ({ id: winId, focused: props.focused })
    },
    alarms: {
        create: () => {},
        clear: () => {},
        onAlarm: { addListener: () => {} }
    },
    scripting: {
        executeScript: async () => [{ result: true }]
    }
};

const bg = require('./background.js');
const cde = require('./modules/contact-discovery-engine.js');
const { HistoryStore } = require('./modules/history-store.js');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(e);
        failCount++;
    }
}

async function runSuite() {
    console.log('\n=== [RUNTIME CORRECTNESS HOTFIX R3 ACCEPTANCE SUITE] ===\n');

    // -------------------------------------------------------------
    console.log('--- 1. DOWNLOAD PREVENTION & EXTENSION REJECTION ---');
    // -------------------------------------------------------------

    await test('DL-REJECT-1: validateCandidateUrl rejects vCard (.vcf) files', async () => {
        const res = bg.validateCandidateUrl('https://example.com/assets/contact.vcf');
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reasonCode, 'DOWNLOADABLE_FILE_REJECTED');
    });

    await test('DL-REJECT-2: validateCandidateUrl rejects iCalendar (.ics) files', async () => {
        const res = bg.validateCandidateUrl('https://example.com/events/invite.ics');
        assert.strictEqual(res.valid, false);
        assert.strictEqual(res.reasonCode, 'DOWNLOADABLE_FILE_REJECTED');
    });

    await test('DL-REJECT-3: validateCandidateUrl rejects PDF, ZIP, and executable files', async () => {
        const files = ['/info.pdf', '/archive.zip', '/setup.exe', '/document.docx', '/sheet.xlsx'];
        for (const f of files) {
            const res = bg.validateCandidateUrl(`https://example.com${f}`);
            assert.strictEqual(res.valid, false, `File ${f} must be rejected`);
            assert.strictEqual(res.reasonCode, 'DOWNLOADABLE_FILE_REJECTED');
        }
    });

    await test('DL-REJECT-4: validateCandidateUrl rejects mailto: and tel: schemes', async () => {
        const m = bg.validateCandidateUrl('mailto:contact@business.com');
        assert.strictEqual(m.valid, false);
        const t = bg.validateCandidateUrl('tel:+18005550199');
        assert.strictEqual(t.valid, false);
    });

    await test('DL-REJECT-5: resolveCandidateUrl in contact-discovery-engine rejects downloadable extensions', async () => {
        assert.strictEqual(cde.resolveCandidateUrl('/contact.vcf', 'https://example.com'), null);
        assert.strictEqual(cde.resolveCandidateUrl('/calendar.ics', 'https://example.com'), null);
        assert.strictEqual(cde.resolveCandidateUrl('/guide.pdf', 'https://example.com'), null);
        assert.strictEqual(cde.resolveCandidateUrl('/download.zip', 'https://example.com'), null);
        assert.strictEqual(cde.resolveCandidateUrl('mailto:hello@example.com', 'https://example.com'), null);
    });

    await test('DL-REJECT-6: AnchorSemanticFinder ignores anchors with download attribute or downloadable href', async () => {
        const mockDoc = {
            querySelectorAll: () => [
                {
                    getAttribute: (attr) => attr === 'href' ? '/contact.vcf' : null,
                    hasAttribute: (attr) => false,
                    textContent: 'Contact Card (vCard)',
                    closest: () => null
                },
                {
                    getAttribute: (attr) => attr === 'href' ? '/contact-us' : null,
                    hasAttribute: (attr) => attr === 'download',
                    textContent: 'Contact Us',
                    closest: () => null
                },
                {
                    getAttribute: (attr) => attr === 'href' ? '/contact-form' : null,
                    hasAttribute: (attr) => false,
                    textContent: 'Contact Us Now',
                    closest: () => null
                }
            ]
        };

        const candidates = cde.AnchorSemanticFinder.find(mockDoc, 'https://example.com');
        assert.strictEqual(candidates.length, 1, 'Only clean HTML contact links must be picked');
        assert.strictEqual(candidates[0].url, 'https://example.com/contact-form');
    });

    // -------------------------------------------------------------
    console.log('\n--- 2. NON-BUSINESS & GOVERNMENT & MAJOR PLATFORMS EXCLUSION ---');
    // -------------------------------------------------------------

    await test('NON-BIZ-1: isNonBusinessOrMajorPlatform skips government and military domains', async () => {
        const govDomains = [
            'https://whitehouse.gov',
            'https://www.senate.gov/contact',
            'https://korea.go.kr',
            'https://president.go.kr',
            'https://mod.mil.kr',
            'https://army.mil'
        ];
        for (const url of govDomains) {
            const check = bg.isNonBusinessOrMajorPlatform(url);
            assert.strictEqual(check.skip, true, `Domain ${url} must be skipped`);
            assert.strictEqual(check.category, 'GOVERNMENT_OR_PUBLIC');
        }
    });

    await test('NON-BIZ-2: isNonBusinessOrMajorPlatform skips academic institutions', async () => {
        const eduDomains = ['https://harvard.edu', 'https://mit.edu/about', 'https://snu.ac.kr', 'https://ox.ac.uk'];
        for (const url of eduDomains) {
            const check = bg.isNonBusinessOrMajorPlatform(url);
            assert.strictEqual(check.skip, true, `Academic domain ${url} must be skipped`);
            assert.strictEqual(check.category, 'GOVERNMENT_OR_PUBLIC');
        }
    });

    await test('NON-BIZ-3: isNonBusinessOrMajorPlatform skips major search portals and social platforms', async () => {
        const platforms = [
            'https://google.com',
            'https://google.co.kr/search',
            'https://naver.com',
            'https://daum.net',
            'https://youtube.com',
            'https://facebook.com/business',
            'https://instagram.com/p/123',
            'https://twitter.com/x',
            'https://x.com'
        ];
        for (const url of platforms) {
            const check = bg.isNonBusinessOrMajorPlatform(url);
            assert.strictEqual(check.skip, true, `Platform ${url} must be skipped`);
            assert.strictEqual(check.category, 'MAJOR_PLATFORM');
        }
    });

    await test('NON-BIZ-4: isNonBusinessOrMajorPlatform skips major shopping malls and marketplaces', async () => {
        const malls = [
            'https://amazon.com/dp/B000',
            'https://amazon.co.jp',
            'https://coupang.com/vp/products/123',
            'https://gmarket.co.kr/item',
            'https://11st.co.kr',
            'https://auction.co.kr',
            'https://walmart.com'
        ];
        for (const url of malls) {
            const check = bg.isNonBusinessOrMajorPlatform(url);
            assert.strictEqual(check.skip, true, `Shopping mall ${url} must be skipped`);
            assert.strictEqual(check.category, 'MAJOR_SHOPPING_MALL');
        }
    });

    await test('NON-BIZ-5: isNonBusinessOrMajorPlatform preserves individual business websites', async () => {
        const businesses = [
            'https://brewsterkarate.org',
            'https://bostonbjjwoburn.com',
            'https://myplumbingcompany.com',
            'https://bestdentistseoul.co.kr',
            'https://designagency.net'
        ];
        for (const url of businesses) {
            const check = bg.isNonBusinessOrMajorPlatform(url);
            assert.strictEqual(check.skip, false, `Business ${url} must not be skipped`);
        }
    });

    await test('NON-BIZ-6: orchestrateSending immediately skips non-business target without opening tab', async () => {
        let tabCreated = false;
        const origCreate = global.chrome.tabs.create;
        global.chrome.tabs.create = async () => { tabCreated = true; return { id: 999 }; };

        const res = await bg.orchestrateSending('https://mofa.go.kr', {});
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reasonCode, 'NON_BUSINESS_OR_GOV_SKIPPED');
        assert.strictEqual(tabCreated, false, 'No browser tab must be opened for non-business target');

        global.chrome.tabs.create = origCreate;
    });

    // -------------------------------------------------------------
    console.log('\n--- 3. HISTORY LEDGER CONTACT URL PERSISTENCE ---');
    // -------------------------------------------------------------

    await test('HIST-LEDGER-1: Settle attempt stores contactPageUrl and selectedCandidateUrl in durable attempt', async () => {
        const hs = new HistoryStore(global.chrome.storage.local);
        await hs.load();

        const row = await hs.recordAttempt({
            targetUrl: 'https://myservice.com',
            templateId: 'tpl_1'
        });
        const attemptId = row.attempt.attemptId;

        // Candidate discovered
        hs.updateAttemptContact(attemptId, {
            selectedCandidateUrl: 'https://myservice.com/contact-us',
            contactDiscoverySource: 'Ensemble'
        });

        // Settle with confirmed success
        await hs.settleAttempt(attemptId, true, 'CONFIRMED_SUCCESS', {
            contactPageUrl: 'https://myservice.com/contact-us',
            selectedCandidateUrl: 'https://myservice.com/contact-us',
            resultUrl: 'https://myservice.com/thank-you'
        });
        await hs.persist();

        const loadedHs = new HistoryStore(global.chrome.storage.local);
        await loadedHs.load();
        const rec = loadedHs.attempts.find(a => a.attemptId === attemptId);

        assert.strictEqual(rec.contactPageUrl, 'https://myservice.com/contact-us');
        assert.strictEqual(rec.selectedCandidateUrl, 'https://myservice.com/contact-us');
        assert.strictEqual(rec.contactPageHostname, 'myservice.com');
    });

    await test('HIST-LEDGER-2: Settle attempt falls back to selectedCandidateUrl when contactPageUrl was not pre-locked', async () => {
        const hs = new HistoryStore(global.chrome.storage.local);
        await hs.load();

        const row = await hs.recordAttempt({
            targetUrl: 'https://localbakery.com',
            templateId: 'tpl_1'
        });
        const attemptId = row.attempt.attemptId;

        // Candidate discovered
        hs.updateAttemptContact(attemptId, {
            selectedCandidateUrl: 'https://localbakery.com/reach-out',
            contactDiscoverySource: 'Anchor'
        });

        // Settled as SUCCESS without explicit contactPageUrl in extra
        await hs.settleAttempt(attemptId, true, 'CONFIRMED_SUCCESS', {
            resultUrl: 'https://localbakery.com/thanks'
        });
        await hs.persist();

        const rec = hs.attempts.find(a => a.attemptId === attemptId);
        assert.strictEqual(rec.contactPageUrl, 'https://localbakery.com/reach-out');
        assert.strictEqual(rec.contactPageHostname, 'localbakery.com');
    });

    await test('HIST-LEDGER-3: exportGoogleSheetsCsv outputs discovered contact URL in ContactPageURL column', async () => {
        const hs = new HistoryStore(global.chrome.storage.local);
        await hs.load();

        const row = await hs.recordAttempt({
            targetUrl: 'https://floristshop.com',
            templateId: 'tpl_1'
        });
        const attemptId = row.attempt.attemptId;

        await hs.settleAttempt(attemptId, true, 'CONFIRMED_SUCCESS', {
            contactPageUrl: 'https://floristshop.com/contact-us',
            selectedCandidateUrl: 'https://floristshop.com/contact-us',
            resultUrl: 'https://floristshop.com/thank-you'
        });

        const csv = hs.exportGoogleSheetsCsv();
        assert.ok(csv.includes('https://floristshop.com/contact-us'), 'CSV must contain discovered contactPageUrl');
    });

    await test('HIST-LEDGER-4: getLedgerRecords provides contactPageUrl and selectedCandidateUrl for popup display', async () => {
        const hs = new HistoryStore(global.chrome.storage.local);
        await hs.load();

        await hs.ingestImportRows(['https://artgallery.org'], 'import_test');
        const row = await hs.recordAttempt({
            targetUrl: 'https://artgallery.org',
            templateId: 'tpl_1'
        });
        const attemptId = row.attempt.attemptId;

        hs.updateAttemptContact(attemptId, {
            selectedCandidateUrl: 'https://artgallery.org/inquiries'
        });

        await hs.settleAttempt(attemptId, false, 'FORM_NOT_FOUND', {
            selectedCandidateUrl: 'https://artgallery.org/inquiries'
        });

        const ledgerResult = hs.getFilteredRecords({ status: 'ALL', search: 'artgallery' });
        assert.strictEqual(ledgerResult.records.length, 1);
        const item = ledgerResult.records[0];
        // popup.js uses: const contactUrl = rec.contactPageUrl || rec.selectedCandidateUrl || '';
        const popupContactUrl = item.contactPageUrl || item.selectedCandidateUrl || '';
        assert.strictEqual(popupContactUrl, 'https://artgallery.org/inquiries');
    });

    // -------------------------------------------------------------
    console.log('\n--- 4. PRODUCTION BUILD PARITY ---');
    // -------------------------------------------------------------

    function checkParity(relPath) {
        const pSrc = path.join(__dirname, relPath);
        const pBuild = path.join(__dirname, 'build', 'extension', relPath);
        assert(fs.existsSync(pSrc), `Source file missing: ${pSrc}`);
        assert(fs.existsSync(pBuild), `Build file missing: ${pBuild}`);
        const bufSrc = fs.readFileSync(pSrc);
        const bufBuild = fs.readFileSync(pBuild);
        assert.strictEqual(bufSrc.length, bufBuild.length, `Byte length mismatch for ${relPath}`);
        const hashSrc = crypto.createHash('sha256').update(bufSrc).digest('hex');
        const hashBuild = crypto.createHash('sha256').update(bufBuild).digest('hex');
        assert.strictEqual(hashSrc, hashBuild, `SHA-256 hash mismatch for ${relPath}`);
    }

    await test('PARITY-1: background.js matches 100% between source and build', async () => {
        checkParity('background.js');
    });

    await test('PARITY-2: content-script.js matches 100% between source and build', async () => {
        checkParity('content-script.js');
    });

    await test('PARITY-3: popup.js matches 100% between source and build', async () => {
        checkParity('popup.js');
    });

    await test('PARITY-4: modules/contact-discovery-engine.js matches 100% between source and build', async () => {
        checkParity(path.join('modules', 'contact-discovery-engine.js'));
    });

    await test('PARITY-5: modules/history-store.js matches 100% between source and build', async () => {
        checkParity(path.join('modules', 'history-store.js'));
    });

    console.log(`\n=== R3 SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===\n`);
    if (failCount > 0) process.exit(1);
}

runSuite().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});

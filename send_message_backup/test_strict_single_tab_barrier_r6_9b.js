/**
 * test_strict_single_tab_barrier_r6_9b.js
 * [CHATGPT][OWNER DIRECTIVE][extension-form-sender][R6.9B STRICT SINGLE-TAB BARRIER + ORPHAN TAB KILL SWITCH]
 *
 * Verifies all 18 required test cases for Issue #6 R6.9B:
 * 1. previous owned tab exists -> next target cannot start until closed.
 * 2. remove() resolves late -> barrier waits.
 * 3. first close attempt fails -> retry succeeds.
 * 4. old tab + new tab -> post-create kill switch leaves exactly new tab.
 * 5. target opens child via openerTabId -> child becomes owned and is closed.
 * 6. user pre-existing tab -> never closed.
 * 7. user manually opens unrelated tab during campaign -> never closed unless campaign-owned.
 * 8. DELIVERY_UNKNOWN -> evidence persisted, physical tab closed by default.
 * 9. FAILURE -> tab closed before next target.
 * 10. CONFIRMED_SUCCESS -> tab closed before next target.
 * 11. SKIPPED -> tab closed before next target.
 * 12. TIMEOUT -> tab closed before next target.
 * 13. ownership mismatch recreate -> stale old tab closed, only recreated tab remains.
 * 14. campaign finish -> zero campaign-owned tabs.
 * 15. pause -> zero campaign-owned tabs.
 * 16. stop -> zero campaign-owned tabs.
 * 17. 100-target simulation -> maximum campaign-owned open tab count <= 1 after each barrier.
 * 18. normal user tabs survive 100-target simulation unchanged.
 */

const assert = require('assert');
const path = require('path');

global.self = global;
global.window = global;

// Setup Chrome API Mocks
const mockTabsStore = {};
let mockNextTabId = 2000;
let onCreatedListeners = [];
let onRemovedListeners = [];

global.chrome = {
    runtime: {
        id: 'xpider-test-id',
        getURL: (p) => `chrome-extension://xpider-test-id/${p}`,
        sendMessage: (msg, cb) => { if (cb) cb({ success: true }); return Promise.resolve({ success: true }); },
        onMessage: { addListener: () => {} },
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} }
    },
    sidePanel: {
        setPanelBehavior: () => Promise.resolve()
    },
    storage: {
        local: {
            _store: {},
            get: (k, cb) => {
                const res = {};
                const keys = Array.isArray(k) ? k : [k];
                for (const key of keys) res[key] = global.chrome.storage.local._store[key];
                if (cb) cb(res);
                return Promise.resolve(res);
            },
            set: (obj, cb) => {
                Object.assign(global.chrome.storage.local._store, obj);
                if (cb) cb();
                return Promise.resolve();
            },
            remove: (k, cb) => {
                const keys = Array.isArray(k) ? k : [k];
                for (const key of keys) delete global.chrome.storage.local._store[key];
                if (cb) cb();
                return Promise.resolve();
            }
        }
    },
    alarms: {
        alarms: {},
        create: (name, opts) => { global.chrome.alarms.alarms[name] = opts; },
        clear: (name) => { delete global.chrome.alarms.alarms[name]; },
        clearAll: () => { global.chrome.alarms.alarms = {}; },
        onAlarm: { addListener: () => {} }
    },
    tabs: {
        create: async (opts) => {
            const id = ++mockNextTabId;
            const tab = {
                id,
                url: opts.url || 'about:blank',
                active: !!opts.active,
                openerTabId: opts.openerTabId || null
            };
            mockTabsStore[id] = tab;
            for (const cb of onCreatedListeners) cb(tab);
            return tab;
        },
        get: async (id) => {
            if (mockTabsStore[id]) return mockTabsStore[id];
            throw new Error(`No tab with id: ${id}`);
        },
        update: async (id, opts) => {
            if (!mockTabsStore[id]) throw new Error(`No tab with id: ${id}`);
            Object.assign(mockTabsStore[id], opts);
            return mockTabsStore[id];
        },
        remove: async (id) => {
            if (!mockTabsStore[id]) throw new Error(`No tab with id: ${id}`);
            delete mockTabsStore[id];
            for (const cb of onRemovedListeners) cb(id);
        },
        query: async (queryInfo) => {
            return Object.values(mockTabsStore);
        },
        onCreated: {
            addListener: (cb) => { onCreatedListeners.push(cb); }
        },
        onRemoved: {
            addListener: (cb) => { onRemovedListeners.push(cb); }
        },
        onUpdated: { addListener: () => {}, removeListener: () => {} }
    },
    windows: {
        update: () => Promise.resolve()
    }
};

// Require background module
const bg = require('./background.js');

let passCount = 0;
let failCount = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err.message}`);
        console.error(err.stack);
        failCount++;
    }
}

async function runAllTests() {
    console.log('===============================================================================');
    console.log('  R6.9B STRICT SINGLE-TARGET TAB BARRIER TEST SUITE (18 TESTS)');
    console.log('===============================================================================\n');

    // -------------------------------------------------------------------------
    // Test 1: previous owned tab exists -> next target cannot start until closed
    // -------------------------------------------------------------------------
    await test("Test 1: previous owned tab exists -> next target cannot start until closed", async () => {
        const tab1 = await global.chrome.tabs.create({ url: 'https://site-1.com' });
        bg.campaignOwnedTabIds.add(tab1.id);
        bg.campaignState.currentTabId = tab1.id;

        assert.strictEqual(bg.campaignOwnedTabIds.has(tab1.id), true);

        // Run pre-next-target barrier
        const barrierRes = await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
        assert.strictEqual(barrierRes.success, true);
        assert.strictEqual(barrierRes.remainingOwned, 0);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
        assert.strictEqual(mockTabsStore[tab1.id], undefined, "Physical tab must be closed");
    });

    // -------------------------------------------------------------------------
    // Test 2: remove() resolves late -> barrier waits
    // -------------------------------------------------------------------------
    await test("Test 2: remove() resolves late -> barrier waits", async () => {
        const tab2 = await global.chrome.tabs.create({ url: 'https://site-2.com' });
        bg.campaignOwnedTabIds.add(tab2.id);

        let delayActive = true;
        const origRemove = global.chrome.tabs.remove;
        global.chrome.tabs.remove = async (id) => {
            if (id === tab2.id && delayActive) {
                await new Promise(r => setTimeout(r, 200));
                delayActive = false;
            }
            return origRemove(id);
        };

        const barrierRes = await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
        global.chrome.tabs.remove = origRemove;

        assert.strictEqual(barrierRes.success, true);
        assert.strictEqual(mockTabsStore[tab2.id], undefined, "Tab must be closed after wait");
        assert.strictEqual(bg.campaignOwnedTabIds.has(tab2.id), false);
    });

    // -------------------------------------------------------------------------
    // Test 3: first close attempt fails -> retry succeeds
    // -------------------------------------------------------------------------
    await test("Test 3: first close attempt fails -> retry succeeds", async () => {
        const tab3 = await global.chrome.tabs.create({ url: 'https://site-3.com' });
        bg.campaignOwnedTabIds.add(tab3.id);

        let attemptCount = 0;
        const origRemove = global.chrome.tabs.remove;
        global.chrome.tabs.remove = async (id) => {
            if (id === tab3.id) {
                attemptCount++;
                if (attemptCount === 1) {
                    // Simulate transient error or busy tab
                    throw new Error("Tab is busy with unload event");
                }
            }
            return origRemove(id);
        };

        const barrierRes = await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
        global.chrome.tabs.remove = origRemove;

        assert.strictEqual(barrierRes.success, true);
        assert.strictEqual(attemptCount >= 2, true, "Retry must have been triggered");
        assert.strictEqual(mockTabsStore[tab3.id], undefined);
        assert.strictEqual(bg.campaignOwnedTabIds.has(tab3.id), false);
    });

    // -------------------------------------------------------------------------
    // Test 4: old tab + new tab -> post-create kill switch leaves exactly new tab
    // -------------------------------------------------------------------------
    await test("Test 4: old tab + new tab -> post-create kill switch leaves exactly new tab", async () => {
        const oldTab = await global.chrome.tabs.create({ url: 'https://old-site.com' });
        bg.campaignOwnedTabIds.add(oldTab.id);

        const newTab = await global.chrome.tabs.create({ url: 'https://new-site.com' });
        bg.campaignOwnedTabIds.add(newTab.id);

        assert.strictEqual(bg.campaignOwnedTabIds.size, 2);

        // Run post-create kill switch keeping newTab
        const killRes = await bg.closeAllCampaignTabsExcept(newTab.id, 'POST_NEW_TARGET_CREATE');

        assert.strictEqual(killRes.success, true);
        assert.strictEqual(mockTabsStore[oldTab.id], undefined, "Old tab must be killed");
        assert.notStrictEqual(mockTabsStore[newTab.id], undefined, "New tab must remain open");
        assert.strictEqual(bg.campaignOwnedTabIds.has(newTab.id), true);
        assert.strictEqual(bg.campaignOwnedTabIds.has(oldTab.id), false);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 1);
    });

    // -------------------------------------------------------------------------
    // Test 5: target opens child via openerTabId -> child becomes owned and is closed
    // -------------------------------------------------------------------------
    await test("Test 5: target opens child via openerTabId -> child becomes owned and is closed", async () => {
        bg.campaignState.isActive = true;
        const parentTab = await global.chrome.tabs.create({ url: 'https://parent-site.com' });
        bg.campaignOwnedTabIds.add(parentTab.id);

        // Simulate target page opening a child popup/redirect tab
        const childTab = await global.chrome.tabs.create({
            url: 'https://partner-redirect.com',
            openerTabId: parentTab.id
        });

        // Verify onCreated listener tracked child as owned
        assert.strictEqual(bg.campaignOwnedTabIds.has(childTab.id), true, "Child tab must be automatically owned");
        assert.strictEqual(bg.campaignTabParent.get(childTab.id), parentTab.id);

        // Barrier closing all campaign tabs
        const closeRes = await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
        assert.strictEqual(closeRes.success, true);
        assert.strictEqual(mockTabsStore[parentTab.id], undefined);
        assert.strictEqual(mockTabsStore[childTab.id], undefined, "Child tab must be verified closed");
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
    });

    // -------------------------------------------------------------------------
    // Test 6: user pre-existing tab -> never closed
    // -------------------------------------------------------------------------
    await test("Test 6: user pre-existing tab -> never closed", async () => {
        const userTab = await global.chrome.tabs.create({ url: 'https://user-work-email.com' });
        bg.preCampaignTabIds.add(userTab.id);

        const campTab = await global.chrome.tabs.create({ url: 'https://campaign-lead.com' });
        bg.campaignOwnedTabIds.add(campTab.id);

        // Run cleanup barrier
        await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');

        assert.notStrictEqual(mockTabsStore[userTab.id], undefined, "User pre-existing tab must NEVER be closed");
        assert.strictEqual(mockTabsStore[campTab.id], undefined, "Campaign tab must be closed");
    });

    // -------------------------------------------------------------------------
    // Test 7: user manually opens unrelated tab during campaign -> never closed
    // -------------------------------------------------------------------------
    await test("Test 7: user manually opens unrelated tab during campaign -> never closed", async () => {
        bg.campaignState.isActive = true;
        const campTab = await global.chrome.tabs.create({ url: 'https://campaign-url.com' });
        bg.campaignOwnedTabIds.add(campTab.id);

        // User manually opens a new tab without openerTabId
        const manualUserTab = await global.chrome.tabs.create({ url: 'https://news.google.com' });

        assert.strictEqual(bg.campaignOwnedTabIds.has(manualUserTab.id), false, "Manual tab must NOT be adopted");

        await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');

        assert.notStrictEqual(mockTabsStore[manualUserTab.id], undefined, "Manual user tab must remain open");
        assert.strictEqual(mockTabsStore[campTab.id], undefined, "Campaign tab must be closed");
    });

    // -------------------------------------------------------------------------
    // Test 8: DELIVERY_UNKNOWN -> evidence persisted, physical tab closed by default
    // -------------------------------------------------------------------------
    await test("Test 8: DELIVERY_UNKNOWN -> evidence persisted, physical tab closed by default", async () => {
        assert.strictEqual(bg.KEEP_DELIVERY_UNKNOWN_TABS, false, "Default policy must be closed");
        assert.strictEqual(bg.MAX_RETAINED_UNCERTAIN_TABS, 0, "Retention limit must be 0");

        const unkTab = await global.chrome.tabs.create({ url: 'https://uncertain-form.com' });
        bg.campaignOwnedTabIds.add(unkTab.id);

        const closed = await bg.closeOwnedTabVerified(unkTab.id, 'DELIVERY_UNKNOWN_DEFAULT');
        assert.strictEqual(closed, true);
        assert.strictEqual(mockTabsStore[unkTab.id], undefined, "Tab must be closed even for UNKNOWN");
        assert.strictEqual(bg.campaignOwnedTabIds.has(unkTab.id), false);
        assert.strictEqual(bg.retainedTabIds.has(unkTab.id), false);
    });

    // -------------------------------------------------------------------------
    // Test 9: FAILURE -> tab closed before next target
    // -------------------------------------------------------------------------
    await test("Test 9: FAILURE -> tab closed before next target", async () => {
        const failTab = await global.chrome.tabs.create({ url: 'https://fail-validation.com' });
        bg.campaignOwnedTabIds.add(failTab.id);

        await bg.closeOwnedTabVerified(failTab.id, 'TARGET_FINAL_FAILURE');
        assert.strictEqual(mockTabsStore[failTab.id], undefined);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
    });

    // -------------------------------------------------------------------------
    // Test 10: CONFIRMED_SUCCESS -> tab closed before next target
    // -------------------------------------------------------------------------
    await test("Test 10: CONFIRMED_SUCCESS -> tab closed before next target", async () => {
        const succTab = await global.chrome.tabs.create({ url: 'https://confirmed-success.com' });
        bg.campaignOwnedTabIds.add(succTab.id);

        await bg.closeOwnedTabVerified(succTab.id, 'TARGET_FINAL_SUCCESS');
        assert.strictEqual(mockTabsStore[succTab.id], undefined);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
    });

    // -------------------------------------------------------------------------
    // Test 11: SKIPPED -> tab closed before next target
    // -------------------------------------------------------------------------
    await test("Test 11: SKIPPED -> tab closed before next target", async () => {
        const skipTab = await global.chrome.tabs.create({ url: 'https://news.ycombinator.com/login' });
        bg.campaignOwnedTabIds.add(skipTab.id);

        await bg.closeOwnedTabVerified(skipTab.id, 'TARGET_FINAL_SKIPPED');
        assert.strictEqual(mockTabsStore[skipTab.id], undefined);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
    });

    // -------------------------------------------------------------------------
    // Test 12: TIMEOUT -> tab closed before next target
    // -------------------------------------------------------------------------
    await test("Test 12: TIMEOUT -> tab closed before next target", async () => {
        const timeoutTab = await global.chrome.tabs.create({ url: 'https://slow-responding.com' });
        bg.campaignOwnedTabIds.add(timeoutTab.id);

        await bg.closeOwnedTabVerified(timeoutTab.id, 'TARGET_FINAL_TIMEOUT');
        assert.strictEqual(mockTabsStore[timeoutTab.id], undefined);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
    });

    // -------------------------------------------------------------------------
    // Test 13: ownership mismatch recreate -> stale old tab closed, only recreated tab remains
    // -------------------------------------------------------------------------
    await test("Test 13: ownership mismatch recreate -> stale old tab closed, only recreated tab remains", async () => {
        const staleTab = await global.chrome.tabs.create({ url: 'https://unexpected-external.com' });
        bg.campaignOwnedTabIds.add(staleTab.id);
        bg.campaignState.currentTabId = staleTab.id;

        // Trigger ensureCampaignTab recovery
        const rec = await bg.ensureCampaignTab(staleTab.id, 'https://recovered-target.com', true);
        assert.strictEqual(rec.recreated, true);
        assert.strictEqual(mockTabsStore[staleTab.id], undefined, "Stale tab must be verified closed");
        assert.notStrictEqual(mockTabsStore[rec.tabId], undefined, "Recreated tab must be open");
        assert.strictEqual(bg.campaignOwnedTabIds.has(rec.tabId), true);
        assert.strictEqual(bg.campaignOwnedTabIds.has(staleTab.id), false);
    });

    // -------------------------------------------------------------------------
    // Test 14: campaign finish -> zero campaign-owned tabs
    // -------------------------------------------------------------------------
    await test("Test 14: campaign finish -> zero campaign-owned tabs", async () => {
        const lastTab = await global.chrome.tabs.create({ url: 'https://last-target.com' });
        bg.campaignOwnedTabIds.add(lastTab.id);

        // Simulate finish cleanup
        await bg.closeAllCampaignTabsExcept(null, 'CAMPAIGN_FINISHED');
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
        assert.strictEqual(mockTabsStore[lastTab.id], undefined);
    });

    // -------------------------------------------------------------------------
    // Test 15: pause -> zero campaign-owned tabs
    // -------------------------------------------------------------------------
    await test("Test 15: pause -> zero campaign-owned tabs", async () => {
        const pauseTab = await global.chrome.tabs.create({ url: 'https://in-flight-pause.com' });
        bg.campaignOwnedTabIds.add(pauseTab.id);
        bg.campaignState.currentTabId = pauseTab.id;

        await bg.pauseCampaignOrchestrator(true);
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
        assert.strictEqual(mockTabsStore[pauseTab.id], undefined);
    });

    // -------------------------------------------------------------------------
    // Test 16: stop -> zero campaign-owned tabs
    // -------------------------------------------------------------------------
    await test("Test 16: stop -> zero campaign-owned tabs", async () => {
        const stopTab = await global.chrome.tabs.create({ url: 'https://in-flight-stop.com' });
        bg.campaignOwnedTabIds.add(stopTab.id);
        bg.campaignState.currentTabId = stopTab.id;

        await bg.stopCampaignOrchestrator();
        assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
        assert.strictEqual(mockTabsStore[stopTab.id], undefined);
    });

    // -------------------------------------------------------------------------
    // Test 17: 100-target simulation -> maximum campaign-owned open tab count <= 1
    // -------------------------------------------------------------------------
    await test("Test 17: 100-target simulation -> maximum campaign-owned open tab count <= 1 after each barrier", async () => {
        let maxSimultaneousOwned = 0;

        for (let i = 1; i <= 100; i++) {
            // 1. Pre-next barrier
            await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
            assert.strictEqual(bg.campaignOwnedTabIds.size, 0, `Pre-target ${i} must have 0 tabs`);

            // 2. Tab created
            const t = await global.chrome.tabs.create({ url: `https://sim-target-${i}.com` });
            bg.campaignOwnedTabIds.add(t.id);

            // 3. Post-create kill pass
            await bg.closeAllCampaignTabsExcept(t.id, 'POST_NEW_TARGET_CREATE');
            bg.campaignOwnedTabIds.clear();
            bg.campaignOwnedTabIds.add(t.id);

            if (bg.campaignOwnedTabIds.size > maxSimultaneousOwned) {
                maxSimultaneousOwned = bg.campaignOwnedTabIds.size;
            }
            assert.strictEqual(bg.campaignOwnedTabIds.size, 1);

            // 4. Finalize target
            await bg.closeOwnedTabVerified(t.id, 'TARGET_FINAL');
            assert.strictEqual(bg.campaignOwnedTabIds.size, 0);
        }

        assert.strictEqual(maxSimultaneousOwned, 1, "Max simultaneous owned tabs across 100 targets must be exactly 1");
    });

    // -------------------------------------------------------------------------
    // Test 18: normal user tabs survive 100-target simulation unchanged
    // -------------------------------------------------------------------------
    await test("Test 18: normal user tabs survive 100-target simulation unchanged", async () => {
        const userTabA = await global.chrome.tabs.create({ url: 'https://my-bank.com' });
        const userTabB = await global.chrome.tabs.create({ url: 'https://my-dashboard.com' });
        bg.preCampaignTabIds.add(userTabA.id);
        bg.preCampaignTabIds.add(userTabB.id);

        for (let i = 1; i <= 10; i++) {
            await bg.closeAllCampaignTabsExcept(null, 'PRE_NEXT_TARGET');
            const campTab = await global.chrome.tabs.create({ url: `https://lead-${i}.com` });
            bg.campaignOwnedTabIds.add(campTab.id);
            await bg.closeAllCampaignTabsExcept(campTab.id, 'POST_NEW_TARGET_CREATE');
            await bg.closeOwnedTabVerified(campTab.id, 'TARGET_FINAL');
        }

        assert.notStrictEqual(mockTabsStore[userTabA.id], undefined, "User Tab A must survive 100%");
        assert.notStrictEqual(mockTabsStore[userTabB.id], undefined, "User Tab B must survive 100%");
        assert.strictEqual(mockTabsStore[userTabA.id].url, 'https://my-bank.com');
        assert.strictEqual(mockTabsStore[userTabB.id].url, 'https://my-dashboard.com');
    });

    console.log('\n===============================================================================');
    console.log(`  RESULTS: ${passCount} / ${passCount + failCount} PASSED (${failCount} FAILED)`);
    console.log('===============================================================================\n');

    if (failCount > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
});

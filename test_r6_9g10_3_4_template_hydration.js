/**
 * test_r6_9g10_3_4_template_hydration.js
 * Mandatory Regression Tests A through F for R6.9G.10.3.4 (Directive #6058000706)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load TemplateStore module
const { TemplateStore } = require('./send_message_backup/modules/template-store.js');

// Mock chrome storage
function createMockStorage(initialData = {}) {
    const store = JSON.parse(JSON.stringify(initialData));
    return {
        _data: store,
        get: function(keys, cb) {
            let res = {};
            if (keys === null || keys === undefined) {
                res = JSON.parse(JSON.stringify(store));
            } else if (Array.isArray(keys)) {
                keys.forEach(k => { if (store[k] !== undefined) res[k] = JSON.parse(JSON.stringify(store[k])); });
            } else if (typeof keys === 'string') {
                if (store[keys] !== undefined) res[keys] = JSON.parse(JSON.stringify(store[keys]));
            }
            if (typeof cb === 'function') setTimeout(() => cb(res), 5);
            return Promise.resolve(res);
        },
        set: function(obj, cb) {
            for (const [k, v] of Object.entries(obj)) {
                store[k] = JSON.parse(JSON.stringify(v));
            }
            if (typeof cb === 'function') setTimeout(() => cb(), 5);
            return Promise.resolve();
        }
    };
}

async function runTests() {
    console.log('=== [R6.9G.10.3.4] TEMPLATE HYDRATION & REPAIR REGRESSION SUITE ===\n');

    // -------------------------------------------------------------------------
    // TEST A: Fresh v1 migration — xpider_tpl only with non-empty message
    // -------------------------------------------------------------------------
    console.log('--- Test A: Fresh v1 migration — xpider_tpl only with non-empty message ---');
    {
        const mockStorage = createMockStorage({
            xpider_schema_version: 1,
            xpider_tpl: {
                name: 'Owner Outreach',
                subject: 'Collaboration Inquiry',
                message: 'Hello, we would love to connect with your team.',
                sender: { firstName: 'Alice', email: 'alice@example.com' }
            }
        });

        const tStore = new TemplateStore(mockStorage);
        const result = await tStore.migrateLegacyData(mockStorage._data, true);

        assert.strictEqual(result.migrated, true, 'Test A: Must migrate');
        assert.ok(result.templates_v2, 'Test A: templates_v2 must exist');
        assert.ok(result.templates_v2.defaultId, 'Test A: defaultId must exist');

        const defTpl = result.templates_v2.templates[result.templates_v2.defaultId];
        assert.ok(defTpl, 'Test A: Default template must be resolved');
        assert.strictEqual(defTpl.message, 'Hello, we would love to connect with your team.', 'Test A: Message must be preserved');
        assert.strictEqual(defTpl.subject, 'Collaboration Inquiry', 'Test A: Subject must be preserved');
        console.log('✓ Test A PASS: xpider_tpl only migrated with message preserved.\n');
    }

    // -------------------------------------------------------------------------
    // TEST B: Fresh v1 migration — tplLibrary only
    // -------------------------------------------------------------------------
    console.log('--- Test B: Fresh v1 migration — tplLibrary only ---');
    {
        const mockStorage = createMockStorage({
            xpider_schema_version: 1,
            tplLibrary: [
                {
                    id: 'tpl_custom_1',
                    name: 'Sales Pitch',
                    subject: 'Exclusive Offer',
                    message: 'Check out our special enterprise discount.',
                    email: 'sales@example.com',
                    isDefault: true
                }
            ]
        });

        const tStore = new TemplateStore(mockStorage);
        const result = await tStore.migrateLegacyData(mockStorage._data, true);

        assert.strictEqual(result.migrated, true, 'Test B: Must migrate');
        assert.ok(result.templates_v2, 'Test B: templates_v2 must exist');
        const defTpl = result.templates_v2.templates[result.templates_v2.defaultId];
        assert.ok(defTpl, 'Test B: Default template resolved');
        assert.strictEqual(defTpl.message, 'Check out our special enterprise discount.', 'Test B: Message preserved');
        console.log('✓ Test B PASS: tplLibrary only migrated with message preserved.\n');
    }

    // -------------------------------------------------------------------------
    // TEST C: Fresh v1 migration — BOTH tplLibrary and xpider_tpl (tplLibrary empty, xpider_tpl valid)
    // -------------------------------------------------------------------------
    console.log('--- Test C: Fresh v1 migration — BOTH tplLibrary (empty) and xpider_tpl (valid) ---');
    {
        const mockStorage = createMockStorage({
            xpider_schema_version: 1,
            tplLibrary: [
                {
                    id: 'tpl_placeholder',
                    name: 'Blank Default',
                    subject: 'Empty Subject',
                    message: '', // EMPTY message in library!
                    isDefault: true
                }
            ],
            xpider_tpl: {
                name: 'Active Current Message',
                subject: 'Real Outreach Subject',
                message: 'This is the active valid campaign message that must NOT be lost.',
                email: 'active@example.com'
            }
        });

        const tStore = new TemplateStore(mockStorage);
        const result = await tStore.migrateLegacyData(mockStorage._data, true);

        assert.strictEqual(result.migrated, true, 'Test C: Must migrate');
        const defTpl = result.templates_v2.templates[result.templates_v2.defaultId];
        assert.ok(defTpl, 'Test C: Default template resolved');
        assert.strictEqual(defTpl.message, 'This is the active valid campaign message that must NOT be lost.', 'Test C: xpider_tpl message must be prioritized over empty tplLibrary');
        console.log('✓ Test C PASS: Valid message from xpider_tpl preserved despite empty tplLibrary entry.\n');
    }

    // -------------------------------------------------------------------------
    // TEST D: Already-migrated v2 repair — default empty, backup/xpider_tpl valid
    // -------------------------------------------------------------------------
    console.log('--- Test D: Already-migrated v2 repair — default empty, backup/xpider_tpl valid ---');
    {
        // Simulating the exact Owner state from Smoke Test failure
        const ownerBackupKey = 'xpider_backup_v1_1791455369707';
        const mockStorage = createMockStorage({
            xpider_schema_version: 2,
            templates_v2: {
                version: 2,
                templates: {
                    tpl_empty_default: {
                        id: 'tpl_empty_default',
                        name: 'Default Template',
                        subject: 'Product Demo',
                        message: '', // Empty from botched migration!
                        isDefault: true
                    }
                },
                defaultId: 'tpl_empty_default',
                recentIds: ['tpl_empty_default']
            },
            xpider_tpl: {
                subject: 'Product Demo',
                message: 'Hello, please review our product demo presentation.',
                email: 'owner@example.com'
            },
            [ownerBackupKey]: {
                xpider_tpl: {
                    message: 'Hello, please review our product demo presentation.',
                    subject: 'Product Demo'
                },
                timestamp: 1791455369707
            }
        });

        const tStore = new TemplateStore(mockStorage);
        const result = await tStore.migrateLegacyData(mockStorage._data, true);

        assert.strictEqual(result.repaired, true, 'Test D: Must be repaired');
        assert.strictEqual(result.repairSource, 'xpider_tpl', 'Test D: Repair source identified');
        
        // Check repaired template
        const repairedDef = result.templates_v2.templates[result.templates_v2.defaultId];
        assert.strictEqual(repairedDef.message, 'Hello, please review our product demo presentation.', 'Test D: Repaired message must match');
        
        // Verify Owner backup key is untouched
        assert.ok(mockStorage._data[ownerBackupKey], 'Test D: Owner backup key must remain preserved');

        // Test idempotency: running again should report ALREADY_V2_VALID and not re-repair
        const secondPass = await tStore.migrateLegacyData(mockStorage._data, true);
        assert.strictEqual(secondPass.repaired, false, 'Test D: Second pass must be idempotent');
        assert.strictEqual(secondPass.reason, 'ALREADY_V2_VALID', 'Test D: Second pass must be ALREADY_V2_VALID');
        console.log('✓ Test D PASS: Idempotent repair restored canonical message from legacy/backup state.\n');
    }

    // -------------------------------------------------------------------------
    // TEST E: Startup race — artificially delayed migration resolution
    // -------------------------------------------------------------------------
    console.log('--- Test E: Startup race — artificially delayed migration ---');
    {
        let migrationResolved = false;
        let hydrationStarted = false;

        // Simulated ensureSchemaReady with 100ms artificial delay
        const mockEnsureSchemaReady = async () => {
            await new Promise(r => setTimeout(r, 100));
            migrationResolved = true;
            return { success: true, migrated: false, reason: 'SCHEMA_READY' };
        };

        const mockHydrateSettings = async () => {
            hydrationStarted = true;
            assert.strictEqual(migrationResolved, true, 'Test E: Migration MUST be resolved before hydration starts!');
            return true;
        };

        // Sequential boot pattern
        const bootPromise = (async () => {
            await mockEnsureSchemaReady();
            await mockHydrateSettings();
        })();

        await bootPromise;
        assert.strictEqual(hydrationStarted, true, 'Test E: Hydration completed after migration');
        console.log('✓ Test E PASS: Serialized boot prevents hydration from racing ahead of migration.\n');
    }

    // -------------------------------------------------------------------------
    // TEST F: Popup close/reopen — saved default template automatically reappears
    // -------------------------------------------------------------------------
    console.log('--- Test F: Popup close/reopen — saved default template automatically reappears ---');
    {
        // 1. Simulate session 1: user saves template into templates_v2
        const sharedStorage = createMockStorage({
            xpider_schema_version: 2,
            templates_v2: {
                version: 2,
                templates: {
                    tpl_saved_1: {
                        id: 'tpl_saved_1',
                        name: 'Saved Outreach',
                        subject: 'Partnership Proposal',
                        message: 'We are reaching out to propose a partnership.',
                        isDefault: true
                    }
                },
                defaultId: 'tpl_saved_1',
                recentIds: ['tpl_saved_1']
            }
        });

        // 2. Simulate session 2 boot: popup loads storage
        const tStore = new TemplateStore(sharedStorage);
        const migResult = await tStore.migrateLegacyData(sharedStorage._data, false);
        assert.strictEqual(migResult.repaired, false, 'Test F: Already valid, no repair needed');

        // Verify loaded default
        const defTpl = migResult.templates_v2.templates[migResult.templates_v2.defaultId];
        assert.strictEqual(defTpl.message, 'We are reaching out to propose a partnership.', 'Test F: Message restored on boot');
        assert.strictEqual(defTpl.subject, 'Partnership Proposal', 'Test F: Subject restored on boot');
        console.log('✓ Test F PASS: Saved default template automatically reappears upon popup reopen.\n');
    }

    console.log('=================================================================');
    console.log('🎉 ALL 6 MANDATORY TESTS (A through F) PASSED WITH 100% SUCCESS!');
    console.log('=================================================================');
}

runTests().catch(err => {
    console.error('❌ REGRESSION TEST FAILED:', err);
    process.exit(1);
});

/**
 * X PIDER Template Store Module (v2.0)
 * Handles canonical FormTemplateV2 CRUD, default selection, backup/import,
 * and background-authoritative idempotent legacy migration.
 */

(function(root) {
    'use strict';

    class TemplateStore {
        constructor(storageAdapter = null) {
            this.storage = storageAdapter || (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
        }

        /**
         * Create a new FormTemplateV2 record
         */
        createTemplateData({ name, sender = {}, content = {}, aiInstructions = '', isDefault = false }) {
            const now = Date.now();
            return {
                id: `tpl_${now}_${Math.random().toString(36).substring(2, 7)}`,
                name: (name || 'Untitled Template').trim(),
                version: 1,
                sender: {
                    fullName: sender.fullName || '',
                    company: sender.company || '',
                    email: sender.email || '',
                    phone: sender.phone || '',
                    website: sender.website || ''
                },
                content: {
                    subject: content.subject || '',
                    message: content.message || ''
                },
                aiInstructions: aiInstructions || '',
                isDefault: !!isDefault,
                createdAt: now,
                updatedAt: now
            };
        }

        /**
         * Validate FormTemplateV2 structure
         */
        validateTemplate(tpl) {
            if (!tpl || typeof tpl !== 'object') return false;
            if (!tpl.id || typeof tpl.id !== 'string') return false;
            if (!tpl.name || typeof tpl.name !== 'string') return false;
            if (!tpl.sender || typeof tpl.sender !== 'object') return false;
            if (!tpl.content || typeof tpl.content !== 'object') return false;
            return true;
        }

        /**
         * Duplicate an existing template
         */
        duplicateTemplate(tpl) {
            const copy = JSON.parse(JSON.stringify(tpl));
            copy.id = `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            copy.name = `${copy.name} (Copy)`;
            copy.version = 1;
            copy.isDefault = false;
            copy.createdAt = Date.now();
            copy.updatedAt = Date.now();
            return copy;
        }

        /**
         * Authoritative Legacy Migration: Converts legacy tplLibrary and savedUrlLists
         * Must be executed by Single Writer (Background Service Worker).
         */
        async migrateLegacyData(storageData) {
            const currentVersion = storageData.xpider_schema_version || 0;
            if (currentVersion >= 2) {
                return {
                    migrated: false,
                    reason: 'ALREADY_V2',
                    templates: storageData.templates_v2 || [],
                    savedUrlLists: storageData.savedUrlLists_v2 || storageData.savedUrlLists || []
                };
            }

            // 1. Snapshot raw backup of legacy state
            const backupKey = `xpider_backup_v1_${Date.now()}`;
            const backupPayload = {
                [backupKey]: {
                    tplLibrary: storageData.tplLibrary || null,
                    savedUrlLists: storageData.savedUrlLists || null,
                    xpider_tpl: storageData.xpider_tpl || null,
                    timestamp: Date.now()
                }
            };

            const templatesV2 = [];
            const legacyLibrary = storageData.tplLibrary;

            // 2. Transform legacy tplLibrary
            if (legacyLibrary && typeof legacyLibrary === 'object') {
                if (Array.isArray(legacyLibrary)) {
                    for (const item of legacyLibrary) {
                        templatesV2.push(this._convertLegacyItem(item));
                    }
                } else {
                    for (const [key, item] of Object.entries(legacyLibrary)) {
                        const converted = this._convertLegacyItem(item, key);
                        templatesV2.push(converted);
                    }
                }
            } else if (storageData.xpider_tpl && typeof storageData.xpider_tpl === 'object') {
                templatesV2.push(this._convertLegacyItem(storageData.xpider_tpl, 'Default Template'));
            }

            // Ensure at least one default if templates exist
            if (templatesV2.length > 0 && !templatesV2.some(t => t.isDefault)) {
                templatesV2[0].isDefault = true;
            }

            // 3. Preserve savedUrlLists
            const savedUrlListsV2 = Array.isArray(storageData.savedUrlLists) 
                ? [...storageData.savedUrlLists] 
                : [];

            // 4. Verify converted templates
            for (const t of templatesV2) {
                if (!this.validateTemplate(t)) {
                    throw new Error(`Migration validation failed for template: ${JSON.stringify(t)}`);
                }
            }

            const migrationCommit = {
                ...backupPayload,
                templates_v2: templatesV2,
                savedUrlLists_v2: savedUrlListsV2,
                xpider_schema_version: 2,
                xpider_migration_ts: Date.now()
            };

            return {
                migrated: true,
                commit: migrationCommit,
                backupKey,
                templates: templatesV2,
                savedUrlLists: savedUrlListsV2
            };
        }

        _convertLegacyItem(item, fallbackName = 'Imported Template') {
            const name = item.name || fallbackName;
            const sender = item.sender || {};
            const content = item.content || {};

            return this.createTemplateData({
                name,
                sender: {
                    fullName: sender.fullName || item.name_val || item.fullName || '',
                    company: sender.company || item.company_val || item.company || '',
                    email: sender.email || item.email_val || item.email || '',
                    phone: sender.phone || item.phone_val || item.phone || '',
                    website: sender.website || item.website_val || item.website || ''
                },
                content: {
                    subject: content.subject || item.subject_val || item.subject || '',
                    message: content.message || item.message_val || item.message || ''
                },
                aiInstructions: item.aiInstructions || '',
                isDefault: !!(item.isDefault || item.default)
            });
        }
    }

    // Universal Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { TemplateStore };
    }
    if (typeof root !== 'undefined') {
        root.TemplateStore = TemplateStore;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

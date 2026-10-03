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
        createTemplateData(nameOrOpts = {}, maybeOpts = {}) {
            let opts;
            if (typeof nameOrOpts === 'string') {
                opts = { name: nameOrOpts, ...maybeOpts };
            } else {
                opts = { ...maybeOpts, ...(nameOrOpts || {}) };
            }
            const now = Date.now();
            const sender = opts.sender || {};
            const content = opts.content || {};

            const firstName = opts.firstName || sender.firstName || '';
            const lastName = opts.lastName || sender.lastName || '';
            const fullName = opts.fullName || sender.fullName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : (firstName || lastName || ''));
            const email = opts.email || sender.email || '';
            const phone = opts.phone || sender.phone || '';
            const company = opts.company || sender.company || '';
            const website = opts.website || sender.website || '';
            const subject = opts.subject || content.subject || '';
            const message = opts.message || content.message || '';

            return {
                id: opts.id || `tpl_${now}_${Math.random().toString(36).substring(2, 7)}`,
                name: (opts.name || 'Untitled Template').trim(),
                version: 1,
                // [F9 Unified Schema] Canonical flat accessors (for direct popup UI binding)
                firstName,
                lastName,
                fullName,
                email,
                phone,
                company,
                website,
                subject,
                message,
                // [F9 Unified Schema] Canonical nested objects (for FormTemplateV2 model compliance)
                sender: {
                    fullName,
                    firstName,
                    lastName,
                    company,
                    email,
                    phone,
                    website
                },
                content: {
                    subject,
                    message
                },
                customFields: opts.customFields || {},
                aiInstructions: opts.aiInstructions || '',
                isDefault: !!opts.isDefault,
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
            if (copy.subject) {
                copy.subject = `${copy.subject} (Copy)`;
            }
            if (copy.content && copy.content.subject) {
                copy.content.subject = `${copy.content.subject} (Copy)`;
            }
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
        async migrateLegacyData(storageData, autoCommit = false) {
            if (!storageData || typeof storageData !== 'object') {
                throw new Error("Invalid storage data provided for migration");
            }

            const currentVersion = storageData.xpider_schema_version || 0;
            if (currentVersion >= 2) {
                const existingTemplates = Array.isArray(storageData.templates_v2)
                    ? storageData.templates_v2
                    : (storageData.templates_v2 && storageData.templates_v2.templates ? Object.values(storageData.templates_v2.templates) : []);
                return {
                    migrated: false,
                    reason: 'ALREADY_V2',
                    templates: existingTemplates,
                    templates_v2: storageData.templates_v2 || null,
                    savedUrlLists: storageData.savedUrlLists_v2 || storageData.savedUrlLists || storageData.xpider_saved_lists || []
                };
            }

            // 1. Snapshot raw backup of legacy state
            const backupKey = `xpider_backup_v1_${Date.now()}`;
            const backupPayload = {
                [backupKey]: {
                    tplLibrary: storageData.tplLibrary || null,
                    savedUrlLists: storageData.savedUrlLists || storageData.xpider_saved_lists || null,
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

            // 3. Build canonical templates_v2 object schema { version: 2, templates: { [id]: tpl }, defaultId, recentIds }
            // to match popup CRUD, default selection, and background staged migration verification.
            let defaultId = null;
            const templatesDict = {};
            const recentIds = [];

            for (const t of templatesV2) {
                templatesDict[t.id] = t;
                recentIds.push(t.id);
                if (t.isDefault && !defaultId) {
                    defaultId = t.id;
                }
            }
            if (!defaultId && templatesV2.length > 0) {
                defaultId = templatesV2[0].id;
                templatesDict[defaultId].isDefault = true;
            }

            const canonicalTemplatesV2 = {
                version: 2,
                templates: templatesDict,
                defaultId: defaultId,
                recentIds: recentIds
            };

            // 4. Preserve savedUrlLists (F5: support both array and object-shaped lists without loss)
            const rawUrlLists = storageData.savedUrlLists !== undefined 
                ? storageData.savedUrlLists 
                : storageData.xpider_saved_lists;

            let savedUrlListsV2;
            if (Array.isArray(rawUrlLists)) {
                savedUrlListsV2 = [...rawUrlLists];
            } else if (rawUrlLists && typeof rawUrlLists === 'object') {
                savedUrlListsV2 = JSON.parse(JSON.stringify(rawUrlLists));
            } else {
                savedUrlListsV2 = [];
            }

            // 5. Verify converted templates
            for (const t of templatesV2) {
                if (!this.validateTemplate(t)) {
                    throw new Error(`Migration validation failed for template: ${JSON.stringify(t)}`);
                }
            }

            const migrationCommit = {
                ...backupPayload,
                templates_v2: canonicalTemplatesV2,
                savedUrlLists_v2: savedUrlListsV2,
                savedUrlLists: savedUrlListsV2,
                xpider_schema_version: 2,
                xpider_migration_ts: Date.now()
            };

            if (autoCommit && this.storage && typeof this.storage.set === 'function') {
                await new Promise((resolve, reject) => {
                    try {
                        let settled = false;
                        const onDone = (err) => {
                            if (settled) return;
                            settled = true;
                            if (err) reject(err);
                            else resolve();
                        };
                        const res1 = this.storage.set({ xpider_migration_phase: 'STAGE_COMMIT' }, (err) => {
                            if (err) return onDone(err);
                            const res2 = this.storage.set(migrationCommit, (err2) => {
                                if (err2) return onDone(err2);
                                const res3 = this.storage.set({ xpider_migration_phase: 'COMPLETED' }, (err3) => {
                                    if (err3) return onDone(err3);
                                    onDone();
                                });
                                if (res3 && typeof res3.catch === 'function') res3.catch(onDone);
                            });
                            if (res2 && typeof res2.catch === 'function') res2.catch(onDone);
                        });
                        if (res1 && typeof res1.catch === 'function') res1.catch(onDone);
                    } catch (e) {
                        reject(e);
                    }
                });
            }

            return {
                migrated: true,
                commit: migrationCommit,
                backupKey,
                templates: templatesV2,
                templates_v2: canonicalTemplatesV2,
                savedUrlLists: savedUrlListsV2
            };
        }

        _convertLegacyItem(item, fallbackName = 'Imported Template') {
            if (!item || typeof item !== 'object') {
                item = {};
            }
            const name = item.name || item.title || fallbackName;
            const sender = (item.sender && typeof item.sender === 'object') ? item.sender : {};
            const content = (item.content && typeof item.content === 'object') ? item.content : {};

            // Split name and full name handling
            let firstName = sender.firstName || item.firstName || item.first_name || '';
            let lastName = sender.lastName || item.lastName || item.last_name || '';
            let fullName = sender.fullName || item.fullName || item.name_val || '';

            if (!fullName && (firstName || lastName)) {
                fullName = `${firstName} ${lastName}`.trim();
            } else if (fullName && (!firstName && !lastName)) {
                const parts = fullName.trim().split(/\s+/);
                firstName = parts[0] || '';
                lastName = parts.slice(1).join(' ') || '';
            } else if (!fullName) {
                // Fallback only if no person name fields exist
                fullName = item.name_val || '';
            }

            // Custom fields and extra properties preservation
            const customFields = {
                ...(item.customFields || {}),
                ...(sender.customFields || {}),
                ...(item.extraFields || {})
            };

            const knownCoreKeys = [
                'name', 'title', 'sender', 'content', 'id', 'version', 'createdAt', 'updatedAt',
                'isDefault', 'default', 'aiInstructions', 'firstName', 'lastName', 'first_name',
                'last_name', 'fullName', 'name_val', 'company', 'company_val', 'email', 'email_val',
                'phone', 'phone_val', 'website', 'website_val', 'subject', 'subject_val', 'message',
                'message_val', 'customFields', 'extraFields'
            ];

            for (const [k, v] of Object.entries(item)) {
                if (!knownCoreKeys.includes(k) && customFields[k] === undefined) {
                    customFields[k] = v;
                }
            }

            return this.createTemplateData({
                name,
                sender: {
                    fullName,
                    firstName,
                    lastName,
                    company: sender.company || item.company_val || item.company || '',
                    email: sender.email || item.email_val || item.email || '',
                    phone: sender.phone || item.phone_val || item.phone || '',
                    website: sender.website || item.website_val || item.website || ''
                },
                content: {
                    subject: content.subject || item.subject_val || item.subject || '',
                    message: content.message || item.message_val || item.message || ''
                },
                customFields,
                aiInstructions: item.aiInstructions || '',
                isDefault: !!(item.isDefault || item.default)
            });
        }

        // =====================================================================
        // Phase 2B: Full Multi-Template CRUD Store Operations
        // =====================================================================

        async getStore() {
            if (!this.storage || typeof this.storage.get !== 'function') {
                return { version: 2, templates: {}, defaultId: null, recentIds: [] };
            }
            return new Promise((resolve) => {
                let resolved = false;
                const onData = (data) => {
                    if (resolved) return;
                    resolved = true;
                    const store = (data && data.templates_v2 && typeof data.templates_v2 === 'object')
                        ? data.templates_v2
                        : { version: 2, templates: {}, defaultId: null, recentIds: [] };
                    resolve(store);
                };
                const res = this.storage.get(['templates_v2'], onData);
                if (res && typeof res.then === 'function') {
                    res.then(onData).catch(() => {
                        if (!resolved) { resolved = true; resolve({ version: 2, templates: {}, defaultId: null, recentIds: [] }); }
                    });
                }
            });
        }

        async setStore(store) {
            if (!this.storage || typeof this.storage.set !== 'function') return;
            return new Promise((resolve, reject) => {
                let settled = false;
                const onDone = (err) => {
                    if (settled) return;
                    settled = true;
                    const lastErr = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
                        ? chrome.runtime.lastError
                        : (this.storage && this.storage.lastError);
                    if (lastErr) {
                        return reject(lastErr instanceof Error ? lastErr : new Error(lastErr.message || String(lastErr)));
                    }
                    if (err) {
                        return reject(err instanceof Error ? err : new Error(String(err)));
                    }
                    resolve();
                };
                try {
                    const res = this.storage.set({ templates_v2: store }, onDone);
                    if (res && typeof res.then === 'function') {
                        res.then(() => onDone()).catch(onDone);
                    }
                } catch (e) {
                    onDone(e);
                }
            });
        }

        async getAllTemplates() {
            const store = await this.getStore();
            return {
                templates: Object.values(store.templates || {}),
                templatesMap: store.templates || {},
                defaultId: store.defaultId,
                recentIds: store.recentIds || []
            };
        }

        async getTemplate(id) {
            const store = await this.getStore();
            if (store.templates && store.templates[id]) {
                return store.templates[id];
            }
            if (store.defaultId && store.templates && store.templates[store.defaultId]) {
                return store.templates[store.defaultId];
            }
            return null;
        }

        async saveTemplateRecord(tpl) {
            const store = await this.getStore();
            const canonical = this.createTemplateData(tpl, tpl.id ? { id: tpl.id } : {});
            const id = canonical.id;

            if (!store.templates) store.templates = {};
            store.templates[id] = canonical;
            if (!store.defaultId) store.defaultId = id;
            if (!store.recentIds) store.recentIds = [];
            if (!store.recentIds.includes(id)) store.recentIds.unshift(id);

            await this.setStore(store);

            if (store.defaultId === id && this.storage && typeof this.storage.set === 'function') {
                const legacy = {
                    firstName: canonical.firstName,
                    lastName: canonical.lastName,
                    name: canonical.fullName,
                    email: canonical.email,
                    phone: canonical.phone,
                    company: canonical.company,
                    website: canonical.website,
                    subject: canonical.subject,
                    message: canonical.message
                };
                await new Promise((resolve, reject) => {
                    let settled = false;
                    const onDone = (err) => {
                        if (settled) return;
                        settled = true;
                        const lastErr = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
                            ? chrome.runtime.lastError
                            : (this.storage && this.storage.lastError);
                        if (lastErr) return reject(lastErr instanceof Error ? lastErr : new Error(lastErr.message || String(lastErr)));
                        if (err) return reject(err instanceof Error ? err : new Error(String(err)));
                        resolve();
                    };
                    try {
                        const res = this.storage.set({ xpider_tpl: legacy }, onDone);
                        if (res && typeof res.then === 'function') res.then(() => onDone()).catch(onDone);
                    } catch (e) {
                        onDone(e);
                    }
                });
            }

            return canonical;
        }

        async setDefaultTemplate(id) {
            const store = await this.getStore();
            if (!store.templates || !store.templates[id]) {
                throw new Error(`Template not found: ${id}`);
            }
            store.defaultId = id;
            const tpl = store.templates[id];
            tpl.isDefault = true;

            for (const otherId of Object.keys(store.templates)) {
                if (otherId !== id) {
                    store.templates[otherId].isDefault = false;
                }
            }

            await this.setStore(store);

            if (this.storage && typeof this.storage.set === 'function') {
                const legacy = {
                    firstName: tpl.firstName,
                    lastName: tpl.lastName,
                    name: tpl.fullName,
                    email: tpl.email,
                    phone: tpl.phone,
                    company: tpl.company,
                    website: tpl.website,
                    subject: tpl.subject,
                    message: tpl.message
                };
                await new Promise((resolve, reject) => {
                    let settled = false;
                    const onDone = (err) => {
                        if (settled) return;
                        settled = true;
                        const lastErr = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
                            ? chrome.runtime.lastError
                            : (this.storage && this.storage.lastError);
                        if (lastErr) return reject(lastErr instanceof Error ? lastErr : new Error(lastErr.message || String(lastErr)));
                        if (err) return reject(err instanceof Error ? err : new Error(String(err)));
                        resolve();
                    };
                    try {
                        const res = this.storage.set({ xpider_tpl: legacy }, onDone);
                        if (res && typeof res.then === 'function') res.then(() => onDone()).catch(onDone);
                    } catch (e) {
                        onDone(e);
                    }
                });
            }

            return tpl;
        }

        async deleteTemplate(id) {
            const store = await this.getStore();
            if (!store.templates || !store.templates[id]) {
                throw new Error(`Template not found: ${id}`);
            }
            if (store.defaultId === id) {
                throw new Error("Cannot delete the default template. Set another template as default first.");
            }

            delete store.templates[id];
            if (store.recentIds) {
                store.recentIds = store.recentIds.filter(k => k !== id);
            }

            await this.setStore(store);
            return { deleted: true, id, defaultId: store.defaultId };
        }

        async duplicateAndSaveTemplate(id) {
            const store = await this.getStore();
            const original = store.templates ? store.templates[id] : null;
            if (!original) {
                throw new Error(`Original template not found: ${id}`);
            }

            const copy = this.duplicateTemplate(original);
            return await this.saveTemplateRecord(copy);
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

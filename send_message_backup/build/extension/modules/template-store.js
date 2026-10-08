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
        _extractMessage(item) {
            if (!item || typeof item !== 'object') return '';
            if (typeof item.message === 'string' && item.message.trim().length > 0) return item.message.trim();
            if (item.content && typeof item.content.message === 'string' && item.content.message.trim().length > 0) return item.content.message.trim();
            if (typeof item.message_val === 'string' && item.message_val.trim().length > 0) return item.message_val.trim();
            return '';
        }

        /**
         * Authoritative Legacy Migration & Idempotent Repair (R6.9G.10.3.4):
         * Converts legacy tplLibrary, xpider_tpl, and recent templates without data loss.
         * If already on schema v2, idempotently repairs empty default templates from xpider_tpl or backups.
         */
        async migrateLegacyData(storageData, autoCommit = false) {
            if (!storageData || typeof storageData !== 'object') {
                throw new Error("Invalid storage data provided for migration");
            }

            const currentVersion = storageData.xpider_schema_version || 0;

            // [R6.9G.10.3.4] Idempotent v2 inspection and backup-safe repair path
            if (currentVersion >= 2) {
                let templatesDict = {};
                let defaultId = null;
                let recentIds = [];

                if (storageData.templates_v2 && typeof storageData.templates_v2 === 'object') {
                    if (Array.isArray(storageData.templates_v2)) {
                        for (const t of storageData.templates_v2) {
                            if (t && t.id) templatesDict[t.id] = t;
                        }
                        defaultId = storageData.templates_v2[0]?.id || null;
                    } else {
                        templatesDict = { ...(storageData.templates_v2.templates || {}) };
                        defaultId = storageData.templates_v2.defaultId || null;
                        recentIds = Array.isArray(storageData.templates_v2.recentIds) ? [...storageData.templates_v2.recentIds] : [];
                    }
                }

                // Check default template message
                const defaultTpl = defaultId ? templatesDict[defaultId] : null;
                const defaultMsg = this._extractMessage(defaultTpl);

                if (defaultMsg.length > 0) {
                    console.log('[TEMPLATE_REPAIR] repaired=false source=canonical reason=CANONICAL_DEFAULT_ALREADY_VALID');
                    return {
                        migrated: false,
                        repaired: false,
                        reason: 'ALREADY_V2_VALID',
                        sourceCounts: Object.keys(templatesDict).length,
                        templates: Object.values(templatesDict),
                        templates_v2: { version: 2, templates: templatesDict, defaultId, recentIds },
                        savedUrlLists: storageData.savedUrlLists_v2 || storageData.savedUrlLists || storageData.xpider_saved_lists || []
                    };
                }

                // Canonical default message is empty or missing! Search for recoverable message
                let recoverableItem = null;
                let repairSource = 'none';

                // 1. Check storageData.xpider_tpl
                if (storageData.xpider_tpl && typeof storageData.xpider_tpl === 'object') {
                    const msg = this._extractMessage(storageData.xpider_tpl);
                    if (msg.length > 0) {
                        recoverableItem = storageData.xpider_tpl;
                        repairSource = 'xpider_tpl';
                    }
                }

                // 2. Check backups xpider_backup_v1_* (sorted newest first)
                if (!recoverableItem) {
                    const backupKeys = Object.keys(storageData).filter(k => k.startsWith('xpider_backup_v1_'));
                    backupKeys.sort((a, b) => {
                        const tsA = parseInt(a.replace('xpider_backup_v1_', '')) || 0;
                        const tsB = parseInt(b.replace('xpider_backup_v1_', '')) || 0;
                        return tsB - tsA;
                    });

                    for (const bk of backupKeys) {
                        const backup = storageData[bk];
                        if (!backup || typeof backup !== 'object') continue;

                        if (backup.xpider_tpl && typeof backup.xpider_tpl === 'object') {
                            const bMsg = this._extractMessage(backup.xpider_tpl);
                            if (bMsg.length > 0) {
                                recoverableItem = backup.xpider_tpl;
                                repairSource = 'backup-repair';
                                break;
                            }
                        }
                        if (backup.tplLibrary && typeof backup.tplLibrary === 'object') {
                            const libItems = Array.isArray(backup.tplLibrary) ? backup.tplLibrary : Object.values(backup.tplLibrary);
                            for (const item of libItems) {
                                const lMsg = this._extractMessage(item);
                                if (lMsg.length > 0) {
                                    recoverableItem = item;
                                    repairSource = 'backup-repair';
                                    break;
                                }
                            }
                            if (recoverableItem) break;
                        }
                    }
                }

                // 3. Check if another template in templatesDict has a non-empty message
                if (!recoverableItem) {
                    for (const t of Object.values(templatesDict)) {
                        const tMsg = this._extractMessage(t);
                        if (tMsg.length > 0) {
                            defaultId = t.id;
                            t.isDefault = true;
                            recoverableItem = t;
                            repairSource = 'templates_v2_alternate';
                            break;
                        }
                    }
                }

                if (recoverableItem && repairSource !== 'templates_v2_alternate') {
                    const recMsg = this._extractMessage(recoverableItem);
                    const recSub = recoverableItem.subject || (recoverableItem.content && recoverableItem.content.subject) || recoverableItem.subject_val || '';
                    const recEmail = recoverableItem.email || (recoverableItem.sender && recoverableItem.sender.email) || recoverableItem.email_val || '';
                    const recName = recoverableItem.name || recoverableItem.fullName || (recoverableItem.sender && (recoverableItem.sender.fullName || recoverableItem.sender.name)) || '';

                    if (defaultTpl) {
                        defaultTpl.message = recMsg;
                        if (!defaultTpl.content) defaultTpl.content = {};
                        defaultTpl.content.message = recMsg;
                        if (!defaultTpl.subject && recSub) {
                            defaultTpl.subject = recSub;
                            defaultTpl.content.subject = recSub;
                        }
                        if (!defaultTpl.email && recEmail) defaultTpl.email = recEmail;
                        if (!defaultTpl.fullName && recName) defaultTpl.fullName = recName;
                        defaultTpl.updatedAt = Date.now();
                    } else {
                        const newTpl = this._convertLegacyItem(recoverableItem, 'Default Template');
                        newTpl.isDefault = true;
                        templatesDict[newTpl.id] = newTpl;
                        defaultId = newTpl.id;
                        recentIds.unshift(defaultId);
                    }

                    const repairedTemplatesV2 = {
                        version: 2,
                        templates: templatesDict,
                        defaultId: defaultId,
                        recentIds: recentIds
                    };

                    const repairCommit = {
                        templates_v2: repairedTemplatesV2,
                        xpider_tpl: templatesDict[defaultId] || null,
                        xpider_repair_ts: Date.now()
                    };

                    if (autoCommit && this.storage && typeof this.storage.set === 'function') {
                        await new Promise((resolve, reject) => {
                            this.storage.set(repairCommit, (err) => {
                                if (err) reject(err); else resolve();
                            });
                        });
                    }

                    console.log(`[TEMPLATE_REPAIR] repaired=true source=${repairSource} reason=CANONICAL_DEFAULT_MESSAGE_EMPTY`);

                    return {
                        migrated: true,
                        repaired: true,
                        repairSource: repairSource,
                        reason: 'REPAIRED_EMPTY_DEFAULT',
                        commit: repairCommit,
                        sourceCounts: Object.keys(templatesDict).length,
                        templates: Object.values(templatesDict),
                        templates_v2: repairedTemplatesV2,
                        savedUrlLists: storageData.savedUrlLists_v2 || storageData.savedUrlLists || storageData.xpider_saved_lists || []
                    };
                }

                console.log('[TEMPLATE_REPAIR] repaired=false source=none reason=NO_RECOVERABLE_MESSAGE');
                return {
                    migrated: false,
                    repaired: false,
                    reason: 'NO_RECOVERABLE_MESSAGE',
                    sourceCounts: Object.keys(templatesDict).length,
                    templates: Object.values(templatesDict),
                    templates_v2: { version: 2, templates: templatesDict, defaultId, recentIds },
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

            // 2. Transform legacy sources (examine BOTH tplLibrary, xpider_tpl, and xpider_recent_templates)
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
            }

            let xpiderTplConverted = null;
            if (storageData.xpider_tpl && typeof storageData.xpider_tpl === 'object') {
                xpiderTplConverted = this._convertLegacyItem(storageData.xpider_tpl, 'Default Template');
                xpiderTplConverted._isXpiderTpl = true;
            }

            // Also check xpider_recent_templates
            if (Array.isArray(storageData.xpider_recent_templates)) {
                for (const item of storageData.xpider_recent_templates) {
                    if (item && typeof item === 'object') {
                        templatesV2.push(this._convertLegacyItem(item));
                    }
                }
            }

            // Deduplicate templates and ensure non-empty messages are preserved
            const templatesDict = {};
            const recentIds = [];
            let defaultId = null;

            const xpiderMsg = xpiderTplConverted ? this._extractMessage(xpiderTplConverted) : '';

            for (const t of templatesV2) {
                templatesDict[t.id] = t;
                recentIds.push(t.id);
            }

            if (xpiderTplConverted) {
                const anyHasMsg = Object.values(templatesDict).some(t => this._extractMessage(t).length > 0);
                if (!anyHasMsg && xpiderMsg.length > 0) {
                    templatesDict[xpiderTplConverted.id] = xpiderTplConverted;
                    defaultId = xpiderTplConverted.id;
                    xpiderTplConverted.isDefault = true;
                    recentIds.unshift(defaultId);
                } else if (!templatesDict[xpiderTplConverted.id]) {
                    const existingWithSameSubject = Object.values(templatesDict).find(t => 
                        (t.subject && xpiderTplConverted.subject && t.subject === xpiderTplConverted.subject) ||
                        (t.name && xpiderTplConverted.name && t.name === xpiderTplConverted.name)
                    );
                    if (existingWithSameSubject) {
                        if (!this._extractMessage(existingWithSameSubject) && xpiderMsg.length > 0) {
                            existingWithSameSubject.message = xpiderMsg;
                            if (existingWithSameSubject.content) existingWithSameSubject.content.message = xpiderMsg;
                        }
                    } else {
                        templatesDict[xpiderTplConverted.id] = xpiderTplConverted;
                        recentIds.push(xpiderTplConverted.id);
                    }
                }
            }

            // Priority rule for defaultId:
            // 1. Explicitly isDefault with non-empty message
            for (const t of Object.values(templatesDict)) {
                if (t.isDefault && this._extractMessage(t).length > 0) {
                    defaultId = t.id;
                    break;
                }
            }
            // 2. xpiderTplConverted if it has a non-empty message
            if (!defaultId && xpiderTplConverted && xpiderMsg.length > 0 && templatesDict[xpiderTplConverted.id]) {
                defaultId = xpiderTplConverted.id;
                templatesDict[defaultId].isDefault = true;
            }
            // 3. ANY template with non-empty message
            if (!defaultId) {
                for (const t of Object.values(templatesDict)) {
                    if (this._extractMessage(t).length > 0) {
                        defaultId = t.id;
                        t.isDefault = true;
                        break;
                    }
                }
            }
            // 4. Fallback to existing isDefault or first template
            if (!defaultId) {
                for (const t of Object.values(templatesDict)) {
                    if (t.isDefault) { defaultId = t.id; break; }
                }
            }
            if (!defaultId && Object.keys(templatesDict).length > 0) {
                defaultId = Object.keys(templatesDict)[0];
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
            for (const t of Object.values(templatesDict)) {
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
                sourceCounts: Object.keys(templatesDict).length,
                templates: Object.values(templatesDict),
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

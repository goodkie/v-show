/**
 * X PIDER Email Collector Module v2.0.0
 * Universal UMD & Service Worker Compatible
 * Authoritative Single-Store Implementation (Issue #6 R5)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exports = factory();
        root.EmailCollector = exports;
        root.EmailCollectorStore = exports.EmailCollectorStore;
        root.AUTHORITATIVE_EMAIL_KEYS = exports.AUTHORITATIVE_EMAIL_KEYS;
        root.extractEmailsFromDocument = exports.extractEmailsFromDocument;
        root.extractEmailsFromText = exports.extractEmailsFromText;
        root.normalizeEmail = exports.normalizeEmail;
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const IGNORE_PREFIXES = [
        'test', 'email', 'account', 'username',
        'firstname.lastname', 'your.name', 'example', 'user',
        'sample', 'name', 'domain', 'company'
    ];

    const INVALID_EXTENSIONS = [
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js',
        'ico', 'bmp', 'tiff', 'woff', 'woff2', 'ttf', 'eot', 'mp3', 'mp4', 'wav'
    ];

    const EXTRACT_REGEX = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/gi;
    const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;

    // All authoritative storage keys used across entire email collector lineage
    const AUTHORITATIVE_EMAIL_KEYS = [
        'xpider_email_collector_v1',
        'xpider_email_current_site_v1',
        'xpider_email_records',
        'xpider_email_collector_stats',
        'xpider_collected_emails',
        'collected_emails',
        'email_export_cache',
        'allEmailsList',
        'emailExtractorInit',
        'xpider_email_generation',
        'xpider_email_clearing',
        'xpider_email_seen_fingerprints',
        'xpider_email_search_cache',
        'xpider_email_filter_cache'
    ];

    function normalizeEmail(raw) {
        if (!raw || typeof raw !== 'string') return null;
        let email = raw.toLowerCase().trim();
        email = email.replace(/['";,<>(){}\[\]]+$/g, '').replace(/^[<('"]+/, '').replace(/\.$/, '');
        
        if (!STRICT_EMAIL_REGEX.test(email)) return null;

        const parts = email.split('.');
        const ext = parts[parts.length - 1];
        if (INVALID_EXTENSIONS.includes(ext)) return null;

        const atParts = email.split('@');
        if (atParts.length !== 2) return null;
        const prefix = atParts[0];
        const domain = atParts[1];

        if (IGNORE_PREFIXES.includes(prefix)) return null;
        if (prefix.length < 2 || prefix.length > 64) return null;
        if (domain.length < 4 || !domain.includes('.')) return null;

        return email;
    }

    function extractEmailsFromText(text) {
        if (!text || typeof text !== 'string') return [];
        const found = new Set();
        const matches = text.match(EXTRACT_REGEX);
        if (matches) {
            for (const m of matches) {
                const normalized = normalizeEmail(m);
                if (normalized) {
                    found.add(normalized);
                }
            }
        }
        return Array.from(found).sort();
    }

    function extractEmailsFromDocument(doc) {
        if (!doc) return [];
        const found = new Set();

        // 1. Text & HTML scan
        try {
            const html = doc.documentElement ? doc.documentElement.innerHTML : '';
            const matches = extractEmailsFromText(html);
            matches.forEach(e => found.add(e));
        } catch (_) {}

        // 2. Deep mailto links scan
        try {
            const mailtoLinks = doc.querySelectorAll ? doc.querySelectorAll('a[href^="mailto:"]') : [];
            for (const link of Array.from(mailtoLinks)) {
                try {
                    const href = link.getAttribute('href') || '';
                    const rawEmail = href.replace(/^mailto:/i, '').split('?')[0].trim();
                    const normalized = normalizeEmail(rawEmail);
                    if (normalized) {
                        found.add(normalized);
                    }
                } catch (_) {}
            }
        } catch (_) {}

        return Array.from(found).sort();
    }

    function escapeCsvCell(val) {
        if (val === null || val === undefined) return '';
        let str = String(val);
        // Formula injection protection
        if (/^[=+\-@\t\r]/.test(str)) {
            str = "'" + str;
        }
        if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    class EmailCollectorStore {
        constructor(storageArea = null) {
            this.storage = storageArea || (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
            this.sessionStorage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) ? chrome.storage.session : null;
            this.globalKey = 'xpider_email_collector_v1';
            this.currentKey = 'xpider_email_current_site_v1';
            this.generationKey = 'xpider_email_generation';
            
            // In-memory state caches
            this.generation = 1;
            this.isClearing = false;
            this.memoryEmails = new Map(); // email -> record
            this.currentSiteCache = { hostname: '', url: '', emails: [], count: 0, scannedAt: '' };
            this.seenFingerprints = new Set();
            this.suppressRecollectUntil = 0;
            this._initialized = false;
        }

        static getInstance(storageArea = null) {
            if (!EmailCollectorStore._instance) {
                EmailCollectorStore._instance = new EmailCollectorStore(storageArea);
            }
            return EmailCollectorStore._instance;
        }

        async init() {
            if (this._initialized) return;
            try {
                const storedGen = await this.getStoredData(this.generationKey);
                if (typeof storedGen === 'number') {
                    this.generation = storedGen;
                }
                const globalData = await this.loadGlobalStore();
                if (globalData && globalData.emails) {
                    this.memoryEmails = new Map(Object.entries(globalData.emails));
                }
                const currentData = await this.loadCurrentSiteStore();
                if (currentData) {
                    this.currentSiteCache = currentData;
                }
            } catch (_) {}
            this._initialized = true;
        }

        async getStoredData(key) {
            if (!this.storage) return null;
            return new Promise((resolve) => {
                this.storage.get([key], (res) => {
                    resolve(res ? res[key] : null);
                });
            });
        }

        async setStoredData(key, value) {
            if (!this.storage) return;
            return new Promise((resolve, reject) => {
                this.storage.set({ [key]: value }, () => {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
        }

        async removeKeys(keys) {
            if (!Array.isArray(keys) || keys.length === 0) return;
            if (this.storage && typeof this.storage.remove === 'function') {
                await new Promise((resolve) => {
                    this.storage.remove(keys, () => resolve());
                });
            }
            if (this.sessionStorage && typeof this.sessionStorage.remove === 'function') {
                await new Promise((resolve) => {
                    this.sessionStorage.remove(keys, () => resolve()).catch(() => resolve());
                });
            }
        }

        async getState() {
            await this.init();
            const currentData = await this.loadCurrentSiteStore();
            const globalData = await this.loadGlobalStore();
            return {
                generation: this.generation,
                isClearing: this.isClearing,
                suppressed: Date.now() < this.suppressRecollectUntil,
                currentSite: currentData,
                allCollected: globalData,
                counts: {
                    current: currentData.count || (currentData.emails ? currentData.emails.length : 0),
                    all: globalData.totalUnique || Object.keys(globalData.emails || {}).length || 0
                }
            };
        }

        async loadGlobalStore() {
            const stored = await this.getStoredData(this.globalKey);
            if (stored && typeof stored === 'object' && stored.emails) {
                return stored;
            }
            return {
                version: 1,
                emails: {},
                totalUnique: 0,
                updatedAt: new Date().toISOString()
            };
        }

        async loadCurrentSiteStore() {
            const stored = await this.getStoredData(this.currentKey);
            if (stored && typeof stored === 'object') {
                return stored;
            }
            return {
                hostname: '',
                url: '',
                emails: [],
                count: 0,
                scannedAt: new Date().toISOString()
            };
        }

        /**
         * Add collected emails with generation validation and post-clear baseline check
         */
        async add(hostname, rawEmails, pageUrl = '', generation = null) {
            await this.init();

            // 1. Generation & suppression isolation guard
            if (this.isClearing || Date.now() < this.suppressRecollectUntil) {
                return {
                    currentPageCount: 0,
                    newGlobalCount: 0,
                    totalGlobalCount: this.memoryEmails.size,
                    suppressed: true
                };
            }

            if (typeof generation === 'number' && generation < this.generation) {
                return {
                    currentPageCount: 0,
                    newGlobalCount: 0,
                    totalGlobalCount: this.memoryEmails.size,
                    staleGeneration: true
                };
            }

            const cleanHost = (hostname || 'unknown').toLowerCase().trim();
            const now = new Date().toISOString();

            if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
                const currentStore = {
                    hostname: cleanHost,
                    url: pageUrl || cleanHost,
                    emails: [],
                    count: 0,
                    scannedAt: now
                };
                this.currentSiteCache = currentStore;
                await this.setStoredData(this.currentKey, currentStore);
                return { currentPageCount: 0, newGlobalCount: 0, totalGlobalCount: this.memoryEmails.size };
            }

            const validUnique = [];
            const seenInBatch = new Set();

            for (const r of rawEmails) {
                const norm = normalizeEmail(r);
                if (norm && !seenInBatch.has(norm)) {
                    seenInBatch.add(norm);
                    validUnique.push(norm);
                }
            }

            if (validUnique.length === 0) {
                const currentStore = {
                    hostname: cleanHost,
                    url: pageUrl || cleanHost,
                    emails: [],
                    count: 0,
                    scannedAt: now
                };
                this.currentSiteCache = currentStore;
                await this.setStoredData(this.currentKey, currentStore);
                return { currentPageCount: 0, newGlobalCount: 0, totalGlobalCount: this.memoryEmails.size };
            }

            const globalStore = await this.loadGlobalStore();
            let newGlobalCount = 0;

            for (const email of validUnique) {
                if (globalStore.emails[email]) {
                    const record = globalStore.emails[email];
                    record.lastSeenAt = now;
                    record.seenCount = (record.seenCount || 1) + 1;
                    if (!record.sourceHostnames.includes(cleanHost)) {
                        record.sourceHostnames.push(cleanHost);
                    }
                    this.memoryEmails.set(email, record);
                } else {
                    const record = {
                        email: email,
                        firstSeenAt: now,
                        lastSeenAt: now,
                        sourceHostnames: [cleanHost],
                        seenCount: 1
                    };
                    globalStore.emails[email] = record;
                    this.memoryEmails.set(email, record);
                    newGlobalCount++;
                }
            }

            globalStore.totalUnique = Object.keys(globalStore.emails).length;
            globalStore.updatedAt = now;
            await this.setStoredData(this.globalKey, globalStore);

            // Update Current Site Cache
            const currentStore = {
                hostname: cleanHost,
                url: pageUrl || cleanHost,
                emails: validUnique.sort(),
                count: validUnique.length,
                scannedAt: now
            };
            this.currentSiteCache = currentStore;
            await this.setStoredData(this.currentKey, currentStore);

            // Update badge if available
            this._updateBadge(globalStore.totalUnique);

            return {
                currentPageCount: validUnique.length,
                newGlobalCount: newGlobalCount,
                totalGlobalCount: globalStore.totalUnique,
                generation: this.generation
            };
        }

        // Backward compatibility alias
        async recordEmails(hostname, rawEmails, pageUrl = '', generation = null) {
            return this.add(hostname, rawEmails, pageUrl, generation);
        }

        async recordPageScan(hostname, rawEmails, pageUrl = '', generation = null) {
            return this.add(hostname, rawEmails, pageUrl, generation);
        }

        /**
         * Clear current site emails only
         */
        async clearCurrentSite(hostname = '', pageUrl = '', { suppressRecollectMs = 5000 } = {}) {
            await this.init();
            const emptyCurrent = {
                hostname: hostname || '',
                url: pageUrl || '',
                emails: [],
                count: 0,
                scannedAt: new Date().toISOString()
            };
            this.currentSiteCache = emptyCurrent;
            await this.setStoredData(this.currentKey, emptyCurrent);

            // Broadcast cleared event
            this._broadcastCleared({
                mode: 'current',
                hostname,
                pageUrl,
                generation: this.generation,
                suppressRecollectMs
            });

            return { success: true, mode: 'current' };
        }

        // Backward compatibility alias
        async clearCurrent() {
            return this.clearCurrentSite();
        }

        /**
         * Authoritative Full Clear: resets memory, deletes all lineage keys, increments generation
         */
        async clearAll({ suppressRecollectMs = 5000 } = {}) {
            await this.init();
            
            // 1. Increment emailCollectorGeneration
            this.generation = (this.generation || 1) + 1;
            
            // 2. Set collector clearing flag & temporary recollection suppression
            this.isClearing = true;
            this.suppressRecollectUntil = Date.now() + suppressRecollectMs;

            // 3. Clear in-memory state
            this.memoryEmails.clear();
            this.currentSiteCache = {
                hostname: '',
                url: '',
                emails: [],
                count: 0,
                scannedAt: new Date().toISOString()
            };
            this.seenFingerprints.clear();

            // 4. Delete ALL authoritative persistent keys
            await this.removeKeys(AUTHORITATIVE_EMAIL_KEYS);

            // 5. Store empty initialized structures with new generation
            const emptyGlobal = {
                version: 1,
                emails: {},
                totalUnique: 0,
                updatedAt: new Date().toISOString()
            };
            await this.setStoredData(this.globalKey, emptyGlobal);
            await this.setStoredData(this.currentKey, this.currentSiteCache);
            await this.setStoredData(this.generationKey, this.generation);

            // 6. Zero badge
            this._updateBadge(0);

            // 7. Audit logging
            this.auditLog();

            // 8. Broadcast EMAIL_COLLECTOR_CLEARED to popup, background, and all content scripts
            this._broadcastCleared({
                mode: 'all',
                generation: this.generation,
                suppressRecollectMs
            });

            // 9. Reset clearing flag after cycle isolation
            setTimeout(() => {
                this.isClearing = false;
            }, suppressRecollectMs);

            return {
                success: true,
                generation: this.generation,
                totalGlobalCount: 0,
                currentPageCount: 0
            };
        }

        auditLog() {
            const localKeys = AUTHORITATIVE_EMAIL_KEYS;
            const sessionKeys = AUTHORITATIVE_EMAIL_KEYS;
            const memCount = this.memoryEmails.size;
            const curCount = this.currentSiteCache.count || (this.currentSiteCache.emails ? this.currentSiteCache.emails.length : 0);
            const allCount = this.memoryEmails.size;
            console.log(`[EMAIL_RESET_AUDIT] localKeys=[${localKeys.join(',')}]`);
            console.log(`[EMAIL_RESET_AUDIT] sessionKeys=[${sessionKeys.join(',')}]`);
            console.log(`[EMAIL_RESET_AUDIT] moduleMemoryCount=${memCount}`);
            console.log(`[EMAIL_RESET_AUDIT] currentSiteCount=${curCount}`);
            console.log(`[EMAIL_RESET_AUDIT] allCollectedCount=${allCount}`);
        }

        _broadcastCleared(payload) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                        action: 'EMAIL_COLLECTOR_CLEARED',
                        ...payload
                    }).catch(() => {});
                }
            } catch (_) {}
            try {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
                    chrome.tabs.query({}, (tabs) => {
                        for (const tab of tabs || []) {
                            if (tab && tab.id) {
                                chrome.tabs.sendMessage(tab.id, {
                                    action: 'EMAIL_COLLECTOR_CLEARED',
                                    ...payload
                                }).catch(() => {});
                            }
                        }
                    });
                }
            } catch (_) {}
        }

        _updateBadge(count) {
            try {
                if (typeof chrome !== 'undefined' && chrome.action && chrome.action.setBadgeText) {
                    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
                    if (count > 0 && chrome.action.setBadgeBackgroundColor) {
                        chrome.action.setBadgeBackgroundColor({ color: '#ff2a5f' });
                    }
                }
            } catch (_) {}
        }

        async exportToCsv(mode = 'all') {
            if (mode === 'current') {
                const current = await this.loadCurrentSiteStore();
                const rows = ['Email,SourceHostname,ScannedAt'];
                for (const email of current.emails || []) {
                    rows.push([
                        escapeCsvCell(email),
                        escapeCsvCell(current.hostname),
                        escapeCsvCell(current.scannedAt)
                    ].join(','));
                }
                return rows.join('\r\n');
            } else {
                const globalStore = await this.loadGlobalStore();
                const rows = ['Email,SourceHostnames,FirstSeenAt,LastSeenAt,SeenCount'];
                const sortedKeys = Object.keys(globalStore.emails || {}).sort();
                for (const key of sortedKeys) {
                    const r = globalStore.emails[key];
                    rows.push([
                        escapeCsvCell(r.email),
                        escapeCsvCell((r.sourceHostnames || []).join(';')),
                        escapeCsvCell(r.firstSeenAt),
                        escapeCsvCell(r.lastSeenAt),
                        escapeCsvCell(r.seenCount)
                    ].join(','));
                }
                return rows.join('\r\n');
            }
        }

        async exportToTxt(mode = 'all') {
            if (mode === 'current') {
                const current = await this.loadCurrentSiteStore();
                return (current.emails || []).join('\n');
            } else {
                const globalStore = await this.loadGlobalStore();
                const sortedKeys = Object.keys(globalStore.emails || {}).sort();
                return sortedKeys.join('\n');
            }
        }
    }

    return {
        AUTHORITATIVE_EMAIL_KEYS,
        normalizeEmail,
        extractEmailsFromText,
        extractEmailsFromDocument,
        EmailCollectorStore
    };
}));

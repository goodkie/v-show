/**
 * X PIDER Email Collector Module v1.0.0
 * Universal UMD & Service Worker Compatible
 * Ported & enhanced from Email_Extractor_Source reference
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
            this.globalKey = 'xpider_email_collector_v1';
            this.currentKey = 'xpider_email_current_site_v1';
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

        async recordEmails(hostname, rawEmails, pageUrl = '') {
            if (!Array.isArray(rawEmails) || rawEmails.length === 0) {
                return { currentPageCount: 0, newGlobalCount: 0, totalGlobalCount: 0 };
            }

            const cleanHost = (hostname || 'unknown').toLowerCase().trim();
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
                return { currentPageCount: 0, newGlobalCount: 0, totalGlobalCount: 0 };
            }

            const globalStore = await this.loadGlobalStore();
            const now = new Date().toISOString();
            let newGlobalCount = 0;

            for (const email of validUnique) {
                if (globalStore.emails[email]) {
                    const record = globalStore.emails[email];
                    record.lastSeenAt = now;
                    record.seenCount = (record.seenCount || 1) + 1;
                    if (!record.sourceHostnames.includes(cleanHost)) {
                        record.sourceHostnames.push(cleanHost);
                    }
                } else {
                    globalStore.emails[email] = {
                        email: email,
                        firstSeenAt: now,
                        lastSeenAt: now,
                        sourceHostnames: [cleanHost],
                        seenCount: 1
                    };
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
            await this.setStoredData(this.currentKey, currentStore);

            return {
                currentPageCount: validUnique.length,
                newGlobalCount: newGlobalCount,
                totalGlobalCount: globalStore.totalUnique
            };
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

        async clearCurrent() {
            const emptyCurrent = {
                hostname: '',
                url: '',
                emails: [],
                count: 0,
                scannedAt: new Date().toISOString()
            };
            await this.setStoredData(this.currentKey, emptyCurrent);
            return { success: true };
        }

        async clearAll() {
            const emptyGlobal = {
                version: 1,
                emails: {},
                totalUnique: 0,
                updatedAt: new Date().toISOString()
            };
            await this.setStoredData(this.globalKey, emptyGlobal);
            await this.clearCurrent();
            return { success: true };
        }
    }

    return {
        normalizeEmail,
        extractEmailsFromText,
        extractEmailsFromDocument,
        EmailCollectorStore
    };
}));

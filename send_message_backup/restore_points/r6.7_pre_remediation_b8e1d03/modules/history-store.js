/**
 * X PIDER History Store & Ledger Module (v2.0)
 * 
 * Implements:
 * 1. P2A-2: Strict Separation of ImportRow, Target, Attempt, and ResetEvent
 * 2. P2A-3: Suppression, Intentional Resend, Selective & Global Reset with Lock Guards
 * 3. P2A-4: Tenant-Preserving Target Normalization and Raw URL Retention
 * 4. P2A-5: RFC-4180 & Spreadsheet-Safe CSV Export Engine
 * 5. F1 & F4: Durable Backing Store Persistence and Strict Case-Sensitive Identity Isolation
 */

(function(root) {
    'use strict';

    class HistoryStore {
        constructor(storageAdapter = null) {
            this.storage = storageAdapter || (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
            this.importRows = [];    // ImportRow[]
            this.targets = new Map(); // targetIdentity -> Target
            this.attempts = [];       // Attempt[]
            this.resetEvents = [];    // ResetEvent[]
            this.currentGeneration = 1;
        }

        /**
         * F1 & R3: Persist all history structures to backing storage
         */
        async persist() {
            if (!this.storage || typeof this.storage.set !== 'function') return;
            const data = {
                xpider_history_rows: this.importRows,
                xpider_history_targets: Array.from(this.targets.entries()),
                xpider_history_attempts: this.attempts,
                xpider_history_resets: this.resetEvents,
                xpider_history_generation: this.currentGeneration,
                xpider_history_saved_at: Date.now()
            };
            await new Promise((resolve, reject) => {
                try {
                    let called = false;
                    const res = this.storage.set(data, () => {
                        if (called) return;
                        called = true;
                        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
                            return reject(chrome.runtime.lastError);
                        }
                        resolve();
                    });
                    if (res && typeof res.then === 'function') {
                        res.then(() => {
                            if (!called) { called = true; resolve(); }
                        }).catch(reject);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }

        /**
         * F1: Rehydrate history structures from backing storage
         */
        async load() {
            if (!this.storage || typeof this.storage.get !== 'function') return;
            const data = await new Promise((resolve) => {
                try {
                    let called = false;
                    const res = this.storage.get([
                        'xpider_history_rows',
                        'xpider_history_targets',
                        'xpider_history_attempts',
                        'xpider_history_resets',
                        'xpider_history_generation'
                    ], (out) => {
                        if (called) return;
                        called = true;
                        resolve(out);
                    });
                    if (res && typeof res.then === 'function') {
                        res.then((out) => {
                            if (!called) { called = true; resolve(out); }
                        }).catch(() => resolve({}));
                    }
                } catch (e) {
                    resolve({});
                }
            });

            if (data) {
                if (Array.isArray(data.xpider_history_rows)) this.importRows = data.xpider_history_rows;
                if (Array.isArray(data.xpider_history_targets)) this.targets = new Map(data.xpider_history_targets);
                if (Array.isArray(data.xpider_history_attempts)) this.attempts = data.xpider_history_attempts;
                if (Array.isArray(data.xpider_history_resets)) this.resetEvents = data.xpider_history_resets;
                if (typeof data.xpider_history_generation === 'number') this.currentGeneration = data.xpider_history_generation;
            }
        }

        /**
         * P2A-4 & F4: Tenant-preserving canonical identity normalization
         * Scheme and hostname are lowercase; path and query parameters preserve case sensitivity!
         */
        normalizeTargetIdentity(rawUrl) {
            if (!rawUrl || typeof rawUrl !== 'string') return '';
            try {
                let u = rawUrl.trim();
                if (!u.startsWith('http://') && !u.startsWith('https://')) {
                    if (!u.includes('.') || u.includes(' ') || u.includes('\n')) {
                        return '';
                    }
                    u = 'https://' + u;
                }
                const parsed = new URL(u);
                let hostname = parsed.hostname.toLowerCase();
                if (!hostname || !hostname.includes('.')) {
                    return '';
                }
                if (hostname.startsWith('www.')) hostname = hostname.substring(4);
                const protocol = 'https:';

                // Preserve exact case-sensitive path segments
                let pathname = parsed.pathname.replace(/\/+$/, '');
                if (pathname === '') pathname = '/';

                // Strip strictly marketing tracking parameters; preserve ref, tokens, and app queries with case intact
                const searchParams = new URLSearchParams(parsed.search);
                const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', '_ga', 'mc_cid', 'mc_eid'];
                for (const k of trackingKeys) {
                    searchParams.delete(k);
                }
                const queryString = searchParams.toString() ? '?' + searchParams.toString() : '';

                // Scheme and Hostname lowercase; pathname and query preserve original case!
                return `${protocol}//${hostname}${pathname}${queryString}`;
            } catch (e) {
                return rawUrl.trim();
            }
        }

        /**
         * [F7/P2A-2] Ingest source rows from file import.
         * @param {string[]} rawInputs - Exact raw strings for each source row (including non-URLs)
         * @param {string|null} importId - Optional import batch identifier
         * @param {number[]|null} sourceRowNumbers - Optional explicit 1-based row numbers from parser (actual file line numbers)
         */
        async ingestImportRows(rawInputs = [], importId = null, sourceRowNumbers = null, targetIdentities = null) {
            const batchImportId = importId || `imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const createdRows = [];

            for (let i = 0; i < rawInputs.length; i++) {
                const raw = rawInputs[i];
                // [F7] Use provided file line number, or fall back to 1-based ordinal
                const actualRowNumber = (Array.isArray(sourceRowNumbers) && sourceRowNumbers[i] != null)
                    ? sourceRowNumbers[i]
                    : i + 1;
                const rowId = `row_${batchImportId}_${actualRowNumber}`;

                // [F7] Use explicit target identity if provided by parser pass, else normalize raw input
                const providedIdentity = (Array.isArray(targetIdentities) && targetIdentities[i] !== undefined)
                    ? targetIdentities[i]
                    : null;
                const identity = providedIdentity ? this.normalizeTargetIdentity(providedIdentity) : this.normalizeTargetIdentity(raw);
                const isValid = !!identity && identity.startsWith('http');

                const row = {
                    rowId,
                    sourceRowId: actualRowNumber,   // [F7] actual file line number / logical record number
                    importId: batchImportId,
                    rawInputUrl: raw,
                    targetIdentity: isValid ? identity : null, // [F7] link preserved source row to extracted target identity
                    status: isValid ? 'PENDING' : 'INVALID_INPUT',
                    attemptId: null,
                    createdAt: Date.now()
                };

                this.importRows.push(row);
                createdRows.push(row);

                if (isValid && !this.targets.has(identity)) {
                    this.targets.set(identity, {
                        targetIdentity: identity,
                        rawSampleUrl: raw,
                        isSuppressed: false,
                        suppressionReason: null,
                        effectiveGeneration: 1,
                        lastAttemptId: null,
                        updatedTs: Date.now()
                    });
                }
            }

            await this.persist();
            return { importId: batchImportId, rows: createdRows };
        }

        /**
         * P2A-3: Check if a target identity is suppressed for the active generation
         */
        isSuppressed(targetIdentity) {
            const target = this.targets.get(targetIdentity);
            if (!target) return false;
            if (!target.isSuppressed) return false;
            // Suppressed if target's effective generation has not been reset past current generation
            return target.effectiveGeneration <= this.currentGeneration;
        }

        /**
         * [Phase 2B+ / Reliability R1] Check if a target has a durable prior execution attempt.
         * Counts: PREPARING, SUBMIT_PENDING, CONFIRMED_SUCCESS, FAILURE, DELIVERY_UNKNOWN.
         * Does NOT count: import-only rows, INVALID_INPUT with zero actual attempt.
         */
        hasPriorAttempt(targetIdentity, options = {}) {
            if (!targetIdentity) return false;
            const normId = this.normalizeTargetIdentity(targetIdentity) || targetIdentity;
            const allowedStatuses = options.statuses || [
                'PREPARING', 'SUBMIT_PENDING', 'CONFIRMED_SUCCESS', 'FAILURE', 'DELIVERY_UNKNOWN'
            ];
            return this.attempts.some(att => {
                if (att.targetIdentity !== normId && att.targetIdentity !== targetIdentity) return false;
                if (att.status === 'INVALID_INPUT' || att.reasonCode === 'INVALID_INPUT') return false;
                return allowedStatuses.includes(att.status);
            });
        }

        /**
         * P2A-2: Record an actual execution attempt.
         * @param {string|object} targetOrDesc - Raw URL string OR descriptor object {targetIdentity, ...}
         * @param {object} [opts] - Optional override: { outcome, reason }
         */
        async recordAttempt(targetOrDesc, opts = {}) {
            // Accept either a raw URL string or a full descriptor object
            let descriptor;
            if (typeof targetOrDesc === 'string') {
                const identity = this.normalizeTargetIdentity(targetOrDesc);
                descriptor = {
                    targetIdentity: identity || targetOrDesc,
                    sourceUrl: targetOrDesc,
                    sessionId: opts.sessionId || null,
                    templateId: opts.templateId || null,
                    templateVersion: opts.templateVersion || 1,
                    targetToken: opts.targetToken || null,
                    status: opts.status || (opts.outcome ? (opts.outcome === 'SUCCESS' ? 'CONFIRMED_SUCCESS' : 'FAILURE') : 'PREPARING'),
                    reasonCode: opts.reason || opts.reasonCode || 'PREPARING',
                    contactPageUrl: opts.contactPageUrl || null,
                    formPageUrl: opts.formPageUrl || null,
                    selectedCandidateUrl: opts.selectedCandidateUrl || null,
                    submittedFromUrl: opts.submittedFromUrl || null,
                    resultUrl: opts.resultUrl || null,
                    contactDiscoverySource: opts.contactDiscoverySource || null,
                    contactDiscoveryConfidence: opts.contactDiscoveryConfidence,
                    emailsFound: opts.emailsFound
                };
            } else {
                descriptor = targetOrDesc;
            }

            const targetIdentity = descriptor.targetIdentity || (descriptor.targetUrl ? this.normalizeTargetIdentity(descriptor.targetUrl) : '') || descriptor.targetUrl || '';
            const { sessionId, templateId, templateVersion, status, reasonCode, timing = {}, evidence = {} } = descriptor;
            const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            const sourceUrl = descriptor.sourceUrl || (typeof targetOrDesc === 'string' ? targetOrDesc : targetIdentity);
            let sourceHostname = '';
            try { sourceHostname = new URL(sourceUrl).hostname; } catch (_) { sourceHostname = targetIdentity; }

            const contactPageUrl = descriptor.contactPageUrl || null;
            let contactPageHostname = '';
            if (contactPageUrl) {
                try { contactPageHostname = new URL(contactPageUrl).hostname; } catch (_) { contactPageHostname = ''; }
            }

            const attempt = {
                attemptId,
                targetIdentity,
                sessionId,
                templateId,
                templateVersion: templateVersion || 1,
                targetToken: descriptor.targetToken || null,
                generationId: this.currentGeneration,
                status: status || 'DELIVERY_UNKNOWN',
                reasonCode: reasonCode || 'UNKNOWN',
                sourceUrl,
                sourceHostname,
                selectedCandidateUrl: descriptor.selectedCandidateUrl || null,
                contactPageUrl,
                contactPageHostname,
                contactDiscoverySource: descriptor.contactDiscoverySource || null,
                contactDiscoveryConfidence: descriptor.contactDiscoveryConfidence !== undefined ? descriptor.contactDiscoveryConfidence : 1.0,
                formPageUrl: descriptor.formPageUrl || null,
                submittedFromUrl: descriptor.submittedFromUrl || null,
                resultUrl: descriptor.resultUrl || null,
                isPreSubmitLocked: false,
                emailsFound: descriptor.emailsFound || 0,
                timing: {
                    intentTime: timing.intentTime || Date.now(),
                    finalizedTime: timing.finalizedTime || null,
                    durationMs: timing.durationMs || 0
                },
                evidence: evidence || {},
                createdAt: Date.now()
            };

            this.attempts.push(attempt);

            // Ensure target record exists
            if (!this.targets.has(targetIdentity)) {
                this.targets.set(targetIdentity, {
                    targetIdentity,
                    rawSampleUrl: typeof targetOrDesc === 'string' ? targetOrDesc : targetIdentity,
                    isSuppressed: false,
                    suppressionReason: null,
                    effectiveGeneration: 1,
                    lastAttemptId: null,
                    updatedTs: Date.now()
                });
            }

            // Update Target durable suppression state
            const target = this.targets.get(targetIdentity);
            if (target) {
                target.lastAttemptId = attemptId;
                target.updatedTs = Date.now();
                // Both CONFIRMED_SUCCESS and DELIVERY_UNKNOWN trigger suppression
                if (status === 'CONFIRMED_SUCCESS' || status === 'DELIVERY_UNKNOWN') {
                    target.isSuppressed = true;
                    target.suppressionReason = status;
                    target.effectiveGeneration = this.currentGeneration;
                }
            }

            // Link attempt back to corresponding ImportRows
            for (const row of this.importRows) {
                if (row.targetIdentity === targetIdentity && !row.attemptId) {
                    row.attemptId = attemptId;
                    row.status = status;
                }
            }

            // Do NOT persist here when status is PENDING_INTENT — caller will persist after
            if (status !== 'PENDING_INTENT') {
                await this.persist();
            }
            return { attemptId, attempt };
        }

        /**
         * [Section J & Hotfix R2] Update attempt contact page info with targetToken validation
         */
        updateAttemptContact(attemptId, contactInfo = {}, targetToken = null) {
            const attempt = this.attempts.find(a => a.attemptId === attemptId);
            if (!attempt) return false;

            // Attempt-scoped history write guard
            const incomingToken = targetToken || contactInfo.targetToken;
            if (attempt.targetToken && incomingToken && attempt.targetToken !== incomingToken) {
                console.warn(`[HistoryStore] HISTORY_STALE_DISCOVERY_WRITE_BLOCKED attemptId=${attemptId}`);
                return false;
            }

            if (incomingToken && !attempt.targetToken) {
                attempt.targetToken = incomingToken;
            }

            if (contactInfo.selectedCandidateUrl) {
                attempt.selectedCandidateUrl = contactInfo.selectedCandidateUrl;
            }

            // Only update contactPageUrl/formPageUrl if not locked before submit
            if (!attempt.isPreSubmitLocked) {
                if (contactInfo.contactPageUrl) {
                    try {
                        const parsed = new URL(contactInfo.contactPageUrl);
                        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                            attempt.contactPageUrl = contactInfo.contactPageUrl;
                            attempt.contactPageHostname = parsed.hostname || '';
                        }
                    } catch (_) {}
                }
                if (contactInfo.formPageUrl) {
                    try {
                        const parsed = new URL(contactInfo.formPageUrl);
                        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                            attempt.formPageUrl = contactInfo.formPageUrl;
                        }
                    } catch (_) {}
                }
            }

            // Lock pre-submit URLs if requested (applied after assigning URLs)
            if (contactInfo.lockPreSubmitUrls) {
                attempt.isPreSubmitLocked = true;
                if (contactInfo.submittedFromUrl) {
                    attempt.submittedFromUrl = contactInfo.submittedFromUrl;
                }
            }

            if (contactInfo.submittedFromUrl && !attempt.submittedFromUrl) {
                attempt.submittedFromUrl = contactInfo.submittedFromUrl;
            }
            if (contactInfo.resultUrl) {
                attempt.resultUrl = contactInfo.resultUrl;
            }
            if (contactInfo.contactDiscoverySource) attempt.contactDiscoverySource = contactInfo.contactDiscoverySource;
            if (contactInfo.contactDiscoveryConfidence !== undefined) attempt.contactDiscoveryConfidence = contactInfo.contactDiscoveryConfidence;
            if (contactInfo.emailsFound !== undefined) attempt.emailsFound = contactInfo.emailsFound;
            return true;
        }

        /**
         * F8: Settle a previously recorded PENDING_INTENT attempt with the final outcome.
         * @param {string} attemptId - ID returned from recordAttempt
         * @param {boolean} isSuccess - Whether the submission succeeded
         * @param {string} reason - Reason code string
         * @param {object} [extra={}] - Optional metadata (contactPageUrl, formPageUrl, emailsFound, resultUrl, targetToken)
         */
        async settleAttempt(attemptId, isSuccess, reason, extra = {}) {
            const attempt = this.attempts.find(a => a.attemptId === attemptId);
            if (!attempt) return { settled: false, reason: 'ATTEMPT_NOT_FOUND' };

            // Attempt-scoped token check
            if (extra.targetToken && attempt.targetToken && attempt.targetToken !== extra.targetToken) {
                console.warn(`[HistoryStore] HISTORY_STALE_DISCOVERY_WRITE_BLOCKED settleAttempt attemptId=${attemptId}`);
                return { settled: false, reason: 'HISTORY_STALE_DISCOVERY_WRITE_BLOCKED' };
            }

            const now = Date.now();
            const reasonCode = reason || (isSuccess ? 'SUCCESS_CONFIRMED' : 'UNKNOWN');

            // [F8] DELIVERY_UNKNOWN is a distinct final attempt status (not collapsed to FAILURE)
            if (reason === 'DELIVERY_UNKNOWN' || reasonCode === 'DELIVERY_UNKNOWN') {
                attempt.status = 'DELIVERY_UNKNOWN';
                attempt.reasonCode = 'DELIVERY_UNKNOWN';
            } else if (isSuccess) {
                attempt.status = 'CONFIRMED_SUCCESS';
                attempt.reasonCode = reasonCode;
            } else {
                attempt.status = 'FAILURE';
                attempt.reasonCode = reasonCode;
            }
            attempt.timing.finalizedTime = now;
            attempt.timing.durationMs = now - attempt.timing.intentTime;

            if (extra) {
                if (extra.resultUrl) {
                    attempt.resultUrl = extra.resultUrl;
                }
                if (extra.selectedCandidateUrl && !attempt.selectedCandidateUrl) {
                    attempt.selectedCandidateUrl = extra.selectedCandidateUrl;
                }
                if (extra.submittedFromUrl && !attempt.submittedFromUrl) {
                    attempt.submittedFromUrl = extra.submittedFromUrl;
                }
                // Never overwrite pre-submit locked contactPageUrl with post-submit/thank-you URL
                if (!attempt.isPreSubmitLocked) {
                    if (extra.contactPageUrl && !attempt.contactPageUrl) {
                        try {
                            const parsed = new URL(extra.contactPageUrl);
                            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                                attempt.contactPageUrl = extra.contactPageUrl;
                                attempt.contactPageHostname = parsed.hostname || '';
                            }
                        } catch (_) {}
                    }
                    if (extra.formPageUrl && !attempt.formPageUrl) {
                        try {
                            const parsed = new URL(extra.formPageUrl);
                            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                                attempt.formPageUrl = extra.formPageUrl;
                                attempt.formPageHostname = parsed.hostname || '';
                            }
                        } catch (_) {}
                    }
                    if (!attempt.contactPageUrl && isSuccess && attempt.selectedCandidateUrl) {
                        try {
                            const parsed = new URL(attempt.selectedCandidateUrl);
                            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                                attempt.contactPageUrl = attempt.selectedCandidateUrl;
                                attempt.contactPageHostname = parsed.hostname || '';
                            }
                        } catch (_) {}
                    }
                }
                if (extra.contactDiscoverySource && !attempt.contactDiscoverySource) {
                    attempt.contactDiscoverySource = extra.contactDiscoverySource;
                }
                if (extra.emailsFound !== undefined) attempt.emailsFound = extra.emailsFound;
            }

            // Update suppression state on the linked target
            const target = this.targets.get(attempt.targetIdentity);
            if (target) {
                target.lastAttemptId = attemptId;
                target.updatedTs = now;
                // [F8] CONFIRMED_SUCCESS and DELIVERY_UNKNOWN both suppress; FAILURE does NOT
                if (attempt.status === 'CONFIRMED_SUCCESS' || attempt.status === 'DELIVERY_UNKNOWN') {
                    target.isSuppressed = true;
                    target.suppressionReason = attempt.status;
                    target.effectiveGeneration = this.currentGeneration;
                }
                // FAILURE: isSuppressed remains false — target stays retryable
            }

            // Update linked import rows
            for (const row of this.importRows) {
                if (row.attemptId === attemptId) {
                    row.status = attempt.status;
                }
            }

            // Caller is responsible for calling persist() after
            return { settled: true, attemptId, status: attempt.status };
        }

        /**
         * P2A-3: Reset selected target identities
         */
        async applySelectiveReset(targetIdentities = []) {
            const targetList = Array.isArray(targetIdentities) ? targetIdentities : [targetIdentities];
            const affected = [];

            for (const rawId of targetList) {
                const norm = this.normalizeTargetIdentity(rawId);
                const target = this.targets.get(norm);
                if (target) {
                    target.isSuppressed = false;
                    target.effectiveGeneration = this.currentGeneration + 1; // Release suppression for current run
                    affected.push(norm);
                }
            }

            const resetEvent = {
                resetId: `rst_sel_${Date.now()}`,
                type: 'SELECTED',
                affectedTargets: affected,
                generation: this.currentGeneration,
                timestamp: Date.now()
            };
            this.resetEvents.push(resetEvent);

            await this.persist();
            return { success: true, affectedCount: affected.length, resetEvent };
        }

        /**
         * P2A-3: Reset all targets (Advances global generation, preserves historic audit rows)
         */
        async applyGlobalReset(activeSubmitLocksCount = 0) {
            if (activeSubmitLocksCount > 0) {
                throw new Error("CANNOT_RESET_WITH_ACTIVE_SUBMIT_LOCK: Active submission in flight.");
            }

            this.currentGeneration++;
            for (const [, target] of this.targets) {
                target.isSuppressed = false;
            }

            const resetEvent = {
                resetId: `rst_all_${Date.now()}`,
                type: 'ALL',
                newGeneration: this.currentGeneration,
                timestamp: Date.now()
            };
            this.resetEvents.push(resetEvent);

            await this.persist();
            return { success: true, newGeneration: this.currentGeneration, resetEvent };
        }

        /**
         * [Issue #6 R4 True Full Reset] Completely wipe all rows, targets, attempts, and resets
         */
        async clearAll() {
            this.importRows = [];
            this.targets = new Map();
            this.attempts = [];
            this.resetEvents = [];
            this.currentGeneration = 0;
            if (this.storage && typeof this.storage.remove === 'function') {
                await new Promise((resolve) => {
                    try {
                        let called = false;
                        const res = this.storage.remove([
                            'xpider_history_rows',
                            'xpider_history_targets',
                            'xpider_history_attempts',
                            'xpider_history_resets',
                            'xpider_history_generation'
                        ], () => {
                            if (called) return;
                            called = true;
                            resolve();
                        });
                        if (res && typeof res.then === 'function') {
                            res.then(() => {
                                if (!called) { called = true; resolve(); }
                            }).catch(() => resolve());
                        }
                    } catch (_) {
                        resolve();
                    }
                });
            }
            return { success: true, count: 0 };
        }

        /**
         * P2A-5 & Phase 2B (Correction 2): RFC-4180 and Spreadsheet-Safe CSV Generator
         * Includes additive TemplateId and TemplateVersion metadata columns.
         */
        exportToCsv(options = {}) {
            const safeFormula = options.safeFormula !== false; // Default true
            const headers = [
                "SourceRowId",
                "RawInputUrl",
                "TargetIdentity",
                "ImportId",
                "Status",
                "ReasonCode",
                "AttemptId",
                "Generation",
                "DurationMs",
                "Timestamp",
                "TemplateId",
                "TemplateVersion"
            ];

            const escapeCell = (val) => {
                if (val === null || val === undefined) return '""';
                let str = String(val);

                // Formula injection protection for spreadsheet view
                if (safeFormula && /^[=+\-@\t\r]/.test(str)) {
                    str = "'" + str;
                }

                if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                } else {
                    str = '"' + str + '"';
                }
                return str;
            };

            const lines = [headers.map(escapeCell).join(",")];

            // Join ImportRows with Attempts to guarantee 1:1 original row preservation
            for (const row of this.importRows) {
                const attempt = this.attempts.find(a => a.attemptId === row.attemptId);
                const rowLine = [
                    row.sourceRowId,
                    row.rawInputUrl,
                    row.targetIdentity,
                    row.importId,
                    row.status,
                    attempt ? attempt.reasonCode : (row.status === "INVALID_INPUT" ? "INVALID_INPUT" : "NOT_ATTEMPTED"),
                    row.attemptId || "",
                    attempt ? attempt.generationId : this.currentGeneration,
                    attempt ? attempt.timing.durationMs : 0,
                    attempt ? new Date(attempt.createdAt).toISOString() : new Date(row.createdAt).toISOString(),
                    attempt ? (attempt.templateId || "") : "",
                    attempt ? (attempt.templateVersion || "") : ""
                ];
                lines.push(rowLine.map(escapeCell).join(","));
            }

            return lines.join("\r\n");
        }

        /**
         * [Section K] Google Sheets RFC-4180 CSV Export Engine (16 Standard Columns)
         */
        exportGoogleSheetsCsv(options = {}) {
            const records = options.records || this.getFilteredRecords({ status: 'ALL', search: '', limit: 100000 }).records;
            const headers = [
                "Status",
                "Reason",
                "SourceURL",
                "ContactPageURL",
                "FormPageURL",
                "SourceHostname",
                "ContactPageHostname",
                "ContactDiscoverySource",
                "StartedAt",
                "CompletedAt",
                "DurationMs",
                "TemplateId",
                "TemplateVersion",
                "EmailsFound",
                "AttemptId",
                "SessionId"
            ];

            const escapeCell = (val) => {
                if (val === null || val === undefined) return '""';
                let str = String(val);

                // Formula injection protection for spreadsheets
                if (/^[=+\-@\t\r]/.test(str)) {
                    str = "'" + str;
                }

                if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                } else {
                    str = '"' + str + '"';
                }
                return str;
            };

            const lines = [headers.map(escapeCell).join(",")];

            for (const r of records) {
                const rowLine = [
                    r.status || "",
                    r.reasonCode || "",
                    r.sourceUrl || r.rawUrl || r.targetIdentity || "",
                    r.contactPageUrl || r.selectedCandidateUrl || "",
                    r.formPageUrl || "",
                    r.sourceHostname || "",
                    r.contactPageHostname || "",
                    r.contactDiscoverySource || "",
                    r.startedAt || (r.timestamp ? new Date(r.timestamp).toISOString() : ""),
                    r.completedAt || "",
                    r.durationMs !== undefined ? r.durationMs : 0,
                    r.templateId || "",
                    r.templateVersion || "",
                    r.emailsFound !== undefined ? r.emailsFound : 0,
                    r.attemptId || "",
                    r.sessionId || ""
                ];
                lines.push(rowLine.map(escapeCell).join(","));
            }

            return lines.join("\r\n");
        }

        exportCsv(options = {}) {
            return this.exportToCsv(options);
        }

        /**
         * Phase 2B & Section J/K: Query ledger records with filtering, searching, and pagination.
         * @param {object} options
         * @param {string} [options.status='ALL'] - Filter by status
         * @param {string} [options.search=''] - Substring filter for domain/URL/reason
         * @param {number} [options.limit=50] - Number of records to return
         * @param {number} [options.offset=0] - Offset for pagination
         */
        getFilteredRecords(options = {}) {
            const { status = 'ALL', search = '', limit = 50, offset = 0 } = options;

            const records = [];

            if (this.importRows && this.importRows.length > 0) {
                for (const row of this.importRows) {
                    const target = row.targetIdentity ? this.targets.get(row.targetIdentity) : null;
                    const effectiveAttemptId = row.attemptId || (target ? target.lastAttemptId : null);
                    const attempt = effectiveAttemptId ? this.attempts.find(a => a.attemptId === effectiveAttemptId) : null;
                    const isSuppressed = row.targetIdentity ? this.isSuppressed(row.targetIdentity) : false;

                    const sourceUrl = (attempt && attempt.sourceUrl) ? attempt.sourceUrl : (row.rawInputUrl || row.targetIdentity);
                    let sourceHostname = (attempt && attempt.sourceHostname) ? attempt.sourceHostname : '';
                    if (!sourceHostname && sourceUrl) {
                        try { sourceHostname = new URL(sourceUrl).hostname; } catch (_) { sourceHostname = row.targetIdentity; }
                    }

                    records.push({
                        id: row.rowId,
                        sourceRowId: row.sourceRowId,
                        rawUrl: row.rawInputUrl,
                        sourceUrl,
                        sourceHostname,
                        contactPageUrl: attempt ? (attempt.contactPageUrl || '') : '',
                        contactPageHostname: attempt ? (attempt.contactPageHostname || '') : '',
                        selectedCandidateUrl: attempt ? (attempt.selectedCandidateUrl || '') : '',
                        submittedFromUrl: attempt ? (attempt.submittedFromUrl || '') : '',
                        resultUrl: attempt ? (attempt.resultUrl || '') : '',
                        contactDiscoverySource: attempt ? (attempt.contactDiscoverySource || '') : '',
                        formPageUrl: attempt ? (attempt.formPageUrl || '') : '',
                        emailsFound: attempt ? (attempt.emailsFound !== undefined ? attempt.emailsFound : 0) : 0,
                        targetIdentity: row.targetIdentity,
                        status: attempt ? attempt.status : row.status,
                        reasonCode: attempt ? attempt.reasonCode : (row.status === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'PENDING'),
                        attemptId: row.attemptId,
                        sessionId: attempt ? (attempt.sessionId || '') : '',
                        isSuppressed,
                        suppressionReason: target ? target.suppressionReason : null,
                        generationId: attempt ? attempt.generationId : this.currentGeneration,
                        templateId: attempt ? (attempt.templateId || null) : null,
                        templateVersion: attempt ? (attempt.templateVersion || null) : null,
                        durationMs: attempt ? attempt.timing.durationMs : 0,
                        startedAt: attempt ? new Date(attempt.timing.intentTime || attempt.createdAt).toISOString() : new Date(row.createdAt).toISOString(),
                        completedAt: (attempt && attempt.timing && attempt.timing.finalizedTime) ? new Date(attempt.timing.finalizedTime).toISOString() : '',
                        timestamp: attempt ? attempt.createdAt : row.createdAt
                    });
                }
            } else {
                let rowIdx = 1;
                for (const [identity, target] of this.targets.entries()) {
                    const attempt = target.lastAttemptId ? this.attempts.find(a => a.attemptId === target.lastAttemptId) : null;
                    const isSuppressed = this.isSuppressed(identity);
                    const sourceUrl = (attempt && attempt.sourceUrl) ? attempt.sourceUrl : (target.rawSampleUrl || identity);
                    let sourceHostname = (attempt && attempt.sourceHostname) ? attempt.sourceHostname : '';
                    if (!sourceHostname && sourceUrl) {
                        try { sourceHostname = new URL(sourceUrl).hostname; } catch (_) { sourceHostname = identity; }
                    }

                    records.push({
                        id: `tgt_${rowIdx}`,
                        sourceRowId: rowIdx++,
                        rawUrl: target.rawSampleUrl || identity,
                        sourceUrl,
                        sourceHostname,
                        contactPageUrl: attempt ? (attempt.contactPageUrl || '') : '',
                        contactPageHostname: attempt ? (attempt.contactPageHostname || '') : '',
                        selectedCandidateUrl: attempt ? (attempt.selectedCandidateUrl || '') : '',
                        submittedFromUrl: attempt ? (attempt.submittedFromUrl || '') : '',
                        resultUrl: attempt ? (attempt.resultUrl || '') : '',
                        contactDiscoverySource: attempt ? (attempt.contactDiscoverySource || '') : '',
                        formPageUrl: attempt ? (attempt.formPageUrl || '') : '',
                        emailsFound: attempt ? (attempt.emailsFound !== undefined ? attempt.emailsFound : 0) : 0,
                        targetIdentity: identity,
                        status: attempt ? attempt.status : (isSuppressed ? 'SUPPRESSED' : 'READY'),
                        reasonCode: attempt ? attempt.reasonCode : 'NONE',
                        attemptId: target.lastAttemptId,
                        sessionId: attempt ? (attempt.sessionId || '') : '',
                        isSuppressed,
                        suppressionReason: target.suppressionReason,
                        generationId: attempt ? attempt.generationId : target.effectiveGeneration,
                        templateId: attempt ? (attempt.templateId || null) : null,
                        templateVersion: attempt ? (attempt.templateVersion || null) : null,
                        durationMs: attempt ? attempt.timing.durationMs : 0,
                        startedAt: attempt ? new Date(attempt.timing.intentTime || attempt.createdAt).toISOString() : new Date(target.updatedTs || Date.now()).toISOString(),
                        completedAt: (attempt && attempt.timing && attempt.timing.finalizedTime) ? new Date(attempt.timing.finalizedTime).toISOString() : '',
                        timestamp: target.updatedTs || Date.now()
                    });
                }
            }

            let filtered = records;
            if (status && status !== 'ALL') {
                const s = status.toUpperCase();
                if (s === 'SUPPRESSED') {
                    filtered = filtered.filter(r => r.isSuppressed);
                } else if (s === 'SUCCESS' || s === 'CONFIRMED_SUCCESS') {
                    filtered = filtered.filter(r => r.status === 'CONFIRMED_SUCCESS');
                } else if (s === 'DELIVERY_UNKNOWN' || s === 'UNKNOWN') {
                    filtered = filtered.filter(r => r.status === 'DELIVERY_UNKNOWN');
                } else if (s === 'FAILED' || s === 'FAILURE') {
                    filtered = filtered.filter(r => r.status === 'FAILURE');
                } else if (s === 'INVALID' || s === 'INVALID_INPUT') {
                    filtered = filtered.filter(r => r.status === 'INVALID_INPUT');
                } else if (s === 'PREPARING') {
                    filtered = filtered.filter(r => r.status === 'PREPARING' || r.reasonCode === 'PREPARING');
                } else if (s === 'SUBMIT_PENDING') {
                    filtered = filtered.filter(r => r.status === 'SUBMIT_PENDING' || r.status === 'PENDING_INTENT');
                } else if (s === 'SKIPPED' || s === 'HISTORY_SKIPPED') {
                    filtered = filtered.filter(r => r.status === 'SKIPPED' || r.reasonCode === 'HISTORY_SKIPPED' || r.reasonCode === 'ALREADY_ATTEMPTED');
                } else if (s === 'INTERRUPTED' || s === 'STALE_PREPARING') {
                    filtered = filtered.filter(r => r.status === 'INTERRUPTED' || r.reasonCode === 'INTERRUPTED_PAUSE' || r.reasonCode === 'STALE_PREPARING');
                } else {
                    filtered = filtered.filter(r => r.status === s);
                }
            }

            if (search && search.trim()) {
                const q = search.trim().toLowerCase();
                filtered = filtered.filter(r => {
                    return (r.rawUrl && r.rawUrl.toLowerCase().includes(q)) ||
                           (r.sourceUrl && r.sourceUrl.toLowerCase().includes(q)) ||
                           (r.contactPageUrl && r.contactPageUrl.toLowerCase().includes(q)) ||
                           (r.targetIdentity && r.targetIdentity.toLowerCase().includes(q)) ||
                           (r.reasonCode && r.reasonCode.toLowerCase().includes(q));
                });
            }

            const totalCount = filtered.length;
            const paginated = filtered.slice(offset, offset + limit);

            return {
                totalCount,
                offset,
                limit,
                records: paginated
            };
        }

        /**
         * Phase 2B (Correction 1): Query retryable failed target identities without mutating suppression or generation.
         * Returns distinct target identities whose last attempt was FAILURE and are not suppressed.
         */
        getRetryableFailedIdentities() {
            const failedSet = new Set();
            const lastAttemptMap = new Map();
            for (const attempt of this.attempts) {
                lastAttemptMap.set(attempt.targetIdentity, attempt);
            }
            for (const [identity, attempt] of lastAttemptMap.entries()) {
                if (attempt.status === 'FAILURE') {
                    if (!this.isSuppressed(identity)) {
                        failedSet.add(identity);
                    }
                }
            }
            return Array.from(failedSet);
        }

        getFailedTargetIdentities() {
            return this.getRetryableFailedIdentities();
        }

        /**
         * [Issue #6 R4.1] Authoritative Clear: physically empty all rows, targets, attempts, resets, and storage keys
         */
        async clearAll() {
            this.importRows = [];
            this.targets.clear();
            this.attempts = [];
            this.resetEvents = [];
            this.currentGeneration = 0;
            if (this.storage && typeof this.storage.remove === 'function') {
                await new Promise((resolve) => {
                    this.storage.remove([
                        'xpider_history_rows',
                        'xpider_history_targets',
                        'xpider_history_attempts',
                        'xpider_history_resets',
                        'xpider_history_generation',
                        'xpider_history_saved_at',
                        'xpider_suppressions'
                    ], () => resolve());
                });
            }
        }
    }

    // Universal Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { HistoryStore };
    }
    if (typeof root !== 'undefined') {
        root.HistoryStore = HistoryStore;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

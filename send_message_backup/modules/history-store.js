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
                    sessionId: opts.sessionId || null,
                    templateId: opts.templateId || null,
                    templateVersion: opts.templateVersion || 1,
                    status: opts.status || (opts.outcome ? (opts.outcome === 'SUCCESS' ? 'CONFIRMED_SUCCESS' : 'FAILURE') : 'PREPARING'),
                    reasonCode: opts.reason || opts.reasonCode || 'PREPARING'
                };
            } else {
                descriptor = targetOrDesc;
            }

            const { targetIdentity, sessionId, templateId, templateVersion, status, reasonCode, timing = {}, evidence = {} } = descriptor;
            const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const attempt = {
                attemptId,
                targetIdentity,
                sessionId,
                templateId,
                templateVersion: templateVersion || 1,
                generationId: this.currentGeneration,
                status: status || 'DELIVERY_UNKNOWN',
                reasonCode: reasonCode || 'UNKNOWN',
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
         * F8: Settle a previously recorded PENDING_INTENT attempt with the final outcome.
         * @param {string} attemptId - ID returned from recordAttempt
         * @param {boolean} isSuccess - Whether the submission succeeded
         * @param {string} reason - Reason code string
         */
        async settleAttempt(attemptId, isSuccess, reason) {
            const attempt = this.attempts.find(a => a.attemptId === attemptId);
            if (!attempt) return { settled: false, reason: 'ATTEMPT_NOT_FOUND' };

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
         * P2A-5: RFC-4180 and Spreadsheet-Safe CSV Generator
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
                "Timestamp"
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
                    attempt ? new Date(attempt.createdAt).toISOString() : new Date(row.createdAt).toISOString()
                ];
                lines.push(rowLine.map(escapeCell).join(","));
            }

            return lines.join("\r\n");
        }

        exportCsv(options = {}) {
            return this.exportToCsv(options);
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

/**
 * X PIDER History Store & Ledger Module (v2.0)
 * 
 * Implements:
 * 1. P2A-2: Strict Separation of ImportRow, Target, Attempt, and ResetEvent
 * 2. P2A-3: Suppression, Intentional Resend, Selective & Global Reset with Lock Guards
 * 3. P2A-4: Tenant-Preserving Target Normalization and Raw URL Retention
 * 4. P2A-5: RFC-4180 & Spreadsheet-Safe CSV Export Engine
 */

(function(root) {
    'use strict';

    class HistoryStore {
        constructor() {
            this.importRows = [];    // ImportRow[]
            this.targets = new Map(); // targetIdentity -> Target
            this.attempts = [];       // Attempt[]
            this.resetEvents = [];    // ResetEvent[]
            this.currentGeneration = 1;
        }

        /**
         * P2A-4: Tenant-preserving canonical identity normalization
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

                // Preserve meaningful path segments (e.g. hosted tenant blogs: platform.com/store/contact)
                let pathname = parsed.pathname.replace(/\/+$/, '');
                if (pathname === '') pathname = '/';

                // Strip strictly marketing tracking parameters; preserve meaningful ref, app, and tenant queries per R1
                const searchParams = new URLSearchParams(parsed.search);
                const trackingKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', '_ga', 'mc_cid', 'mc_eid'];
                for (const k of trackingKeys) {
                    searchParams.delete(k);
                }
                const queryString = searchParams.toString() ? '?' + searchParams.toString() : '';

                return `${parsed.protocol}//${hostname}${pathname}${queryString}`.toLowerCase();
            } catch (e) {
                return rawUrl.trim().toLowerCase();
            }
        }

        /**
         * P2A-2: Ingest user imported rows without inventing fake submit attempts
         */
        ingestImportRows(rawUrls = [], importId = null) {
            const batchImportId = importId || `imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const createdRows = [];

            for (let i = 0; i < rawUrls.length; i++) {
                const raw = rawUrls[i];
                const rowId = `row_${batchImportId}_${i + 1}`;
                const identity = this.normalizeTargetIdentity(raw);
                const isValid = !!identity && identity.startsWith('http');

                const row = {
                    rowId,
                    sourceRowId: i + 1,
                    importId: batchImportId,
                    rawInputUrl: raw,
                    targetIdentity: identity,
                    status: isValid ? "PENDING" : "INVALID_INPUT",
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
         * P2A-2: Record an actual execution attempt
         */
        recordAttempt({ targetIdentity, sessionId, templateId, templateVersion, status, reasonCode, timing = {}, evidence = {} }) {
            const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const attempt = {
                attemptId,
                targetIdentity,
                sessionId,
                templateId,
                templateVersion: templateVersion || 1,
                generationId: this.currentGeneration,
                status: status || "DELIVERY_UNKNOWN",
                reasonCode: reasonCode || "UNKNOWN",
                timing: {
                    intentTime: timing.intentTime || Date.now(),
                    finalizedTime: timing.finalizedTime || Date.now(),
                    durationMs: timing.durationMs || 0
                },
                evidence: evidence || {},
                createdAt: Date.now()
            };

            this.attempts.push(attempt);

            // Update Target durable suppression state
            const target = this.targets.get(targetIdentity);
            if (target) {
                target.lastAttemptId = attemptId;
                target.updatedTs = Date.now();
                // Both CONFIRMED_SUCCESS and DELIVERY_UNKNOWN trigger suppression
                if (status === "CONFIRMED_SUCCESS" || status === "DELIVERY_UNKNOWN") {
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

            return attempt;
        }

        /**
         * P2A-3: Reset selected target identities
         */
        applySelectiveReset(targetIdentities = []) {
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

            return { success: true, affectedCount: affected.length, resetEvent };
        }

        /**
         * P2A-3: Reset all targets (Advances global generation, preserves historic audit rows)
         */
        applyGlobalReset(activeSubmitLocksCount = 0) {
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
    }

    // Universal Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { HistoryStore };
    }
    if (typeof root !== 'undefined') {
        root.HistoryStore = HistoryStore;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));

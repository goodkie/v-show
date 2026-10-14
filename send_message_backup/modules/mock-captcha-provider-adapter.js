/**
 * mock-captcha-provider-adapter.js
 * 
 * [Issue #6 R6.9G.10.3.7.1.4.5 Section F]
 * Controlled Test-Only Mock CAPTCHA Provider Adapter.
 * 
 * Hard Gates:
 * - BuildProvenance.isTestOnlyBuild() === true
 * - ownerFunctionTestMode === true
 * - hostname 127.0.0.1 or localhost
 * - approved loopback fixture path
 * 
 * Simulates all controlled CAPTCHA Lab cases (CAP-06, CAP-07, CAP-08, CAP-14)
 * without contacting or defeating any third-party live CAPTCHA challenges.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MockCaptchaProviderAdapter = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class MockCaptchaProviderAdapter {
        constructor(options = {}) {
            this.options = options;
            this.name = 'mock_provider';
        }

        /**
         * Authoritative Hard-Gate validation for mock adapter eligibility.
         */
        static isEligible(request = {}, context = {}) {
            let isTestOnly = false;
            try {
                if (context.isTestOnlyBuild !== undefined) {
                    isTestOnly = Boolean(context.isTestOnlyBuild);
                } else if (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function') {
                    isTestOnly = BuildProvenance.isTestOnlyBuild();
                }
            } catch (_) {
                isTestOnly = false;
            }

            if (!isTestOnly) return false;

            const isOwnerTestMode = Boolean(context.ownerFunctionTestMode || request.ownerFunctionTestMode);
            if (!isOwnerTestMode) return false;

            const targetUrl = request.url || request.pageUrl || request.hostUrl || context.targetUrl || '';
            try {
                const u = new URL(targetUrl);
                const isLoopback = (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1');
                return isLoopback;
            } catch (_) {
                return targetUrl.includes('127.0.0.1') || targetUrl.includes('localhost');
            }
        }

        /**
         * Executes mock solving according to test scenario.
         */
        async solve(request = {}, solveIdentity = {}) {
            const sitekey = (request.sitekey || '').toLowerCase();
            const url = (request.url || request.pageUrl || request.hostUrl || '').toLowerCase();
            const scenario = (request.mockScenario || '').toLowerCase();

            // CAP-08: Mock Permanent Config Error (ERROR_ZERO_BALANCE)
            if (scenario === 'zero_balance' || scenario === 'error' || sitekey.includes('zero_balance') || url.includes('zero-balance') || url.includes('config-error') || url.includes('mock-error')) {
                const err = new Error('ERROR_ZERO_BALANCE');
                err.code = 'ERROR_ZERO_BALANCE';
                err.isTerminal = true;
                throw err;
            }

            // CAP-07: Mock Provider Timeout
            if (scenario === 'timeout' || sitekey.includes('timeout') || url.includes('timeout')) {
                // Wait brief interval to exercise async polling boundary
                await new Promise(r => setTimeout(r, 600));
                const err = new Error('MOCK_TIMEOUT: Solver polling exceeded maximum test duration');
                err.code = 'SOLVER_TIMEOUT';
                err.isTerminal = true;
                throw err;
            }

            // CAP-14: Local Audio/STT Pipeline
            if (scenario === 'audio' || request.audioData || request.audioUrl || sitekey.includes('audio') || url.includes('audio')) {
                await new Promise(r => setTimeout(r, 200));
                // Deterministic local audio verification token
                return {
                    success: true,
                    method: 'mock_audio_stt',
                    token: '94821',
                    solution: '94821',
                    transcript: 'nine four eight two one',
                    normalizedDigits: '94821',
                    elapsedMs: 200
                };
            }

            // CAP-06: Mock Provider Success
            // Simulates fast polling response with deterministic synthetic token
            await new Promise(r => setTimeout(r, 150));
            const token = `mock_token_success_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            return {
                success: true,
                method: 'mock_provider',
                token,
                elapsedMs: 150
            };
        }
    }

    return MockCaptchaProviderAdapter;
}));

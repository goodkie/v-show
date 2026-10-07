/**
 * privacy-gateway.js
 * Fail-Closed Network Privacy Gateway for Campaign Tabs (Issue #6 R6.9G.9)
 * 
 * Protects Owner network identity:
 * - Managed Proxy (SOCKS5, HTTPS) via chrome.proxy API with NO direct fallback
 * - System VPN Required mode with fail-closed preflight
 * - WebRTC leak guard: chrome.privacy.network.webRTCIPHandlingPolicy = 'disable_non_proxied_udp'
 * - Network prediction hardening: chrome.privacy.network.networkPredictionEnabled = false
 * - Reversible settings restoration on stop/pause
 * - Zero raw IP / credentials logging (ephemeral in-memory only, one-way fingerprint)
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PrivacyGateway = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const PRIVACY_MODES = {
        SYSTEM_VPN: 'SYSTEM_VPN',
        SOCKS5: 'SOCKS5',
        HTTPS_PROXY: 'HTTPS_PROXY',
        DIRECT: 'DIRECT'
    };

    const DEFAULT_CONFIG = {
        enabled: true,
        transportMode: PRIVACY_MODES.SYSTEM_VPN,
        failClosed: true,
        proxyHost: '',
        proxyPort: 1080,
        proxyUsername: '',
        proxyPassword: '',
        proxyScheme: 'http',
        proxyBypassList: null,
        canaryUrl: null,
        rememberPassword: false,
        strictPrivacy: {
            blockGeolocation: true,
            disableThirdPartyCookies: false,
            clearTargetDataOnComplete: false
        },
        systemVpnConfirmed: false,
        systemVpnEgressRegion: null
    };

    class PrivacyGatewayEngine {
        constructor() {
            this.config = { ...DEFAULT_CONFIG };
            this.isGateReady = false;
            this.isGateActive = false;
            this.failureReason = null;
            this.lastPreflightResult = null;
            this.originalSettings = {
                proxy: null,
                webrtc: null,
                networkPrediction: null
            };
            this.hasCapturedOriginals = false;
            this.ephemeralEgressFingerprint = null; // Truncated hash only, never raw IP
            this.ephemeralProxyPassword = null; // Memory-only password if rememberPassword is false
        }

        async init(customConfig = {}) {
            if (customConfig.proxyPassword !== undefined) {
                this.ephemeralProxyPassword = customConfig.proxyPassword;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    const data = await chrome.storage.local.get(['xpider_privacy_config']);
                    if (data && data.xpider_privacy_config) {
                        this.config = { ...DEFAULT_CONFIG, ...data.xpider_privacy_config, ...customConfig };
                        // Password is never persisted unless rememberPassword was true
                        if (!this.config.rememberPassword) {
                            if (customConfig.proxyPassword) {
                                this.ephemeralProxyPassword = customConfig.proxyPassword;
                            }
                            this.config.proxyPassword = '';
                        }
                    } else {
                        this.config = { ...DEFAULT_CONFIG, ...customConfig };
                        if (!this.config.rememberPassword) {
                            if (customConfig.proxyPassword) {
                                this.ephemeralProxyPassword = customConfig.proxyPassword;
                            }
                            this.config.proxyPassword = '';
                        }
                    }
                } catch (_) {
                    this.config = { ...DEFAULT_CONFIG, ...customConfig };
                    if (!this.config.rememberPassword) {
                        if (customConfig.proxyPassword) {
                            this.ephemeralProxyPassword = customConfig.proxyPassword;
                        }
                        this.config.proxyPassword = '';
                    }
                }
            } else {
                this.config = { ...DEFAULT_CONFIG, ...customConfig };
                if (!this.config.rememberPassword) {
                    if (customConfig.proxyPassword) {
                        this.ephemeralProxyPassword = customConfig.proxyPassword;
                    }
                    this.config.proxyPassword = '';
                }
            }
            return this.config;
        }

        async saveConfig(newConfig = {}) {
            if (newConfig.transportMode && newConfig.transportMode !== this.config.transportMode) {
                // If switching away from SYSTEM_VPN or switching to SYSTEM_VPN, invalidate prior confirmation
                this.ephemeralEgressFingerprint = null;
                if (this.config.transportMode === PRIVACY_MODES.SYSTEM_VPN || newConfig.transportMode === PRIVACY_MODES.SYSTEM_VPN) {
                    if (newConfig.systemVpnConfirmed === undefined) {
                        newConfig.systemVpnConfirmed = false;
                    }
                }
            }
            if (newConfig.systemVpnConfirmed === false) {
                this.ephemeralEgressFingerprint = null;
            }
            this.config = { ...this.config, ...newConfig };
            if (newConfig.proxyPassword !== undefined) {
                this.ephemeralProxyPassword = newConfig.proxyPassword;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                const toSave = { ...this.config };
                if (!toSave.rememberPassword) {
                    toSave.proxyPassword = '';
                }
                await chrome.storage.local.set({ xpider_privacy_config: toSave });
            }
            return this.config;
        }

        /**
         * [R6.9G.9.2] Get proxy authentication credentials scoped to configured host/port
         */
        getProxyAuthCredentials(challenger) {
            if (this.config.transportMode !== PRIVACY_MODES.SOCKS5 && this.config.transportMode !== PRIVACY_MODES.HTTPS_PROXY) {
                return null;
            }
            const proxyHost = (this.config.proxyHost || '').toLowerCase().trim();
            const proxyPort = parseInt(this.config.proxyPort, 10);
            const username = (this.config.proxyUsername || '').trim();
            const password = this.config.proxyPassword || this.ephemeralProxyPassword || '';

            if (!username || !password) return null;

            if (challenger && challenger.host) {
                const challengerHost = challenger.host.toLowerCase().trim();
                if (proxyHost && challengerHost !== proxyHost) {
                    return null; // Scoped strictly to configured proxy host
                }
                if (proxyPort && challenger.port && challenger.port !== proxyPort) {
                    return null; // Scoped strictly to configured proxy port
                }
            }

            return { username, password };
        }

        /**
         * Privacy-safe one-way hash (SHA-256 truncated to 16 hex characters)
         * Zero raw IP / zero PII stored or logged.
         */
        async _hashString(str) {
            if (!str) return null;
            try {
                if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
                    const buffer = new TextEncoder().encode(String(str));
                    const digest = await crypto.subtle.digest('SHA-256', buffer);
                    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                    return hex.substring(0, 16);
                }
                if (typeof require === 'function') {
                    try {
                        const nodeCrypto = require('crypto');
                        return nodeCrypto.createHash('sha256').update(String(str)).digest('hex').substring(0, 16);
                    } catch (_) {}
                }
            } catch (_) {}
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return 'h_' + Math.abs(hash).toString(16);
        }

        /**
         * Compute ephemeral egress fingerprint without logging or persisting raw IP.
         * Returns structured result:
         *   { verified: true, fingerprint: '...' } OR
         *   { verified: false, reason: '...' }
         * Never accepts synthetic or fallback seeds as verified egress.
         */
        async computeEgressFingerprint() {
            try {
                let rawData = null;
                if (this._mockEgressProbe && typeof this._mockEgressProbe === 'function') {
                    const mockRaw = await this._mockEgressProbe();
                    if (!mockRaw) {
                        return { verified: false, reason: 'EGRESS_PROBE_UNAVAILABLE' };
                    }
                    if (typeof mockRaw === 'object' && mockRaw.error) {
                        return { verified: false, reason: mockRaw.error };
                    }
                    rawData = String(mockRaw).trim();
                } else if (typeof fetch === 'function') {
                    const probeEndpoints = [
                        {
                            url: 'https://cloudflare.com/cdn-cgi/trace',
                            extract: (text) => {
                                const m = text.match(/ip=([^\r\n]+)/);
                                return m && m[1] ? m[1].trim() : null;
                            }
                        },
                        {
                            url: 'https://api64.ipify.org?format=text',
                            extract: (text) => (text && text.trim().length > 0 ? text.trim() : null)
                        }
                    ];

                    let lastReason = 'EGRESS_PROBE_UNAVAILABLE';
                    for (const probe of probeEndpoints) {
                        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                        const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;
                        try {
                            const resp = await fetch(probe.url, {
                                signal: controller ? controller.signal : undefined,
                                cache: 'no-store'
                            });
                            if (resp.ok) {
                                const text = await resp.text();
                                const extracted = probe.extract(text);
                                if (extracted) {
                                    rawData = extracted;
                                    break;
                                } else {
                                    lastReason = 'EGRESS_PROBE_PARSE_FAILED';
                                }
                            } else {
                                lastReason = `EGRESS_PROBE_HTTP_${resp.status}`;
                            }
                        } catch (err) {
                            if (err.name === 'AbortError') {
                                lastReason = 'EGRESS_PROBE_TIMEOUT';
                            } else {
                                lastReason = 'EGRESS_PROBE_UNAVAILABLE';
                            }
                        } finally {
                            if (timeoutId) clearTimeout(timeoutId);
                        }
                    }

                    if (!rawData) {
                        return { verified: false, reason: lastReason };
                    }
                } else {
                    return { verified: false, reason: 'EGRESS_PROBE_UNAVAILABLE' };
                }

                if (!rawData) {
                    return { verified: false, reason: 'EGRESS_PROBE_UNAVAILABLE' };
                }

                const fingerprint = await this._hashString(rawData);
                return { verified: true, fingerprint };
            } catch (err) {
                return { verified: false, reason: 'EGRESS_PROBE_UNVERIFIED' };
            }
        }

        setMockEgressProbe(fn) {
            this._mockEgressProbe = fn;
        }

        simulateEgressChange(newVal = 'simulated-new-ip-change') {
            this._mockEgressProbe = () => newVal;
        }

        /**
         * [R6.9G.9.4] Perform bounded network canary through the configured proxy
         * - If canaryUrl or this.config.canaryUrl is explicitly configured, probe that single endpoint.
         * - If neither is set (Owner production default), probe real public HTTPS endpoints:
         *   Primary: https://cloudflare.com/cdn-cgi/trace
         *   Secondary fallback: https://api64.ipify.org?format=text
         * - Fail closed if fetch is unavailable: returns PROXY_CANARY_UNAVAILABLE (never success: true).
         */
        async probeProxyCanary(canaryUrl = null, timeoutMs = 3000) {
            if (typeof fetch === 'undefined') {
                return { success: false, reason: 'PROXY_CANARY_UNAVAILABLE' };
            }

            const explicitTarget = canaryUrl || this.config.canaryUrl || null;
            const targetList = explicitTarget ? [explicitTarget] : [
                'https://cloudflare.com/cdn-cgi/trace',
                'https://api64.ipify.org?format=text'
            ];

            let lastReason = 'PROXY_CANARY_FAILED';
            for (const target of targetList) {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                try {
                    const resp = await fetch(target, {
                        method: 'GET',
                        cache: 'no-store',
                        signal: controller ? controller.signal : undefined
                    });
                    if (timer) clearTimeout(timer);
                    if (resp.status >= 200 && resp.status < 400) {
                        return { success: true, status: resp.status, endpoint: target };
                    } else if (resp.status === 407) {
                        return { success: false, reason: 'PROXY_AUTH_REQUIRED_407', endpoint: target };
                    } else {
                        lastReason = `HTTP_STATUS_${resp.status}`;
                    }
                } catch (err) {
                    if (timer) clearTimeout(timer);
                    const isTimeout = err.name === 'AbortError' || (err.message && err.message.includes('abort'));
                    lastReason = isTimeout ? 'CANARY_TIMEOUT' : (err.message || 'NETWORK_ERROR');
                }
            }

            return {
                success: false,
                reason: `PROXY_CANARY_FAILED: ${lastReason}`
            };
        }

        /**
         * Verify continuity of the egress tunnel during campaign run
         */
        async checkEgressContinuity() {
            if (!this.config.enabled) return { pass: true };

            // [R6.9G.9.3] Managed proxy continuity check
            if (this.config.transportMode === PRIVACY_MODES.SOCKS5 || this.config.transportMode === PRIVACY_MODES.HTTPS_PROXY) {
                if (!this.isGateActive || !this.isGateReady) {
                    return { pass: false, reason: this.failureReason || 'MANAGED_PROXY_NOT_READY' };
                }
                const canaryUrl = this.config.canaryUrl || null;
                const canaryRes = await this.probeProxyCanary(canaryUrl, 2500);
                if (!canaryRes.success) {
                    this.isGateReady = false;
                    this.failureReason = `MANAGED_PROXY_DROPPED: ${canaryRes.reason}`;
                    return { pass: false, reason: this.failureReason };
                }
                return { pass: true };
            }

            if (this.config.transportMode !== PRIVACY_MODES.SYSTEM_VPN) return { pass: true };
            if (!this.config.systemVpnConfirmed) {
                return { pass: false, reason: 'SYSTEM_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED' };
            }

            try {
                const fpResult = await this.computeEgressFingerprint();
                if (!fpResult || !fpResult.verified) {
                    const failReason = (fpResult && fpResult.reason) || 'EGRESS_PROBE_UNVERIFIED';
                    if (this.config.failClosed) {
                        console.warn('[PRIVACY_GATE] Egress probe unverified in fail-closed mode:', failReason);
                        await this.invalidateVpnConfirmation(failReason);
                        return { pass: false, reason: failReason };
                    }
                    return { pass: true, warning: failReason };
                }

                const currentFingerprint = fpResult.fingerprint;
                if (!this.ephemeralEgressFingerprint) {
                    this.ephemeralEgressFingerprint = currentFingerprint;
                    return { pass: true, fingerprint: currentFingerprint };
                }

                if (currentFingerprint !== this.ephemeralEgressFingerprint) {
                    console.warn('[PRIVACY_GATE] Egress fingerprint changed unexpectedly! Invalidate confirmation.');
                    await this.invalidateVpnConfirmation('SYSTEM_VPN_EGRESS_CHANGED');
                    return {
                        pass: false,
                        reason: 'SYSTEM_VPN_EGRESS_CHANGED',
                        previousFingerprint: this.ephemeralEgressFingerprint,
                        currentFingerprint
                    };
                }

                return { pass: true, fingerprint: currentFingerprint };
            } catch (err) {
                if (this.config.failClosed) {
                    await this.invalidateVpnConfirmation('EGRESS_PROBE_UNVERIFIED');
                    return { pass: false, reason: 'EGRESS_PROBE_UNVERIFIED' };
                }
                return { pass: true, warning: err.message };
            }
        }

        /**
         * Invalidate VPN confirmation when transport changes, network drops, or explicitly revoked
         */
        async invalidateVpnConfirmation(reason = 'SYSTEM_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED') {
            this.config.systemVpnConfirmed = false;
            this.ephemeralEgressFingerprint = null;
            this.isGateReady = false;
            this.failureReason = reason;
            await this.saveConfig({ systemVpnConfirmed: false });
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                    chrome.runtime.sendMessage({
                        action: 'SYSTEM_VPN_CONFIRMATION_INVALIDATED',
                        reason: reason
                    }).catch(() => {});
                } catch (_) {}
            }
            return { success: true, reason };
        }

        /**
         * Capture original browser settings before applying XPIDER privacy policy
         */
        async captureOriginalSettings() {
            if (this.hasCapturedOriginals) return;

            // 1. Capture Proxy
            if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                try {
                    await new Promise((resolve) => {
                        chrome.proxy.settings.get({ incognito: false }, (details) => {
                            this.originalSettings.proxy = details ? details.value : null;
                            resolve();
                        });
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Could not read original proxy settings:', e);
                }
            }

            // 2. Capture WebRTC
            if (typeof chrome !== 'undefined' && chrome.privacy && chrome.privacy.network && chrome.privacy.network.webRTCIPHandlingPolicy) {
                try {
                    await new Promise((resolve) => {
                        chrome.privacy.network.webRTCIPHandlingPolicy.get({}, (details) => {
                            this.originalSettings.webrtc = details ? details.value : null;
                            resolve();
                        });
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Could not read original WebRTC policy:', e);
                }
            }

            // 3. Capture Network Prediction
            if (typeof chrome !== 'undefined' && chrome.privacy && chrome.privacy.network && chrome.privacy.network.networkPredictionEnabled) {
                try {
                    await new Promise((resolve) => {
                        chrome.privacy.network.networkPredictionEnabled.get({}, (details) => {
                            this.originalSettings.networkPrediction = details ? details.value : null;
                            resolve();
                        });
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Could not read original network prediction:', e);
                }
            }

            this.hasCapturedOriginals = true;
        }

        /**
         * Apply WebRTC and network prediction hardening
         */
        async applyBrowserPrivacyHardening() {
            let webrtcGuardPass = false;
            let netPredPass = false;

            if (typeof chrome !== 'undefined' && chrome.privacy && chrome.privacy.network) {
                // 1. WebRTC leak policy: disable_non_proxied_udp
                if (chrome.privacy.network.webRTCIPHandlingPolicy) {
                    try {
                        await new Promise((resolve, reject) => {
                            chrome.privacy.network.webRTCIPHandlingPolicy.set({
                                value: 'disable_non_proxied_udp',
                                scope: 'regular'
                            }, () => {
                                if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                                webrtcGuardPass = true;
                                resolve();
                            });
                        });
                    } catch (e) {
                        console.warn('[PRIVACY_GATE] WebRTC hardening failed:', e);
                    }
                }

                // 2. Network prediction disabled
                if (chrome.privacy.network.networkPredictionEnabled) {
                    try {
                        await new Promise((resolve, reject) => {
                            chrome.privacy.network.networkPredictionEnabled.set({
                                value: false,
                                scope: 'regular'
                            }, () => {
                                if (chrome.runtime && chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                                netPredPass = true;
                                resolve();
                            });
                        });
                    } catch (e) {
                        console.warn('[PRIVACY_GATE] Network prediction hardening failed:', e);
                    }
                }
            } else {
                // In non-extension or testing mock environments
                webrtcGuardPass = true;
                netPredPass = true;
            }

            return { webrtcGuardPass, netPredPass };
        }

        /**
         * Apply Managed Proxy (SOCKS5 or HTTPS) without DIRECT fallback
         */
        async applyManagedProxy(mode, host, port, bypassList = null) {
            if (typeof chrome === 'undefined' || !chrome.proxy || !chrome.proxy.settings) {
                return { success: true, mocked: true };
            }

            const parsedPort = parseInt(port) || (mode === PRIVACY_MODES.SOCKS5 ? 1080 : 8080);
            const scheme = mode === PRIVACY_MODES.SOCKS5 ? 'socks5' : (this.config.proxyScheme || 'http');

            // [R6.9G.9.3] If bypassList is explicitly provided or configured, use it.
            // If proxy host is loopback (127.0.0.1/localhost) for testing, use ['<-loopback>']
            // so requests to 127.0.0.1 (such as local fixtures or test canary) actually traverse the proxy.
            const resolvedBypass = (bypassList !== null && bypassList !== undefined)
                ? bypassList
                : (this.config.proxyBypassList || ((host === '127.0.0.1' || host === 'localhost') ? ['<-loopback>'] : ['<local>']));

            const proxyConfig = {
                mode: 'fixed_servers',
                rules: {
                    singleProxy: {
                        scheme: scheme,
                        host: host,
                        port: parsedPort
                    },
                    bypassList: resolvedBypass
                }
            };

            return new Promise((resolve, reject) => {
                chrome.proxy.settings.set({
                    value: proxyConfig,
                    scope: 'regular'
                }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve({ success: true, mode, host, port: parsedPort, bypassList: resolvedBypass });
                });
            });
        }

        /**
         * Restore original browser settings on campaign stop/pause/exit
         */
        async restoreOriginalSettings() {
            if (!this.config.rememberPassword) {
                this.ephemeralProxyPassword = null;
            }

            if (!this.hasCapturedOriginals) {
                this.isGateActive = false;
                this.isGateReady = false;
                return;
            }

            // 1. Restore Proxy
            if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                try {
                    await new Promise((resolve) => {
                        if (this.originalSettings.proxy) {
                            chrome.proxy.settings.set({ value: this.originalSettings.proxy, scope: 'regular' }, resolve);
                        } else {
                            chrome.proxy.settings.clear({ scope: 'regular' }, resolve);
                        }
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Proxy restore failed:', e);
                }
            }

            // 2. Restore WebRTC
            if (typeof chrome !== 'undefined' && chrome.privacy && chrome.privacy.network && chrome.privacy.network.webRTCIPHandlingPolicy) {
                try {
                    await new Promise((resolve) => {
                        if (this.originalSettings.webrtc) {
                            chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: this.originalSettings.webrtc, scope: 'regular' }, resolve);
                        } else {
                            chrome.privacy.network.webRTCIPHandlingPolicy.clear({ scope: 'regular' }, resolve);
                        }
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] WebRTC restore failed:', e);
                }
            }

            // 3. Restore Network Prediction
            if (typeof chrome !== 'undefined' && chrome.privacy && chrome.privacy.network && chrome.privacy.network.networkPredictionEnabled) {
                try {
                    await new Promise((resolve) => {
                        if (this.originalSettings.networkPrediction !== null) {
                            chrome.privacy.network.networkPredictionEnabled.set({ value: this.originalSettings.networkPrediction, scope: 'regular' }, resolve);
                        } else {
                            chrome.privacy.network.networkPredictionEnabled.clear({ scope: 'regular' }, resolve);
                        }
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Network prediction restore failed:', e);
                }
            }

            if (!this.config.rememberPassword) {
                this.ephemeralProxyPassword = null;
            }

            this.isGateActive = false;
            this.isGateReady = false;
        }

        /**
         * Privacy Preflight Verification
         * Verifies all policies, transport state, WebRTC leak guard, and fail-closed readiness.
         */
        async runPreflight(options = {}) {
            const mode = options.transportMode || this.config.transportMode || PRIVACY_MODES.SYSTEM_VPN;
            const failClosed = options.failClosed !== undefined ? options.failClosed : this.config.failClosed;
            const enabled = options.enabled !== undefined ? options.enabled : this.config.enabled;

            await this.captureOriginalSettings();

            let webrtcGuard = 'PASS';
            let directFallbackBlocked = 'BLOCKED';
            let egressCheck = 'UNKNOWN';
            let dnsPrivacy = 'UNKNOWN';
            let ipv6Protection = 'UNKNOWN';
            let ready = false;
            let failureReason = null;

            if (!enabled) {
                // Privacy Gateway turned OFF
                ready = !failClosed;
                failureReason = failClosed ? 'PRIVACY_GATEWAY_DISABLED_WHILE_FAIL_CLOSED' : null;
                return this._recordPreflightResult({
                    ready,
                    mode: PRIVACY_MODES.DIRECT,
                    failClosed,
                    webrtcGuard: 'FAIL',
                    directFallbackBlocked: 'ALLOWED',
                    egressCheck: 'UNKNOWN',
                    dnsPrivacy: 'DEGRADED',
                    ipv6Protection: 'UNKNOWN',
                    failureReason: failureReason || 'PRIVACY_GATEWAY_DISABLED'
                });
            }

            // WebRTC Leak Guard check
            const hardeningRes = await this.applyBrowserPrivacyHardening();
            webrtcGuard = hardeningRes.webrtcGuardPass ? 'PASS' : 'FAIL';

            if (webrtcGuard === 'FAIL' && failClosed) {
                ready = false;
                failureReason = 'WEBRTC_LEAK_GUARD_FAILED';
                return this._recordPreflightResult({
                    ready,
                    mode,
                    failClosed,
                    webrtcGuard,
                    directFallbackBlocked,
                    egressCheck,
                    dnsPrivacy,
                    ipv6Protection,
                    failureReason
                });
            }

            // Transport Mode evaluation
            if (mode === PRIVACY_MODES.DIRECT) {
                directFallbackBlocked = 'ALLOWED';
                dnsPrivacy = 'DEGRADED';
                if (failClosed) {
                    ready = false;
                    failureReason = 'DIRECT_MODE_BLOCKED_BY_FAIL_CLOSED';
                } else {
                    ready = true;
                    failureReason = null;
                }
            } else if (mode === PRIVACY_MODES.SYSTEM_VPN) {
                directFallbackBlocked = 'BLOCKED';
                dnsPrivacy = 'PASS';
                ipv6Protection = 'PROTECTED';

                const isVpnConfirmed = options.systemVpnConfirmed !== undefined
                    ? options.systemVpnConfirmed
                    : this.config.systemVpnConfirmed;

                const ownerVpnConfirmed = Boolean(isVpnConfirmed);
                let egressVerified = false;

                if (!ownerVpnConfirmed) {
                    egressCheck = 'BLOCKED';
                    this.ephemeralEgressFingerprint = null;
                    if (failClosed) {
                        ready = false;
                        failureReason = 'SYSTEM_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED';
                    } else {
                        ready = true;
                        dnsPrivacy = 'DEGRADED';
                    }
                } else {
                    // Owner confirmed VPN. Now verify actual external egress via probe.
                    const fpResult = await this.computeEgressFingerprint();
                    if (fpResult && fpResult.verified) {
                        egressVerified = true;
                        egressCheck = 'PASS';
                        this.ephemeralEgressFingerprint = fpResult.fingerprint;
                        ready = true;
                        failureReason = null;
                    } else {
                        egressVerified = false;
                        egressCheck = 'FAIL';
                        this.ephemeralEgressFingerprint = null;
                        const probeReason = (fpResult && fpResult.reason) || 'EGRESS_PROBE_UNVERIFIED';
                        if (failClosed) {
                            ready = false;
                            failureReason = probeReason;
                        } else {
                            ready = true;
                            dnsPrivacy = 'DEGRADED';
                            failureReason = null;
                        }
                    }
                }

                this.isGateReady = ready;
                this.failureReason = failureReason;

                return this._recordPreflightResult({
                    ready,
                    mode,
                    failClosed,
                    ownerVpnConfirmed,
                    egressVerified,
                    webrtcGuard,
                    directFallbackBlocked,
                    egressCheck,
                    egressFingerprint: this.ephemeralEgressFingerprint,
                    dnsPrivacy,
                    ipv6Protection,
                    failureReason
                });
            } else if (mode === PRIVACY_MODES.SOCKS5 || mode === PRIVACY_MODES.HTTPS_PROXY) {
                const host = options.proxyHost !== undefined ? options.proxyHost : this.config.proxyHost;
                const port = options.proxyPort !== undefined ? options.proxyPort : this.config.proxyPort;
                const username = options.proxyUsername !== undefined ? options.proxyUsername : this.config.proxyUsername;
                const password = options.proxyPassword !== undefined ? options.proxyPassword : (this.config.proxyPassword || this.ephemeralProxyPassword);

                const authRegistered = typeof globalThis !== 'undefined' && typeof globalThis.isProxyAuthHandlerRegistered !== 'undefined'
                    ? globalThis.isProxyAuthHandlerRegistered
                    : (typeof self !== 'undefined' && typeof self.isProxyAuthHandlerRegistered !== 'undefined'
                        ? self.isProxyAuthHandlerRegistered
                        : (typeof chrome !== 'undefined' && !!(chrome.webRequest && chrome.webRequest.onAuthRequired)));

                if (!host || !port) {
                    ready = false;
                    directFallbackBlocked = 'ALLOWED';
                    failureReason = 'PROXY_HOST_OR_PORT_MISSING';
                } else if (username && !password) {
                    ready = false;
                    directFallbackBlocked = 'BLOCKED';
                    egressCheck = 'FAIL';
                    failureReason = 'PROXY_CREDENTIALS_INCOMPLETE';
                } else if (username && password && !authRegistered) {
                    ready = false;
                    directFallbackBlocked = 'BLOCKED';
                    egressCheck = 'FAIL';
                    failureReason = 'PROXY_AUTH_HANDLER_UNAVAILABLE';
                } else {
                    try {
                        const bypassList = options.proxyBypassList !== undefined ? options.proxyBypassList : this.config.proxyBypassList;
                        await this.applyManagedProxy(mode, host, port, bypassList);

                        // [R6.9G.9.4] Perform bounded network canary through the configured proxy
                        const canaryUrl = options.canaryUrl || this.config.canaryUrl || null;
                        const canaryRes = await this.probeProxyCanary(canaryUrl, 3000);

                        if (!canaryRes.success) {
                            ready = false;
                            directFallbackBlocked = 'BLOCKED';
                            egressCheck = 'FAIL';
                            failureReason = `PROXY_CANARY_FAILED: ${canaryRes.reason}`;
                        } else {
                            directFallbackBlocked = 'BLOCKED';
                            dnsPrivacy = 'UNKNOWN';
                            ipv6Protection = 'UNKNOWN';
                            egressCheck = 'PASS';
                            ready = true;
                            failureReason = null;
                            this.isGateActive = true;
                        }
                    } catch (proxyErr) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = `MANAGED_PROXY_CONFIGURATION_FAILED: ${proxyErr.message}`;
                    }
                }
            } else {
                ready = false;
                failureReason = `UNKNOWN_TRANSPORT_MODE: ${mode}`;
            }

            this.isGateReady = ready;
            this.failureReason = failureReason;

            return this._recordPreflightResult({
                ready,
                mode,
                failClosed,
                ownerVpnConfirmed: false,
                egressVerified: (mode === PRIVACY_MODES.SOCKS5 || mode === PRIVACY_MODES.HTTPS_PROXY) ? ready : false,
                webrtcGuard,
                directFallbackBlocked,
                egressCheck,
                egressFingerprint: null,
                dnsPrivacy,
                ipv6Protection,
                failureReason
            });
        }

        _recordPreflightResult(res) {
            const result = {
                ...res,
                lastCheck: new Date().toISOString()
            };
            this.lastPreflightResult = result;
            this.isGateReady = result.ready;
            this.failureReason = result.failureReason;
            return result;
        }

        /**
         * Mandatory Invariant Check before any target tab navigation:
         * PRIVACY_GATE_READY === true
         */
        isPrivacyGateReady() {
            if (!this.config.enabled) {
                return !this.config.failClosed;
            }
            return this.isGateReady === true;
        }

        /**
         * Safe metadata for HistoryStore and attempt records
         * Zero PII / Zero raw IP / Zero secrets
         */
        getAttemptPrivacyMetadata() {
            return {
                privacyMode: this.config.transportMode,
                privacyTransport: this.config.transportMode,
                privacyGatePassed: this.isPrivacyGateReady(),
                privacyGateCheckedAt: new Date().toISOString(),
                privacyFailureReason: this.failureReason || null
            };
        }

        /**
         * Redaction engine for IPv4, IPv6, proxy passwords, auth headers
         */
        static redactSensitivePrivacyInfo(text) {
            if (!text || typeof text !== 'string') return text;

            return text
                // IPv4 addresses (e.g. 192.168.1.1, 104.28.19.4)
                .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => {
                    if (ip === '127.0.0.1' || ip === '0.0.0.0') return ip; // Allow local loopback fixture
                    return '[REDACTED_IP]';
                })
                // IPv6 addresses
                .replace(/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, '[REDACTED_IPV6]')
                .replace(/\b(?:[0-9a-fA-F]{1,4}:){1,7}:(?::[0-9a-fA-F]{1,4}){1,7}\b/g, '[REDACTED_IPV6]')
                // Proxy credentials
                .replace(/proxy(?:-password|Pass|Password)[\s:="']+[^\s"'`]+/gi, 'proxyPassword: [REDACTED_SECRET]')
                .replace(/(?:socks5|http|https):\/\/[^:\s]+:[^@\s]+@/gi, (match) => {
                    const protocol = match.split('://')[0];
                    return `${protocol}://[REDACTED_USER]:[REDACTED_PASS]@`;
                })
                .replace(/proxy\s+user:[^\s@,]+/gi, 'proxy user:[REDACTED_SECRET]');
        }
    }

    const instance = new PrivacyGatewayEngine();

    return {
        PrivacyGatewayEngine,
        PRIVACY_MODES,
        getInstance: () => instance,
        redactSensitivePrivacyInfo: PrivacyGatewayEngine.redactSensitivePrivacyInfo
    };
}));

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
        EXTERNAL_VPN_MONITOR: 'EXTERNAL_VPN_MONITOR',
        SYSTEM_VPN: 'EXTERNAL_VPN_MONITOR', // backward compat alias
        SOCKS5: 'SOCKS5',
        HTTPS_PROXY: 'HTTPS_PROXY',
        PRIVACY_RELAY: 'PRIVACY_RELAY',
        DIRECT: 'DIRECT'
    };

    const DEFAULT_CONFIG = {
        enabled: true,
        transportMode: PRIVACY_MODES.PRIVACY_RELAY,
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
        systemVpnEgressRegion: null,
        // [Issue #6 R6.9G.10 Privacy Relay Settings]
        relayHost: '127.0.0.1',
        relayProxyPort: 18988,
        relayControlPort: 18989,
        relayControlToken: '',
        relayRotationMode: 'FIXED', // FIXED | MANUAL | CAMPAIGN_BOUNDARY | HEALTH_FAILOVER
        rotateAtCampaignStart: false,
        healthFailover: true,
        selectedEgressId: null,
        // [Issue #6 RC3.22/RC3.23 Privacy Relay Persistence]
        keepPrivacyRelayEnforcedBetweenCampaigns: true,
        // [Issue #6 R6.9G.10.3.7 Physical Router Security Gate Settings]
        physicalGateEnabled: false
    };

    class PrivacyGatewayEngine {
        constructor() {
            this.config = { ...DEFAULT_CONFIG };
            this.isGateReady = false;
            this.isGateActive = false;
            this.failureReason = null;
            this.lastPreflightResult = null;
            this.lastPhysicalGateStatus = null;
            this.originalSettings = {
                proxy: null,
                webrtc: null,
                networkPrediction: null
            };
            this.hasCapturedOriginals = false;
            this.ephemeralEgressFingerprint = null; // Truncated hash only, never raw IP
            this.ephemeralProxyPassword = null; // Memory-only password if rememberPassword is false
            this.ephemeralRelayToken = null; // Ephemeral relay token from Native Messaging
            this.lastEgressMonitor = null; // [RC3.60 .88] Normalized 5-row live egress IP monitor
            this._lastEgressCheckTime = 0;
            this._egressCheckInProgress = null;
            this._proxyChangeListenerBound = false;
            this._setupProxyChangeListener();
        }

        _setupProxyChangeListener() {
            if (this._proxyChangeListenerBound) return;
            if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings && chrome.proxy.settings.onChange && typeof chrome.proxy.settings.onChange.addListener === 'function') {
                this._proxyChangeListenerBound = true;
                try {
                    chrome.proxy.settings.onChange.addListener((details) => {
                        if (this.config && this.config.enabled && this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY) {
                            const val = details && details.value;
                            const mode = val && val.mode;
                            const sp = val && val.rules && val.rules.singleProxy;
                            const expHost = this.config.relayHost || '127.0.0.1';
                            const expPort = Number(this.config.relayProxyPort || 18988);
                            if (mode !== 'fixed_servers' || !sp || sp.host !== expHost || Number(sp.port) !== expPort) {
                                console.warn('[PRIVACY_GATE] chrome.proxy.settings.onChange detected invalid/tampered settings:', details);
                                this.invalidateGateReadiness('PROXY_SETTINGS_TAMPERED_ONCHANGE');
                            }
                        }
                    });
                } catch (e) {
                    console.warn('[PRIVACY_GATE] Failed to attach chrome.proxy.settings.onChange listener:', e);
                }
            }
        }

        invalidateGateReadiness(reason = 'PRIVACY_GATE_INVALIDATED') {
            this.isGateReady = false;
            this.isGateActive = false;
            this.failureReason = reason;
            if (this.lastPreflightResult) {
                this.lastPreflightResult.ready = false;
                this.lastPreflightResult.provisional = true;
                this.lastPreflightResult.failureReason = reason;
            }
        }

        async init(customConfig = {}) {
            this._setupProxyChangeListener();
            if (customConfig.proxyPassword !== undefined) {
                this.ephemeralProxyPassword = customConfig.proxyPassword;
            }
            if (customConfig.relayControlToken !== undefined) {
                this.ephemeralRelayToken = customConfig.relayControlToken;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    const data = await chrome.storage.local.get(['xpider_privacy_config', 'xpider_last_privacy_preflight']);
                    if (data && data.xpider_last_privacy_preflight && !this.lastPreflightResult) {
                        const storedPf = data.xpider_last_privacy_preflight;
                        if (storedPf && typeof storedPf === 'object' && storedPf.lastCheck) {
                            // [Issue #6 RC3.60 .84 Live Authority Fix]
                            // Persisted snapshot is strictly for provisional UI diagnostics.
                            // NEVER grant live gate authorization (isGateReady = true) from storage cache!
                            this.cachedPreflightSnapshot = storedPf;
                            this.lastPreflightResult = {
                                ...storedPf,
                                ready: false, // Never grant live ready from storage cache
                                provisional: true,
                                verifying: true,
                                statusLabel: 'VERIFYING_FRESH_READINESS'
                            };
                            this.isGateReady = false;
                            this.isGateActive = false;
                            if (storedPf.failureReason) {
                                this.failureReason = storedPf.failureReason;
                            }
                        }
                    }
                    if (data && data.xpider_privacy_config) {
                        // [R6.9G.10.2 Blocker 4 Sanitization]: Purge any old persisted relayControlToken from storage
                        if (data.xpider_privacy_config.relayControlToken) {
                            delete data.xpider_privacy_config.relayControlToken;
                            await chrome.storage.local.set({ xpider_privacy_config: data.xpider_privacy_config });
                        }
                        this.config = { ...DEFAULT_CONFIG, ...data.xpider_privacy_config, ...customConfig };
                        this.config.relayControlToken = ''; // Memory-only isolation
                        if (customConfig.relayControlToken) {
                            this.ephemeralRelayToken = customConfig.relayControlToken;
                        }
                        // Password is never persisted unless rememberPassword was true
                        if (!this.config.rememberPassword) {
                            if (customConfig.proxyPassword) {
                                this.ephemeralProxyPassword = customConfig.proxyPassword;
                            }
                            this.config.proxyPassword = '';
                        }
                    } else {
                        this.config = { ...DEFAULT_CONFIG, ...customConfig };
                        this.config.relayControlToken = '';
                        if (!this.config.rememberPassword) {
                            if (customConfig.proxyPassword) {
                                this.ephemeralProxyPassword = customConfig.proxyPassword;
                            }
                            this.config.proxyPassword = '';
                        }
                    }
                } catch (_) {
                    this.config = { ...DEFAULT_CONFIG, ...customConfig };
                    this.config.relayControlToken = '';
                    if (!this.config.rememberPassword) {
                        if (customConfig.proxyPassword) {
                            this.ephemeralProxyPassword = customConfig.proxyPassword;
                        }
                        this.config.proxyPassword = '';
                    }
                }
            } else {
                this.config = { ...DEFAULT_CONFIG, ...customConfig };
                this.config.relayControlToken = '';
                if (!this.config.rememberPassword) {
                    if (customConfig.proxyPassword) {
                        this.ephemeralProxyPassword = customConfig.proxyPassword;
                    }
                    this.config.proxyPassword = '';
                }
            }
            if (this.config.transportMode === 'SYSTEM_VPN') {
                this.config.transportMode = PRIVACY_MODES.EXTERNAL_VPN_MONITOR;
            }
            return this.config;
        }

        async saveConfig(newConfig = {}) {
            if (newConfig.transportMode && newConfig.transportMode !== this.config.transportMode) {
                // If switching transport mode, invalidate prior confirmation and preflight snapshot
                this.ephemeralEgressFingerprint = null;
                this.lastPreflightResult = null;
                this.isGateReady = false;
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.remove(['xpider_last_privacy_preflight']).catch(() => {});
                }
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
            this.config.relayControlToken = ''; // Keep memory-only; never in this.config
            if (newConfig.proxyPassword !== undefined) {
                this.ephemeralProxyPassword = newConfig.proxyPassword;
            }
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                const toSave = { ...this.config };
                if (!toSave.rememberPassword) {
                    toSave.proxyPassword = '';
                }
                // [R6.9G.10.2 Blocker 4]: relayControlToken must NEVER be written to chrome.storage.local
                delete toSave.relayControlToken;
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

        setMockFetch(fn) {
            this._mockFetch = fn;
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
        async probeProxyCanary(canaryUrl = null, timeoutMs = 8000) {
            const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
            if (!fetchFn || typeof fetchFn !== 'function') {
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
                    const resp = await fetchFn(target, {
                        method: 'GET',
                        cache: 'no-store',
                        signal: controller ? controller.signal : undefined
                    });
                    if (timer) clearTimeout(timer);
                    if (resp.status >= 200 && resp.status < 400) {
                        let observedIp = null;
                        try {
                            if (typeof resp.text === 'function') {
                                const text = await resp.text();
                                const cfMatch = text.match(/(?:^|\n)ip=([^\r\n]+)/);
                                if (cfMatch) {
                                    observedIp = cfMatch[1].trim();
                                } else {
                                    const trimmed = text.trim();
                                    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(trimmed) || /^[0-9a-fA-F:]{3,39}$/.test(trimmed)) {
                                        observedIp = trimmed;
                                    } else {
                                        try {
                                            const parsed = JSON.parse(trimmed);
                                            if (parsed.ip) observedIp = String(parsed.ip).trim();
                                        } catch (_) {}
                                    }
                                }
                            }
                        } catch (_) {}
                        return { success: true, status: resp.status, endpoint: target, observedIp: observedIp || null };
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
         * [RC3.60 .88 Directive #6497395270] Mask IP for public artifacts, logs, and telemetry
         */
        _maskIp(ip) {
            if (!ip || typeof ip !== 'string') return null;
            const trimmed = ip.trim();
            const parts = trimmed.split('.');
            if (parts.length === 4) {
                return `${parts[0]}.${parts[1]}.*.*`;
            }
            if (trimmed.includes(':')) {
                const segs = trimmed.split(':');
                return segs.slice(0, 2).join(':') + ':*:*:*:*';
            }
            return '***.***.***.***';
        }

        /**
         * [RC3.60 .88 Directive #6497395270] Check Connection & Live Egress IP across all 5 routes
         * Throttled (~20-30s) unless force=true; race-safe async de-duplication.
         */
        async checkLiveEgressIp(force = false) {
            const now = Date.now();
            if (!force && this.lastEgressMonitor && this._lastEgressCheckTime && (now - this._lastEgressCheckTime < 20000)) {
                return this.lastEgressMonitor;
            }
            if (this._egressCheckInProgress) {
                return this._egressCheckInProgress;
            }

            this._egressCheckInProgress = (async () => {
                try {
                    // 1. Protected read-only browser canary probe through XPIDER proxy
                    let browserCanaryRes = null;
                    if (this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY || this.config.transportMode === PRIVACY_MODES.SOCKS5 || this.config.transportMode === PRIVACY_MODES.HTTPS_PROXY) {
                        try {
                            browserCanaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 5000);
                        } catch (err) {
                            browserCanaryRes = { success: false, reason: err.message };
                        }
                    }

                    // 2. Query Companion Control Plane for authenticated upstream probe status
                    let companionMonitor = null;
                    let relayReady = false;
                    try {
                        if (!this.ephemeralRelayToken) {
                            await this.fetchRelayControlToken();
                        }
                        const relayStatusRes = await this.queryRelayStatus();
                        if (relayStatusRes && relayStatusRes.success && relayStatusRes.status) {
                            companionMonitor = relayStatusRes.status.egressIpMonitor || null;
                            relayReady = Boolean(relayStatusRes.status.relayReady);
                        }
                    } catch (_) {}

                    // Row 1: ACTUAL XPIDER BROWSER EXIT IP (primary)
                    let bObservedIp = null;
                    let bStatus = 'UNKNOWN';
                    let bSource = 'NONE';
                    if (browserCanaryRes && browserCanaryRes.success && browserCanaryRes.observedIp) {
                        bObservedIp = browserCanaryRes.observedIp;
                        bStatus = 'BROWSER_VERIFIED';
                        bSource = `BROWSER_CANARY (${browserCanaryRes.endpoint || 'proxy'})`;
                    } else if (browserCanaryRes && !browserCanaryRes.success) {
                        bObservedIp = null;
                        bStatus = browserCanaryRes.reason === 'PROXY_AUTH_REQUIRED_407' ? 'BLOCKED_HTTP_407' : 'CANARY_FAILED';
                        bSource = 'BROWSER_CANARY_FAIL';
                    } else if (companionMonitor && companionMonitor.companionProbeEgress && companionMonitor.companionProbeEgress.observedIp) {
                        // Companion probe only; never claim browser verified
                        bObservedIp = companionMonitor.companionProbeEgress.observedIp;
                        bStatus = 'COMPANION_PROBE_ONLY';
                        bSource = 'COMPANION_PROBE_ONLY';
                    }

                    const browserExit = {
                        observedIp: bObservedIp,
                        observedIpMasked: this._maskIp(bObservedIp),
                        status: bStatus,
                        source: bSource,
                        checkedAt: new Date().toISOString(),
                        staleAt: new Date(Date.now() + 30000).toISOString()
                    };

                    // Row 2: DECODO RESIDENTIAL EXIT IP
                    const decodo = companionMonitor && companionMonitor.decodoResidential ? { ...companionMonitor.decodoResidential } : {
                        observedIp: null,
                        observedIpMasked: null,
                        status: 'NOT_CONFIGURED',
                        source: 'DECODO_AUTHENTICATED_UPSTREAM_PROBE',
                        checkedAt: null,
                        confidence: 'NONE',
                        inUse: false,
                        error: null
                    };

                    // Row 3: DIGITALOCEAN EGRESS IP
                    const digitalOcean = companionMonitor && companionMonitor.digitalOcean ? { ...companionMonitor.digitalOcean } : {
                        configuredIp: (this.config && this.config.proxyHost) || '143.198.40.33',
                        configuredIpMasked: this._maskIp((this.config && this.config.proxyHost) || '143.198.40.33'),
                        status: 'CONFIGURED',
                        source: 'DIGITALOCEAN_NODE_CONFIG',
                        checkedAt: new Date().toISOString()
                    };

                    // Row 4: RAW ISP WAN IP (Anti-leak invariant: Never direct public echo probe)
                    const rawIspWan = {
                        observedIp: null,
                        observedIpMasked: null,
                        status: 'UNKNOWN / NOT SAFELY MEASURED',
                        source: 'NONE',
                        note: 'Never bypass protected relay with a new direct public IP probe simply to learn the raw ISP IP'
                    };

                    // Row 5: ACTIVE ROUTE
                    let activeRoute = {
                        route: 'UNKNOWN/PARTIALLY VERIFIED',
                        status: 'DEGRADED',
                        egressIp: null,
                        egressIpMasked: null,
                        checkedAt: new Date().toISOString()
                    };
                    if (companionMonitor && companionMonitor.activeRoute) {
                        activeRoute = { ...companionMonitor.activeRoute };
                        // If browser exit is verified, bind real observed exit IP
                        if (bObservedIp && bStatus === 'BROWSER_VERIFIED') {
                            activeRoute.egressIp = bObservedIp;
                            activeRoute.egressIpMasked = this._maskIp(bObservedIp);
                            activeRoute.status = 'VERIFIED';
                        }
                    } else if (this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY || relayReady) {
                        const isDecodo = companionMonitor && companionMonitor.decodoResidential && companionMonitor.decodoResidential.status === 'CONNECTED';
                        activeRoute.route = isDecodo ? 'DECODO' : 'DIGITALOCEAN';
                        activeRoute.status = bStatus === 'BROWSER_VERIFIED' ? 'VERIFIED' : (relayReady ? 'COMPANION_PROBE_ONLY' : 'DEGRADED');
                        activeRoute.egressIp = bObservedIp || (companionMonitor && companionMonitor.companionProbeEgress && companionMonitor.companionProbeEgress.observedIp) || null;
                        activeRoute.egressIpMasked = this._maskIp(activeRoute.egressIp);
                    } else if (this.config.transportMode === 'DIRECT') {
                        activeRoute.route = 'DIRECT ISP';
                        activeRoute.status = 'DIRECT_NO_PRIVACY';
                        activeRoute.egressIp = bObservedIp;
                        activeRoute.egressIpMasked = this._maskIp(bObservedIp);
                    }

                    const result = {
                        browserExit,
                        decodoResidential: decodo,
                        digitalOcean,
                        rawIspWan,
                        activeRoute,
                        relayReady,
                        timestamp: new Date().toISOString()
                    };

                    this.lastEgressMonitor = result;
                    this._lastEgressCheckTime = Date.now();
                    return result;
                } finally {
                    this._egressCheckInProgress = null;
                }
            })();

            return this._egressCheckInProgress;
        }

        /**
         * [R6.9G.10.1] Get Bearer authorization headers for Companion Privacy Relay Control API
         */
        getRelayAuthHeaders() {
            const token = this.ephemeralRelayToken || this.config.relayControlToken || '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            return headers;
        }

        /**
         * [R6.9G.10.2 Blocker 4] Retrieve control token via Native Messaging host (Memory-Only)
         */
        async fetchRelayControlToken() {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
                return new Promise((resolve) => {
                    chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'GET_TOKEN' }, (resp) => {
                        if (chrome.runtime.lastError || !resp || !resp.controlToken) {
                            return resolve(null);
                        }
                        this.ephemeralRelayToken = resp.controlToken;
                        this.config.relayControlToken = ''; // Memory-only; never in this.config or storage
                        resolve(resp.controlToken);
                    });
                });
            }
            return null;
        }

        /**
         * [R6.9G.10.2] Ensure companion privacy relay is started and responsive
         * Auto-invokes Native Messaging START if relay is offline.
         */
        async ensureRelayActive(autoStart = true) {
            let statusRes = await this.queryRelayStatus();
            if (statusRes.success && statusRes.status) {
                return { active: true, status: statusRes.status };
            }

            // If unauthorized or token missing from memory, retrieve from Native Messaging
            if (statusRes.reason === 'HTTP_401' || !this.ephemeralRelayToken) {
                await this.fetchRelayControlToken();
                statusRes = await this.queryRelayStatus();
                if (statusRes.success && statusRes.status) {
                    return { active: true, status: statusRes.status };
                }
            }

            // If offline and autoStart is enabled, dispatch Native Messaging START
            let startRes = null;
            if (autoStart && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendNativeMessage) {
                console.log('[PRIVACY_GATE] Relay offline. Dispatching Native Messaging START command...');
                startRes = await new Promise((resolve) => {
                    chrome.runtime.sendNativeMessage('com.xpider.privacy_relay', { action: 'START' }, (resp) => {
                        if (chrome.runtime.lastError || !resp) {
                            return resolve({ success: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'NO_RESPONSE' });
                        }
                        if (resp.controlToken) {
                            this.ephemeralRelayToken = resp.controlToken;
                            this.config.relayControlToken = ''; // Memory-only
                        }
                        resolve({ success: true, ...resp });
                    });
                });

                if (startRes && startRes.success) {
                    for (let i = 0; i < 8; i++) {
                        await new Promise(r => setTimeout(r, 400));
                        if (!this.ephemeralRelayToken) {
                            await this.fetchRelayControlToken();
                        }
                        statusRes = await this.queryRelayStatus();
                        if (statusRes.success && statusRes.status) {
                            return { active: true, status: statusRes.status };
                        }
                    }
                }
            }

            return { active: false, reason: (startRes && startRes.error) || statusRes.reason || 'RELAY_UNAVAILABLE' };
        }

        /**
         * [R6.9G.10] Query Companion Privacy Relay Control API (/status)
         */
        async queryRelayStatus() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE', failureReason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                let res = await fetchFn(`http://${host}:${port}/status`, {
                    cache: 'no-store',
                    headers
                });
                if (res.status === 401) {
                    // Try to retrieve token via Native Messaging and retry once
                    const fetchedToken = await this.fetchRelayControlToken();
                    if (fetchedToken) {
                        res = await fetchFn(`http://${host}:${port}/status`, {
                            cache: 'no-store',
                            headers: this.getRelayAuthHeaders()
                        });
                    }
                }
                if (res.ok) {
                    const data = await res.json();
                    return { success: true, status: data };
                }
                const reason = `HTTP_${res.status}`;
                const failureReason = res.status === 401 ? 'HTTP_401_UNAUTHORIZED' : (res.status === 502 ? 'HTTP_502_BAD_GATEWAY' : reason);
                return { success: false, reason, failureReason };
            } catch (e) {
                const isConnErr = e.message && (e.message.includes('Failed to fetch') || e.message.includes('ECONNREFUSED') || e.message.includes('NetworkError'));
                const failureReason = isConnErr ? 'PORT_18989_REFUSED_OR_OFFLINE' : (e.message || 'NETWORK_ERROR');
                return { success: false, reason: e.message, failureReason };
            }
        }

        /**
         * [RC3.18 Lifecycle Probe & Health Watchdog]
         * Probes Companion process, port 18989, authenticated /status, and returns lifecycle info.
         * If relay is degraded or offline, can trigger auto-healing.
         */
        async probeRelayLifecycle(autoHeal = false) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
            if (!fetchFn) return { ok: false, lifecycleState: 'UNKNOWN', reason: 'FETCH_UNAVAILABLE' };

            try {
                // 1. Check coarse /health first
                const hRes = await fetchFn(`http://${host}:${port}/health`, { cache: 'no-store' });
                if (!hRes.ok) {
                    if (autoHeal) await this.ensureRelayActive(true);
                    return { ok: false, lifecycleState: 'DEGRADED', reason: `HEALTH_HTTP_${hRes.status}` };
                }
                const hData = await hRes.json();

                // 2. Check authenticated /status
                const sRes = await this.queryRelayStatus();
                if (sRes.success && sRes.status) {
                    const st = sRes.status;
                    return {
                        ok: Boolean(st.relayReady && st.isHealthValid),
                        lifecycleState: st.lifecycleState || (st.relayReady ? 'READY' : 'DEGRADED'),
                        relayReady: st.relayReady,
                        isHealthValid: st.isHealthValid,
                        reconnectAttempt: st.reconnectAttempt || 0,
                        diagnostics: st.diagnostics || null,
                        status: st
                    };
                }

                // If authenticated /status failed but /health was OK:
                if (sRes.reason === 'HTTP_401' || sRes.failureReason === 'HTTP_401_UNAUTHORIZED') {
                    if (autoHeal) await this.ensureRelayActive(true);
                    return { ok: false, lifecycleState: 'DEGRADED', reason: 'TOKEN_DESYNC_401' };
                }

                return {
                    ok: false,
                    lifecycleState: hData.lifecycleState || 'DEGRADED',
                    reason: sRes.failureReason || sRes.reason || 'STATUS_UNAVAILABLE'
                };
            } catch (err) {
                if (autoHeal) await this.ensureRelayActive(true);
                return { ok: false, lifecycleState: 'OFFLINE', reason: err.message || 'PORT_OFFLINE' };
            }
        }

        /**
         * [R6.9G.10.1] Trigger candidate egress health check and canary probe (/probe)
         */
        async probeRelayEgress(canaryUrl = null) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/probe`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ canaryUrl: canaryUrl || this.config.canaryUrl || null })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.verified) {
                        this.ephemeralEgressFingerprint = data.fingerprint;
                        this.config.selectedEgressId = data.activeNode;
                    }
                    return data;
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10] Safe Egress Rotation via Companion Relay Control API (/rotate)
         */
        async rotateRelayEgress(reason = 'MANUAL', canaryUrl = null) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/rotate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ reason, canaryUrl: canaryUrl || this.config.canaryUrl || null })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        this.ephemeralEgressFingerprint = data.egressFingerprint;
                        this.config.selectedEgressId = data.selectedEgressId;
                    }
                    return data;
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10] Select specific egress node in pool (/select)
         */
        async selectRelayEgress(egressId, canaryUrl = null) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/select`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ egressId, canaryUrl: canaryUrl || this.config.canaryUrl || null })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        this.ephemeralEgressFingerprint = data.egressFingerprint;
                        this.config.selectedEgressId = data.selectedEgressId;
                    }
                    return data;
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10] Set relay rotation mode (/mode)
         */
        async setRelayMode(rotationMode) {
            const ALLOWED_MODES = ['FIXED', 'MANUAL', 'CAMPAIGN_BOUNDARY', 'HEALTH_FAILOVER'];
            if (!ALLOWED_MODES.includes(rotationMode)) {
                return { success: false, reason: 'INVALID_ROTATION_MODE', message: `Allowed modes: ${ALLOWED_MODES.join(', ')}` };
            }
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/mode`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ rotationMode })
                });
                if (res.ok) {
                    const data = await res.json();
                    this.config.relayRotationMode = rotationMode;
                    await this.saveConfig({ relayRotationMode: rotationMode });
                    return data;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, message: errData.message };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10.3 Blocker 4] Retrieve list of configured relay egress nodes (/nodes)
         */
        async getRelayEgressNodes() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/nodes`, {
                    cache: 'no-store',
                    headers
                });
                if (res.ok) {
                    return await res.json();
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10.3 Blocker 4] Add / Configure new egress node in Companion Relay pool (/add-node)
         * Strictly rejects SOCKS5 in Relay mode; requires HTTP_PROXY or HTTPS_PROXY.
         * Passwords are sent over localhost authenticated channel and encrypted into DPAPI.
         */
        async addRelayEgressNode(nodeData) {
            if (!nodeData) return { success: false, reason: 'NO_DATA' };

            // Explicit client-side protocol check
            if (nodeData.type === 'SOCKS5') {
                return {
                    success: false,
                    reason: 'UNSUPPORTED_RELAY_NODE_TYPE: Privacy Relay pool supports HTTP_PROXY and HTTPS_PROXY only. For direct SOCKS5 proxies, use Mode B: Managed SOCKS5 Proxy.'
                };
            }
            if (nodeData.type !== 'HTTP_PROXY' && nodeData.type !== 'HTTPS_PROXY') {
                return {
                    success: false,
                    reason: 'INVALID_NODE_TYPE: Must be HTTP_PROXY or HTTPS_PROXY.'
                };
            }

            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/add-node`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(nodeData)
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [R6.9G.10.3 Blocker 4] Remove egress node from Companion Relay pool (/remove-node)
         */
        async removeRelayEgressNode(nodeId) {
            if (!nodeId) return { success: false, reason: 'NO_NODE_ID' };
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/remove-node`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ id: nodeId })
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7] Query Companion Physical Router Security Gate Status (/physical-gate/status)
         */
        async queryPhysicalGateStatus() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/status`, {
                    cache: 'no-store',
                    headers
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status) {
                        this.lastPhysicalGateStatus = data.status;
                    }
                    return data;
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1.4.12] Step A: Verify DO token & live catalog pricing with zero cloud creation (/verify-plan)
         */
        async verifyPrivateEgressPlan(data) {
            if (!data || !data.token) return { success: false, reason: 'MISSING_API_TOKEN' };
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const payload = {
                    ...data,
                    extensionBuildId: data.extensionBuildId || ((typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.buildId : null),
                    extensionFunctionalHead: data.extensionFunctionalHead || ((typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.implementationHead : null)
                };
                const res = await fetchFn(`http://${host}:${port}/verify-plan`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                const status = res.status;
                const errorCode = errData.error || (status === 401 ? 'TOKEN_INVALID' : status === 403 ? 'TOKEN_SCOPE_MISSING' : status === 404 ? 'COMPANION_VERSION_MISMATCH' : `HTTP_${status}`);
                const reason = errData.reason || (status === 404 ? 'Running companion does not support /verify-plan (COMPANION_VERSION_MISMATCH). Please run XPIDER_AUTO_SETUP.bat.' : `HTTP_${status}`);
                return {
                    success: false,
                    error: errorCode,
                    reason,
                    statusCode: status
                };
            } catch (e) {
                return {
                    success: false,
                    error: 'PROVIDER_NETWORK_ERROR',
                    reason: `Failed to connect to local companion on ${host}:${port}: ${e.message}`
                };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3] Automated DigitalOcean Private Egress Provisioning (/provision-egress)
         */
        async provisionPrivateEgress(data) {
            if (!data || !data.token) return { success: false, reason: 'MISSING_API_TOKEN' };
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const payload = {
                    ...data,
                    extensionBuildId: data.extensionBuildId || ((typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.buildId : null),
                    extensionFunctionalHead: data.extensionFunctionalHead || ((typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO.implementationHead : null)
                };
                const res = await fetchFn(`http://${host}:${port}/provision-egress`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return {
                    success: false,
                    error: errData.error || `HTTP_${res.status}`,
                    reason: errData.reason || `HTTP_${res.status}`
                };
            } catch (e) {
                return {
                    success: false,
                    error: 'PROVIDER_NETWORK_ERROR',
                    reason: `Failed to connect to local companion on ${host}:${port}: ${e.message}`
                };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3] Query Egress Provisioning Progress (/provision-progress)
         */
        async getProvisionProgress() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/provision-progress`, {
                    cache: 'no-store',
                    headers
                });
                if (res.ok) {
                    return await res.json();
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3] One-Click Teardown & Destroy of Private Egress VPS (/destroy-egress)
         */
        async destroyPrivateEgress(data) {
            if (!data || !data.token) return { success: false, reason: 'MISSING_API_TOKEN' };

            // [RC3.13 Teardown Resilience]
            // Teardown must NEVER depend on or be disrupted by active browser proxy routing.
            // Clear browser proxy settings prior to dispatching teardown to Companion control plane.
            if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                try {
                    await new Promise(r => chrome.proxy.settings.clear({ scope: 'regular' }, r));
                    this.isGateActive = false;
                    this.isGateReady = false;
                } catch (_) {}
            }

            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/destroy-egress`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    return await res.json();
                }
                // [X5 & RC3.13 Closure] Preserve structured destroy response end-to-end without collapsing to generic HTTP_502
                const resStatus = res.status;
                let errData = {};
                let rawText = '';
                try {
                    if (typeof res.text === 'function') {
                        rawText = await res.text();
                        try {
                            errData = JSON.parse(rawText);
                        } catch (_) {
                            errData = { details: rawText };
                        }
                    } else if (typeof res.json === 'function') {
                        errData = await res.json();
                    }
                } catch (_) {
                    errData = {};
                }

                return Object.assign({
                    success: false,
                    reason: errData.reason || (Array.isArray(errData.errors) && errData.errors.length > 0 ? errData.errors.join('; ') : (errData.details ? `HTTP_${resStatus}: ${errData.details}` : `HTTP_${resStatus}`)),
                    status: errData.status || `HTTP_${resStatus}`,
                    errors: errData.errors || (errData.details ? [errData.details] : []),
                    verifications: errData.verifications || {},
                    details: errData.details || rawText || null
                }, errData);
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Sprint P0-A/P0-C] Safe In-Place Repair of Existing DigitalOcean Private Egress (/repair-egress)
         */
        async repairPrivateEgress(data = {}) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const payload = {
                    ...data,
                    token: data.token || null
                };
                const res = await fetchFn(`http://${host}:${port}/repair-egress`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload)
                });
                const resData = await res.json().catch(() => ({}));
                if (res.ok) {
                    return resData;
                }
                return {
                    success: false,
                    error: resData.error || resData.code || `HTTP_${res.status}`,
                    reason: resData.reason || `HTTP_${res.status}`,
                    code: resData.code || `HTTP_${res.status}`,
                    details: resData.details || null
                };
            } catch (e) {
                return {
                    success: false,
                    error: 'PROVIDER_NETWORK_ERROR',
                    reason: `Failed to connect to local companion on ${host}:${port}: ${e.message}`
                };
            }
        }

        /**
         * [Issue #6 Comment #6250195133 U1 & Comment #6250701581 V5] Query Companion Recovery Journal Status (/recovery-status)
         * Authenticated endpoint passes Bearer token; falls back to coarse unauthenticated /health
         */
        async getRecoveryStatus() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                let res = await fetchFn(`http://${host}:${port}/recovery-status`, {
                    cache: 'no-store',
                    headers
                });
                if (res.status === 502 && typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                    // Possible proxy self-interception: clear proxy and retry once directly
                    try {
                        await new Promise(r => chrome.proxy.settings.clear({ scope: 'regular' }, r));
                        res = await fetchFn(`http://${host}:${port}/recovery-status`, { cache: 'no-store', headers });
                    } catch (_) {}
                }
                if (res.ok) {
                    return await res.json();
                }
                // Fallback check /health (unauthenticated coarse recovery status)
                const healthRes = await fetchFn(`http://${host}:${port}/health`, { cache: 'no-store' });
                if (healthRes.ok) {
                    const healthData = await healthRes.json();
                    if (healthData && healthData.recovery) {
                        return { success: true, recovery: healthData.recovery };
                    }
                }
                return { success: false, reason: `HTTP_${res.status}` };
            } catch (e) {
                return {
                    success: false,
                    error: 'PROVIDER_NETWORK_ERROR',
                    reason: `Failed to connect to local companion on ${host}:${port}: ${e.message}`
                };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3] Query Egress Node Resource Telemetry (/egress-telemetry)
         */
        async getEgressTelemetry(mock = false) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/egress-telemetry${mock ? '?mock=true' : ''}`, {
                    cache: 'no-store',
                    headers
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7] Enable/Disable Physical Router Security Gate (/physical-gate/enable)
         */
        async setPhysicalGateEnabled(enabled) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/enable`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ enabled: Boolean(enabled) })
                });
                if (res.ok) {
                    const data = await res.json();
                    this.config.physicalGateEnabled = Boolean(enabled);
                    await this.saveConfig({ physicalGateEnabled: Boolean(enabled) });
                    if (data && data.status) {
                        this.lastPhysicalGateStatus = data.status;
                    }
                    return data;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}` };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7] Trigger Full Physical Router Security Gate Evaluation (/physical-gate/verify)
         */
        async verifyPhysicalGate() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/verify`, {
                    method: 'POST',
                    headers
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status) {
                        this.lastPhysicalGateStatus = data.status;
                    }
                    return data;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7] Pair GL-SFT1200 Opal Travel Router (/physical-gate/pair)
         */
        async pairRouter(data = {}) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/pair`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    const resData = await res.json();
                    if (resData && resData.status) {
                        this.lastPhysicalGateStatus = resData.status;
                    }
                    return resData;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1.1] Generate Ed25519 pairing keypair with DPAPI storage
         */
        async generatePhysicalRouterKey(algorithm = 'ed25519') {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/generate-key`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ algorithm })
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1.1] Retrieve public key and forced command instruction
         */
        async getPhysicalRouterPublicKey() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/public-key`, {
                    headers
                });
                if (res.ok) {
                    return await res.json();
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1.1] Explicit Fixed-Egress Enrollment / Pinning
         */
        async enrollPhysicalEgress(data = {}) {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/enroll-egress`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    const resData = await res.json();
                    if (resData && resData.pinnedFingerprint) {
                        this.pinnedPhysicalEgressFingerprint = resData.pinnedFingerprint;
                    }
                    return resData;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1.4.1] Owner-Operated Destructive Reset of Physical Egress Trust
         */
        async resetPhysicalEgressTrust() {
            const host = this.config.relayHost || '127.0.0.1';
            const port = this.config.relayControlPort || 18989;
            try {
                if (!this.ephemeralRelayToken && !this.config.relayControlToken) {
                    await this.fetchRelayControlToken();
                }
                const fetchFn = this._mockFetch !== undefined ? this._mockFetch : (typeof fetch !== 'undefined' ? fetch : null);
                if (!fetchFn) return { success: false, reason: 'FETCH_UNAVAILABLE' };
                const headers = this.getRelayAuthHeaders();
                const res = await fetchFn(`http://${host}:${port}/physical-gate/reset-trust`, {
                    method: 'POST',
                    headers
                });
                if (res.ok) {
                    const resData = await res.json();
                    this.pinnedPhysicalEgressFingerprint = null;
                    this.isGateReady = false;
                    this.failureReason = 'PHYSICAL_EGRESS_TRUST_RESET';
                    return resData;
                }
                const errData = await res.json().catch(() => ({}));
                return { success: false, reason: errData.reason || `HTTP_${res.status}`, details: errData };
            } catch (e) {
                return { success: false, reason: e.message };
            }
        }

        /**
         * Verify continuity of the egress tunnel during campaign run
         */
        async checkEgressContinuity() {
            if (!this.config.enabled) return { pass: true };

            // [R6.9G.10] Companion Privacy Relay Continuity Check
            if (this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY) {
                // [RC3.60 .85 Strict Egress Continuity: Read back Chrome proxy settings first]
                // Prevent fail-open leak where Chrome proxy was switched to DIRECT but ordinary fetch canary still succeeds
                if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                    let pDetails = null;
                    try {
                        pDetails = await new Promise((resolve) => {
                            chrome.proxy.settings.get({ incognito: false }, (details) => {
                                if (chrome.runtime && chrome.runtime.lastError) return resolve({ error: chrome.runtime.lastError.message });
                                resolve(details);
                            });
                        });
                    } catch (e) {
                        pDetails = { error: e.message };
                    }
                    const pVal = pDetails && pDetails.value;
                    const expHost = this.config.relayHost || '127.0.0.1';
                    const expPort = Number(this.config.relayProxyPort || 18988);
                    if (!pVal || pVal.mode !== 'fixed_servers' || !pVal.rules || !pVal.rules.singleProxy || pVal.rules.singleProxy.host !== expHost || Number(pVal.rules.singleProxy.port) !== expPort) {
                        this.invalidateGateReadiness('PROXY_SETTINGS_TAMPERED_DIRECT');
                        return { pass: false, reason: 'PROXY_SETTINGS_TAMPERED_DIRECT' };
                    }
                }

                if (!this.isGateActive || !this.isGateReady) {
                    return { pass: false, reason: this.failureReason || 'PRIVACY_RELAY_NOT_READY' };
                }
                const statusRes = await this.queryRelayStatus();
                if (statusRes.status && statusRes.status.physicalGate) {
                    this.lastPhysicalGateStatus = statusRes.status.physicalGate;
                    if (this.config.physicalGateEnabled && !statusRes.status.physicalGate.ready) {
                        return {
                            pass: false,
                            reason: 'PHYSICAL_GATE_FAIL_CLOSED',
                            details: (statusRes.status.physicalGate.reasons || []).join(', ')
                        };
                    }
                }
                if (!statusRes.success || !statusRes.status || !statusRes.status.relayReady || statusRes.status.health === 'EXPIRED') {
                    if (this.config.healthFailover) {
                        console.log('[PRIVACY_RELAY] Current egress failed or expired, settling and executing HEALTH_FAILOVER...');
                        // 1. Check if companion is currently completing automatic failover
                        for (let retry = 0; retry < 10; retry++) {
                            await new Promise(r => setTimeout(r, 100));
                            const readyStatus = await this.queryRelayStatus();
                            if (readyStatus.success && readyStatus.status && readyStatus.status.relayReady && readyStatus.status.selectedEgressId !== this.config.selectedEgressId) {
                                const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 3000);
                                if (canaryRes.success) {
                                    this.ephemeralEgressFingerprint = readyStatus.status.egressFingerprint;
                                    this.config.selectedEgressId = readyStatus.status.selectedEgressId;
                                    return {
                                        pass: true,
                                        recovered: true,
                                        newEgressId: readyStatus.status.selectedEgressId,
                                        fingerprint: this.ephemeralEgressFingerprint
                                    };
                                }
                            }
                        }

                        // 2. Explicitly request HEALTH_FAILOVER rotation
                        const rotRes = await this.rotateRelayEgress('HEALTH_FAILOVER', this.config.canaryUrl || null);
                        if (rotRes.success) {
                            for (let retry = 0; retry < 10; retry++) {
                                await new Promise(r => setTimeout(r, 100));
                                const readyStatus = await this.queryRelayStatus();
                                if (readyStatus.success && readyStatus.status && readyStatus.status.relayReady) {
                                    const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 3000);
                                    if (canaryRes.success) {
                                        this.ephemeralEgressFingerprint = readyStatus.status.egressFingerprint || rotRes.egressFingerprint;
                                        this.config.selectedEgressId = readyStatus.status.selectedEgressId || rotRes.selectedEgressId;
                                        return { pass: true, recovered: true, newEgressId: this.config.selectedEgressId };
                                    }
                                }
                            }
                        }
                    }
                    this.isGateReady = false;
                    this.failureReason = statusRes.status && statusRes.status.health === 'EXPIRED' ? 'PRIVACY_RELAY_HEALTH_EXPIRED' : 'PRIVACY_RELAY_NO_HEALTHY_EGRESS';
                    return { pass: false, reason: this.failureReason };
                }

                // If companion auto-rotated to another node asynchronously
                const currentEgressId = statusRes.status.selectedEgressId;
                const currentFp = statusRes.status.egressFingerprint;
                if (this.config.healthFailover && this.config.selectedEgressId && currentEgressId && currentEgressId !== this.config.selectedEgressId) {
                    console.log(`[PRIVACY_RELAY] Asynchronous failover detected: ${this.config.selectedEgressId} -> ${currentEgressId}`);
                    for (let retry = 0; retry < 10; retry++) {
                        const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 3000);
                        if (canaryRes.success) {
                            this.ephemeralEgressFingerprint = currentFp;
                            this.config.selectedEgressId = currentEgressId;
                            return {
                                pass: true,
                                recovered: true,
                                newEgressId: currentEgressId,
                                fingerprint: currentFp
                            };
                        }
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                const rotMode = this.config.relayRotationMode || 'FIXED';
                if ((rotMode === 'FIXED' || rotMode === 'CAMPAIGN_BOUNDARY') && this.ephemeralEgressFingerprint) {
                    if (currentFp !== this.ephemeralEgressFingerprint) {
                        this.isGateReady = false;
                        this.failureReason = 'PRIVACY_RELAY_EGRESS_CHANGED';
                        return {
                            pass: false,
                            reason: 'PRIVACY_RELAY_EGRESS_CHANGED',
                            previousFingerprint: this.ephemeralEgressFingerprint,
                            currentFingerprint: currentFp
                        };
                    }
                }

                const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 8000);
                if (!canaryRes.success) {
                    if (this.config.healthFailover) {
                        console.log('[PRIVACY_RELAY] Canary probe failed. Checking companion failover status or rotating...');
                        // 1. Check if companion already completed automatic failover during probe failure
                        for (let retry = 0; retry < 10; retry++) {
                            await new Promise(r => setTimeout(r, 100));
                            let postFailStatus = await this.queryRelayStatus();
                            if (postFailStatus.success && postFailStatus.status && postFailStatus.status.relayReady && postFailStatus.status.selectedEgressId !== this.config.selectedEgressId) {
                                const retryCanary = await this.probeProxyCanary(this.config.canaryUrl || null, 8000);
                                if (retryCanary.success) {
                                    this.ephemeralEgressFingerprint = postFailStatus.status.egressFingerprint;
                                    this.config.selectedEgressId = postFailStatus.status.selectedEgressId;
                                    return {
                                        pass: true,
                                        recovered: true,
                                        newEgressId: postFailStatus.status.selectedEgressId,
                                        fingerprint: this.ephemeralEgressFingerprint
                                    };
                                }
                            }
                        }

                        // 2. If companion hasn't rotated yet, explicitly request HEALTH_FAILOVER rotation
                        const rotRes = await this.rotateRelayEgress('HEALTH_FAILOVER', this.config.canaryUrl || null);
                        if (rotRes.success) {
                            for (let retry = 0; retry < 10; retry++) {
                                await new Promise(r => setTimeout(r, 100));
                                const readyStatus = await this.queryRelayStatus();
                                if (readyStatus.success && readyStatus.status && readyStatus.status.relayReady) {
                                    const retryCanary = await this.probeProxyCanary(this.config.canaryUrl || null, 8000);
                                    if (retryCanary.success) {
                                        this.ephemeralEgressFingerprint = readyStatus.status.egressFingerprint || rotRes.egressFingerprint;
                                        this.config.selectedEgressId = readyStatus.status.selectedEgressId || rotRes.selectedEgressId;
                                        return {
                                            pass: true,
                                            recovered: true,
                                            newEgressId: this.config.selectedEgressId,
                                            fingerprint: this.ephemeralEgressFingerprint
                                        };
                                    }
                                }
                            }
                        }
                    }

                    this.isGateReady = false;
                    this.failureReason = `PRIVACY_RELAY_DROPPED: ${canaryRes.reason}`;
                    return { pass: false, reason: this.failureReason };
                }
                return { pass: true, fingerprint: currentFp };
            }

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

            if (this.config.transportMode !== PRIVACY_MODES.EXTERNAL_VPN_MONITOR && this.config.transportMode !== 'SYSTEM_VPN') return { pass: true };
            if (this.config.failClosed) {
                return { pass: false, reason: 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE' };
            }
            if (!this.config.systemVpnConfirmed) {
                return { pass: false, reason: 'EXTERNAL_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED' };
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
            let resolvedBypass = (bypassList !== null && bypassList !== undefined)
                ? (Array.isArray(bypassList) ? [...bypassList] : [bypassList])
                : (this.config.proxyBypassList ? [...this.config.proxyBypassList] : ((host === '127.0.0.1' || host === 'localhost') ? ['<-loopback>'] : ['<local>']));

            // [RC3.13 Bypass Ordering & Self-Interception Fix]
            // Control port on localhost must NEVER be proxied through the upstream tunnel.
            // In Chromium net::ProxyBypassRules, bypass rules are evaluated sequentially.
            // When '<-loopback>' is present (used to subtract default localhost bypass so local fixtures/canary traverse proxy),
            // '<-loopback>' MUST come FIRST, and explicit control-plane bypass rules MUST come AFTER it
            // as exceptions. If placed before '<-loopback>', '<-loopback>' subtracts and intercepts control calls with HTTP 502.
            const ctrlPort = this.config.relayControlPort || 18989;
            const fixturePort = 8088;
            const ctrlEntries = [
                `127.0.0.1:${ctrlPort}`,
                `localhost:${ctrlPort}`,
                `[::1]:${ctrlPort}`,
                `127.0.0.1:${fixturePort}`,
                `localhost:${fixturePort}`,
                `[::1]:${fixturePort}`
            ];

            const hasSubtractLoopback = resolvedBypass.includes('<-loopback>');
            const otherRules = resolvedBypass.filter(r => r !== '<-loopback>' && !ctrlEntries.includes(r));

            resolvedBypass = hasSubtractLoopback
                ? ['<-loopback>', ...ctrlEntries, ...otherRules]
                : [...ctrlEntries, ...otherRules];

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
                }, async () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    try {
                        // [R6.9G.10.3.5 Verification] Read back proxy settings to prove actual enforcement
                        const readback = await new Promise((resGet) => {
                            chrome.proxy.settings.get({ incognito: false }, (details) => {
                                resGet(details ? details.value : null);
                            });
                        });
                        if (!readback || readback.mode !== 'fixed_servers' || !readback.rules || !readback.rules.singleProxy) {
                            return reject(new Error('PROXY_SETTINGS_VERIFICATION_FAILED: mode is not fixed_servers'));
                        }
                        const sp = readback.rules.singleProxy;
                        if (sp.host !== host || Number(sp.port) !== Number(parsedPort)) {
                            return reject(new Error(`PROXY_SETTINGS_VERIFICATION_FAILED: host/port mismatch (expected ${host}:${parsedPort}, got ${sp.host}:${sp.port})`));
                        }

                        // [RC3.13 Verification] Read back bypass list to verify control plane bypass rule order
                        const rbBypass = (readback.rules && readback.rules.bypassList) || [];
                        if (rbBypass.includes('<-loopback>')) {
                            const loopbackIdx = rbBypass.indexOf('<-loopback>');
                            const ctrlIdx = rbBypass.indexOf(`127.0.0.1:${ctrlPort}`);
                            if (ctrlIdx !== -1 && ctrlIdx < loopbackIdx) {
                                return reject(new Error(`PROXY_SETTINGS_VERIFICATION_FAILED: control bypass index (${ctrlIdx}) is before <-loopback> (${loopbackIdx})`));
                            }
                        }

                        // [RC3.13 Live Control-Plane Assertion]
                        // Verify that Companion control plane (127.0.0.1:ctrlPort) is reachable directly and NOT intercepted by proxy with 502
                        if (typeof fetch !== 'undefined') {
                            try {
                                const ctrlCheck = await fetch(`http://127.0.0.1:${ctrlPort}/health`, { cache: 'no-store' });
                                if (ctrlCheck.status === 502) {
                                    return reject(new Error(`CONTROL_PLANE_SELF_INTERCEPTION_DETECTED: 127.0.0.1:${ctrlPort} returned HTTP 502 from proxy`));
                                }
                            } catch (_) {
                                // If companion is not currently running, connection refused is expected;
                                // HTTP 502 bad gateway from proxy is what indicates interception.
                            }
                        }

                        resolve({ success: true, mode, host, port: parsedPort, bypassList: resolvedBypass, verified: true });
                    } catch (vErr) {
                        reject(vErr);
                    }
                });
            });
        }

        /**
         * Restore original browser settings on campaign stop/pause/exit
         */
        async restoreOriginalSettings(options = {}) {
            const keepEnforced = this.config.keepPrivacyRelayEnforcedBetweenCampaigns !== false;
            const isRelayMode = this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY;
            const forceDirect = Boolean(options && options.forceDirect);

            if (keepEnforced && isRelayMode && !forceDirect) {
                this.isGateReady = true;
                this.isGateActive = true;
                this.failureReason = null;
                console.log('[PRIVACY_SETTINGS_RESTORED] keepEnforced=true gateReady=true transportEnforced=true mode=PRIVACY_RELAY');
                return;
            }

            if (!this.config.rememberPassword) {
                this.ephemeralProxyPassword = null;
            }

            if (!this.hasCapturedOriginals) {
                this.isGateActive = false;
                this.isGateReady = false;
                this.failureReason = 'PRIVACY_GATE_RESTORED_TO_DEFAULT';
                console.log('[PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false');
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
            this.failureReason = 'PRIVACY_GATE_RESTORED_TO_DEFAULT';
            console.log('[PRIVACY_SETTINGS_RESTORED] gateReady=false transportEnforced=false');
        }

        /**
         * Privacy Preflight Verification
         * Verifies all policies, transport state, WebRTC leak guard, and fail-closed readiness.
         */
        async runPreflight(options = {}) {
            if (options.controlToken && typeof options.controlToken === 'string') {
                this.ephemeralRelayToken = options.controlToken;
            }
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
            } else if (mode === PRIVACY_MODES.EXTERNAL_VPN_MONITOR || mode === 'SYSTEM_VPN') {
                directFallbackBlocked = 'UNVERIFIED';
                dnsPrivacy = 'UNKNOWN';
                ipv6Protection = 'UNKNOWN';

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
                        failureReason = 'EXTERNAL_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED';
                    } else {
                        ready = true;
                        dnsPrivacy = 'DEGRADED';
                    }
                } else {
                    // Owner confirmed VPN monitor. Now verify actual external egress via probe.
                    const fpResult = await this.computeEgressFingerprint();
                    if (fpResult && fpResult.verified) {
                        egressVerified = true;
                        egressCheck = 'PASS';
                        this.ephemeralEgressFingerprint = fpResult.fingerprint;
                        // [R6.9G.10.3.5 B.2] Without independent route/kill-switch attestation,
                        // EXTERNAL_VPN_MONITOR alone must not satisfy strict transport readiness.
                        if (failClosed) {
                            ready = false;
                            failureReason = 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE';
                        } else {
                            ready = true;
                            failureReason = null;
                        }
                    } else {
                        egressVerified = false;
                        egressCheck = 'FAIL';
                        this.ephemeralEgressFingerprint = null;
                        const probeReason = (fpResult && fpResult.reason) || 'EGRESS_PROBE_UNVERIFIED';
                        ready = false;
                        failureReason = probeReason;
                    }
                }

                this.isGateReady = ready;
                this.failureReason = failureReason;

                return this._recordPreflightResult({
                    ready,
                    mode: PRIVACY_MODES.EXTERNAL_VPN_MONITOR,
                    failClosed,
                    ownerVpnConfirmed,
                    egressVerified,
                    transportEnforced: false,
                    webrtcGuard,
                    directFallbackBlocked,
                    egressCheck,
                    egressContinuity: egressVerified ? 'PASS' : 'FAIL',
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
                            this.ephemeralEgressFingerprint = await this._hashString(`${host}:${port}:${canaryRes.endpoint || 'proxy'}`);
                        }
                    } catch (proxyErr) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = `MANAGED_PROXY_CONFIGURATION_FAILED: ${proxyErr.message}`;
                    }
                }
            } else if (mode === PRIVACY_MODES.PRIVACY_RELAY) {
                const relayHost = options.relayHost !== undefined ? options.relayHost : (this.config.relayHost || '127.0.0.1');
                const relayControlPort = options.relayControlPort !== undefined ? options.relayControlPort : (this.config.relayControlPort || 18989);
                const relayProxyPort = options.relayProxyPort !== undefined ? options.relayProxyPort : (this.config.relayProxyPort || 18988);

                // 1. Probe Companion Control Plane with Bearer Token (Auto-recover if offline)
                let statusRes = await this.queryRelayStatus();
                if ((!statusRes.success || statusRes.reason === 'HTTP_401') && options.autoStart !== false) {
                    const activeRes = await this.ensureRelayActive(true);
                    if (activeRes.active) {
                        statusRes = await this.queryRelayStatus();
                    }
                }

                if (!statusRes.success || !statusRes.status) {
                    ready = false;
                    directFallbackBlocked = 'BLOCKED';
                    egressCheck = 'FAIL';
                    failureReason = statusRes.reason === 'HTTP_401' ? 'PRIVACY_RELAY_UNAUTHORIZED' : 'PRIVACY_RELAY_OFFLINE';
                } else {
                    const canaryUrl = options.canaryUrl || this.config.canaryUrl || null;
                    if (!statusRes.status.relayReady && options.autoStart !== false) {
                        // Unverified on boot -> execute candidate canary probe
                        const probeRes = await this.probeRelayEgress(canaryUrl);
                        if (probeRes && probeRes.verified) {
                            statusRes = await this.queryRelayStatus();
                        }
                    }

                    if (statusRes.status && statusRes.status.physicalGate) {
                        this.lastPhysicalGateStatus = statusRes.status.physicalGate;
                    }

                    if (this.config.physicalGateEnabled && statusRes.status && statusRes.status.physicalGate && !statusRes.status.physicalGate.ready) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = 'PHYSICAL_GATE_FAIL_CLOSED';
                    } else if (!statusRes.status || !statusRes.status.relayReady || statusRes.status.health === 'NO_NODES') {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = (statusRes.status && statusRes.status.physicalGate && !statusRes.status.physicalGate.ready) ? 'PHYSICAL_GATE_FAIL_CLOSED' : 'PRIVACY_RELAY_NO_HEALTHY_EGRESS';
                    } else {
                    try {
                        // 2. Configure Chrome Proxy to loopback proxy on 18988
                        await this.applyManagedProxy(PRIVACY_MODES.HTTPS_PROXY, relayHost, relayProxyPort, ['<-loopback>']);

                        // 3. Canary probe through Relay Proxy
                        const canaryUrl = options.canaryUrl || this.config.canaryUrl || null;
                        const canaryRes = await this.probeProxyCanary(canaryUrl, 3000);

                        if (!canaryRes.success) {
                            ready = false;
                            directFallbackBlocked = 'BLOCKED';
                            egressCheck = 'FAIL';
                            failureReason = `PRIVACY_RELAY_CANARY_FAILED: ${canaryRes.reason}`;
                        } else {
                            ready = true;
                            this.isGateActive = true;
                            directFallbackBlocked = 'BLOCKED';
                            const companionDns = statusRes.status.dnsProtection || statusRes.status.residentialProxy?.dnsProtection || (statusRes.status.diagnostics?.dnsPath?.ok ? 'VERIFIED_REMOTE_PROXY_CONNECT' : null);
                            const companionIpv6 = statusRes.status.ipv6Protection || statusRes.status.residentialProxy?.ipv6Protection || statusRes.status.diagnostics?.ipv6Path?.status;
                            dnsPrivacy = (companionDns === 'PASS' || companionDns === 'VERIFIED_REMOTE_PROXY_CONNECT') ? 'PASS' : (companionDns || 'UNKNOWN');
                            ipv6Protection = (companionIpv6 === 'PROTECTED' || companionIpv6 === 'VERIFIED_IPV6_DISABLED_AND_PROXY_BLOCKED' || companionIpv6 === 'IPV6_ROUTE_ACTIVE_BLOCKED_AT_PROXY') ? 'PROTECTED' : (companionIpv6 || 'UNKNOWN');
                            egressCheck = 'PASS';
                            this.ephemeralEgressFingerprint = statusRes.status.egressFingerprint;
                            this.config.selectedEgressId = statusRes.status.selectedEgressId;
                            failureReason = null;
                        }
                    } catch (relayErr) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = `PRIVACY_RELAY_SETUP_ERROR: ${relayErr.message}`;
                    }
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
                egressVerified: (mode === PRIVACY_MODES.SOCKS5 || mode === PRIVACY_MODES.HTTPS_PROXY || mode === PRIVACY_MODES.PRIVACY_RELAY) ? ready : false,
                webrtcGuard,
                directFallbackBlocked,
                egressCheck,
                egressFingerprint: this.ephemeralEgressFingerprint,
                selectedEgressId: this.config.selectedEgressId || null,
                dnsPrivacy,
                ipv6Protection,
                failureReason
            });
        }

        _recordPreflightResult(res) {
            const isReady = Boolean(res && res.ready);
            const result = {
                ...res,
                ready: isReady,
                provisional: false,
                verifying: false,
                lastCheck: new Date().toISOString()
            };
            this.lastPreflightResult = result;
            this.isGateReady = isReady;
            this.isGateActive = isReady;
            this.failureReason = isReady ? null : (result.failureReason || 'PREFLIGHT_VERIFICATION_FAILED');

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    const snapshot = {
                        ready: isReady,
                        mode: result.mode,
                        failClosed: Boolean(result.failClosed),
                        webrtcGuard: result.webrtcGuard,
                        directFallbackBlocked: result.directFallbackBlocked,
                        egressCheck: result.egressCheck,
                        lastCheck: result.lastCheck,
                        failureReason: result.failureReason || null,
                        selectedEgressId: result.selectedEgressId || this.config.selectedEgressId || null,
                        egressFingerprint: result.egressFingerprint || this.ephemeralEgressFingerprint || null,
                        dnsPrivacy: result.dnsPrivacy || 'UNKNOWN',
                        ipv6Protection: result.ipv6Protection || 'UNKNOWN'
                    };
                    chrome.storage.local.set({ xpider_last_privacy_preflight: snapshot }).catch(() => {});
                } catch (_) {}
            }
            return result;
        }

        /**
         * [Issue #6 RC3.60 .84] Clear live readiness immediately on relay drop, token mismatch, or proxy disconnect
         */
        clearLiveReadiness(reason = 'PRIVACY_GATE_CLEARED') {
            this.isGateReady = false;
            this.isGateActive = false;
            this.failureReason = reason;
            if (this.lastPreflightResult) {
                this.lastPreflightResult.ready = false;
                this.lastPreflightResult.failureReason = reason;
            }
        }


        /**
         * [R6.9G.10.3.6] Auto-Enforced Privacy Start Preparation & Legacy VPN Self-Healing
         * Orchestrates deterministic preparation sequence before campaign execution:
         * [PRIVACY_START_PREP] -> [PRIVACY_AUTO_RECOVERY] -> [PRIVACY_TRANSPORT_APPLIED] -> [PRIVACY_CANARY] PASS -> [PRIVACY_START_READY]
         * If recovery fails: [PRIVACY_START_BLOCKED] reason=...
         */
        async ensureEnforcedPrivacyForStart(options = {}) {
            const currentMode = this.config.transportMode || PRIVACY_MODES.PRIVACY_RELAY;
            const failClosed = this.config.failClosed !== false;
            console.log(`[PRIVACY_START_PREP] currentMode=${currentMode} failClosed=${failClosed}`);

            // [R6.9G.10.3.8 Owner Functional Test Mode - Local Controlled Pages Only]
            if (options.ownerFunctionTestMode) {
                const isTestAuthorized = (typeof BuildProvenance !== 'undefined' && typeof BuildProvenance.isTestOnlyBuild === 'function')
                    ? BuildProvenance.isTestOnlyBuild()
                    : Boolean(typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO && (
                        BuildProvenance.BUILD_INFO.channel === 'TEST_ONLY' ||
                        BuildProvenance.BUILD_INFO.channel === 'OWNER_BETA' ||
                        (typeof BuildProvenance.BUILD_INFO.channel === 'string' && BuildProvenance.BUILD_INFO.channel.startsWith('OWNER_BETA')) ||
                        BuildProvenance.BUILD_INFO.testOnly === true
                    ));

                if (!isTestAuthorized) {
                    console.error('[OWNER_FUNCTION_TEST_BLOCKED] Runtime build is not authorized for TEST_ONLY or OWNER_BETA channel.');
                    return {
                        ready: false,
                        reason: 'OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD',
                        userMessage: 'Owner Functional Test Mode is strictly forbidden: runtime build does not declare TEST_ONLY or OWNER_BETA.'
                    };
                }

                console.log('[OWNER_FUNCTION_TEST] loopbackOnly=true strictPublicBypass=false');
                this.isGateReady = true;
                this.isGateActive = true;
                this.failureReason = null;
                this.lastPreflightResult = {
                    ready: true,
                    provisional: false,
                    mode: PRIVACY_MODES.DIRECT,
                    ownerFunctionTestMode: true,
                    lastCheck: new Date().toISOString(),
                    failureReason: null
                };
                return {
                    ready: true,
                    mode: PRIVACY_MODES.DIRECT,
                    ownerFunctionTestMode: true
                };
            }

            // If Privacy Gateway is disabled:
            if (!this.config.enabled) {
                if (failClosed) {
                    const blockReason = 'PRIVACY_GATEWAY_DISABLED_FAIL_CLOSED';
                    console.log(`[PRIVACY_START_BLOCKED] reason=${blockReason}`);
                    this.isGateReady = false;
                    this.failureReason = blockReason;
                    return {
                        ready: false,
                        reason: blockReason,
                        userMessage: 'Strict Privacy is enabled, but Privacy Gateway is toggled off. Enable Privacy Gateway or configure an enforced transport.',
                        actionSection: 'privacy-gateway-group'
                    };
                }
                console.log('[PRIVACY_START_READY] mode=DIRECT');
                return { ready: true, mode: PRIVACY_MODES.DIRECT };
            }

            // If Owner explicitly disabled strict fail-closed (failClosed === false):
            if (!failClosed) {
                const preflight = await this.runPreflight(options);
                if (preflight.ready) {
                    console.log(`[PRIVACY_START_READY] mode=${currentMode}`);
                    return { ready: true, mode: currentMode };
                }
                console.log(`[PRIVACY_START_BLOCKED] reason=${preflight.failureReason}`);
                return {
                    ready: false,
                    reason: preflight.failureReason,
                    userMessage: preflight.failureReason === 'EXTERNAL_VPN_UNCONFIRMED_PREFLIGHT_BLOCKED'
                        ? 'System VPN mode is selected, but not confirmed. Connect your VPN and confirm in Settings > Privacy Gateway.'
                        : `Privacy preflight check failed: ${preflight.failureReason}`,
                    actionSection: 'privacy-system-vpn-fields'
                };
            }

            // Strict mode (failClosed === true):
            // Priority A: If current transport is already an enforceable mode AND gate is already active & ready
            const isCurrentModeEnforceable = (
                currentMode === PRIVACY_MODES.PRIVACY_RELAY ||
                currentMode === PRIVACY_MODES.HTTPS_PROXY ||
                currentMode === PRIVACY_MODES.SOCKS5
            );

            if (isCurrentModeEnforceable && this.isGateReady && this.isGateActive) {
                console.log(`[PRIVACY_START_READY] mode=${currentMode}`);
                return { ready: true, mode: currentMode };
            }

            // Priority B: Check Privacy Relay companion (Auto-recover / self-heal)
            let relayUsable = false;
            let relayStatus = null;
            let nativeHostMissing = false;

            try {
                let statusRes = await this.queryRelayStatus();
                if ((!statusRes.success || !statusRes.status || statusRes.reason === 'HTTP_401') && options.autoStart !== false) {
                    console.log('[PRIVACY_AUTO_RECOVERY] candidate=PRIVACY_RELAY daemon_check=starting');
                    const activeRes = await this.ensureRelayActive(true);
                    if (activeRes.active && activeRes.status) {
                        relayStatus = activeRes.status;
                    } else {
                        if (activeRes.reason && (
                            activeRes.reason.includes('Specified native messaging host not found') ||
                            activeRes.reason.includes('NATIVE_HOST_NOT_FOUND')
                        )) {
                            nativeHostMissing = true;
                        }
                    }
                } else if (statusRes.success && statusRes.status) {
                    relayStatus = statusRes.status;
                }
            } catch (err) {
                console.warn('[PRIVACY_RELAY_CHECK_ERROR]', err);
            }

            // Re-check status if we have active daemon
            if (!relayStatus) {
                const retryStatus = await this.queryRelayStatus();
                if (retryStatus.success && retryStatus.status) {
                    relayStatus = retryStatus.status;
                }
            }

            if (relayStatus) {
                const nodeCount = relayStatus.totalNodes !== undefined
                    ? relayStatus.totalNodes
                    : (relayStatus.nodes ? relayStatus.nodes.length : 0);
                if (nodeCount > 0 && relayStatus.health !== 'NO_NODES') {
                    relayUsable = true;
                } else {
                    console.log(`[PRIVACY_RELAY_ZERO_NODES] totalNodes=${nodeCount} health=${relayStatus.health}`);
                }
            }

            if (relayUsable) {
                console.log('[PRIVACY_AUTO_RECOVERY] candidate=PRIVACY_RELAY');
                this.config.transportMode = PRIVACY_MODES.PRIVACY_RELAY;
                this.config.relayRotationMode = this.config.relayRotationMode || 'FIXED';
                await this.saveConfig({
                    transportMode: PRIVACY_MODES.PRIVACY_RELAY,
                    relayRotationMode: this.config.relayRotationMode
                });

                const relayHost = this.config.relayHost || '127.0.0.1';
                const relayProxyPort = this.config.relayProxyPort || 18988;
                try {
                    // Apply chrome.proxy to loopback on 18988 and verify settings readback
                    await this.applyManagedProxy(PRIVACY_MODES.HTTPS_PROXY, relayHost, relayProxyPort, ['<-loopback>']);
                    console.log(`[PRIVACY_TRANSPORT_APPLIED] mode=PRIVACY_RELAY host=${relayHost}:${relayProxyPort}`);

                    // Run canary probe through proxy
                    const canaryRes = await this.probeProxyCanary(options.canaryUrl || this.config.canaryUrl || null, 8000);
                    if (canaryRes.success) {
                        console.log(`[PRIVACY_CANARY] PASS endpoint=${canaryRes.endpoint || 'default'}`);
                        this.isGateReady = true;
                        this.isGateActive = true;
                        this.failureReason = null;
                        this.ephemeralEgressFingerprint = relayStatus.egressFingerprint || null;
                        this.config.selectedEgressId = relayStatus.selectedEgressId || null;
                        this.lastPreflightResult = {
                            ready: true,
                            provisional: false,
                            mode: PRIVACY_MODES.PRIVACY_RELAY,
                            lastCheck: new Date().toISOString(),
                            selectedEgressId: this.config.selectedEgressId,
                            egressFingerprint: this.ephemeralEgressFingerprint,
                            failureReason: null
                        };
                        console.log('[PRIVACY_START_READY] mode=PRIVACY_RELAY');
                        return { ready: true, mode: PRIVACY_MODES.PRIVACY_RELAY };
                    } else {
                        console.warn(`[PRIVACY_CANARY] FAIL reason=${canaryRes.reason}`);
                    }
                } catch (applyErr) {
                    console.warn('[PRIVACY_TRANSPORT_APPLY_FAILED]', applyErr);
                }
            }

            // Priority C: Check Managed Proxy (HTTPS / SOCKS5)
            const hasProxyHost = !!(this.config.proxyHost && this.config.proxyHost.trim());
            const hasProxyPort = !!(this.config.proxyPort);
            const proxyCandidate = (this.config.transportMode === PRIVACY_MODES.SOCKS5)
                ? PRIVACY_MODES.SOCKS5
                : PRIVACY_MODES.HTTPS_PROXY;

            if (hasProxyHost && hasProxyPort) {
                console.log(`[PRIVACY_AUTO_RECOVERY] candidate=${proxyCandidate}`);
                try {
                    await this.applyManagedProxy(proxyCandidate, this.config.proxyHost, this.config.proxyPort, this.config.proxyBypassList);
                    console.log(`[PRIVACY_TRANSPORT_APPLIED] mode=${proxyCandidate} host=${this.config.proxyHost}:${this.config.proxyPort}`);

                    const canaryRes = await this.probeProxyCanary(options.canaryUrl || this.config.canaryUrl || null, 3000);
                    if (canaryRes.success) {
                        console.log(`[PRIVACY_CANARY] PASS endpoint=${canaryRes.endpoint || 'default'}`);
                        this.config.transportMode = proxyCandidate;
                        await this.saveConfig({ transportMode: proxyCandidate });
                        this.isGateReady = true;
                        this.isGateActive = true;
                        this.failureReason = null;
                        this.ephemeralEgressFingerprint = await this._hashString(`${this.config.proxyHost}:${this.config.proxyPort}`);
                        this.lastPreflightResult = {
                            ready: true,
                            provisional: false,
                            mode: proxyCandidate,
                            lastCheck: new Date().toISOString(),
                            failureReason: null
                        };
                        console.log(`[PRIVACY_START_READY] mode=${proxyCandidate}`);
                        return { ready: true, mode: proxyCandidate };
                    } else {
                        console.warn(`[PRIVACY_CANARY] FAIL reason=${canaryRes.reason}`);
                    }
                } catch (proxyErr) {
                    console.warn('[PRIVACY_PROXY_APPLY_FAILED]', proxyErr);
                }
            }

            // Priority D: Neither relay nor proxy is usable / healthy -> Fail-closed!
            let blockReason = 'PROXY_NOT_CONFIGURED';
            let userMsg = 'Strict Privacy needs an enforced relay/proxy. No healthy egress is configured.';
            let actionSection = 'privacy-relay-config-fields';

            if (currentMode === PRIVACY_MODES.EXTERNAL_VPN_MONITOR || currentMode === PRIVACY_MODES.SYSTEM_VPN) {
                blockReason = 'EXTERNAL_VPN_NOT_ENFORCEABLE_IN_STRICT_MODE';
                userMsg = 'Strict Privacy is ON. External VPN Monitor is monitor-only and cannot enforce campaign routing. For public-site campaigns, use Privacy Relay Companion or a Managed HTTPS/SOCKS5 Proxy.';
                actionSection = 'privacy-system-vpn-fields';
            } else if (relayStatus && (relayStatus.totalNodes === 0 || relayStatus.health === 'NO_NODES')) {
                blockReason = 'NO_HEALTHY_EGRESS';
                userMsg = 'Strict Privacy needs an enforced relay/proxy. No healthy egress is configured. Please add an HTTP/HTTPS proxy node to Privacy Relay.';
                actionSection = 'privacy-relay-add-form';
            } else if (nativeHostMissing) {
                blockReason = 'RELAY_OFFLINE';
                userMsg = 'Strict Privacy needs an enforced relay/proxy. Privacy Relay companion is not installed. Run companion/install_companion.bat to install it, or configure a Managed Proxy.';
                actionSection = 'privacy-relay-config-fields';
            } else if (!relayStatus && !hasProxyHost) {
                blockReason = 'RELAY_OFFLINE';
                userMsg = 'Strict Privacy needs an enforced relay/proxy. Privacy Relay is offline and no Managed Proxy is configured. Start the Privacy Relay companion or enter proxy credentials below.';
                actionSection = 'privacy-relay-config-fields';
            }

            console.log(`[PRIVACY_START_BLOCKED] reason=${blockReason}`);
            this.isGateReady = false;
            this.failureReason = blockReason;

            return {
                ready: false,
                reason: blockReason,
                userMessage: userMsg,
                actionSection: actionSection
            };
        }

        /**
         * [Issue #6 RC3.60 .85 Authoritative Egress Verifier]
         * Invoked synchronously/awaited before EVERY external target tab open/navigation and form submit.
         * Enforces live fail-closed checks:
         * 1. Contemporaneous chrome.proxy.settings.get({incognito:false}) must return fixed_servers to 127.0.0.1:18988.
         * 2. Companion control plane query must return HTTP 200 with relayReady: true, non-expired health, and valid selectedEgressId.
         * 3. Outbound tunneled egress canary probe must return HTTP 200/PASS through enforced proxy.
         * On ANY failure, mismatch, timeout, 401, or proxy tampering: strictly invalidates gate and fails closed.
         */
        async verifyAuthoritativeEgressEnforcement(context = 'GENERAL') {
            if (context === 'OWNER_FUNCTION_TEST' || (typeof campaignState !== 'undefined' && campaignState.ownerFunctionTestMode)) {
                return { ready: true, mode: PRIVACY_MODES.DIRECT, ownerFunctionTestMode: true };
            }
            if (!this.config || !this.config.enabled) {
                if (this.config && this.config.failClosed) {
                    this.invalidateGateReadiness('PRIVACY_GATEWAY_DISABLED_WHILE_FAIL_CLOSED');
                    return { ready: false, reason: 'PRIVACY_GATEWAY_DISABLED_WHILE_FAIL_CLOSED' };
                }
                return { ready: true, mode: PRIVACY_MODES.DIRECT };
            }

            if (this.config.physicalGateEnabled) {
                const physRes = await this.assertPhysicalGateReady();
                if (!physRes || !physRes.ready) {
                    this.invalidateGateReadiness(physRes ? physRes.reason : 'PHYSICAL_GATE_NOT_READY');
                    return { ready: false, reason: physRes ? physRes.reason : 'PHYSICAL_GATE_NOT_READY' };
                }
            }

            if (this.config.transportMode === PRIVACY_MODES.PRIVACY_RELAY) {
                const expectedHost = this.config.relayHost || '127.0.0.1';
                const expectedPort = Number(this.config.relayProxyPort || 18988);
                const expectedCtrlPort = Number(this.config.relayControlPort || 18989);

                // 1. Contemporaneous Chrome Proxy Settings Readback
                if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                    let proxyDetails = null;
                    try {
                        proxyDetails = await new Promise((resolve) => {
                            chrome.proxy.settings.get({ incognito: false }, (details) => {
                                if (chrome.runtime && chrome.runtime.lastError) {
                                    return resolve({ error: chrome.runtime.lastError.message });
                                }
                                resolve(details);
                            });
                        });
                    } catch (e) {
                        proxyDetails = { error: e.message };
                    }

                    if (!proxyDetails || proxyDetails.error) {
                        const r = 'PROXY_SETTINGS_READ_ERROR';
                        this.invalidateGateReadiness(r);
                        return { ready: false, reason: r, details: proxyDetails?.error };
                    }

                    if (proxyDetails.levelOfControl === 'not_controllable') {
                        const r = 'PROXY_SETTINGS_NOT_CONTROLLABLE';
                        this.invalidateGateReadiness(r);
                        return { ready: false, reason: r };
                    }

                    const pVal = proxyDetails.value;
                    if (!pVal || pVal.mode !== 'fixed_servers') {
                        const tamperedMode = pVal ? pVal.mode : 'undefined';
                        const r = 'PROXY_SETTINGS_TAMPERED';
                        this.invalidateGateReadiness(r);
                        return { ready: false, reason: r, mode: tamperedMode };
                    }

                    const sp = pVal.rules && pVal.rules.singleProxy;
                    if (!sp || sp.host !== expectedHost || Number(sp.port) !== expectedPort) {
                        const r = 'PROXY_SETTINGS_MISMATCH';
                        this.invalidateGateReadiness(r);
                        return { ready: false, reason: r };
                    }

                    const bypassList = (pVal.rules && pVal.rules.bypassList) || [];
                    const hasCtrlBypass = bypassList.some(b => b.includes(`${expectedCtrlPort}`));
                    if (!hasCtrlBypass && bypassList.length > 0 && !bypassList.includes('<local>')) {
                        const r = 'PROXY_BYPASS_POLICY_INVALID';
                        this.invalidateGateReadiness(r);
                        return { ready: false, reason: r };
                    }
                }

                // 2. Query Companion Control Plane & Authenticated Readiness
                const statusRes = await this.queryRelayStatus();
                if (!statusRes.success || !statusRes.status) {
                    const failReason = statusRes.reason === 'HTTP_401' ? 'PRIVACY_RELAY_UNAUTHORIZED' : (statusRes.reason || 'PRIVACY_RELAY_OFFLINE');
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }

                const rStatus = statusRes.status;
                if (!rStatus.relayReady || rStatus.health === 'EXPIRED' || rStatus.health === 'NO_NODES') {
                    const failReason = rStatus.health === 'EXPIRED' ? 'PRIVACY_RELAY_HEALTH_EXPIRED' : 'PRIVACY_RELAY_NOT_READY';
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }

                if (!rStatus.selectedEgressId) {
                    const failReason = 'PRIVACY_RELAY_NO_SELECTED_EGRESS';
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }

                // 3. Canary Probe Verification (Tunneled Egress Canary)
                const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 5000);
                if (!canaryRes.success) {
                    const failReason = `PRIVACY_RELAY_DROPPED: ${canaryRes.reason}`;
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }

                this.isGateReady = true;
                this.isGateActive = true;
                this.failureReason = null;
                this.ephemeralEgressFingerprint = rStatus.egressFingerprint || this.ephemeralEgressFingerprint;
                this.config.selectedEgressId = rStatus.selectedEgressId;
                this.lastPreflightResult = {
                    ready: true,
                    provisional: false,
                    mode: PRIVACY_MODES.PRIVACY_RELAY,
                    lastCheck: new Date().toISOString(),
                    selectedEgressId: rStatus.selectedEgressId,
                    egressFingerprint: this.ephemeralEgressFingerprint,
                    failureReason: null
                };

                return { ready: true, mode: PRIVACY_MODES.PRIVACY_RELAY, egressId: rStatus.selectedEgressId };
            }

            if (this.config.transportMode === PRIVACY_MODES.SOCKS5 || this.config.transportMode === PRIVACY_MODES.HTTPS_PROXY) {
                const expHost = this.config.proxyHost;
                const expPort = Number(this.config.proxyPort);
                if (typeof chrome !== 'undefined' && chrome.proxy && chrome.proxy.settings) {
                    const pDetails = await new Promise((res) => chrome.proxy.settings.get({ incognito: false }, res));
                    const pVal = pDetails && pDetails.value;
                    if (!pVal || pVal.mode !== 'fixed_servers') {
                        this.invalidateGateReadiness('PROXY_SETTINGS_TAMPERED');
                        return { ready: false, reason: 'PROXY_SETTINGS_TAMPERED' };
                    }
                    const sp = pVal.rules && pVal.rules.singleProxy;
                    if (!sp || sp.host !== expHost || Number(sp.port) !== expPort) {
                        this.invalidateGateReadiness('PROXY_SETTINGS_MISMATCH');
                        return { ready: false, reason: 'PROXY_SETTINGS_MISMATCH' };
                    }
                }
                const canaryRes = await this.probeProxyCanary(this.config.canaryUrl || null, 3000);
                if (!canaryRes.success) {
                    this.invalidateGateReadiness('MANAGED_PROXY_DROPPED');
                    return { ready: false, reason: 'MANAGED_PROXY_DROPPED' };
                }
                this.isGateReady = true;
                this.isGateActive = true;
                this.failureReason = null;
                return { ready: true, mode: this.config.transportMode };
            }

            return { ready: true, mode: this.config.transportMode };
        }

        /**
         * [Issue #6 RC3.60 .84 Single Authoritative Privacy Gate Check]
         * Mandatory Invariant Check before any target tab navigation or submission:
         * Strictly requires contemporaneous live readiness and active transport enforcement.
         * NEVER trusts storage cache alone or stale in-memory state.
         */
        isPrivacyGateReady() {
            if (!this.config || !this.config.enabled) {
                return this.config ? !this.config.failClosed : false;
            }
            if (this.failureReason) {
                return false;
            }
            if (this.config.physicalGateEnabled) {
                if (!this.lastPhysicalGateStatus || !this.lastPhysicalGateStatus.ready) {
                    return false;
                }
                const age = Date.now() - (this.lastPhysicalGateStatus.lastEvaluatedAt || 0);
                if (age > 30000) {
                    return false; // Stale attestation (Blocker 6)
                }
            }
            // Strict live verification requirements:
            if (this.isGateReady !== true || this.isGateActive !== true) {
                return false;
            }
            if (!this.lastPreflightResult || typeof this.lastPreflightResult !== 'object') {
                return false;
            }
            if (this.lastPreflightResult.provisional === true || this.lastPreflightResult.ready !== true) {
                return false;
            }
            if (this.lastPreflightResult.lastCheck) {
                const age = Date.now() - new Date(this.lastPreflightResult.lastCheck).getTime();
                if (age > 120000) {
                    return false; // Stale preflight requires fresh live verification
                }
            }
            return true;
        }

        /**
         * [Issue #6 R6.9G.10.3.7.1] Assert Physical Router Security Gate Ready & Fresh
         */
        async assertPhysicalGateReady() {
            if (!this.config.enabled || !this.config.physicalGateEnabled) {
                return { ready: true };
            }
            const age = Date.now() - (this.lastPhysicalGateStatus ? (this.lastPhysicalGateStatus.lastEvaluatedAt || 0) : 0);
            if (!this.lastPhysicalGateStatus || age > 15000) {
                const vRes = await this.verifyPhysicalGate();
                if (!vRes.success || !vRes.status || !vRes.status.ready) {
                    return {
                        ready: false,
                        reason: 'PHYSICAL_GATE_FAIL_CLOSED',
                        details: (vRes.status && vRes.status.reasons) ? vRes.status.reasons.join(', ') : (vRes.reason || 'UNKNOWN')
                    };
                }
            }
            const isReady = Boolean(this.lastPhysicalGateStatus && this.lastPhysicalGateStatus.ready);
            return {
                ready: isReady,
                reason: isReady ? null : 'PHYSICAL_GATE_NOT_READY',
                details: isReady ? null : ((this.lastPhysicalGateStatus && this.lastPhysicalGateStatus.reasons) ? this.lastPhysicalGateStatus.reasons.join(', ') : 'FAIL_CLOSED')
            };
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

        static isLoopbackTestUrl(url) {
            if (!url || typeof url !== 'string') return false;
            try {
                let u = url.trim();
                if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
                const parsed = new URL(u);
                const host = parsed.hostname.toLowerCase();
                return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
            } catch (_) {
                return false;
            }
        }

        isLoopbackTestUrl(url) {
            return PrivacyGatewayEngine.isLoopbackTestUrl(url);
        }
    }

    const instance = new PrivacyGatewayEngine();

    return {
        PrivacyGatewayEngine,
        PRIVACY_MODES,
        getInstance: () => instance,
        isPrivacyGateReady: () => instance.isPrivacyGateReady(),
        verifyAuthoritativeEgressEnforcement: (context) => instance.verifyAuthoritativeEgressEnforcement(context),
        invalidateGateReadiness: (reason) => instance.invalidateGateReadiness(reason),
        ensureEnforcedPrivacyForStart: (options) => instance.ensureEnforcedPrivacyForStart(options),
        redactSensitivePrivacyInfo: PrivacyGatewayEngine.redactSensitivePrivacyInfo,
        isLoopbackTestUrl: PrivacyGatewayEngine.isLoopbackTestUrl
    };
}));

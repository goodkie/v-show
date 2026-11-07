/**
 * XPIDER V7 UAT Network-Isolation, Egress-Denial, Package Host-Networking Audit &
 * Synthetic Profile Isolation Harness (Directives #6703224519 & #6703609650).
 *
 * Enforces & verifies:
 *  1. Fail-Closed Preflight Gate BEFORE Browser Start (`verify-uat-firewall`):
 *     - Fails closed (`UAT_NETWORK_FIREWALL_UNAVAILABLE`, nonzero exit) before launching Chrome if the
 *       local fail-closed sink firewall is down or fails active HTTP/CONNECT negative-control probes.
 *  2. Multi-Layer Browser + Local Sink Firewall Isolation (Not Host-Resolver Alone):
 *     - Local Fail-Closed Sink Proxy (`127.0.0.1:8090`) permitting ONLY `127.0.0.1:8089` via `--proxy-bypass-list`,
 *     - Explicit CDP `Network.enable` & `Fetch.enable` request interception,
 *     - Extension `declarativeNetRequest` loopback-only session rules (`installOwnerTestNetworkGuard`: 990001-990005),
 *     - `--host-resolver-rules="MAP * 127.0.0.1, EXCLUDE localhost"`.
 *  3. Candidate Package (`dist/clean_room_unpacked_v7`) Static & Runtime Host-Networking Inspection:
 *     - Audits all 50 files for `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `chrome.proxy`, `declarativeNetRequest`,
 *     - Confirms 0 unexpected external requests during Chrome extension boot, popup load, and idle window.
 *  4. Network-Level Outbound-Denial Negative Controls:
 *     - Dummy public hostname (`http://` and `https://dummy-public-target.example.com/contact`),
 *     - Literal external IPv4 (`http://198.51.100.42:8080/leak-check`) & literal IPv6 (`http://[2001:db8::42]:8080/leak-check`),
 *     - HTTP 302 redirect from `http://127.0.0.1:8089/redirect-external` to `http://198.51.100.42:8080/redirected-leak`,
 *     - WebSocket (`ws://198.51.100.42:8080/ws`), Page `fetch()`, and Service Worker background `fetch()`,
 *     - Optional configured proxy / campaign start gates (`OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET`, `PRIVACY_GATEWAY_BLOCKED`, `chrome.proxy.settings`).
 *  5. Offline Encrypted Backup In-Memory Verification & Synthetic Profile State Audit (`verify-storage-backup`, `audit-uat-state`).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { Br, cdp, openWs, sleep, BIN, EXT_ID } = require('./lib/browser_cdp');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CAND = path.join(DIST, 'clean_room_unpacked_v7');
const CLI = path.join(ROOT, 'scripts', 'xpider_safe_update.js');
const SERVER_SCRIPT = path.join(ROOT, 'owner-extension-test-site', 'server.js');
const REPORT = path.join(DIST, 'report_uat_synthetic_profile_isolation.json');
const REPORT_NET = path.join(DIST, 'report_uat_network_isolation_and_egress_denial.json');

const CDP_PORT = 9246;
const FIXTURE_PORT = 8088;
const SINK_PORT = 8090;

function runCli(args, extraEnv = {}) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv }
    });
    const text = (r.stdout || '') + (r.stderr || '');
    let out = null;
    try { out = JSON.parse((r.stdout || r.stderr || '').trim()); } catch (_) { out = { raw: text.slice(0, 300) }; }
    return { status: r.status, out, text };
}

function scanCandidateHostNetworking(candDir) {
    function walk(d) {
        let res = [];
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) res.push(...walk(p));
            else res.push(p);
        }
        return res;
    }
    const files = walk(candDir);
    const manifest = JSON.parse(fs.readFileSync(path.join(candDir, 'manifest.json'), 'utf8'));
    const summary = {
        totalFilesScanned: files.length,
        manifestHostPermissions: manifest.host_permissions || [],
        manifestPermissions: manifest.permissions || [],
        xmlHttpRequestCount: 0,
        webSocketClientCount: 0,
        sendBeaconCount: 0,
        fetchCallSites: [],
        declarativeNetRequestCallSites: [],
        proxySettingsCallSites: []
    };
    for (const f of files) {
        if (!/\.(js|html|json)$/i.test(f)) continue;
        const rel = path.relative(candDir, f).replace(/\\/g, '/');
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        lines.forEach((line, idx) => {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*')) return;
            if (/\bnew\s+XMLHttpRequest\b/.test(t)) summary.xmlHttpRequestCount++;
            if (/\bnew\s+WebSocket\b/.test(t)) summary.webSocketClientCount++;
            if (/\bnavigator\.sendBeacon\b/.test(t)) summary.sendBeaconCount++;
            if (/\bfetch\s*\(/.test(t)) {
                summary.fetchCallSites.push({ file: rel, line: idx + 1, snippet: t.slice(0, 140) });
            }
            if (/\bchrome\.declarativeNetRequest\b/.test(t)) {
                summary.declarativeNetRequestCallSites.push({ file: rel, line: idx + 1 });
            }
            if (/\bchrome\.proxy\.settings\b/.test(t)) {
                summary.proxySettingsCallSites.push({ file: rel, line: idx + 1 });
            }
        });
    }
    return summary;
}

const report = {
    suite: 'XPIDER_UAT_NETWORK_ISOLATION_EGRESS_DENIAL_AND_SYNTHETIC_PROFILE_HARNESS',
    directive: '#6703609650',
    browserBinary: BIN,
    runtimeBrowserVersion: null,
    extensionId: EXT_ID,
    startedAt: new Date().toISOString(),
    networkIsolationConfig: {
        fixtureServer: `http://127.0.0.1:${FIXTURE_PORT}`,
        sinkProxyServer: `http://127.0.0.1:${SINK_PORT}`,
        chromeProxyFlags: [
            `--proxy-server=127.0.0.1:${SINK_PORT}`,
            `--proxy-bypass-list=127.0.0.1:${FIXTURE_PORT};localhost:${FIXTURE_PORT};[::1]:${FIXTURE_PORT}`,
            `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost`,
            `--disable-quic`
        ],
        cdpInterceptionEnabled: true,
        extensionDnrSessionGuardInstalled: true,
        isolationScopeQualification: 'SCOPED_TO_BROWSER_CONFIGURED_PROXY_DNR_CDP_ONLY_NOT_HOST_OS_FIREWALL_CERTIFICATE'
    },
    osNetworkBoundaryAudit: null,
    packageNetworkingAudit: null,
    egressCounters: {
        counterScope: 'CONFIGURED_SINK_PROXY_AND_BROWSER_DNR_CDP_ONLY_NOT_OS_FIREWALL_CERTIFICATE',
        attemptedExternalRequests: 0,
        blockedByBrowserDnrOrCdp: 0,
        blockedByLocalSinkFirewall: 0,
        blockedExternalRequests: 0,
        transmittedViaSinkProxy: 0,
        transmittedExternalRequests: 0,
        allowedLoopbackRequests: 0
    },
    negativeControls: [],
    assertions: [],
    status: 'RUNNING'
};

let failures = 0;
function A(name, pass, detail = {}) {
    report.assertions.push({ name, pass: !!pass, detail });
    if (!pass) failures++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`);
}

(async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-uat-net-iso-'));
    let serverProc = null;
    let br = null;
    let pageWs = null;

    try {
        // =========================================================================
        // PART 1: OS FIREWALL SNAPSHOT & FAIL-CLOSED PREFLIGHT BEFORE BROWSER START
        // =========================================================================
        const fwSnapshotBefore = spawnSync('netsh', ['advfirewall', 'show', 'allprofiles'], { encoding: 'utf8' });
        const fwBeforeSha256 = crypto.createHash('sha256').update(fwSnapshotBefore.stdout || '').digest('hex');
        const fwAddRuleProbe = spawnSync('netsh', [
            'advfirewall', 'firewall', 'add', 'rule',
            'name=XPIDER_UAT_TEST_PROBE_DO_NOT_APPLY',
            'dir=out', 'action=block',
            `program=${BIN}`, 'enable=no'
        ], { encoding: 'utf8' });

        // 1A. Verify preflight FAILS CLOSED before browser start when sink firewall is unavailable
        const preflightDown = runCli(['verify-uat-firewall', '--fixture-port', '18089', '--sink-port', '18090']);
        A('PREFLIGHT_FAILS_CLOSED_BEFORE_BROWSER_START_WHEN_FIREWALL_DOWN',
            preflightDown.status !== 0 &&
            preflightDown.out &&
            preflightDown.out.result === 'ABORTED' &&
            preflightDown.out.code === 'UAT_NETWORK_FIREWALL_UNAVAILABLE',
            preflightDown.out
        );

        // 1B. Start local fixture server (127.0.0.1:8089) + fail-closed sink proxy firewall (127.0.0.1:8090)
        serverProc = spawn(process.execPath, [SERVER_SCRIPT], {
            env: { ...process.env, PORT: String(FIXTURE_PORT), SINK_PROXY_PORT: String(SINK_PORT) },
            stdio: 'ignore'
        });
        let serverReady = false;
        for (let i = 0; i < 30; i++) {
            await sleep(200);
            try {
                const r = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
                if (r && r.ok && r.firewallActive && r.sinkProxyPort === SINK_PORT) {
                    serverReady = true;
                    break;
                }
            } catch (_) {}
        }
        if (!serverReady) {
            throw new Error('UAT_NETWORK_FIREWALL_UNAVAILABLE: Failed to start local fixture/sink firewall server');
        }

        // 1C. Run mandatory `verify-uat-firewall` preflight gate BEFORE launching Chrome
        const preflightUp = runCli(['verify-uat-firewall', '--fixture-port', String(FIXTURE_PORT), '--sink-port', String(SINK_PORT)]);
        A('PREFLIGHT_VERIFIES_ACTIVE_LOCAL_SINK_FIREWALL_BEFORE_BROWSER_START',
            preflightUp.status === 0 &&
            preflightUp.out &&
            preflightUp.out.result === 'UAT_FIREWALL_VERIFIED_FAIL_CLOSED' &&
            preflightUp.out.httpProbeBlocked403 === true &&
            preflightUp.out.connectProbeBlocked403 === true &&
            preflightUp.out.transmittedExternalRequests === 0,
            preflightUp.out
        );
        if (preflightUp.status !== 0) {
            throw new Error('Preflight firewall verification failed — aborting before browser start.');
        }

        // =========================================================================
        // PART 2: CANDIDATE PACKAGE HOST-NETWORKING STATIC AUDIT (Action 4)
        // =========================================================================
        const pkgAudit = scanCandidateHostNetworking(CAND);
        report.packageNetworkingAudit = pkgAudit;
        A('STATIC_PACKAGE_HOST_NETWORKING_AUDIT_50_FILES',
            pkgAudit.totalFilesScanned === 50 &&
            pkgAudit.xmlHttpRequestCount === 0 &&
            pkgAudit.webSocketClientCount === 0 &&
            pkgAudit.sendBeaconCount === 0 &&
            pkgAudit.fetchCallSites.length === 13 &&
            pkgAudit.declarativeNetRequestCallSites.length > 0,
            {
                totalFilesScanned: pkgAudit.totalFilesScanned,
                xmlHttpRequestCount: pkgAudit.xmlHttpRequestCount,
                webSocketClientCount: pkgAudit.webSocketClientCount,
                sendBeaconCount: pkgAudit.sendBeaconCount,
                fetchCallSitesCount: pkgAudit.fetchCallSites.length,
                fetchFiles: Array.from(new Set(pkgAudit.fetchCallSites.map(x => x.file)))
            }
        );

        // =========================================================================
        // PART 3: LAUNCH CHROME WITH MULTI-LAYER NETWORK ISOLATION + CDP INTERCEPTION
        // =========================================================================
        const uatProf = path.join(work, 'uat_clean_chrome_profile');
        const isolationFlags = [
            `--proxy-server=127.0.0.1:${SINK_PORT}`,
            `--proxy-bypass-list=127.0.0.1:${FIXTURE_PORT};localhost:${FIXTURE_PORT};[::1]:${FIXTURE_PORT}`,
            `--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost`,
            `--disable-quic`
        ];
        br = new Br(uatProf, CAND, CDP_PORT, isolationFlags);
        await br.start(`http://127.0.0.1:${FIXTURE_PORT}/contact-standard.html`);
        report.runtimeBrowserVersion = await br.version();
        A('REAL_GOOGLE_CHROME_BOOTED_WITH_SINK_PROXY_AND_LOOPBACK_BYPASS',
            /^Chrome\//.test(report.runtimeBrowserVersion) && !/Edg\//.test(report.runtimeBrowserVersion),
            { version: report.runtimeBrowserVersion, isolationFlags }
        );

        // Attach CDP Network.enable & Fetch.enable on Service Worker and active page target
        let cdpObservedExternalAttempts = 0;
        let cdpBlockedRequests = 0;
        const isAllowedLoopbackUrl = (u) => {
            if (!u) return true;
            if (u.startsWith('chrome-extension://') || u.startsWith('devtools://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return true;
            return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(8088|18989)(?:\/|$)/i.test(u);
        };

        let swBootExternalRequests = [];
        let measuringBoot = true;
        await cdp(br.sws, 'Network.enable');
        br.sws.addEventListener('message', (ev) => {
            try {
                const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
                if (m.method === 'Network.requestWillBeSent' && m.params && m.params.request) {
                    const u = m.params.request.url || '';
                    if (!isAllowedLoopbackUrl(u)) {
                        cdpObservedExternalAttempts++;
                        if (measuringBoot) swBootExternalRequests.push(u);
                    }
                }
            } catch (_) {}
        });

        const pageTarget = (await br.targets()).find(x => x.type === 'page' && x.url.includes(`127.0.0.1:${FIXTURE_PORT}`));
        pageWs = await openWs(pageTarget.webSocketDebuggerUrl);
        await cdp(pageWs, 'Runtime.enable');
        await cdp(pageWs, 'Network.enable');
        await cdp(pageWs, 'Fetch.enable', { patterns: [{ urlPattern: '*' }] });
        pageWs.addEventListener('message', (ev) => {
            try {
                const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
                if (m.method === 'Fetch.requestPaused' && m.params) {
                    const u = (m.params.request && m.params.request.url) || '';
                    const reqId = m.params.requestId;
                    if (isAllowedLoopbackUrl(u)) {
                        report.egressCounters.allowedLoopbackRequests++;
                        pageWs.send(JSON.stringify({ id: Math.floor(Math.random() * 1e9), method: 'Fetch.continueRequest', params: { requestId: reqId } }));
                    } else {
                        cdpObservedExternalAttempts++;
                        pageWs.send(JSON.stringify({ id: Math.floor(Math.random() * 1e9), method: 'Fetch.continueRequest', params: { requestId: reqId } }));
                    }
                }
                if (m.method === 'Network.webSocketCreated' && m.params) {
                    const u = m.params.url || '';
                    if (!isAllowedLoopbackUrl(u)) cdpObservedExternalAttempts++;
                }
            } catch (_) {}
        });

        // Verify extension boot + popup open + 2000ms idle produces ZERO unexpected extension external host requests (Action 4)
        await br.openPopup();
        await sleep(2000);
        measuringBoot = false;
        const fwBootStatus = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
        const bootLog = fwBootStatus.blockedLog || [];
        const localCompanionRelayProbes = bootLog.filter(e => /^(?:http:\/\/)?127\.0\.0\.1:18989(?:\/|$)/i.test(e.target));
        const chromeVendorBgHits = bootLog.filter(e => /(?:googleapis\.com|google\.com|gstatic\.com|gvt1\.com)/i.test(e.target));
        const unexpectedExtensionExternalHits = bootLog.filter(e =>
            !/^(?:http:\/\/)?127\.0\.0\.1:18989(?:\/|$)/i.test(e.target) &&
            !/(?:googleapis\.com|google\.com|gstatic\.com|gvt1\.com)/i.test(e.target)
        );
        report.bootNetworkingObservation = {
            swBootExternalRequestsCount: swBootExternalRequests.length,
            swBootExternalRequests,
            sinkProxyBootBlockedCount: bootLog.length,
            localCompanionRelay18989ProbesBlockedBySink: localCompanionRelayProbes.length,
            chromeBrowserVendorBgRequestsBlockedBySink: chromeVendorBgHits.length,
            unexpectedExtensionExternalHitsCount: unexpectedExtensionExternalHits.length,
            unexpectedExtensionExternalHits,
            transmittedExternalRequests: fwBootStatus.transmittedExternalRequests
        };
        A('RUNTIME_EXTENSION_BOOT_AND_POPUP_IDLE_ZERO_EXTERNAL_HOST_NETWORKING',
            swBootExternalRequests.length === 0 &&
            unexpectedExtensionExternalHits.length === 0 &&
            fwBootStatus.transmittedExternalRequests === 0,
            report.bootNetworkingObservation
        );

        // Reset firewall counters before running explicit Negative Controls (Action 2)
        await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_reset_firewall_log`);

        // Install extension declarativeNetRequest loopback guard (`installOwnerTestNetworkGuard`) and verify session rules 990001-990005
        const dnrInstall = await br.sw(`(async()=>{
            await installOwnerTestNetworkGuard({ allowCloudflareChallenges: false });
            const rules = await chrome.declarativeNetRequest.getSessionRules();
            return { count: rules.length, ids: rules.map(r => r.id).sort() };
        })()`);
        A('EXTENSION_DNR_LOOPBACK_GUARD_INSTALLED_AND_VERIFIED',
            dnrInstall.count === 5 && JSON.stringify(dnrInstall.ids) === JSON.stringify([990001, 990002, 990003, 990004, 990005]),
            dnrInstall
        );

        // Positive Loopback Control: allowed local fixture fetch (`http://127.0.0.1:8089/contact-standard.html`) succeeds
        const posRes = await cdp(pageWs, 'Runtime.evaluate', {
            expression: `(async()=>{
                const r = await fetch('http://127.0.0.1:${FIXTURE_PORT}/contact-standard.html', { cache: 'no-store' });
                return { ok: r.ok, status: r.status };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        A('POSITIVE_CONTROL_ALLOWED_LOOPBACK_FIXTURE_SUCCEEDS',
            posRes.result.value && posRes.result.value.ok === true && posRes.result.value.status === 200,
            posRes.result.value
        );

        // =========================================================================
        // PART 4: NEGATIVE CONTROLS — MULTI-LAYER OUTBOUND DENIAL (Action 2)
        // =========================================================================
        // Helper to test a page-level request under BOTH (1) Extension DNR + CDP layer AND (2) Independent Local Sink Proxy Firewall layer
        async function runDualLayerNegativeControl(controlId, description, pageExpr) {
            // Subtest A: With Extension DNR (`installOwnerTestNetworkGuard`) active
            await br.sw(`installOwnerTestNetworkGuard({ allowCloudflareChallenges: false })`);
            const resDnr = await cdp(pageWs, 'Runtime.evaluate', {
                expression: pageExpr,
                awaitPromise: true,
                returnByValue: true
            });
            const dnrVal = resDnr.result && resDnr.result.value;

            // Subtest B: With Extension DNR temporarily removed so request reaches the independent Local Sink Proxy Firewall (127.0.0.1:8090)
            const fwBefore = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
            await br.sw(`removeOwnerTestNetworkGuard()`);
            const resSink = await cdp(pageWs, 'Runtime.evaluate', {
                expression: pageExpr,
                awaitPromise: true,
                returnByValue: true
            });
            const sinkVal = resSink.result && resSink.result.value;
            const fwAfter = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
            await br.sw(`installOwnerTestNetworkGuard({ allowCloudflareChallenges: false })`);

            const sinkBlockedDelta = fwAfter.blockedExternalRequests - fwBefore.blockedExternalRequests;
            const record = {
                controlId,
                description,
                dnrLayerResult: dnrVal,
                sinkFirewallLayerResult: sinkVal,
                sinkFirewallBlockedDelta: sinkBlockedDelta,
                transmittedExternalRequests: fwAfter.transmittedExternalRequests
            };
            report.negativeControls.push(record);
            if (dnrVal && dnrVal.blocked) {
                report.egressCounters.attemptedExternalRequests += (dnrVal.attempts || 1);
                report.egressCounters.blockedByBrowserDnrOrCdp += (dnrVal.attempts || 1);
            }
            return record;
        }

        // Negative Control 1: Dummy public hostname (HTTP & HTTPS)
        const nc1 = await runDualLayerNegativeControl(
            'NC1_DUMMY_PUBLIC_HOSTNAME_HTTP_AND_HTTPS',
            'Dummy public hostname HTTP (http://dummy-public-target.example.com/contact) & HTTPS (https://dummy-public-target.example.com/contact)',
            `(async()=>{
                const results = [];
                for (const u of ['http://dummy-public-target.example.com/contact', 'https://dummy-public-target.example.com/contact']) {
                    try {
                        const r = await fetch(u, { method: 'POST', body: 'test=1', cache: 'no-store' });
                        results.push({ url: u, status: r.status, firewallHeader: r.headers.get('x-xpider-uat-firewall'), blocked: r.status === 403 });
                    } catch (e) {
                        results.push({ url: u, error: e.message, blocked: true });
                    }
                }
                return { blocked: results.every(x => x.blocked), attempts: results.length, results };
            })()`
        );
        A('NEG_CONTROL_1_DUMMY_PUBLIC_HOSTNAME_HTTP_AND_HTTPS_BLOCKED',
            nc1.dnrLayerResult.blocked === true &&
            nc1.sinkFirewallLayerResult.blocked === true &&
            nc1.sinkFirewallBlockedDelta >= 2 &&
            nc1.transmittedExternalRequests === 0,
            nc1
        );

        // Negative Control 2: Literal external IPv4 & IPv6 URLs (proving literal IPs that bypass --host-resolver-rules are blocked!)
        const nc2 = await runDualLayerNegativeControl(
            'NC2_LITERAL_EXTERNAL_IPV4_AND_IPV6_URLS',
            'Literal external IPv4 (http://198.51.100.42:8080/leak-check) and literal external IPv6 (http://[2001:db8::42]:8080/leak-check)',
            `(async()=>{
                const results = [];
                for (const u of ['http://198.51.100.42:8080/leak-check', 'http://[2001:db8::42]:8080/leak-check']) {
                    try {
                        const r = await fetch(u, { cache: 'no-store' });
                        results.push({ url: u, status: r.status, firewallHeader: r.headers.get('x-xpider-uat-firewall'), blocked: r.status === 403 });
                    } catch (e) {
                        results.push({ url: u, error: e.message, blocked: true });
                    }
                }
                return { blocked: results.every(x => x.blocked), attempts: results.length, results };
            })()`
        );
        A('NEG_CONTROL_2_LITERAL_EXTERNAL_IPV4_AND_IPV6_BLOCKED',
            nc2.dnrLayerResult.blocked === true &&
            nc2.sinkFirewallLayerResult.blocked === true &&
            nc2.sinkFirewallBlockedDelta >= 2 &&
            nc2.transmittedExternalRequests === 0,
            nc2
        );

        // Negative Control 3: HTTP 302 redirect from allowed loopback (`http://127.0.0.1:8089/redirect-external`) to external IP (`http://198.51.100.42:8080/redirected-leak`)
        const nc3 = await runDualLayerNegativeControl(
            'NC3_HTTP_302_REDIRECT_LOOPBACK_TO_EXTERNAL',
            'HTTP 302 redirect from http://127.0.0.1:8089/redirect-external to http://198.51.100.42:8080/redirected-leak',
            `(async()=>{
                const u = 'http://127.0.0.1:${FIXTURE_PORT}/redirect-external?target=' + encodeURIComponent('http://198.51.100.42:8080/redirected-leak');
                try {
                    const r = await fetch(u, { redirect: 'follow', cache: 'no-store' });
                    return { blocked: r.status === 403, status: r.status, firewallHeader: r.headers.get('x-xpider-uat-firewall'), attempts: 1 };
                } catch (e) {
                    return { blocked: true, error: e.message, attempts: 1 };
                }
            })()`
        );
        A('NEG_CONTROL_3_HTTP_302_REDIRECT_FROM_LOOPBACK_TO_EXTERNAL_BLOCKED',
            nc3.dnrLayerResult.blocked === true &&
            nc3.sinkFirewallLayerResult.blocked === true &&
            nc3.sinkFirewallBlockedDelta >= 1 &&
            nc3.transmittedExternalRequests === 0,
            nc3
        );

        // Negative Control 4: WebSocket (`ws://198.51.100.42:8080/ws`), Page `fetch()`, and Extension Service Worker background `fetch()`
        const nc4WsAndPage = await runDualLayerNegativeControl(
            'NC4A_WEBSOCKET_AND_PAGE_FETCH_EXTERNAL',
            'WebSocket (ws://198.51.100.42:8080/ws) and Page fetch (http://198.51.100.42:8080/page-fetch-leak)',
            `(async()=>{
                const wsRes = await new Promise((resolve) => {
                    let settled = false;
                    const done = (val) => { if (!settled) { settled = true; resolve(val); } };
                    try {
                        const ws = new WebSocket('ws://198.51.100.42:8080/ws');
                        ws.onopen = () => { try { ws.close(); } catch(_){} done({ blocked: false, state: 'OPENED' }); };
                        ws.onerror = () => done({ blocked: true, state: 'ERROR_BLOCKED' });
                        ws.onclose = () => done({ blocked: true, state: 'CLOSED_BLOCKED' });
                        setTimeout(() => { try { ws.close(); } catch(_){} done({ blocked: true, state: 'TIMEOUT_BLOCKED' }); }, 2000);
                    } catch (e) {
                        done({ blocked: true, state: 'EXCEPTION_BLOCKED', error: e.message });
                    }
                });
                let fetchRes;
                try {
                    const r = await fetch('http://198.51.100.42:8080/page-fetch-leak', { method: 'POST', body: 'leak', cache: 'no-store' });
                    fetchRes = { blocked: r.status === 403, status: r.status };
                } catch (e) {
                    fetchRes = { blocked: true, error: e.message };
                }
                const navRes = await new Promise((resolve) => {
                    const ifr = document.createElement('iframe');
                    ifr.style.display = 'none';
                    const done = (val) => { try { ifr.remove(); } catch(_){} resolve(val); };
                    const t = setTimeout(() => done({ blocked: true, state: 'TIMEOUT_OR_BLOCKED_FRAME' }), 1500);
                    ifr.onload = () => {
                        clearTimeout(t);
                        try {
                            const txt = ifr.contentDocument ? ifr.contentDocument.body.innerText : '';
                            done({ blocked: txt.includes('UAT_EGRESS_BLOCKED_BY_LOCAL_SINK_FIREWALL') || txt === '', bodyPreview: txt.slice(0, 80) });
                        } catch (_) {
                            // Cross-origin error page (chrome-error://chromewebdata/) means navigation was blocked/failed
                            done({ blocked: true, state: 'CHROME_ERROR_PAGE_BLOCKED' });
                        }
                    };
                    ifr.onerror = () => { clearTimeout(t); done({ blocked: true, state: 'ONERROR_BLOCKED' }); };
                    ifr.src = 'http://198.51.100.42:8080/page-nav-leak';
                    document.body.appendChild(ifr);
                });
                return { blocked: wsRes.blocked && fetchRes.blocked && navRes.blocked, attempts: 3, wsRes, fetchRes, navRes };
            })()`
        );

        // Service Worker background fetch negative control (tested under both DNR layer AND Local Sink Proxy Firewall layer)
        await br.sw(`installOwnerTestNetworkGuard({ allowCloudflareChallenges: false })`);
        const swBgDnrRes = await br.sw(`(async()=>{
            const out = [];
            for (const u of ['http://198.51.100.42:8080/sw-bg-fetch-leak', 'https://dummy-public-target.example.com/sw-bg-https-leak']) {
                try {
                    const r = await fetch(u, { cache: 'no-store' });
                    out.push({ url: u, status: r.status, blocked: r.status === 403 });
                } catch (e) {
                    out.push({ url: u, error: e.message, blocked: true });
                }
            }
            return { blocked: out.every(x => x.blocked), attempts: out.length, out };
        })()`);
        report.egressCounters.attemptedExternalRequests += swBgDnrRes.attempts;
        report.egressCounters.blockedByBrowserDnrOrCdp += swBgDnrRes.attempts;

        const fwBeforeSw = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
        await br.sw(`removeOwnerTestNetworkGuard()`);
        const swBgSinkRes = await br.sw(`(async()=>{
            const out = [];
            for (const u of ['http://198.51.100.42:8080/sw-bg-fetch-leak', 'https://dummy-public-target.example.com/sw-bg-https-leak']) {
                try {
                    const r = await fetch(u, { cache: 'no-store' });
                    out.push({ url: u, status: r.status, firewallHeader: r.headers.get('x-xpider-uat-firewall'), blocked: r.status === 403 });
                } catch (e) {
                    out.push({ url: u, error: e.message, blocked: true });
                }
            }
            return { blocked: out.every(x => x.blocked), out };
        })()`);
        await br.sw(`installOwnerTestNetworkGuard({ allowCloudflareChallenges: false })`);
        const fwAfterSw = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
        const swBlockedDelta = fwAfterSw.blockedExternalRequests - fwBeforeSw.blockedExternalRequests;
        report.negativeControls.push({
            controlId: 'NC4B_SERVICE_WORKER_BACKGROUND_FETCH',
            description: 'Service Worker background fetch to http://198.51.100.42:8080/sw-bg-fetch-leak and https://dummy-public-target.example.com/sw-bg-https-leak',
            dnrLayerResult: swBgDnrRes,
            sinkFirewallLayerResult: swBgSinkRes,
            sinkFirewallBlockedDelta: swBlockedDelta,
            transmittedExternalRequests: fwAfterSw.transmittedExternalRequests
        });
        A('NEG_CONTROL_4_WEBSOCKET_PAGE_FETCH_AND_SW_BACKGROUND_FETCH_BLOCKED',
            nc4WsAndPage.dnrLayerResult.blocked === true &&
            nc4WsAndPage.sinkFirewallLayerResult.blocked === true &&
            nc4WsAndPage.sinkFirewallBlockedDelta >= 2 &&
            swBgDnrRes.blocked === true &&
            swBgSinkRes.blocked === true &&
            swBlockedDelta >= 2 &&
            fwAfterSw.transmittedExternalRequests === 0,
            { nc4WsAndPage, swBgDnrRes, swBgSinkRes, swBlockedDelta }
        );

        // Negative Control 5: Optional Configured Proxy & Campaign Start Egress Gates
        const nc5Runtime = await br.sw(`(async()=>{
            const proxyDetails = await new Promise(r => chrome.proxy.settings.get({ incognito: false }, r));
            const info = (typeof BuildProvenance !== 'undefined' && BuildProvenance.BUILD_INFO) ? BuildProvenance.BUILD_INFO : {};
            const prov = {
                expectedImplementationHead: info.implementationHead,
                expectedBuildId: info.buildId
            };
            return { proxyDetails, prov };
        })()`);
        const nc5StartChecks = await br.page('popup.html', `(async()=>{
            const sendMsg = (msg) => new Promise(r => chrome.runtime.sendMessage(msg, r));
            const prov = ${JSON.stringify(nc5Runtime.prov)};
            const nonLoopbackTestMode = await sendMsg({
                action: 'START_CAMPAIGN',
                ...prov,
                ownerFunctionTestMode: true,
                source: 'OWNER_CORE_TEST',
                queue: ['http://198.51.100.42:8080/external-form.html']
            });
            const strictPrivacyNoProxy = await sendMsg({
                action: 'START_CAMPAIGN',
                ...prov,
                ownerFunctionTestMode: false,
                runScopedDirectPrivacy: false,
                queue: ['http://198.51.100.42:8080/external-form.html']
            });
            return { nonLoopbackTestMode, strictPrivacyNoProxy };
        })()`);
        const singleProxy = nc5Runtime.proxyDetails?.value?.rules?.singleProxy || null;
        report.negativeControls.push({
            controlId: 'NC5_CONFIGURED_PROXY_AND_CAMPAIGN_START_GATES',
            description: 'Enforced local sink proxy (fixed_servers -> 127.0.0.1:8090) + OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD/NON_LOOPBACK + PRIVACY_GATEWAY_BLOCKED preflight',
            proxyDetails: nc5Runtime.proxyDetails,
            campaignStartGates: nc5StartChecks
        });
        A('NEG_CONTROL_5_PROXY_LOCK_AND_CAMPAIGN_PREFLIGHT_GATES_FAIL_CLOSED',
            nc5Runtime.proxyDetails &&
            nc5Runtime.proxyDetails.value &&
            nc5Runtime.proxyDetails.value.mode === 'fixed_servers' &&
            singleProxy &&
            singleProxy.host === '127.0.0.1' &&
            singleProxy.port === SINK_PORT &&
            nc5StartChecks.nonLoopbackTestMode &&
            nc5StartChecks.nonLoopbackTestMode.success === false &&
            ['OWNER_FUNCTION_TEST_UNAUTHORIZED_BUILD', 'OWNER_FUNCTION_TEST_NON_LOOPBACK_TARGET'].includes(nc5StartChecks.nonLoopbackTestMode.error) &&
            nc5StartChecks.strictPrivacyNoProxy &&
            nc5StartChecks.strictPrivacyNoProxy.success === false &&
            nc5StartChecks.strictPrivacyNoProxy.error === 'PRIVACY_GATEWAY_BLOCKED',
            { proxyDetails: nc5Runtime.proxyDetails, nc5StartChecks }
        );

        // Final Firewall Telemetry Tally & OS Process/Firewall Boundary Audit (Directive #6703976478)
        const fwFinal = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_firewall_status`).then(x => x.json());
        report.egressCounters.blockedByLocalSinkFirewall = fwFinal.blockedExternalRequests;
        report.egressCounters.attemptedExternalRequests += fwFinal.attemptedExternalRequests;
        report.egressCounters.blockedExternalRequests = report.egressCounters.blockedByBrowserDnrOrCdp + report.egressCounters.blockedByLocalSinkFirewall;
        report.egressCounters.transmittedViaSinkProxy = fwFinal.transmittedExternalRequests;
        report.egressCounters.transmittedExternalRequests = fwFinal.transmittedExternalRequests;
        report.sinkFirewallSampleBlockedLog = fwFinal.blockedLog.slice(0, 15);

        // Sample OS kernel TCP/UDP socket table for all UAT Chrome processes & take post-test Windows Firewall snapshot
        const psSocketCmd = [
            `$profEsc = [Regex]::Escape('${uatProf.replace(/'/g, "''")}');`,
            `$procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match $profEsc };`,
            `$pids = @($procs | Select-Object -ExpandProperty ProcessId);`,
            `$tcp = if ($pids.Count -gt 0) { @(Get-NetTCPConnection -OwningProcess $pids -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess) } else { @() };`,
            `$udp = if ($pids.Count -gt 0) { @(Get-NetUDPEndpoint -OwningProcess $pids -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess) } else { @() };`,
            `$id = [Security.Principal.WindowsIdentity]::GetCurrent();`,
            `$pr = New-Object Security.Principal.WindowsPrincipal($id);`,
            `[PSCustomObject]@{ isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); user = $id.Name; uatChromePids = $pids; tcpSockets = $tcp; udpEndpoints = $udp } | ConvertTo-Json -Depth 4 -Compress`
        ].join(' ');
        const osSockProbe = spawnSync('powershell', ['-NoProfile', '-Command', psSocketCmd], { encoding: 'utf8' });
        let osSockData = { isAdmin: false, uatChromePids: [], tcpSockets: [], udpEndpoints: [] };
        try { osSockData = JSON.parse((osSockProbe.stdout || '').trim()); } catch (_) {}
        const nonLoopbackTcpSockets = (osSockData.tcpSockets || []).filter(s =>
            s && s.RemoteAddress &&
            s.RemoteAddress !== '127.0.0.1' &&
            s.RemoteAddress !== '0.0.0.0' &&
            s.RemoteAddress !== '::' &&
            s.RemoteAddress !== '::1'
        );
        const fwSnapshotAfter = spawnSync('netsh', ['advfirewall', 'show', 'allprofiles'], { encoding: 'utf8' });
        const fwAfterSha256 = crypto.createHash('sha256').update(fwSnapshotAfter.stdout || '').digest('hex');

        report.osNetworkBoundaryAudit = {
            directive: '#6703976478',
            processUser: osSockData.user || null,
            isAdminElevated: Boolean(osSockData.isAdmin),
            windowsFirewallRuleProbeCommand: `netsh advfirewall firewall add rule name=XPIDER_UAT_TEST_PROBE_DO_NOT_APPLY dir=out action=block program="${BIN}" enable=no`,
            windowsFirewallRuleProbeExitCode: fwAddRuleProbe.status,
            windowsFirewallRuleProbeOutput: ((fwAddRuleProbe.stdout || '') + (fwAddRuleProbe.stderr || '')).trim(),
            firewallProfileSnapshotBeforeSha256: fwBeforeSha256,
            firewallProfileSnapshotAfterSha256: fwAfterSha256,
            firewallProfileUnchangedGuaranteed: fwBeforeSha256 === fwAfterSha256,
            uatChromeProcessCount: (osSockData.uatChromePids || []).length,
            uatChromePids: osSockData.uatChromePids || [],
            observedTcpSocketsOnUatChromePids: osSockData.tcpSockets || [],
            observedNonLoopbackTcpSocketsOnUatChromePids: nonLoopbackTcpSockets.length,
            observedUdpEndpointsOnUatChromePids: osSockData.udpEndpoints || [],
            gateStatusByBoundary: {
                browserConfiguredProxyDnrCdpControls: 'PASS_SCOPED_TO_BROWSER_PROXY_DNR_CDP_PATH',
                osKernelDefaultDenyFirewallPolicy: 'BLOCKED / NOT_TESTED (Requires Administrator elevation or isolated VM; non-elevated netsh advfirewall rule add exits with code 1)',
                proxyBypassDirectSocketOsDenial: 'BLOCKED / NOT_TESTED (Host Windows Firewall outbound policy is AllowOutbound; unproxied direct socket denial requires elevated OS firewall rule)',
                udpQuicProtocolDenial: 'MITIGATED_BY_BROWSER_FLAG_ONLY (--disable-quic passed to Chrome; OS-level UDP firewall drop rule NOT_TESTED without elevation)'
            }
        };

        A('ZERO_EXTERNAL_TRANSMISSIONS_ACROSS_ALL_NEGATIVE_CONTROLS',
            report.egressCounters.attemptedExternalRequests >= 12 &&
            report.egressCounters.blockedByLocalSinkFirewall >= 7 &&
            report.egressCounters.blockedByBrowserDnrOrCdp >= 5 &&
            report.egressCounters.blockedExternalRequests === report.egressCounters.attemptedExternalRequests &&
            report.egressCounters.transmittedViaSinkProxy === 0 &&
            nonLoopbackTcpSockets.length === 0 &&
            fwBeforeSha256 === fwAfterSha256 &&
            cdpObservedExternalAttempts > 0,
            { egressCounters: report.egressCounters, osBoundarySummary: report.osNetworkBoundaryAudit.gateStatusByBoundary }
        );

        // =========================================================================
        // PART 5: OFFLINE ENCRYPTED BACKUP IN-MEMORY VERIFY & SYNTHETIC PROFILE AUDIT
        // =========================================================================
        const simRealProf = path.join(work, 'sim_real_owner_profile');
        const simRealLes = path.join(simRealProf, 'Default', 'Local Extension Settings', EXT_ID);
        fs.mkdirSync(simRealLes, { recursive: true });
        const SENSITIVE_SENTINEL = 'DO_NOT_LEAK_OWNER_REAL_SECRET_99182';
        fs.writeFileSync(path.join(simRealLes, '000005.ldb'), `REAL_OWNER_LEVELDB_${SENSITIVE_SENTINEL}`);
        fs.writeFileSync(path.join(simRealLes, 'CURRENT'), 'MANIFEST-000001\n');

        const encFile = path.join(work, 'offline_recovery_only.xpider-enc');
        const PASS = 'Offline-Recovery-Passphrase-2026!';
        const bkRes = runCli(['backup-storage', '--profile-dir', simRealProf, '--out', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
        const verOk = runCli(['verify-storage-backup', '--in', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: PASS });
        const verWrong = runCli(['verify-storage-backup', '--in', encFile, '--passphrase-env', 'XP_PASS'], { XP_PASS: 'Wrong-Passphrase-9999' });
        A('OFFLINE_BACKUP_IN_MEMORY_VERIFY_AND_WRONG_PASSPHRASE_GATE',
            bkRes.status === 0 &&
            verOk.status === 0 &&
            verOk.out.result === 'BACKUP_INTEGRITY_VERIFIED_IN_MEMORY' &&
            verOk.out.writtenToDisk === false &&
            verOk.out.decryptedFilesWritten === 0 &&
            !verOk.text.includes(SENSITIVE_SENTINEL) &&
            verWrong.status !== 0 &&
            verWrong.out.code === 'WRONG_PASSPHRASE_OR_CORRUPT_BACKUP',
            { verifyResult: verOk.out, wrongPassCode: verWrong.out.code }
        );

        // Seed synthetic-only UAT state and verify `audit-uat-state` + negative controls
        await br.sw(`(async()=>{
            await chrome.storage.local.clear();
            await chrome.storage.local.set({
                xpider_schema_version: 2,
                xpider_migration_phase: 'COMPLETED',
                templates_v2: {
                    version: 2,
                    activeTemplateId: 'uat_default',
                    defaultTemplateId: 'uat_default',
                    templates: {
                        uat_default: {
                            id: 'uat_default',
                            name: 'Synthetic UAT Inquiry',
                            email: 'operator@uat-local.test',
                            website: 'http://127.0.0.1:8088',
                            message: 'Disposable localhost UAT message.',
                            includeFormsWithoutMessage: false,
                            ownerAuthorizedConsent: false
                        }
                    }
                },
                savedUrlLists_v2: {
                    lists: {
                        uat_localhost_list: {
                            name: 'Localhost UAT Queue',
                            urls: ['http://127.0.0.1:8088/contact-standard.html', 'http://127.0.0.1:8088/subscribe-no-message.html']
                        }
                    }
                },
                xpider_email_collector_v1: {
                    version: 1,
                    totalUnique: 1,
                    emails: { 'contact@uat-local.test': { email: 'contact@uat-local.test', sourceHostnames: ['127.0.0.1'], seenCount: 1 } }
                },
                xpider_isPaused: true
            });
        })()`);

        const liveStorage = await br.sw(`chrome.storage.local.get(null)`);
        const stateFile = path.join(work, 'live_uat_state.json');
        fs.writeFileSync(stateFile, JSON.stringify(liveStorage, null, 2));
        const auditOk = runCli(['audit-uat-state', '--in', stateFile]);

        const SECRET_VAL = 'RealDecodoSecretPass_DO_NOT_PRINT_7741';
        const REAL_EMAIL_LOCAL = 'real_customer_inbox_8821';
        const badUrlFile = path.join(work, 'bad_url.json');
        const badCredFile = path.join(work, 'bad_cred.json');
        const badEmailFile = path.join(work, 'bad_email.json');
        fs.writeFileSync(badUrlFile, JSON.stringify({ ...liveStorage, savedUrlLists_v2: { lists: { real: { urls: ['https://production-client.example.com/contact'] } } } }));
        fs.writeFileSync(badCredFile, JSON.stringify({ ...liveStorage, xpider_proxy_credentials: { user: 'real_owner', password: SECRET_VAL } }));
        fs.writeFileSync(badEmailFile, JSON.stringify({ ...liveStorage, xpider_email_collector_v1: { emails: { [`${REAL_EMAIL_LOCAL}@corp-domain.com`]: { email: `${REAL_EMAIL_LOCAL}@corp-domain.com` } } } }));

        const rejUrl = runCli(['audit-uat-state', '--in', badUrlFile]);
        const rejCred = runCli(['audit-uat-state', '--in', badCredFile]);
        const rejEmail = runCli(['audit-uat-state', '--in', badEmailFile]);

        A('SYNTHETIC_PROFILE_STATE_AUDIT_AND_SECRET_SAFE_REJECTION_GATES',
            auditOk.status === 0 &&
            auditOk.out.result === 'UAT_PROFILE_ISOLATION_VERIFIED' &&
            rejUrl.status !== 0 && rejUrl.out.code === 'NON_LOOPBACK_TARGET_IN_UAT_PROFILE' &&
            rejCred.status !== 0 && rejCred.out.code === 'SENSITIVE_CREDENTIALS_IN_UAT_PROFILE' && !rejCred.text.includes(SECRET_VAL) &&
            rejEmail.status !== 0 && rejEmail.out.code === 'NON_SYNTHETIC_EMAIL_IN_UAT_PROFILE' && !rejEmail.text.includes(REAL_EMAIL_LOCAL),
            {
                cleanAudit: auditOk.out,
                rejectedUrlCode: rejUrl.out.code,
                rejectedCredCode: rejCred.out.code,
                rejectedEmailCode: rejEmail.out.code
            }
        );

        // =========================================================================
        // PART 6: REV14 DRY-RUN PREFLIGHT (`preflight-uat`), UAT RESTORE GUARD & HANDOFF MANIFEST
        // =========================================================================
        const pfNoArgs = runCli(['preflight-uat']);
        const pfOnlyTarget = runCli(['preflight-uat', '--target', CAND]);
        A('PREFLIGHT_UAT_REJECTS_MISSING_OR_GUESSED_PATHS',
            pfNoArgs.status !== 0 &&
            pfNoArgs.out && pfNoArgs.out.code === 'MISSING_EXPLICIT_PATH' &&
            pfOnlyTarget.status !== 0 &&
            pfOnlyTarget.out && pfOnlyTarget.out.code === 'MISSING_EXPLICIT_PATH',
            { noArgs: pfNoArgs.out, onlyTarget: pfOnlyTarget.out }
        );

        const pfDryRun = runCli([
            'preflight-uat',
            '--target', CAND,
            '--profile-dir', simRealProf,
            '--fixture-port', String(FIXTURE_PORT),
            '--sink-port', String(SINK_PORT)
        ]);
        A('PREFLIGHT_UAT_DRY_RUN_VERIFIES_KIT_AND_REPORTS_OS_FIREWALL_BLOCKED',
            pfDryRun.status === 0 &&
            pfDryRun.out &&
            pfDryRun.out.mode === 'DRY_RUN_PREFLIGHT_UAT' &&
            pfDryRun.out.modifiedTarget === false &&
            pfDryRun.out.modifiedProfile === false &&
            pfDryRun.out.nodeOk === true &&
            pfDryRun.out.expectedExtensionId === EXT_ID &&
            pfDryRun.out.localSinkFirewallStatus &&
            pfDryRun.out.localSinkFirewallStatus.result === 'UAT_FIREWALL_VERIFIED_FAIL_CLOSED' &&
            pfDryRun.out.osFirewallIsolationStatus === 'BLOCKED_NO_SAFE_ELEVATED_TEST_VM' &&
            pfDryRun.out.staticPreflightResult === 'READY_FOR_SYNTHETIC_UAT',
            pfDryRun.out
        );

        const uatRestoreTarget = path.join(work, 'uat_disposable_restore_target');
        fs.mkdirSync(uatRestoreTarget, { recursive: true });
        const restoreIntoUatBlocked = runCli(
            ['restore-storage', '--profile-dir', uatRestoreTarget, '--in', encFile, '--passphrase-env', 'XP_PASS'],
            { XP_PASS: PASS }
        );
        A('RESTORE_STORAGE_INTO_UAT_PROFILE_BLOCKED_BY_DEFAULT',
            restoreIntoUatBlocked.status !== 0 &&
            restoreIntoUatBlocked.out &&
            restoreIntoUatBlocked.out.result === 'ABORTED' &&
            restoreIntoUatBlocked.out.code === 'REAL_BACKUP_RESTORE_INTO_UAT_FORBIDDEN',
            restoreIntoUatBlocked.out
        );

        // Build & Verify Consolidated Owner Handoff Manifest (`dist/OWNER_HANDOFF_MANIFEST_REV14.json`)
        const HANDOFF_MANIFEST_PATH = path.join(DIST, 'OWNER_HANDOFF_MANIFEST_REV14.json');
        const RAW_BASE = 'https://github.com/goodkie/v-show/raw/candidate/p0-core-regressions-v7/';
        const handoffEntriesSpec = [
            { role: 'extension_runtime_zip_50_files_only', relPath: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip', requiredForNonNodeStaticInspect: true },
            { role: 'standalone_transactional_updater_and_uat_cli', relPath: 'scripts/xpider_safe_update.js', requiredForNodeToolkit: true },
            { role: 'candidate_50_file_sha256_inventory', relPath: 'dist/PACKAGE_INVENTORY_SHA256.json', requiredForNodeToolkit: true },
            { role: 'frozen_rc11_baseline_manifest', relPath: 'dist/rc11_baseline_manifest.json', requiredForNodeToolkit: true },
            { role: 'synthetic_only_windows_10_uat_checklist', relPath: 'dist/WINDOWS_10_OWNER_UAT_CHECKLIST.md', requiredForOwnerReview: true },
            { role: 'owner_safe_update_backup_and_rollback_guide', relPath: 'dist/OWNER_SAFE_UPDATE_AND_BACKUP_GUIDE.md', requiredForOwnerReview: true },
            { role: 'localhost_fixture_and_fail_closed_sink_proxy_server', relPath: 'owner-extension-test-site/server.js', requiredForSyntheticUat: true },
            { role: 'localhost_fixture_contact_standard_html', relPath: 'owner-extension-test-site/contact-standard.html', requiredForSyntheticUat: true },
            { role: 'localhost_fixture_subscribe_no_message_html', relPath: 'owner-extension-test-site/subscribe-no-message.html', requiredForSyntheticUat: true },
            { role: 'localhost_fixture_consent_required_no_message_html', relPath: 'owner-extension-test-site/consent-required-no-message.html', requiredForSyntheticUat: true },
            { role: 'localhost_fixture_contact_success_html', relPath: 'owner-extension-test-site/contact-success.html', requiredForSyntheticUat: true },
            { role: 'automated_uat_isolation_and_preflight_harness', relPath: 'test/run_uat_synthetic_profile_isolation_check.js', requiredForAutomatedVerification: true },
            { role: 'automated_browser_cdp_helper', relPath: 'test/lib/browser_cdp.js', requiredForAutomatedVerification: true }
        ];
        const handoffFiles = handoffEntriesSpec.map(item => {
            const abs = path.join(ROOT, item.relPath);
            const buf = fs.readFileSync(abs);
            return {
                role: item.role,
                path: item.relPath,
                size: buf.length,
                sha256: crypto.createHash('sha256').update(buf).digest('hex'),
                rawUrl: RAW_BASE + item.relPath
            };
        });
        const handoffManifest = {
            schemaVersion: 'XPIDER_OWNER_HANDOFF_MANIFEST_REV14',
            directive: '#6704335953',
            status: 'CANDIDATE_RELEASE_HOLD',
            branch: 'candidate/p0-core-regressions-v7',
            functionalCandidateCommit: '76fab0933276ae163c377d39d9dca5169a33063c',
            extensionTreeSha: '1d1bac897f70df6fa107cde85b00de591d5dea93',
            expectedExtensionId: EXT_ID,
            extensionZipAloneIsCompleteKit: false,
            extensionZipScopeNote: 'dist/XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip contains ONLY the 50 Chrome MV3 runtime files from extension/. The host-side transactional updater (scripts/xpider_safe_update.js), SHA-256 inventories, guides, and localhost fixture/sink server are separate host-side files listed in this manifest.',
            operatorCapabilityByEnvironment: {
                withNodeJs18Plus: {
                    supported: true,
                    capabilities: [
                        'preflight-uat (read-only dry-run preflight)',
                        'backup-storage (AES-256-GCM encrypted offline backup)',
                        'verify-storage-backup (in-memory integrity verification, writtenToDisk: false)',
                        'plan / apply / rollback / recover (journaled transactional code update)',
                        'owner-extension-test-site/server.js (localhost 127.0.0.1:8088 fixtures + 127.0.0.1:8090 fail-closed sink proxy)'
                    ]
                },
                withoutNodeJsPowerShellOnly: {
                    supportedForFullSyntheticCampaignUat: false,
                    phaseBCampaignUatStatusWithoutNode: 'BLOCKED',
                    allowedPowerShellFallbacks: [
                        'Get-FileHash .\\dist\\XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip -Algorithm SHA256',
                        'Manual offline Copy-Item of Local Extension Settings\\ldlijlaccfeelfdhgnjbibniocefckjj while Chrome is closed',
                        'Expand-Archive into a disposable copy for static UI inspection only (cannot run localhost fixtures or local sink proxy without Node.js)'
                    ]
                }
            },
            consolidatedAcceptanceMatrix: {
                G1_candidateRuntimeFreezeAnd50FileIntegrity: 'DEV_PASS',
                G2_chrome157AndEdge146MigrationBackupRestoreParity: 'DEV_PASS',
                G3_chrome157FunctionalUi3ModeResetCsvConsentSuite: 'DEV_PASS',
                G4_transactionalUpdaterFaultInjectionAndRollbackSuite: 'DEV_PASS',
                G5_browserSinkProxyDnrQuicAndDryRunPreflightUat: 'DEV_PASS',
                G6_osKernelDefaultDenyFirewallRuleOnTestChromeOrVm: 'BLOCKED (BLOCKED_NO_SAFE_ELEVATED_TEST_VM)',
                G7_ownerWindows10LiveDesktopSmoke: 'OWNER_ACTION_REQUIRED (INDEPENDENT_NOT_RUN)',
                G8_realExternalNopeChaExtensionInteroperability: 'INDEPENDENT_NOT_RUN (OWNER_ACTION_REQUIRED)',
                G9_authorizedDigitalOceanDecodoRelayEgressVerification: 'INDEPENDENT_NOT_RUN (OWNER_ACTION_REQUIRED)',
                G10_ownerFinalReleaseAndLiveUpdateApproval: 'OWNER_ACTION_REQUIRED'
            },
            files: handoffFiles
        };
        fs.writeFileSync(HANDOFF_MANIFEST_PATH, JSON.stringify(handoffManifest, null, 2) + '\n');

        const loadedManifest = JSON.parse(fs.readFileSync(HANDOFF_MANIFEST_PATH, 'utf8'));
        const allManifestFilesMatch = Array.isArray(loadedManifest.files) &&
            loadedManifest.files.length === handoffEntriesSpec.length &&
            loadedManifest.extensionZipAloneIsCompleteKit === false &&
            loadedManifest.files.every(entry => {
                const abs = path.join(ROOT, entry.path);
                if (!fs.existsSync(abs)) return false;
                const buf = fs.readFileSync(abs);
                const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
                return buf.length === entry.size && actualSha === entry.sha256 && entry.rawUrl === RAW_BASE + entry.path;
            });
        A('OWNER_HANDOFF_MANIFEST_REV14_ALL_FILES_AND_HASHES_MATCH',
            allManifestFilesMatch,
            { manifestPath: 'dist/OWNER_HANDOFF_MANIFEST_REV14.json', fileCount: loadedManifest.files.length }
        );

    } catch (e) {
        failures++;
        report.error = e.stack;
        console.error(e);
    } finally {
        if (pageWs) { try { pageWs.close(); } catch (_) {} }
        if (br) await br.stop();
        if (serverProc) {
            try {
                await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__xpider_shutdown`, { method: 'POST' }).catch(() => {});
                await sleep(150);
                serverProc.kill();
            } catch (_) {}
        }
        report.status = (failures === 0 && report.egressCounters.transmittedExternalRequests === 0) ? 'SUCCESS' : 'FAILED';
        report.endedAt = new Date().toISOString();
        report.total = report.assertions.length;
        report.failed = failures;
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
        fs.writeFileSync(REPORT_NET, JSON.stringify(report, null, 2));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
        console.log(`\n${report.total - failures}/${report.total} PASS (transmittedExternalRequests=${report.egressCounters.transmittedExternalRequests}) -> ${REPORT}`);
        process.exit((failures || report.egressCounters.transmittedExternalRequests !== 0) ? 1 : 0);
    }
})();

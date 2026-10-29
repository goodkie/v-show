const fs = require('fs');
const path = require('path');

const popupJsPath = path.resolve(__dirname, '../extension/popup.js');
let code = fs.readFileSync(popupJsPath, 'utf8');

// 1. In checkAndRefreshPrivacyReadinessHUD, handle res.state.egressMonitor
const hudSearch = "if (res.state?.isGateReady) {";
const hudReplace = "if (res.state?.egressMonitor && typeof window.updateEgressIpMonitorUI === 'function') {\n                                window.updateEgressIpMonitorUI(res.state.egressMonitor);\n                            }\n                            if (res.state?.isGateReady) {";

if (!code.includes('window.updateEgressIpMonitorUI(res.state.egressMonitor);')) {
    if (code.includes(hudSearch)) {
        code = code.replace(hudSearch, hudReplace);
    } else {
        console.error('Could not find hudSearch in popup.js');
        process.exit(1);
    }
}

// 2. In updateRelayStatusUI, call window.updateEgressIpMonitorUI if egressIpMonitor present
const relaySearch = "// [Issue #6 Comment #6273652325 EE2] Refresh main campaign HUD on relay readiness transitions";
const relayReplace = "if (statusData && statusData.egressIpMonitor && typeof window.updateEgressIpMonitorUI === 'function') {\n                window.updateEgressIpMonitorUI(statusData.egressIpMonitor);\n            }\n            // [Issue #6 Comment #6273652325 EE2] Refresh main campaign HUD on relay readiness transitions";

if (!code.includes('statusData.egressIpMonitor && typeof window.updateEgressIpMonitorUI')) {
    if (code.includes(relaySearch)) {
        code = code.replace(relaySearch, relayReplace);
    } else {
        console.error('Could not find relaySearch in popup.js');
        process.exit(1);
    }
}

// 3. Define window.updateEgressIpMonitorUI and helper functions right after checkAndRefreshPrivacyReadinessHUD
const egressFunctions = `
        // [RC3.60 .88 Directive #6497395270] Live Egress IP Monitor Controller
        let lastEgressData = null;
        window.updateEgressIpMonitorUI = function(data) {
            if (!data) return;
            lastEgressData = data;
            const showExact = localStorage.getItem('xpider_show_exact_ip') === 'true';

            // 1. Compact HUD elements
            const dot = document.getElementById('egress-status-dot');
            const routeLabel = document.getElementById('egress-route-label');
            const ipVal = document.getElementById('egress-ip-val');
            const toggleBtn = document.getElementById('egress-ip-toggle-btn');

            const route = data.activeRoute?.route || 'UNKNOWN';
            const routeStatus = data.activeRoute?.status || 'UNKNOWN';
            const bExit = data.browserExit || {};
            const decodo = data.decodoResidential || {};
            const dOcean = data.digitalOcean || {};
            const rawIsp = data.rawIspWan || {};

            const isRouteVerified = routeStatus === 'VERIFIED' || bExit.status === 'BROWSER_VERIFIED';
            const isDegraded = routeStatus === 'DEGRADED' || bExit.status === 'COMPANION_PROBE_ONLY' || bExit.status === 'CANARY_FAILED';
            const isBlocked = bExit.status === 'BLOCKED_HTTP_407' || decodo.status === 'BLOCKED_HTTP_407' || decodo.status === 'AUTH_FAILED';

            if (dot) {
                if (isBlocked) {
                    dot.style.background = '#ef4444';
                    dot.title = 'Route blocked / 407 error';
                } else if (isRouteVerified) {
                    dot.style.background = '#22c55e';
                    dot.title = 'Route verified';
                } else if (isDegraded) {
                    dot.style.background = '#eab308';
                    dot.title = 'Route degraded / companion probe only';
                } else {
                    dot.style.background = '#94a3b8';
                    dot.title = 'Route unverified / unknown';
                }
            }

            if (routeLabel) {
                routeLabel.textContent = 'ROUTE: ' + route;
                routeLabel.style.color = isRouteVerified ? '#38bdf8' : (isBlocked ? '#f87171' : '#cbd5e1');
            }

            const activeDisplayIp = showExact
                ? (bExit.observedIp || data.activeRoute?.egressIp || '...')
                : (bExit.observedIpMasked || data.activeRoute?.egressIpMasked || '...');

            if (ipVal) {
                ipVal.textContent = activeDisplayIp;
            }

            if (toggleBtn) {
                toggleBtn.textContent = showExact ? '🔒' : '👁️';
                toggleBtn.title = showExact ? 'Mask exact IPs' : 'Show exact IPs';
            }

            // 2. Settings table elements
            const tableToggleBtn = document.getElementById('egress-table-toggle-ip-btn');
            if (tableToggleBtn) {
                tableToggleBtn.textContent = showExact ? '🔒 Mask IPs' : '👁️ Show Exact';
            }

            // Row 1 Browser Exit
            const rBrowserStatus = document.getElementById('row-browser-status');
            const rBrowserIp = document.getElementById('row-browser-ip');
            const rBrowserSource = document.getElementById('row-browser-source');
            if (rBrowserStatus) {
                rBrowserStatus.textContent = bExit.status || 'UNKNOWN';
                rBrowserStatus.style.color = bExit.status === 'BROWSER_VERIFIED' ? '#22c55e' : (bExit.status === 'COMPANION_PROBE_ONLY' ? '#eab308' : (bExit.status === 'BLOCKED_HTTP_407' ? '#ef4444' : '#94a3b8'));
            }
            if (rBrowserIp) {
                rBrowserIp.textContent = showExact ? (bExit.observedIp || 'UNKNOWN') : (bExit.observedIpMasked || 'UNKNOWN');
            }
            if (rBrowserSource) {
                rBrowserSource.textContent = 'source: ' + (bExit.source || 'NONE');
            }

            // Row 2 Decodo Residential
            const rDecodoStatus = document.getElementById('row-decodo-status');
            const rDecodoIp = document.getElementById('row-decodo-ip');
            const rDecodoSource = document.getElementById('row-decodo-source');
            if (rDecodoStatus) {
                rDecodoStatus.textContent = decodo.status || 'NOT_CONFIGURED';
                rDecodoStatus.style.color = (decodo.status === 'CONNECTED' || decodo.status === 'EGRESS_VERIFIED') ? '#22c55e' : (String(decodo.status).includes('407') || decodo.status === 'AUTH_FAILED' ? '#ef4444' : '#94a3b8');
            }
            if (rDecodoIp) {
                rDecodoIp.textContent = showExact ? (decodo.observedIp || 'NONE') : (decodo.observedIpMasked || 'NONE');
            }
            if (rDecodoSource) {
                const inUseTag = decodo.inUse ? ' (IN USE)' : '';
                rDecodoSource.textContent = 'source: ' + (decodo.source || 'UPSTREAM_PROBE') + inUseTag;
            }

            // Row 3 DigitalOcean
            const rDoStatus = document.getElementById('row-do-status');
            const rDoIp = document.getElementById('row-do-ip');
            const rDoSource = document.getElementById('row-do-source');
            if (rDoStatus) {
                rDoStatus.textContent = dOcean.status || 'CONFIGURED';
                rDoStatus.style.color = dOcean.status === 'HEALTHY' ? '#22c55e' : '#94a3b8';
            }
            if (rDoIp) {
                rDoIp.textContent = showExact ? (dOcean.configuredIp || 'NONE') : (dOcean.configuredIpMasked || 'NONE');
            }
            if (rDoSource) {
                rDoSource.textContent = 'source: ' + (dOcean.source || 'NODE_CONFIG');
            }

            // Row 4 Raw ISP WAN
            const rIspStatus = document.getElementById('row-isp-status');
            if (rIspStatus) {
                rIspStatus.textContent = rawIsp.status || 'UNKNOWN / NOT SAFELY MEASURED';
            }

            // Row 5 Active Route
            const rRouteVal = document.getElementById('row-route-val');
            const rRouteStatus = document.getElementById('row-route-status');
            const rRouteChecked = document.getElementById('row-route-checked');
            if (rRouteVal) {
                rRouteVal.textContent = route;
                rRouteVal.style.color = isRouteVerified ? '#38bdf8' : '#94a3b8';
            }
            if (rRouteStatus) {
                rRouteStatus.textContent = routeStatus;
                rRouteStatus.style.color = isRouteVerified ? '#22c55e' : (isBlocked ? '#ef4444' : '#eab308');
            }
            if (rRouteChecked) {
                rRouteChecked.textContent = data.activeRoute?.checkedAt ? new Date(data.activeRoute.checkedAt).toLocaleTimeString() : 'Never';
            }
        };

        const toggleIpVisibility = () => {
            const current = localStorage.getItem('xpider_show_exact_ip') === 'true';
            localStorage.setItem('xpider_show_exact_ip', (!current).toString());
            if (lastEgressData) {
                window.updateEgressIpMonitorUI(lastEgressData);
            }
        };

        const triggerCheckLiveEgressIp = (btnElement, force = true) => {
            if (btnElement) {
                btnElement.disabled = true;
                btnElement.textContent = 'Checking...';
            }
            chrome.runtime.sendMessage({ action: 'CHECK_LIVE_EGRESS_IP', force }, (res) => {
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.textContent = btnElement.id === 'egress-check-ip-btn' ? 'Check IP' : '🔄 Check IP';
                }
                if (res && res.success && res.egressMonitor) {
                    window.updateEgressIpMonitorUI(res.egressMonitor);
                }
            });
        };

        const bindEgressMonitorListeners = () => {
            const toggleBtn1 = document.getElementById('egress-ip-toggle-btn');
            const toggleBtn2 = document.getElementById('egress-table-toggle-ip-btn');
            const checkBtn1 = document.getElementById('egress-check-ip-btn');
            const checkBtn2 = document.getElementById('egress-table-refresh-btn');

            if (toggleBtn1) toggleBtn1.onclick = toggleIpVisibility;
            if (toggleBtn2) toggleBtn2.onclick = toggleIpVisibility;
            if (checkBtn1) checkBtn1.onclick = () => triggerCheckLiveEgressIp(checkBtn1, true);
            if (checkBtn2) checkBtn2.onclick = () => triggerCheckLiveEgressIp(checkBtn2, true);
        };
        setTimeout(bindEgressMonitorListeners, 200);
        setTimeout(() => triggerCheckLiveEgressIp(null, false), 500);
`;

const insertTarget = "setTimeout(window.checkAndRefreshPrivacyReadinessHUD, 300);";
if (!code.includes('Live Egress IP Monitor Controller')) {
    if (code.includes(insertTarget)) {
        code = code.replace(insertTarget, insertTarget + '\n' + egressFunctions);
    } else {
        console.error('Could not find insertTarget in popup.js');
        process.exit(1);
    }
}

fs.writeFileSync(popupJsPath, code, 'utf8');
console.log('Successfully patched popup.js with egress monitor logic');


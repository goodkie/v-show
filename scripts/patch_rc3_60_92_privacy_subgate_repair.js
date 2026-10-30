const fs = require('fs');
const path = require('path');

console.log('=== APPLYING RC3.60 .92 PRIVACY SUBGATE & PREFLIGHT ACTIONABILITY REPAIRS ===\n');

function patchWithNormalization(filePath, target, replacement, description) {
    const fullPath = path.resolve(filePath);
    let code = fs.readFileSync(fullPath, 'utf8');
    const isCrlf = code.includes('\r\n');
    const normCode = code.replace(/\r\n/g, '\n');
    const normTarget = target.replace(/\r\n/g, '\n');
    const normReplacement = replacement.replace(/\r\n/g, '\n');

    if (normCode.includes(normTarget)) {
        let patched = normCode.replace(normTarget, normReplacement);
        if (isCrlf) {
            patched = patched.replace(/\n/g, '\r\n');
        }
        fs.writeFileSync(fullPath, patched, 'utf8');
        console.log(`✔ Patched ${description} in ${filePath}`);
        return true;
    } else {
        console.warn(`⚠ Target not matched for ${description} in ${filePath}`);
        return false;
    }
}

// 1. privacy-gateway.js
const pgTarget1 = `                    if (this.config.physicalGateEnabled && statusRes.status && statusRes.status.physicalGate && !statusRes.status.physicalGate.ready) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = 'PHYSICAL_GATE_FAIL_CLOSED';
                    } else if (!statusRes.status || !statusRes.status.relayReady || statusRes.status.health === 'NO_NODES') {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = (statusRes.status && statusRes.status.physicalGate && !statusRes.status.physicalGate.ready) ? 'PHYSICAL_GATE_FAIL_CLOSED' : 'PRIVACY_RELAY_NO_HEALTHY_EGRESS';
                    } else {`;

const pgReplacement1 = `                    let subgateFailure = null;
                    const st = statusRes.status;
                    if (st) {
                        if (this.config.physicalGateEnabled && st.physicalGate && st.physicalGate.enabled && !st.physicalGate.ready) {
                            subgateFailure = 'PHYSICAL_GATE_FAIL_CLOSED';
                        } else if (st.residentialProxySelected && (!st.residentialProxy || !st.residentialProxy.sendAllowed || st.residentialProxy.status !== 'EGRESS_VERIFIED')) {
                            const resDetail = st.residentialProxy ? (st.residentialProxy.detail || st.residentialProxy.status) : 'UNCONFIGURED';
                            subgateFailure = \`RESIDENTIAL_UPSTREAM_BLOCKED (\${resDetail})\`;
                        } else if (st.health === 'NO_NODES' || !st.selectedEgressId) {
                            subgateFailure = 'PRIVACY_RELAY_NO_NODES';
                        } else if (st.health === 'EXPIRED') {
                            subgateFailure = 'PRIVACY_RELAY_HEALTH_EXPIRED';
                        } else if (st.lastDisconnectReason) {
                            subgateFailure = \`PRIVACY_RELAY_NODE_UNVERIFIED (\${st.lastDisconnectReason})\`;
                        } else if (!st.relayReady) {
                            subgateFailure = 'PRIVACY_RELAY_UNVERIFIED';
                        }
                    } else {
                        subgateFailure = statusRes.reason === 'HTTP_401' ? 'PRIVACY_RELAY_UNAUTHORIZED' : (statusRes.reason || 'PRIVACY_RELAY_OFFLINE');
                    }

                    if (subgateFailure) {
                        ready = false;
                        directFallbackBlocked = 'BLOCKED';
                        egressCheck = 'FAIL';
                        failureReason = subgateFailure;
                    } else {`;

patchWithNormalization('extension/modules/privacy-gateway.js', pgTarget1, pgReplacement1, 'runPreflight subgate diagnostic accuracy');

const pgTarget2 = `                    if (this.config.physicalGateEnabled && !statusRes.status.physicalGate.ready) {
                        return {
                            pass: false,
                            reason: 'PHYSICAL_GATE_FAIL_CLOSED',
                            details: (statusRes.status.physicalGate.reasons || []).join(', ')
                        };
                    }`;

const pgReplacement2 = `                    if (this.config.physicalGateEnabled && statusRes.status.physicalGate.enabled && !statusRes.status.physicalGate.ready) {
                        return {
                            pass: false,
                            reason: 'PHYSICAL_GATE_FAIL_CLOSED',
                            details: (statusRes.status.physicalGate.reasons || []).join(', ')
                        };
                    }
                    if (statusRes.status.residentialProxySelected && (!statusRes.status.residentialProxy || !statusRes.status.residentialProxy.sendAllowed || statusRes.status.residentialProxy.status !== 'EGRESS_VERIFIED')) {
                        const detail = statusRes.status.residentialProxy ? (statusRes.status.residentialProxy.detail || statusRes.status.residentialProxy.status) : 'UNCONFIGURED';
                        return {
                            pass: false,
                            reason: 'RESIDENTIAL_UPSTREAM_BLOCKED',
                            details: detail
                        };
                    }`;

patchWithNormalization('extension/modules/privacy-gateway.js', pgTarget2, pgReplacement2, 'assertSafeEgressTunnel subgate checks');

const pgTarget3 = `                if (!rStatus.relayReady || rStatus.health === 'EXPIRED' || rStatus.health === 'NO_NODES') {
                    const failReason = rStatus.health === 'EXPIRED' ? 'PRIVACY_RELAY_HEALTH_EXPIRED' : 'PRIVACY_RELAY_NOT_READY';
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }`;

const pgReplacement3 = `                if (!rStatus.relayReady || rStatus.health === 'EXPIRED' || rStatus.health === 'NO_NODES') {
                    let failReason = 'PRIVACY_RELAY_NOT_READY';
                    if (rStatus.health === 'EXPIRED') {
                        failReason = 'PRIVACY_RELAY_HEALTH_EXPIRED';
                    } else if (rStatus.health === 'NO_NODES' || !rStatus.selectedEgressId) {
                        failReason = 'PRIVACY_RELAY_NO_NODES';
                    } else if (rStatus.residentialProxySelected && (!rStatus.residentialProxy || !rStatus.residentialProxy.sendAllowed || rStatus.residentialProxy.status !== 'EGRESS_VERIFIED')) {
                        const detail = rStatus.residentialProxy ? (rStatus.residentialProxy.detail || rStatus.residentialProxy.status) : 'UNCONFIGURED';
                        failReason = \`RESIDENTIAL_UPSTREAM_BLOCKED (\${detail})\`;
                    } else if (this.config.physicalGateEnabled && rStatus.physicalGateEnabled && !rStatus.physicalGateReady) {
                        failReason = 'PHYSICAL_GATE_FAIL_CLOSED';
                    } else if (rStatus.lastDisconnectReason) {
                        failReason = \`PRIVACY_RELAY_NODE_UNVERIFIED (\${rStatus.lastDisconnectReason})\`;
                    }
                    this.invalidateGateReadiness(failReason);
                    return { ready: false, reason: failReason };
                }`;

patchWithNormalization('extension/modules/privacy-gateway.js', pgTarget3, pgReplacement3, '_executeAuthoritativeEgressEnforcement truthful reasons');

// 2. popup.js
const popupTarget1 = `            if (privDiagFailure) {
                const fail = failureReason || (statusData ? (statusData.relayReady ? 'OPERATIONAL' : 'DEGRADED') : 'OFFLINE');
                privDiagFailure.textContent = fail;
                privDiagFailure.style.color = (fail === 'OPERATIONAL' || fail === 'HEALTHY') ? '#4ade80' : '#f87171';
            }`;

const popupReplacement1 = `            if (privDiagFailure) {
                let fail = failureReason;
                if (!fail || fail === 'ONLINE_STANDBY' || fail === 'DEGRADED') {
                    if (statusData) {
                        if (statusData.relayReady) {
                            fail = 'OPERATIONAL';
                        } else if (statusData.residentialProxySelected && (!statusData.residentialProxy || !statusData.residentialProxy.sendAllowed || statusData.residentialProxy.status !== 'EGRESS_VERIFIED')) {
                            const resDetail = statusData.residentialProxy ? (statusData.residentialProxy.detail || statusData.residentialProxy.status) : 'UNCONFIGURED';
                            fail = \`UPSTREAM_WAIT: DECODO_\${resDetail}\`;
                        } else if (statusData.physicalGate && statusData.physicalGate.enabled && !statusData.physicalGate.ready) {
                            fail = 'PHYSICAL_GATE_FAIL_CLOSED';
                        } else if (statusData.totalNodes === 0 || !statusData.selectedEgressId) {
                            fail = 'NO_EGRESS_NODES';
                        } else {
                            fail = statusData.lastDisconnectReason || 'STANDBY_UNVERIFIED';
                        }
                    } else {
                        fail = 'OFFLINE';
                    }
                }
                privDiagFailure.textContent = fail;
                privDiagFailure.style.color = (fail === 'OPERATIONAL' || fail === 'HEALTHY') ? '#4ade80' : '#f87171';
            }`;

patchWithNormalization('extension/popup.js', popupTarget1, popupReplacement1, 'popup.js updateRelayStatusUI diagnostics');

const popupTarget2 = `                    const res = await new Promise(resolve => {
                        chrome.runtime.sendMessage({ action: 'RUN_PRIVACY_PREFLIGHT' }, resolve);
                    });
                    if (res && res.preflight) {
                        _updatePrivacyCardUI(res.preflight);
                        if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                            window.checkAndRefreshPrivacyReadinessHUD();
                        }
                    }`;

const popupReplacement2 = `                    const res = await new Promise(resolve => {
                        chrome.runtime.sendMessage({ action: 'RUN_PRIVACY_PREFLIGHT' }, resolve);
                    });
                    if (res && res.preflight) {
                        _updatePrivacyCardUI(res.preflight);
                    }
                    chrome.runtime.sendMessage({ action: 'QUERY_PRIVACY_RELAY_STATUS' }, (stRes) => {
                        if (stRes && stRes.result && stRes.result.status && typeof updateRelayStatusUI === 'function') {
                            updateRelayStatusUI(stRes.result.status);
                        }
                    });
                    if (typeof window.checkAndRefreshPrivacyReadinessHUD === 'function') {
                        window.checkAndRefreshPrivacyReadinessHUD();
                    }`;

patchWithNormalization('extension/popup.js', popupTarget2, popupReplacement2, 'popup.js priv-run-preflight-btn status synchronization');

console.log('\n=== REPAIR SCRIPT COMPLETE ===');

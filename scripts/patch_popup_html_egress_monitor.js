const fs = require('fs');
const path = require('path');

const popupHtmlPath = path.resolve(__dirname, '../extension/popup.html');
let html = fs.readFileSync(popupHtmlPath, 'utf8');

// 1. Compact monitor on main HUD right below start-readiness-hud
const compactSnippet = `            <!-- [RC3.60 .88 Directive #6497395270] Compact Live Egress IP Monitor -->
            <div id="egress-ip-monitor-compact" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 10px; font-family: monospace; padding: 4px 8px; background: rgba(15, 23, 42, 0.4); border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <span id="egress-status-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; flex-shrink: 0;" title="Route status"></span>
                    <span id="egress-route-label" style="color: #cbd5e1; font-weight: 600;">ROUTE: CHECKING...</span>
                    <span id="egress-ip-val" style="color: #38bdf8; font-weight: 500;" title="Observed Egress IP">...</span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                    <button id="egress-ip-toggle-btn" type="button" style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 2px 4px; font-size: 11px;" title="Toggle Full IP / Masked">👁️</button>
                    <button id="egress-check-ip-btn" type="button" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; border-radius: 3px; cursor: pointer; padding: 2px 6px; font-size: 9px; font-family: monospace;" title="Check Connection & IP">Check IP</button>
                </div>
            </div>`;

if (!html.includes('id="egress-ip-monitor-compact"')) {
    const target1CRLF = '            </div>\r\n\r\n            <div class="action-buttons">';
    const target1LF = '            </div>\n\n            <div class="action-buttons">';
    if (html.includes(target1CRLF)) {
        html = html.replace(target1CRLF, '            </div>\r\n\r\n' + compactSnippet + '\r\n\r\n            <div class="action-buttons">');
    } else if (html.includes(target1LF)) {
        html = html.replace(target1LF, '            </div>\n\n' + compactSnippet + '\n\n            <div class="action-buttons">');
    } else {
        console.error('Failed to locate start-readiness-hud target');
        process.exit(1);
    }
}

// 2. Detailed 5-row table card in Settings -> Privacy Gateway
const tableCardSnippet = `                            <!-- [RC3.60 .88 Directive #6497395270] Live Egress IP Monitor Card -->
                            <div id="egress-ip-table-card" style="background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 6px; padding: 8px; margin-top: 10px; font-family: monospace; font-size: 10px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <div style="font-weight: 700; color: #38bdf8; font-size: 11px;">🌐 LIVE EGRESS IP MONITOR</div>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <button id="egress-table-toggle-ip-btn" type="button" class="secondary-btn-small" style="padding: 2px 5px; font-size: 9px; background: #334155; color: #94a3b8; border: none; border-radius: 3px; cursor: pointer;" title="Toggle Full / Masked IPs">👁️ Show Exact</button>
                                        <button id="egress-table-refresh-btn" type="button" class="primary-btn-small" style="padding: 2px 6px; font-size: 9px; background: #0284c7; color: white; border: none; border-radius: 3px; cursor: pointer;" title="Check Connection & IP">🔄 Check IP</button>
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 5px;">
                                    <!-- Row 1: ACTUAL XPIDER BROWSER EXIT IP (primary) -->
                                    <div style="padding: 4px 6px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 700; color: #e2e8f0;">1. ACTUAL BROWSER EXIT IP:</span>
                                            <span id="row-browser-status" style="font-weight: 700; color: #94a3b8;">UNKNOWN</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                                            <span id="row-browser-ip" style="color: #38bdf8; font-weight: 600;">...</span>
                                            <span id="row-browser-source" style="color: #64748b; font-size: 9px;">source: NONE</span>
                                        </div>
                                    </div>
                                    <!-- Row 2: DECODO RESIDENTIAL EXIT IP -->
                                    <div style="padding: 4px 6px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 700; color: #e2e8f0;">2. DECODO RESIDENTIAL EXIT IP:</span>
                                            <span id="row-decodo-status" style="font-weight: 700; color: #94a3b8;">NOT_CONFIGURED</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                                            <span id="row-decodo-ip" style="color: #a78bfa; font-weight: 600;">...</span>
                                            <span id="row-decodo-source" style="color: #64748b; font-size: 9px;">source: UPSTREAM_PROBE</span>
                                        </div>
                                    </div>
                                    <!-- Row 3: DIGITALOCEAN EGRESS IP -->
                                    <div style="padding: 4px 6px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 700; color: #e2e8f0;">3. DIGITALOCEAN EGRESS IP:</span>
                                            <span id="row-do-status" style="font-weight: 700; color: #94a3b8;">CONFIGURED</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                                            <span id="row-do-ip" style="color: #38bdf8; font-weight: 600;">...</span>
                                            <span id="row-do-source" style="color: #64748b; font-size: 9px;">source: NODE_CONFIG</span>
                                        </div>
                                    </div>
                                    <!-- Row 4: RAW ISP WAN IP -->
                                    <div style="padding: 4px 6px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 700; color: #e2e8f0;">4. RAW ISP WAN IP:</span>
                                            <span id="row-isp-status" style="font-weight: 700; color: #94a3b8;">UNKNOWN / NOT SAFELY MEASURED</span>
                                        </div>
                                        <div style="margin-top: 2px; color: #64748b; font-size: 8px; line-height: 1.2;">
                                            *Anti-leak invariant: direct public IP echo probe never executed to discover raw ISP IP
                                        </div>
                                    </div>
                                    <!-- Row 5: ACTIVE ROUTE -->
                                    <div style="padding: 4px 6px; background: rgba(30, 41, 59, 0.5); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: 700; color: #e2e8f0;">5. ACTIVE ROUTE:</span>
                                            <span id="row-route-val" style="font-weight: 700; color: #38bdf8;">UNKNOWN/PARTIALLY VERIFIED</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                                            <span style="color: #94a3b8; font-size: 9px;">CHECKED: <span id="row-route-checked">Never</span></span>
                                            <span id="row-route-status" style="font-weight: 600; color: #94a3b8;">DEGRADED</span>
                                        </div>
                                    </div>
                                </div>
                            </div>`;

if (!html.includes('id="egress-ip-table-card"')) {
    const cardTargetCRLF = '<button id="priv-run-preflight-btn" type="button" class="secondary-btn" style="margin-top: 8px; width: 100%; font-size: 10px; padding: 4px; border-radius: 4px; background: #1e293b; color: #38bdf8; border: 1px solid #38bdf8; cursor: pointer;">🔍 Run Privacy Preflight</button>\r\n                            </div>';
    const cardTargetLF = '<button id="priv-run-preflight-btn" type="button" class="secondary-btn" style="margin-top: 8px; width: 100%; font-size: 10px; padding: 4px; border-radius: 4px; background: #1e293b; color: #38bdf8; border: 1px solid #38bdf8; cursor: pointer;">🔍 Run Privacy Preflight</button>\n                            </div>';
    if (html.includes(cardTargetCRLF)) {
        html = html.replace(cardTargetCRLF, cardTargetCRLF + '\r\n\r\n' + tableCardSnippet);
    } else if (html.includes(cardTargetLF)) {
        html = html.replace(cardTargetLF, cardTargetLF + '\n\n' + tableCardSnippet);
    } else {
        console.error('Failed to locate priv-run-preflight-btn end target');
        process.exit(1);
    }
}

fs.writeFileSync(popupHtmlPath, html, 'utf8');
console.log('Successfully patched popup.html with egress monitor elements');


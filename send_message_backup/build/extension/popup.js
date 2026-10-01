/**
 * X PIDER Sender Pro - Logic v1.2.0 (Side Panel & Full Settings)
 * [v4.17.0] XPIDER DevLog Bridge + 개발자 스텔스 트리거 적용됨
 */

// ── XPIDER DEV LOG BRIDGE (Popup) ────────────────────────────────────────
(function() {
  const _EXT_NAME = 'Ext[AutoFormSender/Popup]';
  const _xDL = (lvl, msg) => {
    try {
      chrome.runtime.sendMessage({
        _xpider_devlog: true, level: lvl, source: _EXT_NAME,
        msg: String(msg).substring(0, 2048)
      }).catch(() => {});
    } catch(_) {}
  };
  ['log','warn','error','debug','info'].forEach(m => {
    const _o = console[m].bind(console);
    console[m] = (...a) => {
      _o(...a);
      const lvlMap = { log:'INFO', warn:'WARN', error:'ERROR', debug:'DEBUG', info:'INFO' };
      _xDL(lvlMap[m] || 'INFO', a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
    };
  });
})();

// ── 🕵️ 개발자 전용 시크릿 키 트리거 ──────────────────────────────────────
// Ctrl+Shift+D 를 2초 이내 2회 입력 시 DevConsole 오픈 (UI에 표시되지 않음)
(function() {
  let _devKeyCount = 0;
  let _devKeyTimer = null;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      _devKeyCount++;
      if (_devKeyTimer) clearTimeout(_devKeyTimer);
      if (_devKeyCount >= 2) {
        _devKeyCount = 0;
        // DevConsole 오픈 요청
        try {
          window.postMessage({ type: 'XPIDER_INVOKE', channel: 'xpider-devlog-open-console', args: {}, id: 'devcon-' + Date.now() }, '*');
          console.log('[DEV] DevConsole 오픈 트리거 발동');
        } catch(_) {}
      } else {
        _devKeyTimer = setTimeout(() => { _devKeyCount = 0; }, 2000);
      }
    }
  }, true);
})();
// ── END DEV LOG BRIDGE ───────────────────────────────────────────────────

let currentTpl = {};
let campaignQueue = [];
let campaignActive = false;
let campaignPaused = false;
let successCount = 0;
let totalTargets = 0;
let i18nData = null;
let lastLogMessage = "Ready...";
let remainingTargets = 0;

// [v19.0] XPIDER_INVOKE: Direct IPC bridge to main process (bypasses background.js)
function xpiderInvoke(channel, args) {
    return new Promise((resolve, reject) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        const handler = (e) => {
            if (e.data && e.data.type === 'XPIDER_RESPONSE' && e.data.id === id) {
                window.removeEventListener('message', handler);
                if (e.data.error) reject(new Error(e.data.error));
                else resolve(e.data.result);
            }
        };
        window.addEventListener('message', handler);
        window.postMessage({ type: 'XPIDER_INVOKE', channel, args, id }, '*');
        // Safety timeout
        setTimeout(() => {
            window.removeEventListener('message', handler);
            reject(new Error(`IPC timeout: ${channel}`));
        }, 30000);
    });
}


// [v1.1.1] Global error handler for debugging
window.onerror = function(msg, url, line) {
    console.error(`[Popup Error] ${msg} at ${url}:${line}`);
    // Optional: add to log container if it exists
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        const div = document.createElement('div');
        div.className = 'log-entry error';
        div.textContent = `[System Error] ${msg}`;
        logContainer.appendChild(div);
    }
    return false;
};

document.addEventListener('DOMContentLoaded', () => {
    // ── [VITAL] Step 0: Register messaging listener IMMEDIATELY and SYNCHRONOUSLY
    // Ensures that we never miss SENDER_LOG or UPDATE_STATS events, even if translations or settings load slowly.
    
    // 1. Direct Chrome Runtime message listener (Custom bridge fallback)
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return;
            if (request.action === 'SENDER_LOG') {
                addLog(request.message, request.logType);
            } else if (request.action === 'UPDATE_STATS') {
                updateRealTimeStatus(request.data);
            }
        });
        console.log("✅ [Popup] Real-time messaging listener registered via chrome.runtime.");
    } catch(e) { console.error('[Popup] Fatal: onMessage listener failed:', e); }

    // 2. [VITAL 2차 방어벽] Direct window postMessage listener
    // Electron renderer_ui가 executeJavaScript로 window.postMessage릴레이를 보낼 때 직접 가로채어 수신
    try {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'runtime-on-message') {
                const request = event.data.data;
                if (!request) return;
                console.log("📥 [Popup postMessage Relay] Received action:", request.action);
                if (request.action === 'SENDER_LOG') {
                    addLog(request.message, request.logType);
                } else if (request.action === 'UPDATE_STATS') {
                    updateRealTimeStatus(request.data);
                }
            }
        });
        console.log("✅ [Popup] Dual-path postMessage real-time listener active.");
    } catch(e) { console.error('[Popup] Fatal: postMessage listener failed:', e); }

    // ── Step 1: Bind ALL events FIRST (no async, cannot fail) ──
    try { bindEvents(); } catch(e) { console.error('[Popup] bindEvents failed:', e); }
    
    // ── Step 2: Connect to runtime (non-critical, ignore errors) ──
    try { chrome.runtime.connect({ name: 'xpider_popup' }); } catch(e) {}

    // Execute all asynchronous/slower initializations in background to prevent hanging
    initializeAsyncComponents();
});

async function initializeAsyncComponents() {
    // ── Step 3: Load localizer ──
    try { await initLocalizer(); } catch(e) { console.error('[Popup] initLocalizer failed:', e); }

    // ── Step 4: Load settings ──
    try { await loadSettings(); } catch(e) { console.error('[Popup] loadSettings failed:', e); }

    // ── Step 5: Restore persistent logs ──
    try { await loadBlackBoxLogs(); } catch(e) {}

    // ── Step 6: Passive Keep-Alive heartbeat ──
    try {
        setInterval(() => {
            chrome.runtime.sendMessage({ action: 'UI_HEARTBEAT' }).catch(() => {});
        }, 30000);
    } catch(e) {}

    // ── Step 8: Speed slider ──
    try {
        ['delay-input-collect', 'delay-input-fill', 'delay-input-submit'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSpeedLabels);
        });

        // [v4.15.0] 폼 자동 입력 방식 변경 리스너 등록 및 실시간 세이브
        document.querySelectorAll('input[name="fill-mode"]').forEach(el => {
            el.addEventListener('change', (e) => {
                chrome.storage.local.set({ xpider_fill_mode: e.target.value });
            });
        });
    } catch(e) {}

    console.log("✅ X PIDER Sender Pro initialized.");

    // ── Step 9: State Handshake (Directly with Native Campaign Engine) ──
    try {
        xpiderInvoke('xpider-campaign-get-state', {}).then(response => {
            if (response && response.success && response.isActive) {
                campaignActive = true;
                totalTargets = response.totalTargets;
                successCount = response.successCount;
                remainingTargets = response.remainingCount;
                campaignPaused = !!response.isPaused;
                
                const completedCount = response.completedCount || 0;
                
                document.getElementById('status-box').classList.remove('hidden');
                document.getElementById('multi-actions').classList.remove('hidden');
                document.getElementById('start-btn').classList.add('hidden');
                
                updateRealTimeStatus({
                    successCount: successCount,
                    completedCount: completedCount,
                    remainingCount: remainingTargets,
                    totalTargets: totalTargets
                });
                
                const btn = document.getElementById('pause-btn');
                const langSelect = document.getElementById('language-select');
                const lang = langSelect ? langSelect.value : 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                if (btn) {
                    if (campaignPaused) {
                        btn.textContent = dict.btn_resume || "▶️ Resume";
                        btn.style.backgroundColor = "#22c55e";
                    } else {
                        btn.textContent = dict.btn_pause || "⏸️ Pause";
                        btn.style.backgroundColor = "#f59e0b";
                    }
                }
            } else {
                campaignActive = false;
                document.getElementById('start-btn').classList.remove('hidden');
                document.getElementById('multi-actions').classList.add('hidden');
            }
        }).catch(e => {
            console.error('[Popup] Direct engine state check failed, falling back:', e);
            // Fallback to legacy GET_STATE
            chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
                if (response && response.success) {
                    if (response.isActive) {
                        campaignActive = true;
                        totalTargets = response.totalTargets;
                        successCount = response.successCount;
                        remainingTargets = response.remainingCount;
                        campaignPaused = !!response.isPaused;
                        
                        document.getElementById('status-box').classList.remove('hidden');
                        document.getElementById('multi-actions').classList.remove('hidden');
                        document.getElementById('start-btn').classList.add('hidden');
                        
                        updateRealTimeStatus({
                            successCount: successCount,
                            remainingCount: remainingTargets
                        });
                        
                        const btn = document.getElementById('pause-btn');
                        const langSelect = document.getElementById('language-select');
                        const lang = langSelect ? langSelect.value : 'en';
                        const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                        if (btn) {
                            if (campaignPaused) {
                                btn.textContent = dict.btn_resume || "▶️ Resume";
                                btn.style.backgroundColor = "#22c55e";
                            } else {
                                btn.textContent = dict.btn_pause || "⏸️ Pause";
                                btn.style.backgroundColor = "#f59e0b";
                            }
                        }
                    } else {
                        campaignActive = false;
                        document.getElementById('start-btn').classList.remove('hidden');
                        document.getElementById('multi-actions').classList.add('hidden');
                    }
                }
            });
        });
    } catch(e) { console.error('[Popup] Direct state handshake failed:', e); }

    // ── Step 10: Hard Reset Button ──
    try {
        const hardResetBtn = document.getElementById('hard-reset-engine-btn');
        if (hardResetBtn) {
            hardResetBtn.addEventListener('click', () => {
                if (confirm("Are you sure? This will reload the extension and reset its state.")) {
                    chrome.runtime.reload();
                }
            });
        }
    } catch(e) {}

    // ── Step 11: Engine status indicator ──
    try {
        const footer = document.querySelector('.popup-footer');
        if (footer && !document.getElementById('engine-status-indicator')) {
            const span = document.createElement('span');
            span.id = 'engine-status-indicator';
            span.style.cssText = 'font-size:0.7rem;margin-left:auto;opacity:0.8';
            span.textContent = "Checking...";
            footer.appendChild(span);
        }
    } catch(e) {}

    // ── Step 12: Pulse check ──
    try { startPulseCheck(); } catch(e) {}

    // [WitKey-Sync v3] Audio STT API Key (Wit.ai) 최초 설정 여부 체크
    // 먼저 메인 프로세스 공유 스토리지에서 직접 읽기 (chrome.storage 격리 우회)
    xpiderInvoke('xpider-ext-get-wit-key').then(res => {
        const mainKey = (res && res.key) ? res.key : '';
        console.log(`[WitKey-Sync v3] Sender init: MainProcess key = ${mainKey ? mainKey.substring(0, 8) + '...' : 'NONE'}`);
        if (mainKey && mainKey.trim() !== '') {
            const sttKeyInput = document.getElementById('audio-stt-key');
            if (sttKeyInput) sttKeyInput.value = mainKey;
            const setupInput = document.getElementById('setup-stt-key-input');
            if (setupInput) setupInput.value = mainKey;
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.add('hidden');
            // chrome.storage에도 동기화 (다른 로직 호환)
            chrome.storage.local.set({ xpider_stt_api_key: mainKey, audioSttKey: mainKey, witKey: mainKey });
        } else {
            // IPC에서 키가 없으면 chrome.storage 폴백
            _senderFallbackLoadKey();
        }
    }).catch(() => {
        // IPC 실패 시 chrome.storage 폴백
        _senderFallbackLoadKey();
    });

    function _senderFallbackLoadKey() {
        chrome.storage.local.get(['xpider_stt_api_key', 'audioSttKey', 'witKey'], (res) => {
            const latestKey = res.xpider_stt_api_key || res.audioSttKey || res.witKey || '';
            if (latestKey.trim() === '') {
                const setupModal = document.getElementById('stt-setup-modal-overlay');
                if (setupModal) setupModal.classList.remove('hidden');
            } else {
                const sttKeyInput = document.getElementById('audio-stt-key');
                if (sttKeyInput) sttKeyInput.value = latestKey;
                const setupInput = document.getElementById('setup-stt-key-input');
                if (setupInput) setupInput.value = latestKey;
            }
        });
    }
}

async function initLocalizer() {
    // Wait a bit to ensure translations.js is parsed if needed
    i18nData = window.I18N_DATA;
    if (!i18nData) {
        console.warn("I18N_DATA not found, retrying...");
        await new Promise(r => setTimeout(r, 100));
        i18nData = window.I18N_DATA;
    }
    
    if (!i18nData) {
        console.error("Fatal: I18N_DATA could not be loaded.");
        return;
    }

    const storage = await chrome.storage.local.get(['xpider_lang']);
    const lang = storage.xpider_lang || 'en';
    applyTranslations(lang);
}

function applyTranslations(lang) {
    if (!i18nData) return;
    const dict = i18nData[lang] || i18nData['en'] || {};

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        let text = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null) || key;
        
        if (key === 'status_finished') {
            const parts = text.split('{count}');
            const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
            const suffixText = parts[1] ? parts[1].trim() : 'sent';
            
            el.textContent = prefixText;
            
            const suffixLabel = document.querySelector('.status-suffix');
            if (suffixLabel) suffixLabel.textContent = suffixText;
            
            updateRealTimeStatus({ successCount });
        } else {
            el.textContent = text;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = dict[key] || (i18nData['en'] ? i18nData['en'][key] : null);
        if (val) el.placeholder = val;
    });

    // Update API Link Tip
    const methodSelect = document.getElementById('captcha-method-select');
    const apiLinkTip = document.getElementById('api-link-tip');
    if (apiLinkTip && methodSelect) {
        const method = methodSelect.value;
        if (method === 'nopecha') {
            apiLinkTip.innerHTML = '<a href="https://nopecha.com/" target="_blank">NopeCHA API Key 받기</a>';
        } else {
            apiLinkTip.innerHTML = '<a href="https://2captcha.com?from=18329628" target="_blank">2Captcha Key 받기</a>';
        }
    }
}

function updateRealTimeStatus(data) {
    if (data.totalTargets !== undefined) {
        totalTargets = data.totalTargets;
    }
    
    let completedCount = 0;
    if (data.completedCount !== undefined) {
        completedCount = data.completedCount;
    } else if (data.remainingCount !== undefined) {
        completedCount = totalTargets - data.remainingCount;
    }
    if (completedCount < 0) completedCount = 0;
    
    // Update Completed count display
    const completedDisplay = document.getElementById('completed-count-display');
    if (completedDisplay) completedDisplay.textContent = completedCount;

    if (data.successCount !== undefined) {
        successCount = data.successCount;
        const display = document.getElementById('success-count-display');
        if (display) display.textContent = successCount;

        // Refresh the label if it has a placeholder
        const statusLabel = document.querySelector('[data-i18n="status_finished"]');
        if (statusLabel) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            let text = dict['status_finished'] || 'Campaign Status: {count} sent';
            
            const parts = text.split('{count}');
            const prefixText = parts[0] ? parts[0].trim() : 'Campaign Status:';
            const suffixText = parts[1] ? parts[1].trim() : 'sent';
            
            statusLabel.textContent = prefixText;
            
            const suffixLabel = document.querySelector('.status-suffix');
            if (suffixLabel) {
                suffixLabel.textContent = suffixText;
            }
        }
    }
    
    if (data.remainingCount !== undefined) {
        remainingTargets = data.remainingCount;
        
        // Update Remaining count display
        const remainingDisplay = document.getElementById('remaining-count-display');
        if (remainingDisplay) remainingDisplay.textContent = totalTargets - completedCount;

        const progress = totalTargets > 0 ? Math.round((completedCount / totalTargets) * 100) : 0;
        updateProgress(progress);
        
        refreshStatusDetailUI();

        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) {
            const lang = document.getElementById('language-select')?.value || 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            const remainingLabel = dict.remaining_suffix || 'remaining';
            countDisplay.textContent = `${remainingTargets} (${remainingLabel}) / ${totalTargets} URLs`;
        }
    }
}

/**
 * [v2.5.5] Unified UI Refresh for 3-line monitor format:
 * [Last Log Message]: [Remaining Count] remaining.
 */
function refreshStatusDetailUI() {
    const statusDetail = document.getElementById('status-detail');
    if (!statusDetail) return;

    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    const suffix = dict.remaining_suffix || 'remaining.';
    
    // [v2.8.9] Simplified UI: Only show remaining count, remove log noise
    const statusText = campaignPaused ? `⏸️ PAUSED (${remainingTargets} ${suffix})` : `${remainingTargets} ${suffix}`;
    statusDetail.textContent = statusText;
    statusDetail.style.fontWeight = '700';
    statusDetail.style.fontSize = '0.85rem'; // Smaller font as requested
    statusDetail.style.color = campaignPaused ? '#ff3366' : '#facc15'; 
}

function updateSpeedLabels() {
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
    
    // 1. 수집 속도 매핑 라벨
    const collectSlider = document.getElementById('delay-input-collect');
    const collectDisplay = document.getElementById('speed-collect-display');
    if (collectSlider && collectDisplay) {
        const level = collectSlider.value;
        const msArr = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
        const sec = (msArr[parseInt(level)] || 10000) / 1000;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        collectDisplay.innerHTML = label;
        
        // 레거시 연동용으로 hidden delay-input의 value도 대변 업데이트
        const legacyInput = document.getElementById('delay-input');
        if (legacyInput) legacyInput.value = level;
    }

    // 2. 자동 입력 속도 매핑 라벨
    const fillSlider = document.getElementById('delay-input-fill');
    const fillDisplay = document.getElementById('speed-fill-display');
    if (fillSlider && fillDisplay) {
        const level = fillSlider.value;
        const msArr = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
        const ms = msArr[parseInt(level)] || 300;
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${ms}ms)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        fillDisplay.innerHTML = label;
    }

    // 3. 등록 속도 매핑 라벨
    const submitSlider = document.getElementById('delay-input-submit');
    const submitDisplay = document.getElementById('speed-submit-display');
    if (submitSlider && submitDisplay) {
        const level = submitSlider.value;
        const msArr = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
        const sec = ((msArr[parseInt(level)] || 1500) / 1000).toFixed(1);
        let label = `${dict.speed_level || 'Level'} ${level} <small>(${sec}s)</small>`;
        if (level === '6') label += ` <small>${dict.speed_normal || '(Normal)'}</small>`;
        submitDisplay.innerHTML = label;
    }
}

function updateSpeedLabel() {
    updateSpeedLabels();
}

function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(`${btn.dataset.tab}-tab`);
            if (target) target.classList.add('active');
            
            // [v2.3.0] Hide status/log areas when in Template or History Tab
            if (btn.dataset.tab === 'template' || btn.dataset.tab === 'history') {
                document.body.classList.add('template-active');
            } else {
                document.body.classList.remove('template-active');
            }

            if (btn.dataset.tab === 'history') {
                renderLedgerUI();
            }
        });
    });

    // File Upload
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileUpload);

    // Campaign Buttons
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', startCampaign);
    
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
    
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) stopBtn.addEventListener('click', stopCampaign);

    // Settings
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) settingsToggle.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.remove('hidden');
    });
    
    const settingsClose = document.getElementById('settings-close');
    if (settingsClose) settingsClose.addEventListener('click', () => {
        document.getElementById('settings-overlay').classList.add('hidden');
    });
    
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    // [WitKey-Sync v2] #audio-stt-key 실시간 입력 → debounce 후 즉시 스토리지 동기화
    // Crawler의 onChanged 리스너가 감지하여 Crawler UI도 자동 업데이트됨
    (function bindSttKeyRealTimeSync() {
        let _sttDebounceTimer = null;
        const sttKeyEl = document.getElementById('audio-stt-key');
        if (!sttKeyEl) return;
        sttKeyEl.addEventListener('input', () => {
            clearTimeout(_sttDebounceTimer);
            _sttDebounceTimer = setTimeout(() => {
                const key = sttKeyEl.value.trim();
                chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key }, () => {
                    console.log(`[WitKey-Sync v2] Sender 실시간 입력 동기화: ${key ? key.substring(0, 8) + '...' : 'NONE'}`);
                });
            }, 600); // 600ms 타이핑 중지 후 저장
        });
    })();

    // [v18.46.0] Wit.ai STT Key Setup Modal Save Button
    const saveSetupSttBtn = document.getElementById('save-setup-stt-btn');
    if (saveSetupSttBtn) {
        saveSetupSttBtn.addEventListener('click', async () => {
            const input = document.getElementById('setup-stt-key-input');
            const key = input ? input.value.trim() : '';
            if (key === '') {
                alert("Please enter a valid Wit.ai Key.");
                return;
            }
            
            // [WitKey-Sync v2] 3개 키 모두 저장하여 Crawler와 실시간 동기화
            await chrome.storage.local.set({ xpider_stt_api_key: key, audioSttKey: key, witKey: key });
            const settingsInput = document.getElementById('audio-stt-key');
            if (settingsInput) settingsInput.value = key;
            
            // [WitKey-Sync] 전역 IPC 키 동기화 호출
            try {
                await xpiderInvoke('xpider-ext-sync-wit-key', { key });
                console.log("[WitKey-Sync] Sender setup modal: Key successfully synced to global bridge");
            } catch (err) {
                console.error("[WitKey-Sync] Sender setup modal sync failed:", err);
            }
            
            const setupModal = document.getElementById('stt-setup-modal-overlay');
            if (setupModal) setupModal.classList.add('hidden');
            
            const langSelect = document.getElementById('language-select');
            const lang = langSelect ? langSelect.value : 'en';
            const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
            alert(dict.msg_saved || "Saved!");
        });
    }

    // [v19.1.0] Wit.ai Link - Electron 환경에서 시스템 기본 브라우저로 외부 링크 열기
    // chrome.tabs.create는 내부 webview에서 URL을 열어 작동하지 않음
    // shell.openExternal IPC 경로를 사용하여 시스템 브라우저에서 안정적으로 열기
    const witAiLink = document.getElementById('wit-ai-link');
    if (witAiLink) {
        witAiLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = witAiLink.href || 'https://wit.ai';
            // 1순위: Electron IPC 직접 호출 (open-wit-external-link → main.js shell.openExternal)
            try {
                window.postMessage({ type: 'XPIDER_SEND', channel: 'open-wit-external-link', data: url }, '*');
            } catch (err1) {
                console.warn('[Wit.ai Link] XPIDER_SEND failed, trying fallbacks:', err1);
            }
            // 2순위: window.open (setWindowOpenHandler가 wit.ai를 shell.openExternal로 처리)
            try {
                window.open(url, '_blank');
            } catch (err2) {
                console.warn('[Wit.ai Link] window.open failed:', err2);
            }
        });
    }
    // [v19.1.0] 모든 premium-link 클래스의 외부 링크도 동일한 방식으로 처리
    document.querySelectorAll('a.premium-link, a[target="_blank"]').forEach(link => {
        if (link.id === 'wit-ai-link') return; // 이미 위에서 처리
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = link.href;
            if (!url || url === '#') return;
            try {
                window.postMessage({ type: 'XPIDER_SEND', channel: 'auth-open-external', data: url }, '*');
            } catch (err) {}
            try { window.open(url, '_blank'); } catch (err) {}
        });
    });

    // [v2.4.0] Template Save Buttons - Combined
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', saveTemplateChanges);
    });
    
    // [v2.2.0] Drop area styled as button label
    const dropArea = document.getElementById('drop-area');
    if (dropArea) {
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
        dropArea.addEventListener('dragleave', () => { dropArea.classList.remove('drag-active'); });
        dropArea.addEventListener('drop', handleFileUpload);
    }
    
    const loadFileBtn = document.getElementById('load-tpl-file-btn');
    const tplFileInput = document.getElementById('tpl-file-input');
    if (loadFileBtn && tplFileInput) {
        loadFileBtn.addEventListener('click', () => tplFileInput.click());
        tplFileInput.addEventListener('change', importMessageFromFile);
    }
    
    const closeAppBtn = document.getElementById('close-app-btn');
    if (closeAppBtn) closeAppBtn.addEventListener('click', () => window.close());

    // Captcha Logic Toggles
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    if (captchaToggle) {
        captchaToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            const methodGroup = document.getElementById('captcha-method-group');
            if (methodGroup) methodGroup.style.display = enabled ? 'block' : 'none';
            toggleCaptchaApiVisibility();
        });
    }

    const methodSelect = document.getElementById('captcha-method-select');
    if (methodSelect) {
        methodSelect.addEventListener('change', () => {
            toggleCaptchaApiVisibility();
            const langSelect = document.getElementById('language-select');
            if (langSelect) applyTranslations(langSelect.value);
        });
    }

    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            applyTranslations(e.target.value);
        });
    }

    // Persistence for Template
    ['tpl-first-name', 'tpl-last-name', 'tpl-name', 'tpl-email', 'tpl-phone', 'tpl-subject', 'tpl-message'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', saveTemplate);
    });

    // Single URL & List Management
    // Single URL & List Management
    const addUrlBtn = document.getElementById('add-url-btn');
    if (addUrlBtn) {
        addUrlBtn.classList.add('plus-btn-circle');
        addUrlBtn.addEventListener('click', addSingleUrl);
    }
    
    const manualUrlInput = document.getElementById('manual-url-input');
    if (manualUrlInput) {
        manualUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addSingleUrl();
        });
    }

    // Clear List Button
    const clearListBtn = document.getElementById('clear-list-btn');
    if (clearListBtn) {
        clearListBtn.addEventListener('click', clearCampaignQueue);
    }

    // [Phase 2B] Template CRUD Action Toolbar
    const newTplBtn = document.getElementById('new-tpl-btn');
    if (newTplBtn) newTplBtn.addEventListener('click', () => handleCreateNewTemplate());

    const dupTplBtn = document.getElementById('dup-tpl-btn');
    if (dupTplBtn) dupTplBtn.addEventListener('click', () => handleDuplicateTemplate());

    const defTplBtn = document.getElementById('default-tpl-btn');
    if (defTplBtn) defTplBtn.addEventListener('click', () => handleSetDefaultTemplate());

    const delTplBtn = document.getElementById('del-tpl-btn');
    if (delTplBtn) {
        delTplBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this template?")) {
                handleDeleteTemplate().catch(e => alert(e.message));
            }
        });
    }

    const tplSelect = document.getElementById('tpl-library-select');
    if (tplSelect) tplSelect.addEventListener('change', loadTemplateFromLibrary);

    // [Phase 2B] History Ledger Action Toolbar & Filtering
    document.querySelectorAll('.ledger-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.ledger-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            ledgerState.filter = chip.dataset.filter || 'ALL';
            ledgerState.page = 1;
            renderLedgerUI();
        });
    });

    const ledgerSearchInput = document.getElementById('ledger-search-input');
    if (ledgerSearchInput) {
        let searchTimer = null;
        ledgerSearchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                ledgerState.search = ledgerSearchInput.value.trim();
                ledgerState.page = 1;
                renderLedgerUI();
            }, 300);
        });
    }

    const ledgerSelectAllCb = document.getElementById('ledger-select-all-cb');
    if (ledgerSelectAllCb) {
        ledgerSelectAllCb.addEventListener('change', () => {
            const cbs = document.querySelectorAll('.ledger-item-cb');
            cbs.forEach(cb => {
                cb.checked = ledgerSelectAllCb.checked;
                const tgt = cb.dataset.target;
                if (ledgerSelectAllCb.checked) ledgerState.selectedTargets.add(tgt);
                else ledgerState.selectedTargets.delete(tgt);
                cb.closest('.ledger-item-card')?.classList.toggle('is-selected', ledgerSelectAllCb.checked);
            });
            updateSelectionCountUI();
        });
    }

    const ledgerExportBtn = document.getElementById('ledger-export-csv-btn');
    if (ledgerExportBtn) ledgerExportBtn.addEventListener('click', () => triggerCsvExport());

    const ledgerResetSelBtn = document.getElementById('ledger-reset-selected-btn');
    if (ledgerResetSelBtn) {
        ledgerResetSelBtn.addEventListener('click', async () => {
            try {
                await dispatchSelectiveReset();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerRetryFailedBtn = document.getElementById('ledger-retry-failed-btn');
    if (ledgerRetryFailedBtn) {
        ledgerRetryFailedBtn.addEventListener('click', async () => {
            try {
                await dispatchRetryFailed();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerResetAllBtn = document.getElementById('ledger-reset-all-btn');
    const resetAllModal = document.getElementById('reset-all-modal-overlay');
    const cancelResetAllBtn = document.getElementById('cancel-reset-all-btn');
    const confirmResetAllBtn = document.getElementById('confirm-reset-all-btn');

    if (ledgerResetAllBtn && resetAllModal) {
        ledgerResetAllBtn.addEventListener('click', () => {
            if (campaignActive) {
                alert("Cannot reset suppression while campaign is actively running!");
                return;
            }
            resetAllModal.classList.remove('hidden');
        });
    }
    if (cancelResetAllBtn && resetAllModal) {
        cancelResetAllBtn.addEventListener('click', () => {
            resetAllModal.classList.add('hidden');
        });
    }
    if (confirmResetAllBtn && resetAllModal) {
        confirmResetAllBtn.addEventListener('click', async () => {
            resetAllModal.classList.add('hidden');
            try {
                await dispatchGlobalReset();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const ledgerPrevBtn = document.getElementById('ledger-prev-btn');
    if (ledgerPrevBtn) {
        ledgerPrevBtn.addEventListener('click', () => {
            if (ledgerState.page > 1) {
                ledgerState.page--;
                renderLedgerUI();
            }
        });
    }

    const ledgerNextBtn = document.getElementById('ledger-next-btn');
    if (ledgerNextBtn) {
        ledgerNextBtn.addEventListener('click', () => {
            ledgerState.page++;
            renderLedgerUI();
        });
    }

}

function toggleCaptchaApiVisibility() {
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    if (!captchaToggle || !methodSelect) return;

    const enabled = captchaToggle.checked;
    const method = methodSelect.value;
    
    const isApi = (method === 'api' || method === 'nopecha');
    const isAudio = (method === 'audio');
    
    const apiGroup = document.getElementById('captcha-api-group');
    if (apiGroup) apiGroup.style.display = (enabled && isApi) ? 'block' : 'none';
    
    const sttGroup = document.getElementById('audio-stt-group');
    if (sttGroup) sttGroup.style.display = (enabled && isAudio) ? 'block' : 'none';
}

function renderUrlsPreview(urls) {
    const previewArea = document.getElementById('file-urls-preview');
    const previewList = document.getElementById('preview-list');
    if (!previewArea || !previewList) return;

    previewList.innerHTML = '';
    if (!urls || urls.length === 0) {
        previewArea.classList.add('hidden');
        return;
    }

    urls.forEach(url => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.textContent = url;
        div.title = url;
        previewList.appendChild(div);
    });

    previewArea.classList.remove('hidden');
}

async function handleFileUpload(e) {
    e.preventDefault();
    const file = e.target.files ? e.target.files[0] : e.dataTransfer.files[0];
    if (!file) return;

    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = file.name;
    
    const text = await file.text();
    const importId = `import_${Date.now()}`;
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    // [F7] Step 1: Parse source file into LOGICAL records BEFORE URL extraction.
    // CSV: use RFC-4180-aware parser to handle quoted fields with embedded commas/newlines.
    // TXT: use physical newline splitting (one record per line).
    let rawSourceRows;
    if (isCsv) {
        rawSourceRows = _parseRfc4180Records(text);
    } else {
        rawSourceRows = text.split(/\r?\n/);
    }

    // [F7] Step 2: Build per-row records preserving exact source structure
    // Guarantee 1:1 row-to-target linkage: exactly one primary target URL per source row
    const urlRegex = /(https?:\/\/[^\s,"]+)|((?:www\.)?[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:\/[^\s,"]*)?)/g;
    const rowsForLedger = rawSourceRows.map((rawRecord, idx) => {
        let matches = rawRecord.match(urlRegex) || [];
        matches = matches.map(u => {
            u = u.trim().replace(/[.,;)]+$/, '');
            if (u && !u.startsWith('http')) u = 'https://' + u;
            return u;
        }).filter(u => { try { new URL(u); return true; } catch(err) { return false; } });

        // Exactly one primary execution target per source row (guarantees 1:1 row-to-target traceability)
        const primaryTarget = matches.length > 0 ? matches[0] : null;

        return {
            sourceRowNumber: idx + 1,   // 1-indexed logical record number
            rawInput: rawRecord,        // exact original record content unchanged
            targetIdentity: primaryTarget // [F7] explicit 1:1 link to executed target
        };
    });

    // [F7] Step 3: Persist ALL source rows (AWAITED — fail-closed: reject import if ledger write fails)
    try {
        const importRes = await chrome.runtime.sendMessage({
            action: 'RECORD_IMPORT_ROWS',
            rows: rowsForLedger,
            importId
        });
        if (!importRes || !importRes.success) {
            throw new Error((importRes && importRes.error) || 'Ledger write rejected by background service worker');
        }
    } catch (err) {
        addLog(`❌ [F7] Import rejected: durable ledger write failed (${err.message}). Import aborted; no targets queued.`, 'error');
        if (nameDisplay) nameDisplay.textContent = 'Import failed (ledger error)';
        return;
    }

    // [F7] Step 4: Queue ONLY the linked targets from preserved rows (strictly 1:1 linked)
    const blacklist = window.XPIDER_BLACKLIST || [];
    const executionTargets = rowsForLedger
        .map(r => r.targetIdentity)
        .filter(Boolean)
        .filter(url => {
            const lowerUrl = url.toLowerCase();
            return !blacklist.some(domain => lowerUrl.includes(domain));
        });

    campaignQueue = [...new Set(executionTargets)];

    totalTargets = campaignQueue.length;
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = `${totalTargets} URLs found`;
    
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.remove('hidden');
    
    await saveListToStorage(file.name, campaignQueue);
    renderUrlsPreview(campaignQueue);
    chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_total: totalTargets, xpider_success: 0 });
    addLog(`Loaded ${totalTargets} business URLs from ${rawSourceRows.length} source record(s) (${isCsv ? 'CSV logical records' : 'TXT lines'}).`, 'info');
}

/**
 * [F7] RFC-4180 CSV logical-record parser.
 * Handles: quoted fields, embedded commas, embedded CRLF/LF within quoted fields.
 * Preserves the EXACT original source substring for audit integrity (no unescaping).
 */
function _parseRfc4180Records(text) {
    const records = [];
    let recordStart = 0;
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                i += 2; // skip escaped quote pair without modifying raw slice
                continue;
            }
            inQuotes = !inQuotes;
            i++;
        } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
            const end = i;
            if (ch === '\r' && text[i + 1] === '\n') i++;
            records.push(text.slice(recordStart, end));
            i++;
            recordStart = i;
        } else {
            i++;
        }
    }
    if (recordStart < text.length || records.length === 0) {
        records.push(text.slice(recordStart));
    }
    return records;
}

if (typeof window !== 'undefined') {
    window._parseRfc4180Records = _parseRfc4180Records;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports._parseRfc4180Records = _parseRfc4180Records;
}

async function saveListToStorage(name, urls) {
    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    let lists = data.xpider_saved_lists || [];
    
    // Check for duplicates and update or append
    const existingIdx = lists.findIndex(l => l.name === name);
    if (existingIdx > -1) {
        lists[existingIdx] = { name, urls, date: new Date().toISOString() };
    } else {
        lists.push({ name, urls, date: new Date().toISOString() });
    }
    
    await chrome.storage.local.set({ xpider_saved_lists: lists });
    await updateSavedListsUI();
}

async function updateSavedListsUI() {
    const listContainer = document.getElementById('saved-lists-container');
    if (!listContainer) return;

    const data = await chrome.storage.local.get(['xpider_saved_lists']);
    const savedLists = data.xpider_saved_lists || [];

    listContainer.innerHTML = '';
    
    if (savedLists.length === 0) {
        listContainer.innerHTML = '<div class="empty-list-note">No lists saved.</div>';
        return;
    }

    savedLists.forEach((list, index) => {
        const div = document.createElement('div');
        div.className = 'list-item-unified';
        div.innerHTML = `
            <span class="list-item-name">${list.name} (${list.urls.length})</span>
            <button class="list-item-delete" title="Delete">&times;</button>
        `;

        div.onclick = async () => {
            // Select this list
            campaignQueue = [...list.urls];
            totalTargets = campaignQueue.length;
            successCount = 0;
            
            document.querySelectorAll('.list-item-unified').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) countDisplay.textContent = `${campaignQueue.length} URLs found`;
            document.getElementById('file-info').classList.remove('hidden');
            document.getElementById('status-box').classList.remove('hidden');

            // Show URLs Preview in UI
            renderUrlsPreview(campaignQueue);
            
            addLog(`Loaded saved list: ${list.name} (${list.urls.length} URLs)`, 'info');
            await chrome.storage.local.set({ xpider_queue: campaignQueue, xpider_success: 0, xpider_total: totalTargets });
        };

        const delBtn = div.querySelector('.list-item-delete');
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Delete list "${list.name}"?`)) {
                savedLists.splice(index, 1);
                await chrome.storage.local.set({ xpider_saved_lists: savedLists });
                updateSavedListsUI();
                addLog(`Deleted list: ${list.name}`, 'warning');
            }
        };

        listContainer.appendChild(div);
    });
}

/**
 * [v19.0] Save template via native OS Save-As dialog (path + filename choosable)
 */
async function saveTemplateChanges() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name').value.trim(),
        lastName:  document.getElementById('tpl-last-name').value.trim(),
        name:      document.getElementById('tpl-name').value.trim(),
        email:     document.getElementById('tpl-email').value.trim(),
        phone:     document.getElementById('tpl-phone').value.trim(),
        subject:   document.getElementById('tpl-subject').value.trim(),
        message:   document.getElementById('tpl-message').value.trim()
    };

    if (!tpl.message && !tpl.subject) return alert('Please enter at least a Subject or Message.');

    const safeName = (tpl.subject || tpl.name || 'XPIDER_Template').replace(/[<>:"/\\|?*]/g, '_');
    const defaultName = `${safeName}_template.txt`;
    const content = buildTemplateFileContent(tpl);

    addLog('📁 Opening Save As dialog...', 'info');
    const result = await xpiderInvoke('xpider-show-save-dialog', { defaultName, content });

    if (!result || !result.success) {
        if (result && result.reason !== 'cancelled') addLog(`❌ Save failed: ${result.reason}`, 'error');
        return;
    }

    // [F9] Save to templates_v2 as authoritative store
    const tplId = `tpl_${Date.now()}`;
    const fullName = tpl.name || `${tpl.firstName} ${tpl.lastName}`.trim();
    const v2Item = {
        ...tpl,
        id: tplId,
        fullName: fullName,
        fileName: result.fileName,
        filePath: result.filePath,
        sender: {
            fullName: fullName,
            firstName: tpl.firstName,
            lastName: tpl.lastName,
            company: '',
            email: tpl.email,
            phone: tpl.phone,
            website: ''
        },
        content: {
            subject: tpl.subject,
            message: tpl.message
        },
        updatedAt: Date.now()
    };
    const v2Data = await chrome.storage.local.get(['templates_v2']);
    const v2Store = v2Data.templates_v2 || { version: 2, templates: {}, defaultId: null, recentIds: [] };
    v2Store.templates[tplId] = v2Item;
    if (!v2Store.defaultId) v2Store.defaultId = tplId;
    v2Store.recentIds = [tplId, ...(v2Store.recentIds || []).filter(id => id !== tplId)].slice(0, 6);
    // Dual-write: legacy xpider_recent_templates for compatibility
    const legacyItem = { ...tpl, fileName: result.fileName, filePath: result.filePath, timestamp: new Date().toISOString() };
    const legacyData = await chrome.storage.local.get(['xpider_recent_templates']);
    let recent = (legacyData.xpider_recent_templates || []).filter(t => t.filePath !== result.filePath);
    recent.unshift(legacyItem);
    if (recent.length > 6) recent = recent.slice(0, 6);
    await chrome.storage.local.set({ templates_v2: v2Store, xpider_recent_templates: recent, xpider_tpl: tpl });

    await updateTemplateDropdown();

    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { const t = btn.textContent; btn.textContent = '✅ Saved!'; setTimeout(() => btn.textContent = t, 1800); }
    });
    addLog(`✅ Template saved: ${result.fileName}`, 'success');
}

function buildTemplateFileContent(tpl) {
    return `[XPIDER MESSAGE TEMPLATE]
-----------------------------------------
Full Name:  ${tpl.name || 'N/A'}
First Name: ${tpl.firstName || 'N/A'}
Last Name:  ${tpl.lastName || 'N/A'}
Email:      ${tpl.email || 'N/A'}
Phone:      ${tpl.phone || 'N/A'}
Subject:    ${tpl.subject || 'N/A'}

[MESSAGE BODY]
-----------------------------------------
${tpl.message || ''}
-----------------------------------------
Generated by XPIDER AutoForm Sender Pro
Saved: ${new Date().toLocaleString()}
`;
}

async function addSingleUrl() {
    const input = document.getElementById('manual-url-input');
    if (!input || !input.value.trim()) return;
    
    let url = input.value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
        new URL(url); // Validation
        
        // [v1.3.5] Apply Blacklist to manual entries as well
        const lowerUrl = url.toLowerCase();
        const blacklist = window.XPIDER_BLACKLIST || [];
        if (blacklist.some(domain => lowerUrl.includes(domain))) {
            addLog(`⚠️ Blacklisted domain: ${url}`, 'warning');
            input.value = '';
            return;
        }
        
        // Add to ACTIVE queue
        if (!campaignQueue.includes(url)) {
            campaignQueue.push(url);
            totalTargets = campaignQueue.length;
            const countDisplay = document.getElementById('url-count-display');
            if (countDisplay) {
                const lang = document.getElementById('language-select')?.value || 'en';
                const dict = i18nData ? (i18nData[lang] || i18nData['en'] || {}) : {};
                const suffix = dict.remaining_suffix || 'URLs';
                countDisplay.textContent = `${totalTargets} ${suffix}`;
            }
            const fileInfo = document.getElementById('file-info');
            if (fileInfo) fileInfo.classList.remove('hidden');

            // Show URLs Preview in UI for manually added items as well
            renderUrlsPreview(campaignQueue);
            
            // Sync active queue to storage so background can access if needed
            chrome.storage.local.set({ 
                xpider_queue: campaignQueue,
                xpider_total: totalTargets
            });
        }
        
        // [v1.2.1] NEW: Save to Permanent "Manual Entries" List
        const lang = document.getElementById('language-select')?.value || 'en';
        const dict = (i18nData && i18nData[lang]) ? i18nData[lang] : (i18nData ? i18nData['en'] : {});
        const manualListName = dict.list_manual_entries || 'Manual Entries';
        
        const storageData = await chrome.storage.local.get(['xpider_saved_lists']);
        let lists = Array.isArray(storageData.xpider_saved_lists) ? storageData.xpider_saved_lists : [];
        
        let manualList = lists.find(l => l.name === manualListName);
        if (!manualList) {
            manualList = { name: manualListName, urls: [], date: new Date().toISOString() };
            lists.unshift(manualList); // Put at top
        }
        
        // Avoid duplicate in the manual list
        if (!manualList.urls.includes(url)) {
            manualList.urls.push(url);
            manualList.date = new Date().toISOString();
        }
        
        await chrome.storage.local.set({ xpider_saved_lists: lists });
        if (typeof updateSavedListsUI === 'function') {
            await updateSavedListsUI();
        }
        
        addLog(`Manual URL saved: ${url}`, 'info');
        input.value = '';
    } catch (e) {
        console.error("[AddSingleUrl Error]", e);
        addLog(`❌ URL Add Error: ${e.message} (${url})`, 'error');
    }
}

async function startCampaign() {
    const manualInput = document.getElementById('manual-url-input');
    if (manualInput && manualInput.value.trim() && campaignQueue.length === 0) {
        await addSingleUrl();
    }

    if (campaignQueue.length === 0) return alert("Please upload a file or enter a URL first.");

    currentTpl = {
        firstName: document.getElementById('tpl-first-name').value,
        lastName: document.getElementById('tpl-last-name').value,
        name: document.getElementById('tpl-name').value,
        email: document.getElementById('tpl-email').value,
        phone: document.getElementById('tpl-phone').value,
        subject: document.getElementById('tpl-subject').value,
        message: document.getElementById('tpl-message').value
    };

    if (!currentTpl.message) return alert("Please enter a message body.");

    campaignActive = true;
    campaignPaused = false;
    successCount = 0;
    updateRealTimeStatus({ successCount: 0, remainingCount: campaignQueue.length });
    updateProgress(0);

    setTimeout(() => {
        document.getElementById('status-box').classList.remove('hidden');
        document.getElementById('multi-actions').classList.remove('hidden');
        document.getElementById('start-btn').classList.add('hidden');
    }, 100);

    const statusBox = document.getElementById('status-box');
    if (statusBox) statusBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    
    const levelCollect = parseInt(delayCollectInput ? delayCollectInput.value : 6);
    const levelFill = parseInt(delayFillInput ? delayFillInput.value : 6);
    const levelSubmit = parseInt(delaySubmitInput ? delaySubmitInput.value : 6);
    
    const levelToCollectMs = [60000, 45000, 30000, 25000, 20000, 15000, 10000, 7000, 5000, 3000];
    const levelToFillMs = [2000, 1500, 1000, 800, 500, 400, 300, 200, 150, 100];
    const levelToSubmitMs = [5000, 4000, 3000, 2500, 2000, 1800, 1500, 1000, 700, 500];
    
    const delayMs = levelToCollectMs[levelCollect] || 10000;
    const fillDelayMs = levelToFillMs[levelFill] || 300;
    const submitDelayMs = levelToSubmitMs[levelSubmit] || 1500;

    // [v4.15.0] 폼 자동 입력 방식 획득 및 동기화 저장
    const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
    const fillMode = fillModeEl ? fillModeEl.value : 'instant';
    chrome.storage.local.set({ xpider_fill_mode: fillMode });

    // [v19.0] Use XPIDER_INVOKE bridge directly to main process (bypasses background.js)
    addLog("[System] Sending to Native Engine...", "debug");
    xpiderInvoke('xpider-campaign-start', {
        queue: campaignQueue,
        template: currentTpl,
        delayMs,
        fillDelayMs,
        submitDelayMs,
        fillMode
    }).then(response => {
        if (response && response.success) {
            addLog("✅ [Native Engine] Campaign started!", "success");
        } else {
            addLog(`❌ [Native Engine] Start failed`, "error");
        }
    }).catch(e => {
        addLog(`❌ [Fatal Error] ${e.message}`, "error");
    });
}

function togglePause() {
    campaignPaused = !campaignPaused;
    const btn = document.getElementById('pause-btn');
    const lang = document.getElementById('language-select')?.value || 'en';
    const dict = i18nData[lang] || i18nData['en'] || {};

    const action = campaignPaused ? 'xpider-campaign-pause' : 'xpider-campaign-resume';
    xpiderInvoke(action, {}).catch(e => console.error('[Pause Error]', e));

    // [v4.12.23] chrome.runtime.sendMessage를 통해 익스텐션 백그라운드 상태도 동기화
    const extAction = campaignPaused ? 'PAUSE_CAMPAIGN' : 'RESUME_CAMPAIGN';
    chrome.runtime.sendMessage({ action: extAction }).catch(e => console.error('[Pause Ext Error]', e));

    if (btn) {
        btn.textContent = campaignPaused ? (dict.btn_resume || "▶️ Resume") : (dict.btn_pause || "⏸️ Pause");
        btn.style.backgroundColor = campaignPaused ? "#22c55e" : "#f59e0b";
    }
    refreshStatusDetailUI();
}

function stopCampaign() {
    campaignActive = false;
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('multi-actions').classList.add('hidden');
    xpiderInvoke('xpider-campaign-stop', {}).catch(e => console.error('[Stop Error]', e));
    addLog("Campaign stopped by user.", "stop");
}

// processNext in popup is now obsolete as background handles routing
// But we keep it as a fallback or for UI-only updates if needed
async function processNext() {
    console.log("processNext called in popup (Ignored - background handling it)");
}

// [v18.21.5] Pulse Check: Monitor background engine health in real-time
function startPulseCheck() {
    setInterval(() => {
        chrome.runtime.sendMessage({ action: 'PING' }, (response) => {
            const indicator = document.getElementById('engine-status-indicator');
            if (!indicator) return;

            if (chrome.runtime.lastError || !response || !response.success) {
                indicator.textContent = "⚠️ Engine Disconnected";
                indicator.style.color = "#ef4444";
            } else {
                indicator.textContent = "✅ Engine Alive";
                indicator.style.color = "#22c55e";
            }
        });
    }, 2000);
}

function finishCampaign() {
    campaignActive = false;
    addLog("Campaign finished!", "complete");
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.classList.remove('hidden');
    
    const multiActions = document.getElementById('multi-actions');
    if (multiActions) multiActions.classList.add('hidden');
    
    chrome.storage.local.remove(['xpider_queue', 'xpider_success', 'xpider_total']);
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
    
    const text = document.getElementById('progress-text');
    if (text) {
        text.textContent = `${percent}%`;
        text.style.fontSize = '0.9rem'; // Smaller font as requested
    }
}

let localLogQueue = [];
let localLogSaveTimer = null;

function saveBlackBoxLog(message, type, timestamp) {
    localLogQueue.push({ message, type, timestamp });
    if (localLogQueue.length > 150) localLogQueue.shift();

    const isCritical = ['start', 'stop', 'complete', 'error', 'success'].includes(type);

    const saveBatch = () => {
        try {
            chrome.storage.local.get(['xpider_blackbox_logs'], (data) => {
                const logs = data.xpider_blackbox_logs || [];
                const combined = [...logs, ...localLogQueue].slice(-300); // Max 300 logs
                chrome.storage.local.set({ xpider_blackbox_logs: combined });
                localLogQueue = [];
            });
        } catch (e) {
            console.error('[BlackBox Save Error]', e);
        }
    };

    if (isCritical) {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        saveBatch();
    } else {
        if (localLogSaveTimer) clearTimeout(localLogSaveTimer);
        localLogSaveTimer = setTimeout(saveBatch, 1500);
    }
}

function addLog(msg, type = 'info', forcedTime = null) {
    const container = document.getElementById('log-container');
    if (!container) return;

    // [v2.5.5] Update real-time status summary
    const techKeywords = ['Precision targeting', 'Pre-scan', 'Sniper Mode', 'Target lost', 'Processing:', 'Opening target'];
    const isTechLog = techKeywords.some(k => msg.includes(k)) && !msg.includes('Skipping') && !msg.includes('error');
    
    if (!isTechLog) {
        lastLogMessage = msg.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
        refreshStatusDetailUI();
    }

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const time = forcedTime || new Date().toLocaleTimeString('ko-KR', { hour12: false });
    
    // [v1.3.8] Premium Color Set for High Visibility
    let color = '#ccc';
    if (type === 'success') color = '#22c55e'; // Bright Green
    if (type === 'error') color = '#ef4444';   // Bright Red
    if (type === 'start') color = '#facc15';   // XSpider Yellow
    if (type === 'visit') color = '#ffffff';   // Pure White for "Processing:"
    if (type === 'info') color = '#60a5fa';    // Soft Blue
    if (type === 'mapping') color = '#a855f7'; // Purple for mapping steps
    if (type === 'debug') color = '#52525b';   // Darker gray for debug/tech logs

    logEntry.style.color = color;
    logEntry.style.fontWeight = (type === 'visit' || type === 'success') ? 'bold' : 'normal';
    logEntry.style.marginBottom = '2px';
    logEntry.style.fontSize = type === 'debug' ? '0.75rem' : '0.85rem';
    logEntry.innerHTML = `<span class="log-time" style="color: #666; font-size: 0.7rem;">[${time}]</span> ${msg}`;
    
    container.appendChild(logEntry);
    container.scrollTop = container.scrollHeight;

    // Persist real-time logs to chrome storage blackbox
    if (!forcedTime) {
        saveBlackBoxLog(msg, type, time);
    }
}

async function saveTemplate() {
    const tpl = {
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName:  document.getElementById('tpl-last-name')?.value || '',
        name:      document.getElementById('tpl-name')?.value || '',
        email:     document.getElementById('tpl-email')?.value || '',
        phone:     document.getElementById('tpl-phone')?.value || '',
        subject:   document.getElementById('tpl-subject')?.value || '',
        message:   document.getElementById('tpl-message')?.value || ''
    };
    // [F9 Unified Schema] Canonical FormTemplateV2 record with both flat and nested properties
    const fullName = tpl.name || `${tpl.firstName} ${tpl.lastName}`.trim();
    const canonicalTpl = {
        ...tpl,
        fullName: fullName,
        sender: {
            fullName: fullName,
            firstName: tpl.firstName,
            lastName: tpl.lastName,
            company: '',
            email: tpl.email,
            phone: tpl.phone,
            website: ''
        },
        content: {
            subject: tpl.subject,
            message: tpl.message
        },
        updatedAt: Date.now()
    };
    // [F9] templates_v2 is the primary authoritative store — await its completion; propagate errors
    await _syncTemplateToV2(canonicalTpl);
    // Legacy compatibility update ONLY after authoritative v2 write succeeds
    await chrome.storage.local.set({ xpider_tpl: tpl });
    return canonicalTpl;
}

// [F9] Sync a template object into templates_v2 default slot (propagates persistence errors)
async function _syncTemplateToV2(tpl) {
    const data = await chrome.storage.local.get(['templates_v2']);
    const store = data.templates_v2 || { version: 2, templates: {}, defaultId: null, recentIds: [] };
    const id = store.defaultId || 'default';
    const fullName = tpl.name || tpl.fullName || `${tpl.firstName || ''} ${tpl.lastName || ''}`.trim();
    const updatedTpl = {
        ...tpl,
        id,
        fullName,
        sender: tpl.sender || {
            fullName,
            firstName: tpl.firstName || '',
            lastName: tpl.lastName || '',
            company: tpl.company || '',
            email: tpl.email || '',
            phone: tpl.phone || '',
            website: tpl.website || ''
        },
        content: tpl.content || {
            subject: tpl.subject || '',
            message: tpl.message || ''
        },
        updatedAt: Date.now()
    };
    store.templates[id] = updatedTpl;
    store.defaultId = id;
    if (!store.recentIds) store.recentIds = [];
    if (!store.recentIds.includes(id)) store.recentIds.unshift(id);
    await chrome.storage.local.set({ templates_v2: store });
    return updatedTpl;
}

// [v18.10.0] Diagnostic Recovery: Load persistent logs from storage
async function loadBlackBoxLogs() {
    const data = await chrome.storage.local.get(['xpider_blackbox_logs']);
    const logs = data.xpider_blackbox_logs || [];
    
    const container = document.getElementById('log-container');
    if (!container || logs.length === 0) return;

    // Clear and re-populate to avoid duplicate confusion on refresh
    container.innerHTML = '';
    
    logs.forEach(log => {
        addLog(log.message, log.type, log.timestamp || "Past");
    });
    
    addLog("--- Persistent Session Restored ---", "info");
}

// [v1.7.0] Advanced Template Library Logic
async function saveTemplateToLibrary() {
    await saveTemplateChanges();
}

// =========================================================================
// Phase 2B: Module Store Adapters & Controller Methods
// =========================================================================

let _templateStoreInstance = null;
let _historyStoreInstance = null;

function getPopupTemplateStore() {
    if (!_templateStoreInstance) {
        const TS = (typeof TemplateStore !== 'undefined') ? TemplateStore : (typeof require !== 'undefined' ? require('./modules/template-store.js').TemplateStore : null);
        if (TS) {
            _templateStoreInstance = new TS(typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
        }
    }
    return _templateStoreInstance;
}

function getPopupHistoryStore() {
    if (!_historyStoreInstance) {
        const HS = (typeof HistoryStore !== 'undefined') ? HistoryStore : (typeof require !== 'undefined' ? require('./modules/history-store.js').HistoryStore : null);
        if (HS) {
            _historyStoreInstance = new HS(typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null);
        }
    }
    return _historyStoreInstance;
}

// Ledger State
let ledgerState = {
    filter: 'ALL',
    search: '',
    page: 1,
    limit: 50,
    selectedTargets: new Set()
};

/**
 * Phase 2B (Component A): Create a new blank template and persist to TemplateStore
 */
async function handleCreateNewTemplate(initialName = 'New Template') {
    const tStore = getPopupTemplateStore();
    const newTplData = {
        name: initialName,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        subject: initialName,
        message: ''
    };
    let saved;
    if (tStore) {
        saved = await tStore.saveTemplateRecord(newTplData);
    } else {
        saved = await saveTemplate();
    }
    populateFormFromTemplate(saved);
    await updateTemplateDropdown(saved.id);
    addLog(`➕ Created new template: ${saved.subject || saved.name}`, 'success');
    return saved;
}

/**
 * Phase 2B (Component A): Authoritatively save current form fields into the active template
 */
async function handleSaveTemplate(tplData = null) {
    const select = document.getElementById('tpl-library-select');
    const activeId = (select && select.value && select.value !== 'default') ? select.value : null;

    const data = tplData || {
        id: activeId || undefined,
        firstName: document.getElementById('tpl-first-name')?.value || '',
        lastName: document.getElementById('tpl-last-name')?.value || '',
        name: document.getElementById('tpl-name')?.value || '',
        email: document.getElementById('tpl-email')?.value || '',
        phone: document.getElementById('tpl-phone')?.value || '',
        subject: document.getElementById('tpl-subject')?.value || '',
        message: document.getElementById('tpl-message')?.value || ''
    };

    const tStore = getPopupTemplateStore();
    let saved;
    if (tStore) {
        saved = await tStore.saveTemplateRecord(data);
    } else {
        saved = await saveTemplate();
    }

    await updateTemplateDropdown(saved.id);
    ['save-tpl-btn', 'save-tpl-changes-btn', 'save-tpl-bottom-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ Saved!';
            setTimeout(() => { btn.textContent = originalText; }, 1800);
        }
    });
    addLog(`💾 Template saved: ${saved.subject || saved.name}`, 'success');
    return saved;
}

/**
 * Phase 2B (Component A): Duplicate the selected template with [Copy] suffix
 */
async function handleDuplicateTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToClone = templateId || (select && select.value) || null;
    if (!idToClone) throw new Error("No template selected to duplicate");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const duplicated = await tStore.duplicateAndSaveTemplate(idToClone);
    populateFormFromTemplate(duplicated);
    await updateTemplateDropdown(duplicated.id);
    addLog(`📋 Duplicated template: ${duplicated.subject || duplicated.name}`, 'success');
    return duplicated;
}

/**
 * Phase 2B (Component A): Delete the selected non-default template
 */
async function handleDeleteTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToDelete = templateId || (select && select.value) || null;
    if (!idToDelete) throw new Error("No template selected to delete");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const result = await tStore.deleteTemplate(idToDelete);
    await updateTemplateDropdown(result.defaultId);
    if (result.defaultId) {
        const nextDefault = await tStore.getTemplate(result.defaultId);
        if (nextDefault) populateFormFromTemplate(nextDefault);
    }
    addLog(`🗑️ Deleted template: ${idToDelete}`, 'info');
    return result;
}

/**
 * Phase 2B (Component A): Set active template as defaultId and sync legacy xpider_tpl
 */
async function handleSetDefaultTemplate(templateId = null) {
    const select = document.getElementById('tpl-library-select');
    const idToDefault = templateId || (select && select.value) || null;
    if (!idToDefault) throw new Error("No template selected to set as default");

    const tStore = getPopupTemplateStore();
    if (!tStore) throw new Error("TemplateStore unavailable");

    const updated = await tStore.setDefaultTemplate(idToDefault);
    await updateTemplateDropdown(idToDefault);
    addLog(`⭐ Set default template: ${updated.subject || updated.name}`, 'success');
    return updated;
}

/**
 * Dual accessors: populate DOM form inputs from template object
 */
function populateFormFromTemplate(tpl) {
    if (!tpl) return null;
    const firstName = tpl.firstName || (tpl.sender && tpl.sender.firstName) || '';
    const lastName  = tpl.lastName  || (tpl.sender && tpl.sender.lastName)  || '';
    const name      = tpl.name      || tpl.fullName || (tpl.sender && (tpl.sender.fullName || tpl.sender.name)) || '';
    const email     = tpl.email     || (tpl.sender && tpl.sender.email)     || '';
    const phone     = tpl.phone     || (tpl.sender && tpl.sender.phone)     || '';
    const subject   = tpl.subject   || (tpl.content && tpl.content.subject) || '';
    const message   = tpl.message   || (tpl.content && tpl.content.message) || '';

    const elFn = document.getElementById('tpl-first-name'); if (elFn) elFn.value = firstName;
    const elLn = document.getElementById('tpl-last-name');  if (elLn) elLn.value = lastName;
    const elNm = document.getElementById('tpl-name');       if (elNm) elNm.value = name;
    const elEm = document.getElementById('tpl-email');      if (elEm) elEm.value = email;
    const elPh = document.getElementById('tpl-phone');      if (elPh) elPh.value = phone;
    const elSb = document.getElementById('tpl-subject');    if (elSb) elSb.value = subject;
    const elMs = document.getElementById('tpl-message');    if (elMs) elMs.value = message;

    return { firstName, lastName, name, email, phone, subject, message };
}

/**
 * [F9 & Phase 2B] Update template selector dropdown with full list of templates
 */
async function updateTemplateDropdown(selectId = null) {
    const select = document.getElementById('tpl-library-select');
    if (!select) return;

    const tStore = getPopupTemplateStore();
    let templates = [];
    let defaultId = null;

    if (tStore) {
        const all = await tStore.getAllTemplates();
        templates = all.templates;
        defaultId = all.defaultId;
    } else {
        const data = await chrome.storage.local.get(['templates_v2', 'xpider_recent_templates']);
        const v2Store = data.templates_v2;
        if (v2Store && v2Store.templates) {
            templates = Object.values(v2Store.templates);
            defaultId = v2Store.defaultId;
        } else {
            templates = (data.xpider_recent_templates || []).slice(0, 6);
        }
    }

    select.innerHTML = '';
    if (templates.length === 0) {
        const opt = document.createElement('option');
        opt.value = 'default';
        opt.textContent = 'Default Template';
        select.appendChild(opt);
        return;
    }

    const targetSelectId = selectId || defaultId || templates[0].id;

    templates.forEach((tpl, idx) => {
        const opt = document.createElement('option');
        const id = tpl.id || String(idx);
        opt.value = id;
        opt.dataset.tplId = id;
        opt.dataset.tplVersion = String(tpl.version || 1);
        const isDef = (id === defaultId);
        const label = tpl.subject || tpl.name || `Template ${idx + 1}`;
        opt.textContent = `${isDef ? '⭐ ' : ''}${label}${isDef ? ' (Default)' : ''}`;
        if (id === targetSelectId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

/**
 * [F9 & Phase 2B] Load selected template from dropdown into the form
 */
async function loadTemplateFromLibrary() {
    const select = document.getElementById('tpl-library-select');
    const selectedOpt = select?.options[select.selectedIndex];
    if (!selectedOpt || selectedOpt.disabled) return;

    const tplId = selectedOpt.dataset.tplId || selectedOpt.value;
    const tStore = getPopupTemplateStore();
    let tpl = null;

    if (tStore) {
        tpl = await tStore.getTemplate(tplId);
    } else {
        const data = await chrome.storage.local.get(['templates_v2', 'xpider_recent_templates']);
        if (tplId && data.templates_v2?.templates?.[tplId]) {
            tpl = data.templates_v2.templates[tplId];
        } else {
            const idx = parseInt(selectedOpt.value);
            tpl = (data.xpider_recent_templates || [])[idx] || null;
        }
    }

    if (tpl) {
        populateFormFromTemplate(tpl);
        addLog(`📂 Loaded template: ${tpl.subject || tpl.name || 'Template'}`, 'info');
    }
}

// =========================================================================
// Phase 2B (Component B & C): History Ledger, Filtering & Reset Controls
// =========================================================================

/**
 * Query ledger records with filtering, searching, and pagination
 */
async function filterHistoryRecords(options = {}) {
    const hs = getPopupHistoryStore();
    if (!hs) return { totalCount: 0, offset: 0, limit: 50, records: [] };
    await hs.load();
    const filter = options.status !== undefined ? options.status : ledgerState.filter;
    const search = options.search !== undefined ? options.search : ledgerState.search;
    const limit = options.limit !== undefined ? options.limit : ledgerState.limit;
    const offset = options.offset !== undefined ? options.offset : ((ledgerState.page - 1) * limit);

    return hs.getFilteredRecords({ status: filter, search, limit, offset });
}

/**
 * Render the History & Audit Ledger Dashboard in Popup
 */
async function renderLedgerUI() {
    const hs = getPopupHistoryStore();
    if (!hs) return;
    await hs.load();

    // Summary stats
    const allRecordsResult = hs.getFilteredRecords({ status: 'ALL', search: '', limit: 10000 });
    const allRecords = allRecordsResult.records;

    const totalCount = allRecords.length;
    const successCount = allRecords.filter(r => r.status === 'CONFIRMED_SUCCESS').length;
    const suppressedCount = allRecords.filter(r => r.isSuppressed).length;
    const unknownCount = allRecords.filter(r => r.status === 'DELIVERY_UNKNOWN').length;
    const failedCount = allRecords.filter(r => r.status === 'FAILURE').length;

    const elTot = document.getElementById('stat-ledger-total'); if (elTot) elTot.textContent = totalCount;
    const elSuc = document.getElementById('stat-ledger-success'); if (elSuc) elSuc.textContent = successCount;
    const elSup = document.getElementById('stat-ledger-suppressed'); if (elSup) elSup.textContent = suppressedCount;
    const elUnk = document.getElementById('stat-ledger-unknown'); if (elUnk) elUnk.textContent = unknownCount;
    const elFld = document.getElementById('stat-ledger-failed'); if (elFld) elFld.textContent = failedCount;

    // Filtered page
    const pageData = await filterHistoryRecords();
    const container = document.getElementById('ledger-list-container');
    if (!container) return;

    container.innerHTML = '';
    if (pageData.records.length === 0) {
        container.innerHTML = '<div class="ledger-empty-note">No ledger entries match the current filter.</div>';
    } else {
        pageData.records.forEach(rec => {
            const card = document.createElement('div');
            card.className = `ledger-item-card ${ledgerState.selectedTargets.has(rec.targetIdentity) ? 'is-selected' : ''}`;
            
            let badgeClass = 'status-ready';
            let badgeLabel = rec.status;
            if (rec.status === 'CONFIRMED_SUCCESS') {
                badgeClass = 'status-success';
                badgeLabel = 'SUCCESS';
            } else if (rec.isSuppressed) {
                badgeClass = 'status-suppressed';
                badgeLabel = 'SUPPRESSED';
            } else if (rec.status === 'DELIVERY_UNKNOWN') {
                badgeClass = 'status-unknown';
                badgeLabel = 'UNKNOWN';
            } else if (rec.status === 'FAILURE') {
                badgeClass = 'status-failed';
                badgeLabel = 'FAILED';
            } else if (rec.status === 'INVALID_INPUT') {
                badgeClass = 'status-invalid';
                badgeLabel = 'INVALID';
            }

            const timeStr = rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString() : '';
            const checked = ledgerState.selectedTargets.has(rec.targetIdentity) ? 'checked' : '';

            card.innerHTML = `
                <div class="ledger-item-top">
                    <div class="ledger-item-left">
                        <input type="checkbox" class="ledger-item-cb" data-target="${rec.targetIdentity || ''}" ${checked}>
                        <span class="ledger-item-domain" title="${rec.rawUrl || rec.targetIdentity}">${rec.targetIdentity || rec.rawUrl}</span>
                    </div>
                    <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="ledger-item-meta">
                    <span class="ledger-item-row-idx">Row #${rec.sourceRowId} · Gen ${rec.generationId || 1}</span>
                    <span class="ledger-item-reason" title="${rec.reasonCode}">${rec.reasonCode}</span>
                    <span>${timeStr}</span>
                </div>
            `;
            container.appendChild(card);
        });

        // Bind checkbox clicks
        container.querySelectorAll('.ledger-item-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const tgt = e.target.dataset.target;
                if (e.target.checked) {
                    ledgerState.selectedTargets.add(tgt);
                } else {
                    ledgerState.selectedTargets.delete(tgt);
                }
                updateSelectionCountUI();
                e.target.closest('.ledger-item-card')?.classList.toggle('is-selected', e.target.checked);
            });
        });
    }

    // Pagination info
    const totalPages = Math.ceil(pageData.totalCount / ledgerState.limit) || 1;
    const pageInfo = document.getElementById('ledger-page-info');
    if (pageInfo) pageInfo.textContent = `Page ${ledgerState.page} / ${totalPages} (${pageData.totalCount} items)`;

    const prevBtn = document.getElementById('ledger-prev-btn');
    if (prevBtn) prevBtn.disabled = (ledgerState.page <= 1);

    const nextBtn = document.getElementById('ledger-next-btn');
    if (nextBtn) nextBtn.disabled = (ledgerState.page >= totalPages);

    updateSelectionCountUI();
}

function updateSelectionCountUI() {
    const el = document.getElementById('ledger-selection-count');
    if (el) el.textContent = `${ledgerState.selectedTargets.size} selected`;
}

/**
 * Phase 2B (Component C): Selective Reset of checked target suppressions
 */
async function dispatchSelectiveReset(targetIdentities = [], activeSubmitCount = 0) {
    if (activeSubmitCount > 0 || (typeof campaignActive !== 'undefined' && campaignActive)) {
        throw new Error("RESET_LOCKED_ACTIVE_SUBMISSION: Active submission in flight.");
    }
    const list = (Array.isArray(targetIdentities) && targetIdentities.length > 0)
        ? targetIdentities
        : Array.from(ledgerState.selectedTargets);
    if (list.length === 0) {
        throw new Error("NO_TARGETS_SELECTED: Please select at least one target to reset.");
    }

    const hs = getPopupHistoryStore();
    let result;
    if (hs) {
        await hs.load();
        result = await hs.applySelectiveReset(list);
    } else {
        result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'SELECTED', targetIdentities: list }, (res) => {
                if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Selective reset failed'));
            });
        });
    }

    ledgerState.selectedTargets.clear();
    await renderLedgerUI();
    addLog(`🎯 Selective reset applied for ${result.affectedCount} target(s)`, 'success');
    return result;
}

/**
 * Phase 2B (Correction 1): Query retryable failed targets and place into execution queue
 * Does NOT mutate suppression state or generation.
 */
async function dispatchRetryFailed() {
    const hs = getPopupHistoryStore();
    if (!hs) throw new Error("HistoryStore unavailable");
    await hs.load();

    const retryableIdentities = hs.getRetryableFailedIdentities();
    let newlyQueued = 0;
    for (const id of retryableIdentities) {
        if (!campaignQueue.includes(id)) {
            campaignQueue.push(id);
            newlyQueued++;
        }
    }
    totalTargets = campaignQueue.length;
    remainingTargets = campaignQueue.length;

    // Update count display
    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) {
        countDisplay.textContent = `${campaignQueue.length} URLs queued`;
    }
    updateRealTimeStatus({ remainingCount: campaignQueue.length, totalTargets: campaignQueue.length });

    addLog(`⚡ Queued ${newlyQueued} failed target(s) for retry without mutating suppression`, 'success');
    return {
        retryableCount: retryableIdentities.length,
        newlyQueued,
        queueTotal: campaignQueue.length,
        identities: retryableIdentities
    };
}

/**
 * Phase 2B (Component C): Global Campaign Reset (advances generation, releases all suppression)
 */
async function dispatchGlobalReset(activeSubmitCount = 0) {
    if (activeSubmitCount > 0 || (typeof campaignActive !== 'undefined' && campaignActive)) {
        throw new Error("RESET_LOCKED_ACTIVE_SUBMISSION: Active submission in flight.");
    }

    const hs = getPopupHistoryStore();
    let result;
    if (hs) {
        await hs.load();
        result = await hs.applyGlobalReset(activeSubmitCount);
    } else {
        result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'ALL' }, (res) => {
                if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Global reset failed'));
            });
        });
    }

    ledgerState.selectedTargets.clear();
    await renderLedgerUI();
    addLog(`🔄 Global campaign reset applied. Generation: ${result.newGeneration}`, 'success');
    return result;
}

/**
 * Phase 2B (Component B): Trigger RFC-4180 compliant CSV audit export download
 */
async function triggerCsvExport(options = {}) {
    const hs = getPopupHistoryStore();
    let csv = '';
    if (hs) {
        await hs.load();
        csv = hs.exportToCsv(options);
    } else {
        csv = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV', options }, (res) => {
                if (res && res.success && res.csv) resolve(res.csv);
                else reject(new Error(res?.error || 'Failed to generate CSV'));
            });
        });
    }

    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpider_audit_ledger_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        addLog("📊 CSV Audit Ledger downloaded successfully.", "success");
    }

    return csv;
}

/**
 * Phase 2B (Component D & Correction 2): Bind additive template metadata to execution state
 */
function bindCampaignTemplateMetadata(targetState = {}, selectedTemplate = null) {
    const tpl = selectedTemplate || currentTpl || {};
    const select = document.getElementById('tpl-library-select');
    const selectedOpt = select?.options[select.selectedIndex];

    const templateId = tpl.id || selectedOpt?.dataset?.tplId || selectedOpt?.value || 'default';
    const templateVersion = tpl.version || (selectedOpt?.dataset?.tplVersion ? parseInt(selectedOpt.dataset.tplVersion) : 1);

    targetState.templateId = templateId;
    targetState.templateVersion = templateVersion;
    return targetState;
}

function parseTemplateText(content) {
    if (!content || typeof content !== 'string') {
        return { name: '', firstName: '', lastName: '', email: '', phone: '', subject: '', message: '' };
    }
    const isStructured = content.includes('[XPIDER MESSAGE TEMPLATE]');
    const fields = {
        name: '', firstName: '', lastName: '', email: '', phone: '', subject: '', message: ''
    };
    if (isStructured) {
        const lines = content.split('\n');
        let bodyStarted = false;
        let bodyLines = [];
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine.includes('[MESSAGE BODY]')) {
                bodyStarted = true;
                return;
            }
            if (bodyStarted) {
                if (trimmedLine.startsWith('---') && bodyLines.length === 0) return;
                bodyLines.push(line);
                return;
            }
            const matchName = line.match(/Full Name:\s*(.*)/i);
            const matchFirst = line.match(/First Name:\s*(.*)/i);
            const matchLast = line.match(/Last Name:\s*(.*)/i);
            const matchEmail = line.match(/Email:\s*(.*)/i);
            const matchPhone = line.match(/Phone:\s*(.*)/i);
            const matchSubject = line.match(/Subject:\s*(.*)/i);

            if (matchName) fields.name = matchName[1].trim();
            if (matchFirst) fields.firstName = matchFirst[1].trim();
            if (matchLast) fields.lastName = matchLast[1].trim();
            if (matchEmail) fields.email = matchEmail[1].trim();
            if (matchPhone) fields.phone = matchPhone[1].trim();
            if (matchSubject) fields.subject = matchSubject[1].trim();
        });
        let bodyText = bodyLines.join('\n').trim();
        bodyText = bodyText.replace(/---+\s*Generated by XPIDER AutoForm Sender Pro.*/s, '').trim();
        bodyText = bodyText.replace(/---+\s*$/, '').trim();
        fields.message = bodyText;
    } else {
        fields.message = content.trim();
    }
    return fields;
}

// [F9 Unified Schema & Authoritative Persistence]
async function persistImportedTemplate(fields) {
    const fullName = fields.name || `${fields.firstName || ''} ${fields.lastName || ''}`.trim();
    const canonicalTpl = {
        ...fields,
        fullName,
        sender: {
            fullName,
            firstName: fields.firstName || '',
            lastName: fields.lastName || '',
            company: fields.company || '',
            email: fields.email || '',
            phone: fields.phone || '',
            website: fields.website || ''
        },
        content: {
            subject: fields.subject || '',
            message: fields.message || ''
        },
        updatedAt: Date.now()
    };
    // [F9] Authoritative templates_v2 write must be awaited first; propagates error on failure
    await _syncTemplateToV2(canonicalTpl);
    // Legacy compatibility update ONLY after authoritative v2 write succeeds
    await chrome.storage.local.set({ xpider_tpl: fields });
    return canonicalTpl;
}

function importMessageFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const fields = parseTemplateText(content);

            if (fields.name) { const el = document.getElementById('tpl-name'); if (el) el.value = fields.name; }
            if (fields.firstName) { const el = document.getElementById('tpl-first-name'); if (el) el.value = fields.firstName; }
            if (fields.lastName) { const el = document.getElementById('tpl-last-name'); if (el) el.value = fields.lastName; }
            if (fields.email) { const el = document.getElementById('tpl-email'); if (el) el.value = fields.email; }
            if (fields.phone) { const el = document.getElementById('tpl-phone'); if (el) el.value = fields.phone; }
            if (fields.subject) { const el = document.getElementById('tpl-subject'); if (el) el.value = fields.subject; }
            if (fields.message) { const el = document.getElementById('tpl-message'); if (el) el.value = fields.message; }

            await persistImportedTemplate(fields);
            addLog("Intelligent template mapped and saved to authoritative store.", "success");
        } catch (err) {
            console.error('[F9] Failed to persist imported template:', err);
            addLog("Failed to save imported template to store: " + err.message, "error");
        } finally {
            if (event.target) event.target.value = ''; // Reset file input
        }
    };
    reader.readAsText(file);
}

async function saveSettings() {
    const langSelect = document.getElementById('language-select');
    const captchaToggle = document.getElementById('captcha-solve-toggle');
    const methodSelect = document.getElementById('captcha-method-select');
    const apiKeyInput = document.getElementById('captcha-api-key');
    const delayCollectInput = document.getElementById('delay-input-collect');
    const delayFillInput = document.getElementById('delay-input-fill');
    const delaySubmitInput = document.getElementById('delay-input-submit');
    const randomToggle = document.getElementById('random-delay-toggle');

    const lang = langSelect ? langSelect.value : 'en';
    const sttKeyVal = sttKeyInput ? sttKeyInput.value.trim() : '';
    const fillModeEl = document.querySelector('input[name="fill-mode"]:checked');
    const fillMode = fillModeEl ? fillModeEl.value : 'instant';
    const settings = {
        xpider_lang: lang,
        xpider_captcha_enabled: captchaToggle ? captchaToggle.checked : false,
        xpider_captcha_method: methodSelect ? methodSelect.value : 'audio',
        xpider_captcha_api_key: apiKeyInput ? apiKeyInput.value : '',
        xpider_stt_api_key: sttKeyVal,
        // [WitKey-Sync v2] 공유 키 필드: Crawler와 실시간 동기화를 위해 모두 저장
        audioSttKey: sttKeyVal,
        witKey: sttKeyVal,
        xpider_stealth_mode: stealthToggle ? stealthToggle.checked : false,
        xpider_double_submit: doubleSubmitToggle ? doubleSubmitToggle.checked : false,
        xpider_delay: delayCollectInput ? delayCollectInput.value : 6, // 레거시 호환
        xpider_delay_collect: delayCollectInput ? delayCollectInput.value : 6,
        xpider_delay_fill: delayFillInput ? delayFillInput.value : 6,
        xpider_delay_submit: delaySubmitInput ? delaySubmitInput.value : 6,
        xpider_random_delay: randomToggle ? randomToggle.checked : false,
        xpider_fill_mode: fillMode
    };
    await chrome.storage.local.set(settings);
    
    // [WitKey-Sync] 전역 IPC 키 동기화 호출
    try {
        await xpiderInvoke('xpider-ext-sync-wit-key', { key: settings.xpider_stt_api_key });
        console.log("[WitKey-Sync] Sender save settings: Key successfully synced to global bridge");
    } catch (err) {
        console.error("[WitKey-Sync] Sender save settings sync failed:", err);
    }
    
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "✅ Applied!";
        setTimeout(() => saveBtn.textContent = originalText, 2000);
    }
    
    applyTranslations(lang);
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) settingsOverlay.classList.add('hidden');
}

async function loadSettings() {
    const data = await chrome.storage.local.get([
        'xpider_lang', 'xpider_tpl', 'templates_v2',
        'xpider_delay', 'xpider_delay_collect', 'xpider_delay_fill', 'xpider_delay_submit',
        'xpider_queue', 'xpider_success', 'xpider_total',
        'xpider_captcha_enabled', 'xpider_captcha_method', 'xpider_captcha_api_key',
        'xpider_stt_api_key', 'xpider_stealth_mode', 'xpider_double_submit', 'xpider_fill_mode'
    ]);
    
    if (data.xpider_lang) {
        const langSelect = document.getElementById('language-select');
        if (langSelect) langSelect.value = data.xpider_lang;
    }
    
    // Captcha Settings (v1.2.3: Set high-stability defaults if not present)
    const captchaEnabled = (data.xpider_captcha_enabled !== undefined) ? !!data.xpider_captcha_enabled : true;
    const captchaMethod = data.xpider_captcha_method || 'audio';

    if (document.getElementById('captcha-solve-toggle')) {
        document.getElementById('captcha-solve-toggle').checked = captchaEnabled;
    }
    if (document.getElementById('captcha-method-select')) {
        document.getElementById('captcha-method-select').value = captchaMethod;
    }
    if (document.getElementById('captcha-api-key')) {
        document.getElementById('captcha-api-key').value = data.xpider_captcha_api_key || '';
    }
    if (document.getElementById('audio-stt-key')) {
        document.getElementById('audio-stt-key').value = data.xpider_stt_api_key || '';
    }
    // [WitKey-Sync v3] 메인 프로세스에서 직접 키 읽기로 보정 (chrome.storage 격리 우회)
    xpiderInvoke('xpider-ext-get-wit-key').then(res => {
        const mainKey = (res && res.key) ? res.key : '';
        if (mainKey && document.getElementById('audio-stt-key')) {
            document.getElementById('audio-stt-key').value = mainKey;
        }
    }).catch(() => {});
    if (document.getElementById('stealth-mode-toggle')) {
        document.getElementById('stealth-mode-toggle').checked = (data.xpider_stealth_mode !== undefined) ? !!data.xpider_stealth_mode : true;
    }
    if (document.getElementById('double-submit-toggle')) {
        document.getElementById('double-submit-toggle').checked = !!data.xpider_double_submit;
    }
    
    const methodGroup = document.getElementById('captcha-method-group');
    if (methodGroup) methodGroup.style.display = captchaEnabled ? 'block' : 'none';
    toggleCaptchaApiVisibility();

    // [F9] Template: use templates_v2 default slot as authoritative source; fall back to xpider_tpl
    let tplToLoad = data.xpider_tpl || null;
    if (data.templates_v2 && data.templates_v2.defaultId && data.templates_v2.templates) {
        const v2default = data.templates_v2.templates[data.templates_v2.defaultId];
        if (v2default) tplToLoad = v2default;
    }
    if (tplToLoad) {
        // Dual accessors: support flat and nested FormTemplateV2 structures
        const firstName = tplToLoad.firstName || (tplToLoad.sender && tplToLoad.sender.firstName) || '';
        const lastName  = tplToLoad.lastName  || (tplToLoad.sender && tplToLoad.sender.lastName)  || '';
        const name      = tplToLoad.name      || tplToLoad.fullName || (tplToLoad.sender && (tplToLoad.sender.fullName || tplToLoad.sender.name)) || '';
        const email     = tplToLoad.email     || (tplToLoad.sender && tplToLoad.sender.email)     || '';
        const phone     = tplToLoad.phone     || (tplToLoad.sender && tplToLoad.sender.phone)     || '';
        const subject   = tplToLoad.subject   || (tplToLoad.content && tplToLoad.content.subject) || '';
        const message   = tplToLoad.message   || (tplToLoad.content && tplToLoad.content.message) || '';

        if (document.getElementById('tpl-first-name')) document.getElementById('tpl-first-name').value = firstName;
        if (document.getElementById('tpl-last-name'))  document.getElementById('tpl-last-name').value  = lastName;
        if (document.getElementById('tpl-name'))       document.getElementById('tpl-name').value       = name;
        if (document.getElementById('tpl-email'))      document.getElementById('tpl-email').value      = email;
        if (document.getElementById('tpl-phone'))      document.getElementById('tpl-phone').value      = phone;
        if (document.getElementById('tpl-subject'))    document.getElementById('tpl-subject').value    = subject;
        if (document.getElementById('tpl-message'))    document.getElementById('tpl-message').value    = message;
    }

    // 3중 속도 복원
    if (document.getElementById('delay-input-collect')) {
        document.getElementById('delay-input-collect').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    if (document.getElementById('delay-input-fill')) {
        document.getElementById('delay-input-fill').value = data.xpider_delay_fill || 6;
    }
    if (document.getElementById('delay-input-submit')) {
        document.getElementById('delay-input-submit').value = data.xpider_delay_submit || 6;
    }
    
    // 레거시 호환용 동기화
    if (document.getElementById('delay-input')) {
        document.getElementById('delay-input').value = data.xpider_delay_collect || data.xpider_delay || 6;
    }
    
    updateSpeedLabels();
    
    if (document.getElementById('random-delay-toggle')) {
        document.getElementById('random-delay-toggle').checked = !!data.xpider_random_delay;
    }

    // [v4.15.0] 폼 자동 입력 방식 복원 (디폴트: instant)
    const fillMode = data.xpider_fill_mode || 'instant';
    const fillModeEl = document.getElementById(`fill-mode-${fillMode}`);
    if (fillModeEl) fillModeEl.checked = true;

    // Resuming Campaign
    if (data.xpider_queue && data.xpider_queue.length > 0) {
        campaignQueue = data.xpider_queue;
        totalTargets = data.xpider_total || campaignQueue.length;
        successCount = data.xpider_success || 0;
        campaignActive = true; // Mark as active to show Pause/Stop buttons

        updateRealTimeStatus({ successCount });
        const countDisplay = document.getElementById('url-count-display');
        if (countDisplay) countDisplay.textContent = `${campaignQueue.length} (remaining) / ${totalTargets} URLs`;
        
        if (document.getElementById('file-info')) document.getElementById('file-info').classList.remove('hidden');
        if (document.getElementById('status-box')) document.getElementById('status-box').classList.remove('hidden');
        if (document.getElementById('start-btn')) document.getElementById('start-btn').classList.add('hidden');
        if (document.getElementById('multi-actions')) document.getElementById('multi-actions').classList.remove('hidden');
        
        updateProgress(Math.round(((totalTargets - campaignQueue.length) / totalTargets) * 100));
        addLog(`Resumed campaign: ${campaignQueue.length} remaining.`, 'info');
    }

    // [v1.2.0] Populate saved lists
    await updateSavedListsUI();
    
    // [v1.7.0] Populate template library
    await updateTemplateDropdown();
}

// ─── [XPIDER] Browser Language-Change Broadcast Listener ──────────────
// When the XPIDER browser language setting changes, this extension updates instantly.
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'XPIDER_EVENT' && event.data.name === 'language-change') {
        const lang = event.data.data && event.data.data.lang;
        if (lang && typeof applyTranslations === 'function') {
            applyTranslations(lang);
            const langSelect = document.getElementById('language-select');
            if (langSelect) langSelect.value = lang;
            chrome.storage.local.set({ xpider_lang: lang });
        }
    }
});

async function clearCampaignQueue() {
    // 1. Reset campaign queue and counts
    campaignQueue = [];
    totalTargets = 0;
    successCount = 0;
    remainingTargets = 0;
    
    // 2. Hide file info and preview lists
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.add('hidden');
    
    const previewList = document.getElementById('file-urls-preview');
    if (previewList) previewList.classList.add('hidden');
    
    const previewContainer = document.getElementById('preview-list');
    if (previewContainer) previewContainer.innerHTML = '';
    
    // 3. Clear file input
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    
    const nameDisplay = document.getElementById('filename-display');
    if (nameDisplay) nameDisplay.textContent = 'No file selected';

    const countDisplay = document.getElementById('url-count-display');
    if (countDisplay) countDisplay.textContent = '0 URLs found';
    
    // 4. Update UI counts and progress
    updateRealTimeStatus({ successCount: 0, remainingCount: 0 });
    updateProgress(0);
    
    // 5. Clear Storage
    await chrome.storage.local.set({
        xpider_queue: [],
        xpider_total: 0,
        xpider_success: 0
    });
    
    // 6. Log success
    addLog("Business URLs list cleared.", "stop");
}

// [WitKey-Sync] 실시간 스토리지 변경 시 UI 자동 업데이트 처리
chrome.storage.onChanged.addListener((changes) => {
    let newKey = null;
    if (changes.xpider_stt_api_key && changes.xpider_stt_api_key.newValue !== undefined) {
        newKey = changes.xpider_stt_api_key.newValue;
    } else if (changes.audioSttKey && changes.audioSttKey.newValue !== undefined) {
        newKey = changes.audioSttKey.newValue;
    } else if (changes.witKey && changes.witKey.newValue !== undefined) {
        newKey = changes.witKey.newValue;
    }
    
    if (newKey !== null) {
        console.log(`[WitKey-Sync] Sender Popup Storage changed → Syncing UI to new key: ${newKey ? newKey.substring(0, 8) + '...' : 'NONE'}`);
        
        // 1) 설정창의 STT API Key 입력창 갱신
        const sttKeyInput = document.getElementById('audio-stt-key');
        if (sttKeyInput) sttKeyInput.value = newKey;
        
        // 2) 최초 STT 설정 모달 입력 필드 갱신
        const setupInput = document.getElementById('setup-stt-key-input');
        if (setupInput) setupInput.value = newKey;
        
        // 3) 최초 STT 설정 모달 가시성 제어
        const setupModal = document.getElementById('stt-setup-modal-overlay');
        if (setupModal) {
            if (newKey) {
                setupModal.classList.add('hidden'); // 키가 존재하면 숨김
            } else {
                setupModal.classList.remove('hidden'); // 키가 없으면 노출
            }
        }
    }
});

// [P2A Foundation UI Wiring]
document.addEventListener('DOMContentLoaded', () => {
    // 1. Trigger background single-writer migration
    try {
        chrome.runtime.sendMessage({ action: 'EXECUTE_MIGRATION' }, (res) => {
            if (res && res.success) {
                console.log('[Popup] Storage migration verified / initialized to v2.');
            }
        });
    } catch(e) {}

    // 2. Export CSV Report Button
    const exportBtn = document.getElementById('export-csv-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'EXPORT_HISTORY_CSV' }, (res) => {
                if (res && res.success && res.csv) {
                    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `xpider_campaign_report_${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    addLog("📊 CSV Report downloaded successfully.", "success");
                } else {
                    addLog("⚠️ Failed to generate CSV report.", "warning");
                }
            });
        });
    }

    // 3. Reset All Suppression Button
    const resetBtn = document.getElementById('reset-all-history-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("Reset suppression for all targets? This will allow intentional resending while preserving historical audit rows.")) {
                chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'ALL' }, (res) => {
                    if (res && res.success) {
                        addLog(`🔄 All target suppressions reset. (New Generation: ${res.newGeneration})`, "success");
                        _renderHistoryPanel();
                    } else {
                        addLog(`❌ Reset rejected: ${res?.error || 'Active submission in progress'}`, "error");
                    }
                });
            }
        });
    }

    // [F10] Selective Reset Button - reset single URL's suppression state
    const selectiveResetBtn = document.getElementById('selective-reset-history-btn');
    if (selectiveResetBtn) {
        selectiveResetBtn.addEventListener('click', () => {
            const input = document.getElementById('selective-reset-url-input');
            const url = input ? input.value.trim() : '';
            if (!url) return alert('Enter a URL to selectively reset.');
            if (confirm(`Reset suppression for: ${url}?`)) {
                chrome.runtime.sendMessage({ action: 'EXECUTE_RESET', type: 'SELECTED', targetIdentities: [url] }, (res) => {
                    if (res && res.success) {
                        addLog(`🔄 Selective reset applied for ${url} (${res.affectedCount} target(s) affected)`, "success");
                        if (input) input.value = '';
                        _renderHistoryPanel();
                    } else {
                        addLog(`❌ Selective reset failed: ${res?.error || 'Unknown error'}`, "error");
                    }
                });
            }
        });
    }

    // [F10] History status panel: load and display ImportRow/Attempt state
    async function _renderHistoryPanel() {
        const panel = document.getElementById('history-status-panel');
        if (!panel) return;
        try {
            const data = await chrome.storage.local.get(['xpider_history_rows', 'xpider_history_attempts', 'xpider_history_generation']);
            const rows = data.xpider_history_rows || [];
            const attempts = data.xpider_history_attempts || [];
            const gen = data.xpider_history_generation || 1;

            const pending = rows.filter(r => r.status === 'PENDING').length;
            const invalid = rows.filter(r => r.status === 'INVALID_INPUT').length;
            const succeeded = attempts.filter(a => a.status === 'CONFIRMED_SUCCESS').length;
            const failed = attempts.filter(a => a.status === 'FAILURE').length;

            panel.innerHTML = `
                <div class="history-stat-row">
                    <span>Generation:</span><span><b>${gen}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Total Import Rows:</span><span><b>${rows.length}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Pending:</span><span><b>${pending}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Invalid:</span><span><b style="color:#ef4444">${invalid}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Succeeded:</span><span><b style="color:#22c55e">${succeeded}</b></span>
                </div>
                <div class="history-stat-row">
                    <span>Failed:</span><span><b style="color:#f59e0b">${failed}</b></span>
                </div>
            `;
        } catch (e) {
            panel.innerHTML = `<span style="color:#ef4444">History load error: ${e.message}</span>`;
        }
    }

    // Initial render on popup open
    _renderHistoryPanel();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        _parseRfc4180Records,
        _syncTemplateToV2,
        saveTemplate,
        persistImportedTemplate,
        parseTemplateText,
        // Phase 2B Controller Functions (Auditor Correction 3)
        handleCreateNewTemplate,
        handleSaveTemplate,
        handleDuplicateTemplate,
        handleDeleteTemplate,
        handleSetDefaultTemplate,
        populateFormFromTemplate,
        updateTemplateDropdown,
        loadTemplateFromLibrary,
        filterHistoryRecords,
        renderLedgerUI,
        dispatchSelectiveReset,
        dispatchRetryFailed,
        dispatchGlobalReset,
        triggerCsvExport,
        bindCampaignTemplateMetadata,
        getPopupTemplateStore,
        getPopupHistoryStore
    };
}

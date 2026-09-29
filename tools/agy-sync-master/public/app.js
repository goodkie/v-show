// AGY-Sync Master Frontend Controller

const elements = {
  hostName: document.getElementById('hostName'),
  userName: document.getElementById('userName'),
  scoreVal: document.getElementById('scoreVal'),
  scoreCircle: document.getElementById('scoreCircle'),
  metaTargetDir: document.getElementById('metaTargetDir'),
  metaFastTrackDir: document.getElementById('metaFastTrackDir'),
  metaGdrive: document.getElementById('metaGdrive'),
  metaBranch: document.getElementById('metaBranch'),
  btnRefreshStatus: document.getElementById('btnRefreshStatus'),
  btnShortcut: document.getElementById('btnShortcut'),
  btnOpenPathModal: document.getElementById('btnOpenPathModal'),

  // Modals & Controls
  pathModal: document.getElementById('pathModal'),
  btnClosePathModal: document.getElementById('btnClosePathModal'),
  btnCancelPathModal: document.getElementById('btnCancelPathModal'),
  inputCustomPath: document.getElementById('inputCustomPath'),
  previewParent: document.getElementById('previewParent'),
  previewFastTrack: document.getElementById('previewFastTrack'),
  previewMainRepo: document.getElementById('previewMainRepo'),
  btnSavePathConfig: document.getElementById('btnSavePathConfig'),

  uninstallModal: document.getElementById('uninstallModal'),
  btnUninstall: document.getElementById('btnUninstall'),
  btnCloseUninstallModal: document.getElementById('btnCloseUninstallModal'),
  btnCancelUninstallModal: document.getElementById('btnCancelUninstallModal'),
  btnConfirmUninstall: document.getElementById('btnConfirmUninstall'),
  chkRemoveWorktree: document.getElementById('chkRemoveWorktree'),
  chkRemoveMainRepo: document.getElementById('chkRemoveMainRepo'),
  chkResetConfig: document.getElementById('chkResetConfig'),
  uninstallTargetFastTrack: document.getElementById('uninstallTargetFastTrack'),

  toggleAutoSync: document.getElementById('toggleAutoSync'),
  autoSyncInterval: document.getElementById('autoSyncInterval'),
  autoSyncBadge: document.getElementById('autoSyncBadge'),
  autoSyncDesc: document.getElementById('autoSyncDesc'),

  progressSection: document.getElementById('progressSection'),
  progressStatus: document.getElementById('progressStatus'),
  progressPercent: document.getElementById('progressPercent'),
  progressFill: document.getElementById('progressFill'),

  btnSetup: document.getElementById('btnSetup'),
  btnDiagnose: document.getElementById('btnDiagnose'),
  btnRecover: document.getElementById('btnRecover'),
  btnPush: document.getElementById('btnPush'),
  btnPull: document.getElementById('btnPull'),
  btnRemap: document.getElementById('btnRemap'),
  btnUnblock: document.getElementById('btnUnblock'),
  btnOpenCv: document.getElementById('btnOpenCv'),

  checksGrid: document.getElementById('checksGrid'),
  lastCheckedTime: document.getElementById('lastCheckedTime'),
  terminalBody: document.getElementById('terminalBody'),
  btnClearLogs: document.getElementById('btnClearLogs')
};

// 1. Live SSE Log Stream & Progress
function setupEventSource() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('log', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendLog(data.level, `[${data.time}] ${data.message}`);
    } catch (err) {}
  });

  evtSource.addEventListener('progress', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateProgress(data.percent, data.statusText);
    } catch (err) {}
  });

  evtSource.addEventListener('auto-sync-status', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateAutoSyncUI(data);
    } catch (err) {}
  });

  evtSource.onerror = () => {
    setTimeout(setupEventSource, 3000);
  };
}

function appendLog(level, msg) {
  const line = document.createElement('div');
  line.className = `log-line ${level.toLowerCase()}`;
  line.textContent = msg;
  elements.terminalBody.appendChild(line);
  elements.terminalBody.scrollTop = elements.terminalBody.scrollHeight;
}

function updateProgress(percent, statusText) {
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
  if (statusText) elements.progressStatus.textContent = statusText;
}

function setButtonsDisabled(disabled) {
  const btns = [
    elements.btnSetup, elements.btnDiagnose, elements.btnRecover,
    elements.btnPush, elements.btnPull, elements.btnRemap
  ];
  btns.forEach(b => b.disabled = disabled);
}

// 2. Fetch System Status
let currentSystemPaths = null;

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    elements.hostName.textContent = data.hostname;
    elements.userName.textContent = data.username;
    elements.metaTargetDir.textContent = data.targetDir;
    if (data.paths) {
      currentSystemPaths = data.paths;
      if (elements.metaFastTrackDir) {
        elements.metaFastTrackDir.textContent = data.paths.fastTrackDir;
      }
      if (elements.uninstallTargetFastTrack) {
        elements.uninstallTargetFastTrack.textContent = data.paths.fastTrackDir;
      }
    }
    elements.metaGdrive.textContent = `${data.gdriveRoot}\\${data.syncPackage}`;
    elements.metaBranch.textContent = data.branch;

    if (data.autoSync) {
      updateAutoSyncUI(data.autoSync);
    }
  } catch (e) {
    appendLog('WARN', `상태 로드 실패: ${e.message}`);
  }
}

function updatePathPreview(raw) {
  if (!raw) {
    elements.previewParent.textContent = '-';
    elements.previewFastTrack.textContent = '-';
    elements.previewMainRepo.textContent = '-';
    return;
  }
  const clean = raw.trim().replace(/[\/\\]+$/, '');
  const norm = clean.replace(/\\/g, '/').toLowerCase();
  let parent = clean;
  let fastTrack = '';
  let mainRepo = '';

  if (norm.endsWith('/v-show-stage2-fast-track')) {
    const idx = clean.lastIndexOf('\\') !== -1 ? clean.lastIndexOf('\\') : clean.lastIndexOf('/');
    parent = clean.substring(0, idx);
    fastTrack = clean;
    mainRepo = `${parent}\\v-show`;
  } else if (norm.endsWith('/v-show')) {
    const idx = clean.lastIndexOf('\\') !== -1 ? clean.lastIndexOf('\\') : clean.lastIndexOf('/');
    parent = clean.substring(0, idx);
    mainRepo = clean;
    fastTrack = `${parent}\\v-show-stage2-fast-track`;
  } else {
    parent = clean;
    mainRepo = `${clean}\\v-show`;
    fastTrack = `${clean}\\v-show-stage2-fast-track`;
  }

  elements.previewParent.textContent = parent;
  elements.previewFastTrack.textContent = fastTrack;
  elements.previewMainRepo.textContent = mainRepo;
}

// 3. Auto-Sync UI & Control
function updateAutoSyncUI(status) {
  elements.toggleAutoSync.checked = !!status.enabled;
  if (status.intervalSeconds) {
    elements.autoSyncInterval.value = status.intervalSeconds;
  }

  if (status.enabled) {
    elements.autoSyncBadge.textContent = '핸드프리 전자동 가동 중 (30초)';
    elements.autoSyncBadge.className = 'auto-sync-badge badge-on';
    const busyText = status.isBusy ? ' (⚡ 실시간 동기화 작업 진행 중...)' : '';
    const nextCheck = (!status.isBusy && status.nextCheckInSeconds !== undefined) ? ` [다음 점검: ${status.nextCheckInSeconds}초 후]` : '';
    const lastTime = status.lastSyncTime ? ` | 최근 동기화: ${new Date(status.lastSyncTime).toLocaleTimeString()}` : '';
    const resText = status.lastSyncResult ? ` (${status.lastSyncResult})` : '';
    elements.autoSyncDesc.textContent = `${status.intervalSeconds || 30}초마다 개발 코드(Git)와 AI 대화(Brain/DB)를 실시간 전자동 감지 및 Pull/Push 중입니다.${nextCheck}${busyText}${lastTime}${resText}`;
  } else {
    elements.autoSyncBadge.textContent = '일시 정지됨';
    elements.autoSyncBadge.className = 'auto-sync-badge badge-off';
    elements.autoSyncDesc.textContent = '30초 주기 전자동 동기화가 일시 정지되었습니다. 스위치를 켜면 핸드프리 동기화가 다시 시작됩니다.';
  }
}

async function setAutoSync(enable, interval) {
  try {
    const res = await fetch('/api/auto-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: enable ? 'start' : 'stop',
        intervalSeconds: parseInt(interval, 10) || 30
      })
    });
    const data = await res.json();
    updateAutoSyncUI(data);
  } catch (e) {
    appendLog('ERROR', `자동 동기화 설정 실패: ${e.message}`);
  }
}

// 4. Run Diagnosis
async function runDiagnose() {
  setButtonsDisabled(true);
  updateProgress(20, '시스템 및 Git 저장소 정밀 진단 중...');
  appendLog('INFO', '[진단 시작] 로컬 환경, Git 팩파일 및 타 PC 경로 오염 검사 중...');

  try {
    const res = await fetch('/api/diagnose');
    const data = await res.json();

    updateProgress(100, `진단 완료: 종합 건강도 ${data.score}점`);
    elements.scoreVal.textContent = data.score;
    elements.lastCheckedTime.textContent = `최근 진단: ${new Date(data.timestamp).toLocaleTimeString()}`;

    // Score Circle Color
    if (data.score >= 90) {
      elements.scoreCircle.style.borderColor = 'var(--accent-emerald)';
      elements.scoreCircle.style.color = 'var(--accent-emerald)';
    } else if (data.score >= 60) {
      elements.scoreCircle.style.borderColor = 'var(--accent-amber)';
      elements.scoreCircle.style.color = 'var(--accent-amber)';
    } else {
      elements.scoreCircle.style.borderColor = 'var(--accent-rose)';
      elements.scoreCircle.style.color = 'var(--accent-rose)';
    }

    renderChecks(data.checks);
    appendLog('INFO', `[진단 완료] 건강도 ${data.score}/100점`);
  } catch (e) {
    appendLog('ERROR', `진단 실패: ${e.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

function renderChecks(checks) {
  elements.checksGrid.innerHTML = '';
  checks.forEach(c => {
    const card = document.createElement('div');
    card.className = 'check-item';

    const pillClass = c.status === 'PASS' ? 'pill-pass' : (c.status === 'WARN' ? 'pill-warn' : 'pill-fail');

    card.innerHTML = `
      <div class="check-item-header">
        <span class="check-title">${c.name}</span>
        <span class="pill ${pillClass}">${c.status}</span>
      </div>
      <div class="check-desc">${c.message}</div>
      ${c.action ? `
        <div style="margin-top:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <span style="font-size:11px; color:var(--accent-amber); font-weight:600;">추천 조치: ${c.action}</span>
          <button class="btn-mini-action" onclick="handleMiniAction('${c.action}')">즉시 해결</button>
        </div>` : ''}
    `;
    elements.checksGrid.appendChild(card);
  });
}

window.handleMiniAction = function(action) {
  if (action.includes('GitHub')) {
    executeAction('/api/setup-git-auth', 'GitHub 원격 인증(Git Push) 토큰 자동 연동 중...');
  } else if (action.includes('OpenCV')) {
    executeAction('/api/install-opencv', 'Python & OpenCV(cv2) 자동 설치 중 (약 1~2분 소요)...');
  } else if (action.includes('리매핑')) {
    executeAction('/api/remap', '현재 PC 경로로 환경 동적 리매핑 중...');
  } else if (action.includes('복구')) {
    executeAction('/api/recover', 'Git 팩파일 손상 격리 및 원격 refetch 복구 중...');
  } else {
    executeAction('/api/setup', '신규 PC 원클릭 자동 설치 및 환경 매핑 중...');
  }
};

// 5. Action API Handlers
async function executeAction(endpoint, startMsg, confirmMsg = null) {
  if (confirmMsg && !confirm(confirmMsg)) return;

  setButtonsDisabled(true);
  updateProgress(10, startMsg);
  appendLog('INFO', `[실행] ${startMsg}`);

  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      appendLog('INFO', `[완료] 성공적으로 처리되었습니다.`);
      runDiagnose();
    } else {
      appendLog('ERROR', `[오류] ${data.error || '처리 실패'}`);
    }
  } catch (e) {
    appendLog('ERROR', `[네트워크 오류] ${e.message}`);
  } finally {
    setButtonsDisabled(false);
  }
}

// Wire Event Listeners
elements.btnRefreshStatus.addEventListener('click', () => {
  loadStatus();
  runDiagnose();
});

if (elements.btnShortcut) {
  elements.btnShortcut.addEventListener('click', async () => {
    try {
      appendLog('INFO', 'Windows 바탕화면에 [AGY-Sync Master] 바로가기 생성 요청 중...');
      const res = await fetch('/api/shortcut', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        appendLog('INFO', '✓ Windows 바탕화면에 [AGY-Sync Master] 바로가기가 성공적으로 생성되었습니다!');
        alert('바탕화면에 [AGY-Sync Master] 바로가기가 생성되었습니다.');
      } else {
        appendLog('ERROR', `바로가기 생성 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      appendLog('ERROR', `네트워크 오류: ${e.message}`);
    }
  });
}

elements.toggleAutoSync.addEventListener('change', (e) => {
  setAutoSync(e.target.checked, elements.autoSyncInterval.value);
});

elements.autoSyncInterval.addEventListener('change', (e) => {
  if (elements.toggleAutoSync.checked) {
    setAutoSync(true, e.target.value);
  }
});

elements.btnDiagnose.addEventListener('click', runDiagnose);

elements.btnSetup.addEventListener('click', () => {
  executeAction('/api/setup', '신규 PC 원클릭 설치 및 환경 자동 매핑 중...', '현재 PC에 GitHub 코드 클론 및 Antigravity 세션 복원을 진행하시겠습니까?');
});

elements.btnRecover.addEventListener('click', () => {
  executeAction('/api/recover', 'Git 팩파일 손상 격리 및 원격 refetch 복구 중...', '손상된 팩파일을 격리하고 GitHub로부터 정상 오브젝트를 재수신하시겠습니까?');
});

elements.btnPush.addEventListener('click', () => {
  executeAction('/api/push', '작업 완료 내용 GitHub 푸시 및 Google Drive 백업 중...');
});

elements.btnPull.addEventListener('click', () => {
  executeAction('/api/pull', '최신 작업 내용 가져오기 및 현재 PC 경로 재매핑 중...');
});

elements.btnRemap.addEventListener('click', () => {
  executeAction('/api/remap', '현재 PC 경로로 환경 동적 리매핑 중...');
});

if (elements.btnUnblock) {
  elements.btnUnblock.addEventListener('click', () => {
    executeAction('/api/unblock', '대화 세션 워크스페이스 매핑 및 🚫 금지표시 일괄 해제 중...', '대화 세션에 현재 PC 경로를 안전하게 매핑하여 🚫 잠금을 해제하시겠습니까?');
  });
}

if (elements.btnOpenCv) {
  elements.btnOpenCv.addEventListener('click', () => {
    executeAction('/api/install-opencv', 'Python & OpenCV(cv2) 자동 설치 중 (약 1~2분 소요)...', '시스템 내 Python 환경 탐지 및 파노라마 스티칭용 OpenCV 모듈을 자동 설치하시겠습니까?');
  });
}

elements.btnClearLogs.addEventListener('click', () => {
  elements.terminalBody.innerHTML = '';
});

// 6. Path / Project Modal Handlers
if (elements.btnOpenPathModal) {
  elements.btnOpenPathModal.addEventListener('click', () => {
    if (currentSystemPaths) {
      elements.inputCustomPath.value = currentSystemPaths.fastTrackDir || currentSystemPaths.rawTarget;
      updatePathPreview(elements.inputCustomPath.value);
    }
    elements.pathModal.style.display = 'flex';
  });
}

if (elements.btnClosePathModal) {
  elements.btnClosePathModal.addEventListener('click', () => {
    elements.pathModal.style.display = 'none';
  });
}

if (elements.btnCancelPathModal) {
  elements.btnCancelPathModal.addEventListener('click', () => {
    elements.pathModal.style.display = 'none';
  });
}

if (elements.inputCustomPath) {
  elements.inputCustomPath.addEventListener('input', (e) => {
    updatePathPreview(e.target.value);
  });
}

document.querySelectorAll('.btn-quick-path').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = btn.getAttribute('data-path');
    if (p && elements.inputCustomPath) {
      elements.inputCustomPath.value = p;
      updatePathPreview(p);
    }
  });
});

if (elements.btnSavePathConfig) {
  elements.btnSavePathConfig.addEventListener('click', async () => {
    const newPath = (elements.inputCustomPath.value || '').trim();
    if (!newPath) {
      alert('경로를 입력해 주세요.');
      return;
    }
    elements.pathModal.style.display = 'none';
    setButtonsDisabled(true);
    updateProgress(20, `새 작업 경로 설정 및 환경 리매핑 중: ${newPath}`);
    appendLog('INFO', `[경로 변경] 새 작업 경로 설정 시작: ${newPath}`);

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir: newPath })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        appendLog('INFO', `✓ 새 경로 적용 및 환경 매핑 완료! (Fast-Track: ${data.paths.fastTrackDir})`);
        loadStatus();
        runDiagnose();
      } else {
        appendLog('ERROR', `경로 설정 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      appendLog('ERROR', `네트워크 오류: ${e.message}`);
    } finally {
      setButtonsDisabled(false);
    }
  });
}

// 7. Uninstall Modal Handlers
if (elements.btnUninstall) {
  elements.btnUninstall.addEventListener('click', () => {
    if (currentSystemPaths && elements.uninstallTargetFastTrack) {
      elements.uninstallTargetFastTrack.textContent = currentSystemPaths.fastTrackDir;
    }
    elements.uninstallModal.style.display = 'flex';
  });
}

if (elements.btnCloseUninstallModal) {
  elements.btnCloseUninstallModal.addEventListener('click', () => {
    elements.uninstallModal.style.display = 'none';
  });
}

if (elements.btnCancelUninstallModal) {
  elements.btnCancelUninstallModal.addEventListener('click', () => {
    elements.uninstallModal.style.display = 'none';
  });
}

if (elements.btnConfirmUninstall) {
  elements.btnConfirmUninstall.addEventListener('click', async () => {
    const removeWorktree = elements.chkRemoveWorktree.checked;
    const removeMainRepo = elements.chkRemoveMainRepo.checked;
    const resetConfig = elements.chkResetConfig.checked;

    if (!removeWorktree && !removeMainRepo && !resetConfig) {
      alert('최소 하나 이상의 제거 옵션을 선택해 주세요.');
      return;
    }

    elements.uninstallModal.style.display = 'none';
    setButtonsDisabled(true);
    updateProgress(10, '로컬 설치 제거 및 초기화 진행 중...');
    appendLog('WARN', '[설치 제거] 로컬 프로젝트 및 환경 초기화 실행...');

    try {
      const res = await fetch('/api/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removeWorktree,
          removeMainRepo,
          resetConfig
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        appendLog('INFO', `✓ 설치 제거 완료! (${data.removedItems.length}개 항목 제거됨)`);
        appendLog('INFO', `새로운 경로나 폴더를 지정한 후 [설치 시작]을 클릭하시면 깨끗하게 재구축됩니다.`);
        loadStatus();
        runDiagnose();
      } else {
        appendLog('ERROR', `설치 제거 중 오류: ${(data.errors || []).join(', ') || data.error}`);
      }
    } catch (e) {
      appendLog('ERROR', `네트워크 오류: ${e.message}`);
    } finally {
      setButtonsDisabled(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION SESSION ARCHIVE & AGENT HANDOVER CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────
function setupSessionArchiveControls() {
  const sessionModal = document.getElementById('sessionModal');
  const btnOpenSessionModal = document.getElementById('btnOpenSessionModal');
  const btnOpenSessionModalFromCard = document.getElementById('btnOpenSessionModalFromCard');
  const btnQuickHandoverPackage = document.getElementById('btnQuickHandoverPackage');
  const btnCreateHandoverPackageFromCard = document.getElementById('btnCreateHandoverPackageFromCard');
  const btnCloseSessionModal = document.getElementById('btnCloseSessionModal');
  const btnCloseSessionModalBottom = document.getElementById('btnCloseSessionModalBottom');

  if (!sessionModal) return;

  const tabButtons = sessionModal.querySelectorAll('.modal-tab');
  const tabPanes = sessionModal.querySelectorAll('.tab-pane');

  function switchTab(tabId) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    tabPanes.forEach(p => p.classList.toggle('active', p.id === tabId));
    if (tabId === 'tab-active-convs') loadActiveConversations();
    if (tabId === 'tab-saved-docs') loadSavedDocs();
    if (tabId === 'tab-handover-pkgs') loadPackages();
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function openModal(defaultTab = 'tab-active-convs') {
    sessionModal.style.display = 'flex';
    switchTab(defaultTab);
  }

  function closeModal() {
    sessionModal.style.display = 'none';
  }

  if (btnOpenSessionModal) btnOpenSessionModal.addEventListener('click', () => openModal('tab-active-convs'));
  if (btnOpenSessionModalFromCard) btnOpenSessionModalFromCard.addEventListener('click', () => openModal('tab-active-convs'));
  if (btnQuickHandoverPackage) btnQuickHandoverPackage.addEventListener('click', () => openModal('tab-handover-pkgs'));
  if (btnCreateHandoverPackageFromCard) btnCreateHandoverPackageFromCard.addEventListener('click', () => openModal('tab-handover-pkgs'));
  if (btnCloseSessionModal) btnCloseSessionModal.addEventListener('click', closeModal);
  if (btnCloseSessionModalBottom) btnCloseSessionModalBottom.addEventListener('click', closeModal);

  // Tab 1: Active Conversations
  const activeTbody = document.getElementById('activeConvsTbody');
  const btnRefreshConvs = document.getElementById('btnRefreshConvs');
  const btnArchiveAllConvs = document.getElementById('btnArchiveAllConvs');

  async function loadActiveConversations() {
    if (!activeTbody) return;
    activeTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">대화 목록을 불러오는 중...</td></tr>';
    try {
      const res = await fetch('/api/conversations');
      const convs = await res.json();
      if (!Array.isArray(convs) || convs.length === 0) {
        activeTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">발견된 대화 세션이 없습니다.</td></tr>';
        return;
      }
      activeTbody.innerHTML = '';
      convs.forEach(c => {
        const tr = document.createElement('tr');
        const shortDate = (c.last_modified || '').replace('T', ' ').substring(0, 19);
        const isArchived = Boolean(c.archived_file);

        tr.innerHTML = `
          <td>
            <div style="font-weight:600; color:var(--text-main); margin-bottom:2px;">${escapeHtml(c.title || '세션')}</div>
            <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">${c.id}</div>
          </td>
          <td><span style="font-family:var(--font-mono); font-size:11.5px;">${c.steps}</span></td>
          <td style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${shortDate}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn-mini ${isArchived ? 'btn-mini-emerald' : 'btn-mini-primary'} btn-doc-export" data-id="${c.id}">
              ${isArchived ? '✓ 저장됨 (갱신)' : '📝 문서화 저장'}
            </button>
            <button class="btn-mini btn-open-viewer" data-id="${c.id}" data-file="${c.archived_file || ''}" title="새 창 뷰어로 열람">
              🌐 새창보기
            </button>
          </td>
        `;
        activeTbody.appendChild(tr);
      });

      // Hook row buttons
      activeTbody.querySelectorAll('.btn-doc-export').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cid = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = '저장 중...';
          try {
            const expRes = await fetch('/api/conversations/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ convId: cid })
            });
            const d = await expRes.json();
            if (d.success) {
              btn.className = 'btn-mini btn-mini-emerald btn-doc-export';
              btn.textContent = '✓ 저장완료';
              appendLog('INFO', `✓ 세션 문서화 완료: ${d.relPath}`);
            } else {
              alert('문서화 실패: ' + (d.error || '오류'));
              btn.textContent = '문서화 실패';
            }
          } catch (e) {
            alert('오류: ' + e.message);
            btn.textContent = '오류';
          } finally {
            btn.disabled = false;
          }
        });
      });

      activeTbody.querySelectorAll('.btn-open-viewer').forEach(btn => {
        btn.addEventListener('click', () => {
          const cid = btn.dataset.id;
          const file = btn.dataset.file;
          let url = file ? `/viewer.html?file=${encodeURIComponent(file)}` : `/viewer.html?id=${encodeURIComponent(cid)}`;
          window.open(url, '_blank', 'width=1100,height=850,menubar=no,toolbar=no');
        });
      });

    } catch (e) {
      activeTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--accent-rose);">대화 목록 로드 실패: ${e.message}</td></tr>`;
    }
  }

  if (btnRefreshConvs) btnRefreshConvs.addEventListener('click', loadActiveConversations);

  if (btnArchiveAllConvs) {
    btnArchiveAllConvs.addEventListener('click', async () => {
      btnArchiveAllConvs.disabled = true;
      btnArchiveAllConvs.textContent = '일괄 문서화 진행 중...';
      try {
        const res = await fetch('/api/conversations');
        const convs = await res.json();
        let count = 0;
        for (const c of convs) {
          try {
            await fetch('/api/conversations/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ convId: c.id })
            });
            count++;
          } catch (err) {}
        }
        appendLog('INFO', `✓ 전체 ${count}개 대화 세션 프로젝트 문서화 저장 완료 (docs/conversations/)`);
        loadActiveConversations();
      } catch (e) {
        appendLog('ERROR', `일괄 문서화 오류: ${e.message}`);
      } finally {
        btnArchiveAllConvs.disabled = false;
        btnArchiveAllConvs.textContent = '📑 전체 일괄 문서화';
      }
    });
  }

  // Tab 2: Saved Markdown Docs
  const savedTbody = document.getElementById('savedDocsTbody');
  const btnRefreshSavedDocs = document.getElementById('btnRefreshSavedDocs');
  const btnOpenDocsFolder = document.getElementById('btnOpenDocsFolder');

  async function loadSavedDocs() {
    if (!savedTbody) return;
    savedTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">저장된 문서를 불러오는 중...</td></tr>';
    try {
      const res = await fetch('/api/conversations/archived');
      const docs = await res.json();
      if (!Array.isArray(docs) || docs.length === 0) {
        savedTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">아직 저장된 세션 마크다운 문서가 없습니다. Tab 1에서 [문서화 저장]을 실행하세요.</td></tr>';
        return;
      }
      savedTbody.innerHTML = '';
      docs.forEach(d => {
        const tr = document.createElement('tr');
        const sizeKb = (d.sizeBytes / 1024).toFixed(1) + ' KB';
        tr.innerHTML = `
          <td>
            <div style="font-weight:600; color:var(--accent-cyan); margin-bottom:2px;">${escapeHtml(d.title || d.filename)}</div>
            <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">${d.relPath}</div>
          </td>
          <td style="font-family:var(--font-mono); font-size:11.5px;">${sizeKb}</td>
          <td style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${d.mtime}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn-mini btn-mini-primary btn-open-doc-viewer" data-file="${d.relPath}">🌐 새창열기</button>
            <button class="btn-mini btn-open-doc-editor" data-file="${d.relPath}">💻 에디터</button>
          </td>
        `;
        savedTbody.appendChild(tr);
      });

      savedTbody.querySelectorAll('.btn-open-doc-viewer').forEach(btn => {
        btn.addEventListener('click', () => {
          const file = btn.dataset.file;
          window.open(`/viewer.html?file=${encodeURIComponent(file)}`, '_blank', 'width=1100,height=850,menubar=no,toolbar=no');
        });
      });

      savedTbody.querySelectorAll('.btn-open-doc-editor').forEach(btn => {
        btn.addEventListener('click', async () => {
          const file = btn.dataset.file;
          try {
            await fetch('/api/open-in-editor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file })
            });
          } catch (e) {
            alert('에디터 실행 오류: ' + e.message);
          }
        });
      });

    } catch (e) {
      savedTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--accent-rose);">문서 로드 실패: ${e.message}</td></tr>`;
    }
  }

  if (btnRefreshSavedDocs) btnRefreshSavedDocs.addEventListener('click', loadSavedDocs);
  if (btnOpenDocsFolder) {
    btnOpenDocsFolder.addEventListener('click', async () => {
      try {
        await fetch('/api/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'docs/conversations' })
        });
      } catch (e) {
        alert('폴더 열기 오류: ' + e.message);
      }
    });
  }

  // Tab 3: Handover Packages
  const pkgsListContainer = document.getElementById('pkgsListContainer');
  const btnCreateHandoverPackageInModal = document.getElementById('btnCreateHandoverPackageInModal');
  const btnRefreshPkgs = document.getElementById('btnRefreshPkgs');
  const btnOpenPkgsFolder = document.getElementById('btnOpenPkgsFolder');

  async function loadPackages() {
    if (!pkgsListContainer) return;
    pkgsListContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">패키지 목록을 불러오는 중...</div>';
    try {
      const res = await fetch('/api/conversations/packages');
      const pkgs = await res.json();
      if (!Array.isArray(pkgs) || pkgs.length === 0) {
        pkgsListContainer.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">생성된 패키지가 없습니다. 상단 [패키지 지금 생성] 버튼을 누르세요.</div>';
        return;
      }
      pkgsListContainer.innerHTML = '';
      pkgs.forEach(p => {
        const item = document.createElement('div');
        item.className = 'pkg-card-item';
        const sizeMb = (p.sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
        item.innerHTML = `
          <div>
            <div style="font-weight:700; color:var(--accent-cyan); font-size:13px; margin-bottom:2px;">📦 ${escapeHtml(p.filename)}</div>
            <div style="font-size:11px; color:var(--text-dim); font-family:var(--font-mono);">크기: ${sizeMb} | 생성: ${p.mtime}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <a href="/api/download-package?name=${encodeURIComponent(p.filename)}" class="btn-mini btn-mini-primary" download>⬇️ ZIP 다운로드</a>
            <button class="btn-mini btn-pkg-folder" title="탐색기에서 패키지 위치 열기">📁 위치 열기</button>
          </div>
        `;
        pkgsListContainer.appendChild(item);
      });

      pkgsListContainer.querySelectorAll('.btn-pkg-folder').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await fetch('/api/open-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folder: 'handover_packages' })
            });
          } catch (e) {
            alert('폴더 열기 실패: ' + e.message);
          }
        });
      });

    } catch (e) {
      pkgsListContainer.innerHTML = `<div style="text-align:center; padding:20px; color:var(--accent-rose);">패키지 목록 로드 실패: ${e.message}</div>`;
    }
  }

  async function triggerPackageCreation() {
    if (btnCreateHandoverPackageInModal) {
      btnCreateHandoverPackageInModal.disabled = true;
      btnCreateHandoverPackageInModal.textContent = '⏳ 패키지 생성 및 압축 중...';
    }
    setButtonsDisabled(true);
    appendLog('INFO', '📦 에이전트 인수인계 통합 백업 패키지 생성을 시작합니다...');
    try {
      const res = await fetch('/api/conversations/package', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        appendLog('INFO', `✓ 인수인계 패키지 완성: ${data.zipName} (${(data.sizeBytes / (1024*1024)).toFixed(2)} MB, ${data.exportedConversationsCount}개 대화 수록)`);
        loadPackages();
      } else {
        appendLog('ERROR', `패키지 생성 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      appendLog('ERROR', `패키지 생성 통신 오류: ${e.message}`);
    } finally {
      if (btnCreateHandoverPackageInModal) {
        btnCreateHandoverPackageInModal.disabled = false;
        btnCreateHandoverPackageInModal.textContent = '📦 패키지 지금 생성';
      }
      setButtonsDisabled(false);
    }
  }

  if (btnCreateHandoverPackageInModal) btnCreateHandoverPackageInModal.addEventListener('click', triggerPackageCreation);
  if (btnRefreshPkgs) btnRefreshPkgs.addEventListener('click', loadPackages);
  if (btnOpenPkgsFolder) {
    btnOpenPkgsFolder.addEventListener('click', async () => {
      try {
        await fetch('/api/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: 'handover_packages' })
        });
      } catch (e) {}
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Init on Page Load
window.addEventListener('DOMContentLoaded', () => {
  setupEventSource();
  loadStatus();
  runDiagnose();
  setupSessionArchiveControls();
});


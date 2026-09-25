// AGY-Sync Master Frontend Controller

const elements = {
  hostName: document.getElementById('hostName'),
  userName: document.getElementById('userName'),
  scoreVal: document.getElementById('scoreVal'),
  scoreCircle: document.getElementById('scoreCircle'),
  metaTargetDir: document.getElementById('metaTargetDir'),
  metaGdrive: document.getElementById('metaGdrive'),
  metaBranch: document.getElementById('metaBranch'),
  btnRefreshStatus: document.getElementById('btnRefreshStatus'),
  btnShortcut: document.getElementById('btnShortcut'),

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
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    elements.hostName.textContent = data.hostname;
    elements.userName.textContent = data.username;
    elements.metaTargetDir.textContent = data.targetDir;
    elements.metaGdrive.textContent = `${data.gdriveRoot}\\${data.syncPackage}`;
    elements.metaBranch.textContent = data.branch;

    if (data.autoSync) {
      updateAutoSyncUI(data.autoSync);
    }
  } catch (e) {
    appendLog('WARN', `상태 로드 실패: ${e.message}`);
  }
}

// 3. Auto-Sync UI & Control
function updateAutoSyncUI(status) {
  elements.toggleAutoSync.checked = !!status.enabled;
  if (status.intervalSeconds) {
    elements.autoSyncInterval.value = status.intervalSeconds;
  }

  if (status.enabled) {
    elements.autoSyncBadge.textContent = '실시간 양방향 가동 중';
    elements.autoSyncBadge.className = 'auto-sync-badge badge-on';
    const busyText = status.isBusy ? ' (동기화 작업 수행 중...)' : '';
    const lastTime = status.lastSyncTime ? ` | 최근: ${new Date(status.lastSyncTime).toLocaleTimeString()}` : '';
    const resText = status.lastSyncResult ? ` (${status.lastSyncResult})` : '';
    elements.autoSyncDesc.textContent = `${status.intervalSeconds || 10}초마다 양방향 자동 감지 중: 타 PC 변경 시 즉시 Pull, 로컬 대화/설정 변경 시 자동 Push.${busyText}${lastTime}${resText}`;
  } else {
    elements.autoSyncBadge.textContent = '비활성화';
    elements.autoSyncBadge.className = 'auto-sync-badge badge-off';
    elements.autoSyncDesc.textContent = '다른 PC의 작업 업로드를 실시간 감지하여 자동 Pull하고, 내 PC의 대화/코드를 자동 Push합니다.';
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
      ${c.action ? `<div style="font-size:11px; color:var(--accent-amber); font-weight:600;">추천 조치: ${c.action}</div>` : ''}
    `;
    elements.checksGrid.appendChild(card);
  });
}

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

elements.btnClearLogs.addEventListener('click', () => {
  elements.terminalBody.innerHTML = '';
});

// Init on Page Load
window.addEventListener('DOMContentLoaded', () => {
  setupEventSource();
  loadStatus();
  runDiagnose();
});

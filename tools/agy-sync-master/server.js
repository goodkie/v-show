/**
 * Antigravity Multi-PC Universal Sync Dashboard Server
 * Native Node.js HTTP server (ZERO external npm dependencies)
 * Features: SSE live progress/logs, REST actions, and Real-Time Auto-Sync Daemon
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
let SyncEngine = require('./engine');

const PORT = process.env.PORT || 3900;
let engine = new SyncEngine();

function getEngine() {
  try {
    delete require.cache[require.resolve('./engine')];
    SyncEngine = require('./engine');
    engine = new SyncEngine();
    return engine;
  } catch (e) {
    return engine;
  }
}

// SSE Clients for real-time progress and logs
let sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(payload); } catch (e) {}
  });
}

const logger = {
  log: (msg) => broadcast('log', { level: 'INFO', message: msg, time: new Date().toLocaleTimeString() }),
  info: (msg) => broadcast('log', { level: 'INFO', message: msg, time: new Date().toLocaleTimeString() }),
  warn: (msg) => broadcast('log', { level: 'WARN', message: msg, time: new Date().toLocaleTimeString() }),
  error: (msg) => broadcast('log', { level: 'ERROR', message: msg, time: new Date().toLocaleTimeString() })
};

function sendProgress(percent, statusText) {
  broadcast('progress', { percent, statusText });
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME AUTO-SYNC MANAGER (DAEMON)
// ─────────────────────────────────────────────────────────────────────────────
// REAL-TIME HANDS-FREE AUTO-SYNC MANAGER (DAEMON)
// ─────────────────────────────────────────────────────────────────────────────
class AutoSyncManager {
  constructor(engine, broadcastFn, progressFn, loggerObj) {
    this.engine = engine;
    this.broadcast = broadcastFn;
    this.sendProgress = progressFn;
    this.logger = loggerObj;
    this.enabled = true; // Auto-sync active by default!
    this.intervalSeconds = 30; // Default: 30 seconds hands-free auto-sync
    this.timer = null;
    this.countdownTimer = null;
    this.nextCheckTime = null;
    this.isBusy = false;
    this.stateFile = path.join(__dirname, 'sync_state.json');
    this.state = this.loadState();
    this.lastSyncResult = '핸드프리 전자동 동기화 대기 중 (30초 주기)';
    this.lastSyncTime = null;
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      }
    } catch (e) {}
    return {
      lastPulledManifestTime: null,
      lastLocalConversationMtime: this.getLocalConversationMtime(),
      lastLocalGitCommit: this.getLocalGitCommit()
    };
  }

  saveState() {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {}
  }

  get lastLocalConversationMtime() { return this.state.lastLocalConversationMtime || 0; }
  set lastLocalConversationMtime(v) { this.state.lastLocalConversationMtime = v; this.saveState(); }
  get lastLocalGitCommit() { return this.state.lastLocalGitCommit || ''; }
  set lastLocalGitCommit(v) { this.state.lastLocalGitCommit = v; this.saveState(); }
  get lastKnownRemotePush() { return this.state.lastPulledManifestTime || null; }
  set lastKnownRemotePush(v) { this.state.lastPulledManifestTime = v; this.saveState(); }

  getRemotePushTimestamp() {
    try {
      const manifestPath = path.join(this.engine.getSyncPackagePath(), 'sync_manifest.json');
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        return JSON.parse(raw).pushedAt || null;
      }
    } catch (e) {}
    return null;
  }

  getLocalConversationMtime() {
    let maxMtime = 0;
    try {
      const agyRoots = this.engine.getAgyRoots();
      for (const root of agyRoots) {
        // 1. conversation_summaries.db
        const dbPath = path.join(root, 'conversation_summaries.db');
        if (fs.existsSync(dbPath)) {
          try {
            const m = fs.statSync(dbPath).mtimeMs;
            if (m > maxMtime) maxMtime = m;
          } catch (e) {}
        }
        // 2. conversations/*.db (actual turns and messages)
        const convDir = path.join(root, 'conversations');
        if (fs.existsSync(convDir)) {
          try {
            const files = fs.readdirSync(convDir);
            for (const file of files) {
              if (file.endsWith('.db') || file.endsWith('.db-wal') || file.endsWith('.db-shm')) {
                try {
                  const m = fs.statSync(path.join(convDir, file)).mtimeMs;
                  if (m > maxMtime) maxMtime = m;
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
        // 2b. brain transcripts and logs
        const brainDir = path.join(root, 'brain');
        if (fs.existsSync(brainDir)) {
          try {
            const bDirs = fs.readdirSync(brainDir);
            for (const bd of bDirs) {
              const tLog = path.join(brainDir, bd, '.system_generated', 'logs', 'transcript.jsonl');
              if (fs.existsSync(tLog)) {
                try {
                  const m = fs.statSync(tLog).mtimeMs;
                  if (m > maxMtime) maxMtime = m;
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
        // 3. antigravity_state.pbtxt
        const pbtxt = path.join(root, 'antigravity_state.pbtxt');
        if (fs.existsSync(pbtxt)) {
          try {
            const m = fs.statSync(pbtxt).mtimeMs;
            if (m > maxMtime) maxMtime = m;
          } catch (e) {}
        }
      }
      // 4. settings.json (VS Code / Antigravity IDE)
      const configDirs = this.engine.getConfigDirs();
      for (const cDir of configDirs) {
        const setFile = path.join(cDir, 'User', 'settings.json');
        if (fs.existsSync(setFile)) {
          try {
            const m = fs.statSync(setFile).mtimeMs;
            if (m > maxMtime) maxMtime = m;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return maxMtime;
  }

  getLocalGitCommit() {
    try {
      const paths = this.engine.getPaths();
      const headFile = path.join(paths.fastTrackDir, '.git', 'refs', 'heads', this.engine.defaultBranch);
      if (fs.existsSync(headFile)) return fs.readFileSync(headFile, 'utf8').trim();
    } catch (e) {}
    return '';
  }

  getStatus() {
    const now = Date.now();
    const remaining = this.nextCheckTime ? Math.max(0, Math.round((this.nextCheckTime - now) / 1000)) : 0;
    return {
      enabled: this.enabled,
      intervalSeconds: this.intervalSeconds,
      isBusy: this.isBusy,
      lastSyncTime: this.lastSyncTime,
      lastSyncResult: this.lastSyncResult,
      nextCheckInSeconds: remaining,
      lastKnownRemotePush: this.getRemotePushTimestamp()
    };
  }

  start(intervalSeconds = 30) {
    this.enabled = true;
    this.intervalSeconds = Math.max(10, parseInt(intervalSeconds, 10) || 30);
    if (this.timer) clearInterval(this.timer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.logger.info(`[AUTO-SYNC] 핸드프리 전자동 동기화 데몬 활성화됨 (기본 주기: ${this.intervalSeconds}초)`);
    this.nextCheckTime = Date.now() + 2000;
    this.broadcast('auto-sync-status', this.getStatus());

    // Main sync loop
    this.timer = setInterval(() => {
      this.nextCheckTime = Date.now() + (this.intervalSeconds * 1000);
      this.tick();
    }, this.intervalSeconds * 1000);

    // Fast status broadcast for UI countdown (every 3 seconds)
    this.countdownTimer = setInterval(() => {
      if (this.enabled && !this.isBusy) {
        this.broadcast('auto-sync-status', this.getStatus());
      }
    }, 3000);

    // Initial immediate catch-up tick after 2s
    setTimeout(() => {
      this.nextCheckTime = Date.now() + (this.intervalSeconds * 1000);
      this.tick();
    }, 2000);
  }

  stop() {
    this.enabled = false;
    if (this.timer) clearInterval(this.timer);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.timer = null;
    this.countdownTimer = null;
    this.nextCheckTime = null;
    this.logger.info('[AUTO-SYNC] 핸드프리 전자동 동기화 일시정지됨');
    this.broadcast('auto-sync-status', this.getStatus());
  }

  async tick() {
    if (!this.enabled || this.isBusy) return;
    this.isBusy = true;
    this.engine = getEngine();
    this.broadcast('auto-sync-status', this.getStatus());

    try {
      const paths = this.engine.getPaths();
      const fastTrackDir = paths.fastTrackDir;
      let pulledSomething = false;

      // 1. [개발 코드] GitHub 원격지 변경사항 자동 감지 & 핸드프리 Pull
      if (fs.existsSync(path.join(fastTrackDir, '.git'))) {
        try {
          this.engine.setupGitAuth(this.logger);
          // Fetch quietly without modifying working copy
          const fetchRes = await this.engine.runCommand('git', ['fetch', 'origin', this.engine.defaultBranch, '--quiet'], fastTrackDir, this.logger);
          if (fetchRes.code === 0) {
            // Check if remote is ahead of local HEAD
            const revRes = await this.engine.runCommand('git', ['rev-list', '--count', `HEAD..origin/${this.engine.defaultBranch}`], fastTrackDir, this.logger);
            const aheadCount = parseInt((revRes.stdout || '').trim(), 10) || 0;
            if (aheadCount > 0) {
              this.logger.info(`[AUTO-SYNC] GitHub 원격 신규 커밋(${aheadCount}개) 감지됨 -> 핸드프리 자동 Pull 실행`);
              this.sendProgress(15, `[전자동 동기화] GitHub 신규 커밋(${aheadCount}개) 자동 수신 중...`);
              await this.engine.pullSync(this.sendProgress, this.logger);
              pulledSomething = true;
              this.lastSyncResult = `GitHub 신규 커밋(${aheadCount}개) 자동 수신 완료`;
              this.lastSyncTime = new Date().toISOString();
              this.state.lastLocalGitCommit = this.getLocalGitCommit();
              this.state.lastLocalConversationMtime = this.getLocalConversationMtime();
              this.saveState();
              this.sendProgress(100, `[전자동 동기화] 최신 코드 반영 완료 (${new Date().toLocaleTimeString()})`);
            }
          }
        } catch (gitErr) {
          this.logger.warn(`[AUTO-SYNC] Git 원격 감지 확인 중 알림: ${gitErr.message}`);
        }
      }

      // 2. [대화/브레인] Google Drive 원격지 신규 업로드 감지 & 핸드프리 Pull
      const manifestPath = path.join(this.engine.getSyncPackagePath(), 'sync_manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(raw);
          if (manifest.pushedAt) {
            const isFromOtherMachine = manifest.sourceMachine && manifest.sourceMachine !== os.hostname();
            const isNewerThanLastPulled = manifest.pushedAt !== this.state.lastPulledManifestTime;

            if (isFromOtherMachine && isNewerThanLastPulled && !pulledSomething) {
              this.logger.info(`[AUTO-SYNC] 타 PC(${manifest.sourceMachine}) 신규 대화/브레인 감지 (${manifest.pushedAt}) -> 핸드프리 자동 Pull 실행`);
              this.sendProgress(20, `[전자동 동기화] ${manifest.sourceMachine}의 최신 대화/브레인 자동 수신 중...`);
              await this.engine.pullSync(this.sendProgress, this.logger);
              this.state.lastPulledManifestTime = manifest.pushedAt;
              this.lastSyncResult = `타 PC(${manifest.sourceMachine}) 대화/브레인 자동 수신 완료`;
              this.lastSyncTime = new Date().toISOString();
              this.state.lastLocalConversationMtime = this.getLocalConversationMtime();
              this.saveState();
              this.sendProgress(100, `[전자동 동기화] 최신 세션 수신 완료 (${new Date().toLocaleTimeString()})`);
              pulledSomething = true;
            } else if (!isFromOtherMachine) {
              this.state.lastPulledManifestTime = manifest.pushedAt;
              this.saveState();
            }
          }
        } catch (mErr) {
          this.logger.warn(`[AUTO-SYNC] 매니페스트 확인 알림: ${mErr.message}`);
        }
      }

      // 3. [로컬 변경사항] 로컬 대화/세션/설정 변경 또는 로컬 미푸시 커밋 감지 -> 핸드프리 전자동 Push
      if (!pulledSomething) {
        const currentConvMtime = this.getLocalConversationMtime();
        const currentGitCommit = this.getLocalGitCommit();

        // Check unpushed commits
        let unpushedCount = 0;
        try {
          const unpushedRes = await this.engine.runCommand('git', ['rev-list', '--count', `origin/${this.engine.defaultBranch}..HEAD`], fastTrackDir, this.logger);
          unpushedCount = parseInt((unpushedRes.stdout || '').trim(), 10) || 0;
        } catch (e) {}

        const convChanged = currentConvMtime > ((this.state.lastLocalConversationMtime || 0) + 3000);
        const gitChanged = unpushedCount > 0 || (currentGitCommit && currentGitCommit !== this.state.lastLocalGitCommit);

        if (convChanged || gitChanged) {
          const changeReasons = [];
          if (convChanged) changeReasons.push('대화/세션 변경');
          if (gitChanged) changeReasons.push(`신규 커밋(${unpushedCount}개)`);

          this.logger.info(`[AUTO-SYNC] 로컬 작업 변경 감지 [${changeReasons.join(', ')}] -> GitHub 및 Google Drive 전자동 Push 실행`);
          this.sendProgress(20, `[전자동 동기화] 로컬 변경사항(${changeReasons.join(', ')}) 클라우드 백업 중...`);
          await this.engine.pushSync(this.sendProgress, this.logger);
          this.state.lastLocalConversationMtime = currentConvMtime;
          this.state.lastLocalGitCommit = currentGitCommit;
          this.state.lastPulledManifestTime = this.getRemotePushTimestamp();
          this.lastSyncResult = `로컬 변경사항 [${changeReasons.join(', ')}] 클라우드 자동 Push 완료`;
          this.lastSyncTime = new Date().toISOString();
          this.saveState();
          this.sendProgress(100, `[전자동 동기화] 클라우드 백업 완료 (${new Date().toLocaleTimeString()})`);
        }
      }
    } catch (err) {
      this.logger.warn(`[AUTO-SYNC] 점검 중 예외: ${err.message}`);
      this.lastSyncResult = `오류: ${err.message}`;
    } finally {
      this.isBusy = false;
      this.broadcast('auto-sync-status', this.getStatus());
    }
  }
}

const autoSync = new AutoSyncManager(engine, broadcast, sendProgress, logger);

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. SSE Stream for Real-time Progress & Logs
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': ping\n\n');
    sseClients.push(res);
    // Send initial auto-sync status
    res.write(`event: auto-sync-status\ndata: ${JSON.stringify(autoSync.getStatus())}\n\n`);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // 2. Status API
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hostname: os.hostname(),
      username: engine.username,
      targetDir: engine.targetDir,
      paths: engine.getPaths(),
      gdriveRoot: engine.gdriveRoot,
      syncPackage: engine.syncPackageName,
      branch: engine.defaultBranch,
      autoSync: autoSync.getStatus(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 3. Auto-Sync Control API (GET/POST)
  if (pathname === '/api/auto-sync') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          if (data.action === 'start') {
            autoSync.start(data.intervalSeconds || 30);
          } else if (data.action === 'stop') {
            autoSync.stop();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(autoSync.getStatus()));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(autoSync.getStatus()));
      return;
    }
  }

  // 4. Diagnose API
  if (pathname === '/api/diagnose') {
    try {
      const isDeep = parsedUrl.searchParams.get('deep') === '1';
      const report = await getEngine().diagnose(logger, isDeep);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 5. Remap Paths API
  if (pathname === '/api/remap' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      sendProgress(20, '경로 동적 리매핑 시작...');
      const out = await getEngine().remapPaths(logger);
      sendProgress(100, '경로 동적 리매핑 완료');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 6. Setup New PC API
  if (pathname === '/api/setup' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      const out = await getEngine().setupNewPc(sendProgress, logger);
      // 신규 PC 설치 완료 후 현재 파일 상태를 기준점으로 동기화하여 직후 불필요한 push 방지
      autoSync.lastLocalConversationMtime = autoSync.getLocalConversationMtime();
      autoSync.lastLocalGitCommit = autoSync.getLocalGitCommit();
      autoSync.lastKnownRemotePush = autoSync.getRemotePushTimestamp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`설치 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 7. Auto Recover API
  if (pathname === '/api/recover' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      sendProgress(30, '손상 팩파일 격리 및 Git Refetch 중...');
      const out = await getEngine().autoRecover(logger);
      sendProgress(100, 'Git 데이터베이스 복구 완료');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`복구 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 8. Push API
  if (pathname === '/api/push' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      const out = await getEngine().pushSync(sendProgress, logger);
      autoSync.lastLocalConversationMtime = autoSync.getLocalConversationMtime();
      autoSync.lastLocalGitCommit = autoSync.getLocalGitCommit();
      autoSync.lastKnownRemotePush = autoSync.getRemotePushTimestamp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`Push 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 9. Pull API
  if (pathname === '/api/pull' && req.method === 'POST') {
    autoSync.isBusy = true;
    // Snapshot engine.js mtime before pull to detect if it changed
    const enginePath = path.join(__dirname, 'engine.js');
    let engineMtimeBefore = 0;
    try { engineMtimeBefore = fs.statSync(enginePath).mtimeMs; } catch (e) {}

    try {
      const out = await getEngine().pullSync(sendProgress, logger);
      autoSync.lastLocalConversationMtime = autoSync.getLocalConversationMtime();
      autoSync.lastLocalGitCommit = autoSync.getLocalGitCommit();
      autoSync.lastKnownRemotePush = autoSync.getRemotePushTimestamp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));

      // If engine.js was updated by git pull → auto-restart server after 3s
      let engineMtimeAfter = 0;
      try { engineMtimeAfter = fs.statSync(enginePath).mtimeMs; } catch (e) {}
      if (engineMtimeAfter > engineMtimeBefore) {
        logger.info('');
        logger.info('🔄 engine.js가 업데이트되었습니다. 3초 후 서버를 자동 재시작합니다...');
        broadcast('log', { level: 'WARN', message: '🔄 새 버전의 엔진이 감지되었습니다. 3초 후 자동 재시작됩니다. 브라우저 창은 그대로 두세요.', time: new Date().toLocaleTimeString() });
        setTimeout(() => {
          logger.info('🔄 서버 재시작 중...');
          process.exit(0); // launcher CMD will restart automatically if wrapped in a loop
        }, 3000);
      }
    } catch (e) {
      logger.error(`Pull 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 10. Create Desktop Shortcut API
  if (pathname === '/api/shortcut' && req.method === 'POST') {
    try {
      const launcherPath = path.join(__dirname, 'AGY-Sync-Master.cmd');
      const vbsPath = path.join(__dirname, 'Launch_AGY_Sync_Master.vbs');
      const targetExec = fs.existsSync(vbsPath) ? vbsPath : launcherPath;
      const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\\AGY-Sync Master.lnk")
$Shortcut.TargetPath = "${targetExec.replace(/\\/g, '\\\\')}"
$Shortcut.WorkingDirectory = "${__dirname.replace(/\\/g, '\\\\')}"
$Shortcut.Description = "AGY-Sync Master Universal Dashboard"
$Shortcut.Save()
`;
      const { execSync } = require('child_process');
      execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, '; ')}"`, { stdio: 'ignore' });
      logger.info('  ✓ Windows 바탕화면에 [AGY-Sync Master] 바로가기 생성 완료');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      logger.error(`바로가기 생성 실패: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 11. Unblock History (🚫) API
  if (pathname === '/api/unblock' && req.method === 'POST') {
    try {
      sendProgress(20, '대화 히스토리 및 워크스페이스 동기화 준비 중...');
      const eng = getEngine();
      sendProgress(50, 'SQLite 세션 워크스페이스 매핑 및 🚫 잠금 해제 중...');
      const remapRes = await eng.remapPaths(logger);
      sendProgress(100, '대화창 🚫 금지표시 해제 및 대화 히스토리 전체 동기화 완료!');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, remapRes }));
    } catch (e) {
      logger.error(`대화창 언락 실패: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 12. Install Python & OpenCV (cv2) API
  if (pathname === '/api/install-opencv' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      const out = await getEngine().installOpenCv(sendProgress, logger);
      res.writeHead(out.success ? 200 : 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`OpenCV 설치 중 오류: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 13. Setup GitHub Auth API
  if (pathname === '/api/setup-git-auth' && req.method === 'POST') {
    try {
      sendProgress(30, 'Google Drive에서 GitHub 원격 인증 토큰 탐색 중...');
      const eng = getEngine();
      const ok = eng.setupGitAuth(logger);
      sendProgress(100, ok ? 'GitHub 인증 연동 완료! Git Push가 즉시 활성화되었습니다.' : 'GitHub 토큰을 찾을 수 없습니다.');
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: ok }));
    } catch (e) {
      logger.error(`GitHub 인증 연동 실패: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 14. Project Path & Configuration API (GET/POST)
  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      const eng = getEngine();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        targetDir: eng.targetDir,
        paths: eng.getPaths(),
        activeProject: eng.activeProject,
        userConfig: eng.loadUserConfig()
      }));
      return;
    }
    if (req.method === 'POST') {
      autoSync.isBusy = true;
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.targetDir) {
            throw new Error('targetDir 경로가 지정되지 않았습니다.');
          }
          sendProgress(20, '지정된 새 프로젝트 경로 구성 및 검증 중...');
          const eng = getEngine();
          const out = await eng.setCustomTargetDir(payload.targetDir, { activeProject: payload.activeProject }, logger);
          sendProgress(100, `프로젝트 경로 변경 및 환경 리매핑 완료 (${out.paths.fastTrackDir})`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        } catch (e) {
          logger.error(`경로 설정 변경 실패: ${e.message}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        } finally {
          autoSync.isBusy = false;
          autoSync.broadcast('auto-sync-status', autoSync.getStatus());
        }
      });
      return;
    }
  }

  // 15. Clean Uninstall & Reset API (POST)
  if (pathname === '/api/uninstall' && req.method === 'POST') {
    autoSync.isBusy = true;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        sendProgress(20, '로컬 설치 및 워크트리 안전 제거 진행 중...');
        const eng = getEngine();
        const out = await eng.cleanUninstall({
          removeWorktree: payload.removeWorktree !== false,
          removeMainRepo: payload.removeMainRepo === true,
          resetConfig: payload.resetConfig === true
        }, logger);
        sendProgress(100, '로컬 설치 제거 및 초기화 완료');
        res.writeHead(out.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      } catch (e) {
        logger.error(`설치 제거 중 오류: ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      } finally {
        autoSync.isBusy = false;
        autoSync.broadcast('auto-sync-status', autoSync.getStatus());
      }
    });
    return;
  }

  // 16. List All Conversations API (GET)
  if (pathname === '/api/conversations' && req.method === 'GET') {
    try {
      const eng = getEngine();
      const convs = eng.listConversations();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(convs));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 17. Export Conversation to Markdown API (POST)
  if (pathname === '/api/conversations/export' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!data.convId) throw new Error('대화 세션 ID (convId)가 지정되지 않았습니다.');
        const eng = getEngine();
        const resData = eng.exportConversation(data.convId);
        logger.info(`  ✓ 대화 세션 프로젝트 문서화 저장 완료: ${resData.relPath}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resData));
      } catch (e) {
        logger.error(`대화 문서화 실패: ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 18. List Archived Sessions in Project API (GET)
  if (pathname === '/api/conversations/archived' && req.method === 'GET') {
    try {
      const eng = getEngine();
      const sessions = eng.listArchivedSessions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sessions));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 19. Get Conversation/Archived Session Content API (GET)
  if (pathname === '/api/conversations/content' && req.method === 'GET') {
    try {
      const eng = getEngine();
      const paths = eng.getPaths();
      const fileParam = parsedUrl.searchParams.get('file');
      const idParam = parsedUrl.searchParams.get('id');

      let targetPath = null;
      if (fileParam) {
        targetPath = path.isAbsolute(fileParam) ? fileParam : path.join(paths.fastTrackDir, fileParam);
      } else if (idParam) {
        const expRes = eng.exportConversation(idParam);
        targetPath = expRes.filePath;
      }

      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new Error('요청한 대화 세션 마크다운 문서를 찾을 수 없습니다.');
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        filename: path.basename(targetPath),
        filePath: targetPath,
        relPath: path.relative(paths.fastTrackDir, targetPath).replace(/\\/g, '/'),
        content
      }));
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 20. Create Agent Handover Package API (POST)
  if (pathname === '/api/conversations/package' && req.method === 'POST') {
    autoSync.isBusy = true;
    try {
      sendProgress(20, '대화 및 프로젝트 Git 상태 수집 중...');
      const eng = getEngine();
      logger.info('📦 에이전트 인수인계 통합 백업 패키지 생성 시작...');
      sendProgress(50, 'Master Resume Prompt 및 세션 데이터 압축 중...');
      const pkgInfo = eng.createHandoverPackage();
      sendProgress(100, `인수인계 백업 패키지 생성 완료 (${pkgInfo.zipName})`);
      logger.info(`  ✓ 인수인계 패키지 생성 완료: ${pkgInfo.zipName} (${(pkgInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pkgInfo));
    } catch (e) {
      logger.error(`인수인계 패키지 생성 실패: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    } finally {
      autoSync.isBusy = false;
      autoSync.broadcast('auto-sync-status', autoSync.getStatus());
    }
    return;
  }

  // 21. List Packages API (GET)
  if (pathname === '/api/conversations/packages' && req.method === 'GET') {
    try {
      const eng = getEngine();
      const pkgs = eng.listPackages();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pkgs));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 22. Download Handover Package API (GET)
  if (pathname === '/api/download-package' && req.method === 'GET') {
    try {
      const pkgName = parsedUrl.searchParams.get('name');
      if (!pkgName || !pkgName.endsWith('.zip')) throw new Error('잘못된 패키지 파일명입니다.');
      const eng = getEngine();
      const paths = eng.getPaths();
      const zipPath = path.join(paths.fastTrackDir, 'handover_packages', path.basename(pkgName));
      if (!fs.existsSync(zipPath)) throw new Error('패키지 파일을 찾을 수 없습니다.');

      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${path.basename(zipPath)}"`,
        'Content-Length': fs.statSync(zipPath).size
      });
      fs.createReadStream(zipPath).pipe(res);
      return;
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Package not found: ' + e.message);
      return;
    }
  }

  // 23. Open In Editor API (POST)
  if (pathname === '/api/open-in-editor' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!data.file) throw new Error('열 파일 경로가 지정되지 않았습니다.');
        const eng = getEngine();
        const resOut = eng.openInEditor(data.file);
        logger.info(`  ✓ 에디터에서 파일 열기 완료: ${path.basename(data.file)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resOut));
      } catch (e) {
        logger.error(`에디터 열기 실패: ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 24. Open Folder in Explorer API (POST)
  if (pathname === '/api/open-folder' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const eng = getEngine();
        const resOut = eng.openFolder(data.folder);
        logger.info(`  ✓ 탐색기에서 폴더 열기 완료: ${resOut.path}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resOut));
      } catch (e) {
        logger.error(`탐색기 열기 실패: ${e.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

function openAppWindow(port) {
  if (process.argv.includes('--no-open')) return;
  const url = `http://localhost:${port}`;
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];

  let browserExe = null;
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { browserExe = p; break; }
  }
  if (!browserExe) {
    for (const p of chromePaths) {
      if (fs.existsSync(p)) { browserExe = p; break; }
    }
  }

  try {
    if (browserExe) {
      const { spawn } = require('child_process');
      spawn(browserExe, [`--app=${url}`, '--window-size=1260,880'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const { exec } = require('child_process');
      exec(`start "" "${url}"`);
    }
  } catch (e) {}
}

function startServer(portToTry) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[INFO] 포트 ${portToTry} 사용 중 (기존 실행 인스턴스 감지됨). 앱 윈도우를 호출합니다.`);
      openAppWindow(portToTry);
      process.exit(0);
    } else {
      console.error(`서버 시작 오류: ${err.message}`);
    }
  });

  server.listen(portToTry, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`  [AGY-Sync Master] Universal Multi-PC Dashboard Active!`);
    console.log(`  Local URL:   http://localhost:${portToTry}`);
    console.log(`  Network URL: http://${getLocalIp()}:${portToTry}`);
    console.log(`  Auto-Sync:   [ACTIVE] 30초 주기 핸드프리 전자동 동기화 가동 중`);
    console.log(`               개발 코드(Git) 및 AI 대화(Brain/DB) 실시간 전자동 연동`);
    console.log(`================================================================`);
    openAppWindow(portToTry);
    // Start real-time background sync daemon automatically with 30s default interval
    autoSync.start(30);
  });
}

startServer(PORT);

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

module.exports = { server, autoSync };


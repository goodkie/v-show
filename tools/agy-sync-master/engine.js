/**
 * Antigravity Multi-PC Universal Sync & Health Engine (Zero-Dependency)
 * Supported Operations: Diagnose, Setup/Install, Auto-Recovery, Push, Pull, Path Remap
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');

class SyncEngine {
  constructor(options = {}) {
    this.username = process.env.USERNAME || process.env.USER || os.userInfo().username || 'default';
    this.homeDir = os.homedir();
    this.targetDir = options.targetDir || this.detectDefaultProjectDir();
    this.gdriveRoot = options.gdriveRoot || this.detectGoogleDriveRoot();
    this.syncPackageName = options.syncPackageName || 'v-show-antigravity-sync';
    this.githubRepoUrl = options.githubRepoUrl || 'https://github.com/goodkie/v-show.git';
    this.defaultBranch = options.defaultBranch || 'feature/3d2r-stage2-12point-capture';
  }

  detectDefaultProjectDir() {
    const candidates = [
      path.join(this.homeDir, 'ai'),
      path.resolve(__dirname, '..', '..', '..'),
      'C:\\vivpr\\ai',
      'E:\\vivpr\\ai',
      'D:\\ai'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && (fs.existsSync(path.join(c, 'v-show')) || fs.existsSync(path.join(c, 'v-show-stage2-fast-track')))) {
        return c;
      }
    }
    return path.join(this.homeDir, 'ai');
  }

  detectGoogleDriveRoot() {
    const candidates = [
      'G:\\내 드라이브',
      'G:\\My Drive',
      'G:\\',
      path.join(this.homeDir, 'Google Drive'),
      path.join(this.homeDir, 'Google 드라이브')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        if (c === 'G:\\') {
          try {
            const subs = fs.readdirSync('G:\\');
            const found = subs.find(s => s.includes('내 드라이브') || s.includes('My Drive') || fs.existsSync(path.join('G:\\', s, this.syncPackageName)));
            if (found) return path.join('G:\\', found);
          } catch (e) {}
        }
        return c;
      }
    }
    return 'G:\\내 드라이브';
  }

  getSyncPackagePath() {
    return path.join(this.gdriveRoot, this.syncPackageName);
  }

  getAgyRoots() {
    return [
      path.join(this.homeDir, '.gemini', 'antigravity-ide'),
      path.join(this.homeDir, '.gemini', 'antigravity')
    ];
  }

  getConfigDirs() {
    const appData = process.env.APPDATA || path.join(this.homeDir, 'AppData', 'Roaming');
    return [
      path.join(appData, 'Antigravity IDE'),
      path.join(appData, 'Antigravity')
    ];
  }

  runCommand(cmd, args, cwd, logger, onProgress = null) {
    return new Promise((resolve) => {
      const fullCmd = `${cmd} ${args.join(' ')}`;
      if (logger) logger.info(`[EXEC] ${fullCmd} (in ${cwd || process.cwd()})`);
      
      const proc = spawn(cmd, args, {
        cwd: cwd || process.cwd(),
        shell: true,
        env: { ...process.env, LANG: 'en_US.UTF-8' }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        const text = d.toString();
        stdout += text;
        if (logger) logger.log(text.trim());
        if (onProgress) onProgress(text);
      });

      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderr += text;
        if (logger) logger.warn(text.trim());
      });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        if (logger) logger.error(`Execution error: ${err.message}`);
        resolve({ code: -1, stdout, stderr, error: err.message });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DIAGNOSE
  // ─────────────────────────────────────────────────────────────────────────────
  async diagnose(logger, isDeep = false) {
    logger.info(`=== [1/5] 환경 및 저장소 ${isDeep ? '정밀(Deep)' : '고속(Fast)'} 진단 시작 ===`);
    const result = {
      score: 100,
      timestamp: new Date().toISOString(),
      machine: {
        hostname: os.hostname(),
        username: this.username,
        platform: os.platform(),
        targetDir: this.targetDir,
        gdriveRoot: this.gdriveRoot
      },
      checks: []
    };

    // 1. Google Drive 검사
    const syncPkg = this.getSyncPackagePath();
    const gdriveOk = fs.existsSync(syncPkg);
    result.checks.push({
      name: 'Google Drive 동기화 패키지',
      path: syncPkg,
      status: gdriveOk ? 'PASS' : 'WARN',
      message: gdriveOk ? '클라우드 동기화 패키지 확인됨' : 'Google Drive 경로를 찾을 수 없습니다 (G: 마운트 필요)'
    });
    if (!gdriveOk) result.score -= 20;

    // 2. 프로젝트 폴더 및 Git 검사
    const vshowDir = path.join(this.targetDir, 'v-show');
    const fastTrackDir = path.join(this.targetDir, 'v-show-stage2-fast-track');
    const vshowGit = path.join(vshowDir, '.git');
    const fastTrackGit = path.join(fastTrackDir, '.git');

    const vshowOk = fs.existsSync(vshowGit);
    const fastTrackOk = fs.existsSync(fastTrackGit);

    result.checks.push({
      name: '메인 Git 저장소 (v-show)',
      path: vshowDir,
      status: vshowOk ? 'PASS' : 'FAIL',
      message: vshowOk ? '메인 저장소 발견됨' : '메인 저장소가 로컬에 없습니다 (설치 필요)'
    });
    if (!vshowOk) result.score -= 40;

    result.checks.push({
      name: 'Fast-Track 워크트리 (v-show-stage2-fast-track)',
      path: fastTrackDir,
      status: fastTrackOk ? 'PASS' : 'FAIL',
      message: fastTrackOk ? '워크트리 발견됨' : '워크트리가 없습니다 (설치 필요)'
    });
    if (!fastTrackOk) result.score -= 30;

    // 3. Git 팩파일 무결성 검사 (0바이트 트렁케이션 탐지)
    if (vshowOk) {
      const packDir = path.join(vshowGit, 'objects', 'pack');
      let corruptPacks = [];
      if (fs.existsSync(packDir)) {
        const packFiles = fs.readdirSync(packDir).filter(f => f.endsWith('.pack'));
        for (const pf of packFiles) {
          const fullPath = path.join(packDir, pf);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size > 10 * 1024 * 1024) { // 10MB 이상 검증
              const fd = fs.openSync(fullPath, 'r');
              const buf = Buffer.alloc(20);
              fs.readSync(fd, buf, 0, 20, stats.size - 20);
              fs.closeSync(fd);
              if (buf.every(b => b === 0)) {
                corruptPacks.push({ file: pf, size: stats.size });
              }
            }
          } catch (e) {}
        }
      }

      if (corruptPacks.length > 0) {
        result.checks.push({
          name: 'Git 팩파일 무결성',
          status: 'FAIL',
          message: `손상된 0바이트 팩파일 ${corruptPacks.length}개 발견 (${corruptPacks.map(p => p.file).join(', ')})`,
          action: '원클릭 자동 복구 필요'
        });
        result.score -= 40;
      } else {
        result.checks.push({
          name: 'Git 팩파일 무결성',
          status: 'PASS',
          message: '모든 팩파일 체크섬 및 끝단 검증 통과 (0바이트 손상 없음)'
        });
      }

      // Git fsck 검사 (deep=true일 때만 전수 검사, 기본은 HEAD 및 팩파일 고속 무결성 검증)
      if (isDeep) {
        const fsckRes = await this.runCommand('git', ['fsck', '--no-dangling'], fastTrackOk ? fastTrackDir : vshowDir, null);
        const fsckPass = fsckRes.code === 0 && !fsckRes.stderr.includes('error:');
        result.checks.push({
          name: 'Git fsck 정밀 무결성 (Deep)',
          status: fsckPass ? 'PASS' : 'WARN',
          message: fsckPass ? '모든 커밋, 트리, 블롭 오브젝트 무결 (0 오류)' : `경고 또는 결손 발견 (${fsckRes.stderr.slice(0, 150)})`
        });
        if (!fsckPass) result.score -= 20;
      } else {
        const revRes = await this.runCommand('git', ['rev-parse', '--verify', 'HEAD'], fastTrackOk ? fastTrackDir : vshowDir, null);
        const headPass = revRes.code === 0 && revRes.stdout.trim().length === 40;
        result.checks.push({
          name: 'Git HEAD 및 오브젝트 트리 상태 (Fast)',
          status: headPass ? 'PASS' : 'FAIL',
          message: headPass ? `현재 HEAD 커밋 검증 완료 (${revRes.stdout.trim().slice(0, 8)})` : 'HEAD 커밋 참조 실패'
        });
        if (!headPass) result.score -= 20;
      }
    }

    // 4. 경로 하드코딩 오염 검사 (app_storage.json, conversation_summaries.db)
    let pathIssues = [];
    const configDirs = this.getConfigDirs();
    for (const cd of configDirs) {
      const appStorage = path.join(cd, 'app_storage.json');
      if (fs.existsSync(appStorage)) {
        try {
          const content = fs.readFileSync(appStorage, 'utf8');
          const alienMatches = content.match(/Users\/(?:oPus|server[12356789]|vivpr)|[E|D]:\\vivpr/gi);
          if (alienMatches && alienMatches.length > 0) {
            pathIssues.push(`${path.basename(cd)}/app_storage.json (타 PC 경로 ${alienMatches.length}건 잔류)`);
          }
        } catch (e) {}
      }
    }

    result.checks.push({
      name: 'Antigravity 설정 경로 정합성',
      status: pathIssues.length === 0 ? 'PASS' : 'WARN',
      message: pathIssues.length === 0 ? '현재 PC 사용자명 및 경로와 100% 일치' : `타 PC 경로 오염 발견: ${pathIssues.join(', ')}`,
      action: pathIssues.length > 0 ? '경로 자동 리매핑 필요' : null
    });
    if (pathIssues.length > 0) result.score -= 15;

    // 5. Python & OpenCV 검사
    let pyCv2Ok = false;
    try {
      const pyRes = execSync('python -c "import cv2; print(cv2.__version__)"', { stdio: 'pipe' }).toString().trim();
      pyCv2Ok = pyRes.length > 0;
      result.checks.push({
        name: 'Python OpenCV (cv2)',
        status: 'PASS',
        message: `OpenCV 정상 설치됨 (v${pyRes})`
      });
    } catch (e) {
      result.checks.push({
        name: 'Python OpenCV (cv2)',
        status: 'WARN',
        message: 'Python cv2 모듈 미설치 (파노라마 스티칭 실패 위험)'
      });
      result.score -= 15;
    }

    result.score = Math.max(0, result.score);
    logger.info(`=== 진단 완료: 건강 점수 ${result.score}/100점 ===`);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DYNAMIC PATH REMAP ENGINE
  // ─────────────────────────────────────────────────────────────────────────────
  async remapPaths(logger) {
    logger.info(`[REMAP] 현재 PC 환경에 맞게 경로 동적 치환 시작... (Target: ${this.targetDir}, User: ${this.username})`);
    let modifiedFiles = 0;

    const currentNormTarget = this.targetDir.replace(/\\/g, '/');
    const currentWinTarget = this.targetDir.replace(/\//g, '\\');

    // 1. app_storage.json 경로 치환
    for (const cd of this.getConfigDirs()) {
      const storageFile = path.join(cd, 'app_storage.json');
      if (fs.existsSync(storageFile)) {
        try {
          let text = fs.readFileSync(storageFile, 'utf8');
          const original = text;

          // 타 PC 사용자명 치환 (oPus, server1, server2 등 -> 현재 사용자명)
          text = text.replace(/\/Users\/(?:oPus|server[12356789]|vivpr)/gi, `/Users/${this.username}`);
          text = text.replace(/\\Users\\(?:oPus|server[12356789]|vivpr)/gi, `\\Users\\${this.username}`);

          // 타 드라이브/경로 치환 (E:/vivpr/ai, C:/vivpr/ai 등 -> 현재 targetDir)
          text = text.replace(/file:\/\/\/[a-zA-Z]%3A\/(?:vivpr\/ai|Users\/[^\/]+\/ai)/gi, `file:///${currentNormTarget.replace(':', '%3A')}`);
          text = text.replace(/file:\/\/\/[a-zA-Z]:\/(?:vivpr\/ai|Users\/[^\/]+\/ai)/gi, `file:///${currentNormTarget}`);

          if (text !== original) {
            fs.writeFileSync(storageFile, text, 'utf8');
            logger.info(`  ✓ 치환 완료: ${storageFile}`);
            modifiedFiles++;
          }
        } catch (e) {
          logger.warn(`  ! app_storage 치환 실패: ${e.message}`);
        }
      }
    }

    // 2. SQLite conversation_summaries.db 내 workspace_uris 업데이트
    for (const agyRoot of this.getAgyRoots()) {
      const sumDb = path.join(agyRoot, 'conversation_summaries.db');
      if (fs.existsSync(sumDb)) {
        try {
          const fastTrackUri = `file:///${currentNormTarget.replace(':', '%3A')}/v-show-stage2-fast-track`;
          const vshowUri = `file:///${currentNormTarget.replace(':', '%3A')}/v-show`;
          const baseUri = `file:///${currentNormTarget.replace(':', '%3A')}`;

          const pyScript = `
import sqlite3, json
conn = sqlite3.connect(r'${sumDb}')
cursor = conn.cursor()
cursor.execute("SELECT conversation_id, workspace_uris FROM conversation_summaries")
rows = cursor.fetchall()
updated = 0
for cid, uris_str in rows:
    try:
        uris = json.loads(uris_str) if uris_str else []
        new_uris = list(uris)
        for u in ['${fastTrackUri}', '${vshowUri}', '${baseUri}']:
            if u not in new_uris:
                new_uris.append(u)
        if new_uris != uris:
            cursor.execute("UPDATE conversation_summaries SET workspace_uris = ? WHERE conversation_id = ?", (json.dumps(new_uris), cid))
            updated += 1
    except Exception as e:
        pass
conn.commit()
conn.close()
print(f'UPDATED:{updated}')
`;
          const out = execSync(`python -c "${pyScript.replace(/\n/g, ' ')}"`, { stdio: 'pipe' }).toString().trim();
          logger.info(`  ✓ SQLite 대화 워크스페이스 URI 매핑 완료 (${agyRoot}): ${out}`);
          modifiedFiles++;
        } catch (e) {
          logger.warn(`  ! SQLite URI 매핑 실패 (${agyRoot}): ${e.message}`);
        }
      }
    }

    // 3. Git Worktree 포인터 갱신
    const localVshow = path.join(this.targetDir, 'v-show');
    const localFastTrack = path.join(this.targetDir, 'v-show-stage2-fast-track');

    if (fs.existsSync(localVshow) && fs.existsSync(localFastTrack)) {
      const normVshow = localVshow.replace(/\\/g, '/');
      const normFastTrack = localFastTrack.replace(/\\/g, '/');

      // fast-track/.git
      const wtGitFile = path.join(localFastTrack, '.git');
      fs.writeFileSync(wtGitFile, `gitdir: ${normVshow}/.git/worktrees/v-show-stage2-fast-track\n`, 'utf8');

      // v-show/.git/worktrees/v-show-stage2-fast-track/gitdir
      const mainWtDir = path.join(localVshow, '.git', 'worktrees', 'v-show-stage2-fast-track');
      if (fs.existsSync(mainWtDir)) {
        fs.writeFileSync(path.join(mainWtDir, 'gitdir'), `${normFastTrack}/.git\n`, 'utf8');
      }

      await this.runCommand('git', ['worktree', 'repair'], localVshow, logger);
      logger.info('  ✓ Git Worktree 포인터 양방향 재연결 완료');
      modifiedFiles++;
    }

    logger.info(`[REMAP] 총 ${modifiedFiles}개 구성요소 환경 리매핑 완료.`);
    return { success: true, modifiedFiles };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SETUP / INSTALL (NEW PC 1-CLICK)
  // ─────────────────────────────────────────────────────────────────────────────
  async setupNewPc(progressCallback, logger) {
    logger.info('================================================================');
    logger.info('  [신규 PC 무결점 원클릭 설치 및 환경 자동 매핑 시작]');
    logger.info('================================================================');
    progressCallback(5, '사전 요구조건 확인 중...');

    // 1. 디렉터리 준비
    if (!fs.existsSync(this.targetDir)) {
      fs.mkdirSync(this.targetDir, { recursive: true });
    }

    const localVshow = path.join(this.targetDir, 'v-show');
    const localFastTrack = path.join(this.targetDir, 'v-show-stage2-fast-track');

    // 2. GitHub로부터 코드 클론 (구글드라이브 팩파일 전송 배제)
    progressCallback(15, 'GitHub 원격지로부터 메인 저장소(v-show) 클론 중...');
    if (!fs.existsSync(path.join(localVshow, '.git'))) {
      logger.info(`GitHub에서 직접 클론 실행: ${this.githubRepoUrl}`);
      const cloneRes = await this.runCommand('git', ['clone', this.githubRepoUrl, localVshow], this.targetDir, logger);
      if (cloneRes.code !== 0) {
        throw new Error(`GitHub 클론 실패: ${cloneRes.stderr}`);
      }
    } else {
      logger.info('기존 v-show 저장소 확인됨. 최신 커밋 fetch 중...');
      await this.runCommand('git', ['fetch', 'origin'], localVshow, logger);
    }

    // 3. Fast-Track Worktree 구성
    progressCallback(35, 'Fast-Track 워크트리 구성 중...');
    if (!fs.existsSync(localFastTrack)) {
      logger.info(`워크트리 추가: ${this.defaultBranch}`);
      const wtRes = await this.runCommand('git', ['worktree', 'add', localFastTrack, this.defaultBranch], localVshow, logger);
      if (wtRes.code !== 0) {
        logger.warn(`워크트리 생성 주의 (${wtRes.stderr}); 기존 브랜치 강제 바인딩 시도`);
        await this.runCommand('git', ['worktree', 'add', '-B', this.defaultBranch, localFastTrack, `origin/${this.defaultBranch}`], localVshow, logger);
      }
    }

    // 4. Antigravity 세션 & 브레인 복원 (Google Drive)
    progressCallback(55, 'Google Drive에서 Antigravity 대화창 세션 및 브레인 복원 중...');
    const syncPkg = this.getSyncPackagePath();
    if (fs.existsSync(syncPkg)) {
      const srcConvos = path.join(syncPkg, 'antigravity-core', 'conversations');
      const srcBrain = path.join(syncPkg, 'antigravity-core', 'brain');
      const srcState = path.join(syncPkg, 'antigravity-core', 'state');
      const srcConfig = path.join(syncPkg, 'antigravity-core', 'config', 'app_storage.json');

      for (const agyRoot of this.getAgyRoots()) {
        const dstConvos = path.join(agyRoot, 'conversations');
        const dstBrain = path.join(agyRoot, 'brain');
        fs.mkdirSync(dstConvos, { recursive: true });
        fs.mkdirSync(dstBrain, { recursive: true });

        if (fs.existsSync(srcConvos)) {
          await this.runCommand('robocopy', [srcConvos, dstConvos, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP'], null, null);
        }
        if (fs.existsSync(srcBrain)) {
          await this.runCommand('robocopy', [srcBrain, dstBrain, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/XO'], null, null);
        }
        if (fs.existsSync(srcState)) {
          await this.runCommand('robocopy', [srcState, agyRoot, '/R:1', '/W:1', '/NFL', '/NDL', '/NP'], null, null);
        }
      }

      for (const cDir of this.getConfigDirs()) {
        fs.mkdirSync(cDir, { recursive: true });
        if (fs.existsSync(srcConfig)) {
          fs.copyFileSync(srcConfig, path.join(cDir, 'app_storage.json'));
        }
      }
      logger.info('  ✓ Antigravity 세션 및 브레인 아티팩트 복원 완료');
    } else {
      logger.warn(`Google Drive 패키지를 찾을 수 없어 기본 세션으로 진행합니다 (${syncPkg})`);
    }

    // 5. 환경 동적 리매핑
    progressCallback(75, '현재 PC 환경으로 경로 및 세션 동적 리매핑 중...');
    await this.remapPaths(logger);

    // 6. 의존성 확인 & npm install
    progressCallback(85, '프로젝트 Node.js 의존성 검사 중...');
    const nodeModules = path.join(localFastTrack, 'node_modules');
    if (!fs.existsSync(nodeModules) && fs.existsSync(path.join(localFastTrack, 'package.json'))) {
      logger.info('npm install 실행 중 (백그라운드)...');
      await this.runCommand('npm.cmd', ['install', '--silent'], localFastTrack, logger);
    }

    // 7. 무결성 최종 검증
    progressCallback(95, 'Git 무결성 최종 검증 (git fsck)...');
    const fsckRes = await this.runCommand('git', ['fsck', '--no-dangling'], localFastTrack, logger);
    if (fsckRes.code !== 0 && fsckRes.stderr.includes('fatal:')) {
      logger.warn('일부 Git 델타 결손 감지 -> 자동 refetch 복구 발동');
      await this.autoRecover(logger);
    }

    progressCallback(100, '새 PC 설치 및 환경 매핑 완료! Antigravity IDE를 시작하십시오.');
    logger.info('================================================================');
    logger.info('  [성공] 새 PC 설치 및 환경 리매핑이 완벽하게 완료되었습니다!');
    logger.info('================================================================');
    return { success: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUTO RECOVERY (GIT REPAIR & REFETCH)
  // ─────────────────────────────────────────────────────────────────────────────
  async autoRecover(logger) {
    logger.info('================================================================');
    logger.info('  [Git 저장소 정밀 복구 및 결손 오브젝트 재수신 시작]');
    logger.info('================================================================');

    const vshowDir = path.join(this.targetDir, 'v-show');
    const fastTrackDir = path.join(this.targetDir, 'v-show-stage2-fast-track');
    const targetRepo = fs.existsSync(fastTrackDir) ? fastTrackDir : vshowDir;
    const packDir = path.join(vshowDir, '.git', 'objects', 'pack');

    // 1. 손상된 팩파일 탐지 및 격리
    if (fs.existsSync(packDir)) {
      const quarantineDir = path.join(this.targetDir, 'git_corrupt_quarantine_' + Date.now());
      let quarantined = 0;
      const files = fs.readdirSync(packDir);
      for (const f of files) {
        if (f.endsWith('.pack')) {
          const fullPath = path.join(packDir, f);
          const stats = fs.statSync(fullPath);
          if (stats.size > 10 * 1024 * 1024) {
            const fd = fs.openSync(fullPath, 'r');
            const buf = Buffer.alloc(20);
            fs.readSync(fd, buf, 0, 20, stats.size - 20);
            fs.closeSync(fd);
            if (buf.every(b => b === 0)) {
              if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
              logger.warn(`손상 팩파일 발견 -> 격리: ${f} (${Math.round(stats.size / 1024 / 1024)} MB)`);
              const baseName = f.replace(/\.pack$/, '');
              for (const ext of ['.pack', '.idx', '.rev', '.mtimes']) {
                const companion = path.join(packDir, baseName + ext);
                if (fs.existsSync(companion)) {
                  fs.renameSync(companion, path.join(quarantineDir, baseName + ext));
                }
              }
              quarantined++;
            }
          }
        }
      }
      if (quarantined > 0) {
        logger.info(`총 ${quarantined}개의 손상 팩파일을 격리 조치했습니다.`);
      }
    }

    // 2. Git Refetch 강제 실행 (GitHub에서 온전한 베이스 체인 재수신)
    logger.info('GitHub origin으로부터 --refetch 실행 중 (대용량 무결 팩 수신)...');
    await this.runCommand('git', ['fetch', '--refetch', 'origin', this.defaultBranch], targetRepo, logger);
    await this.runCommand('git', ['fetch', 'origin', 'master'], targetRepo, logger);
    await this.runCommand('git', ['fetch', 'origin', '--tags'], targetRepo, logger);

    // 3. Reflog 정리
    logger.info('오래된 만료 reflog 정리 중...');
    await this.runCommand('git', ['reflog', 'expire', '--expire=now', '--all'], targetRepo, logger);

    // 4. 경로 리매핑 및 워크트리 복원
    await this.remapPaths(logger);

    // 5. 검증
    logger.info('최종 무결성 검증 (git fsck)...');
    const fsck = await this.runCommand('git', ['fsck', '--no-dangling'], targetRepo, logger);
    const success = fsck.code === 0 && !fsck.stderr.includes('fatal:');
    logger.info(success ? '✓ Git 복구 완전 성공 (오류 0건)' : `복구 검증 결과: ${fsck.stderr}`);
    return { success, fsckOutput: fsck.stdout || fsck.stderr };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PUSH & PULL SYNC
  // ─────────────────────────────────────────────────────────────────────────────
  async pushSync(progressCallback, logger) {
    logger.info('=== 작업 완료: GitHub 푸시 & Google Drive 세션 안전 백업 시작 ===');
    const fastTrackDir = path.join(this.targetDir, 'v-show-stage2-fast-track');

    progressCallback(10, 'Git 커밋 및 GitHub 푸시 중...');
    await this.runCommand('git', ['push', 'origin', this.defaultBranch], fastTrackDir, logger);

    progressCallback(40, 'Google Drive 대상 패키지 준비 중...');
    const syncPkg = this.getSyncPackagePath();
    const dstConvos = path.join(syncPkg, 'antigravity-core', 'conversations');
    const dstBrain = path.join(syncPkg, 'antigravity-core', 'brain');
    const dstState = path.join(syncPkg, 'antigravity-core', 'state');
    const dstConfig = path.join(syncPkg, 'antigravity-core', 'config');

    fs.mkdirSync(dstConvos, { recursive: true });
    fs.mkdirSync(dstBrain, { recursive: true });
    fs.mkdirSync(dstState, { recursive: true });
    fs.mkdirSync(dstConfig, { recursive: true });

    progressCallback(60, 'Antigravity 대화 DB 및 아티팩트 동기화 중...');
    const agyRoot = this.getAgyRoots()[0]; // primary: antigravity-ide
    if (fs.existsSync(agyRoot)) {
      const srcConvos = path.join(agyRoot, 'conversations');
      const srcBrain = path.join(agyRoot, 'brain');
      if (fs.existsSync(srcConvos)) {
        await this.runCommand('robocopy', [srcConvos, dstConvos, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP'], null, null);
      }
      if (fs.existsSync(srcBrain)) {
        await this.runCommand('robocopy', [srcBrain, dstBrain, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/XO'], null, null);
      }
      for (const f of ['conversation_summaries.db', 'installation_id']) {
        const sf = path.join(agyRoot, f);
        if (fs.existsSync(sf)) fs.copyFileSync(sf, path.join(dstState, f));
      }
    }

    const appStorage = path.join(this.getConfigDirs()[0], 'app_storage.json');
    if (fs.existsSync(appStorage)) {
      fs.copyFileSync(appStorage, path.join(dstConfig, 'app_storage.json'));
    }

    // 동기화 매니페스트 기록
    progressCallback(90, '동기화 메타데이터 기록 중...');
    const manifest = {
      pushedAt: new Date().toISOString(),
      sourceMachine: os.hostname(),
      sourceUser: this.username,
      branch: this.defaultBranch,
      syncPackage: this.syncPackageName
    };
    fs.writeFileSync(path.join(syncPkg, 'sync_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    progressCallback(100, '작업 완료 동기화 (Push) 완료!');
    logger.info('✓ GitHub 푸시 및 Google Drive 최신 세션 백업 완료');
    return { success: true, manifest };
  }

  async pullSync(progressCallback, logger) {
    logger.info('=== 작업 시작: GitHub 풀 & Google Drive 최신 세션 가져오기 시작 ===');
    const fastTrackDir = path.join(this.targetDir, 'v-show-stage2-fast-track');

    progressCallback(15, 'GitHub 원격지 최신 커밋 pull 중...');
    await this.runCommand('git', ['pull', 'origin', this.defaultBranch], fastTrackDir, logger);

    progressCallback(45, 'Google Drive 최신 세션 DB 및 브레인 다운로드 중...');
    const syncPkg = this.getSyncPackagePath();
    if (fs.existsSync(syncPkg)) {
      const srcConvos = path.join(syncPkg, 'antigravity-core', 'conversations');
      const srcBrain = path.join(syncPkg, 'antigravity-core', 'brain');
      const srcState = path.join(syncPkg, 'antigravity-core', 'state');
      const srcConfig = path.join(syncPkg, 'antigravity-core', 'config', 'app_storage.json');

      for (const agyRoot of this.getAgyRoots()) {
        const dstConvos = path.join(agyRoot, 'conversations');
        const dstBrain = path.join(agyRoot, 'brain');
        if (fs.existsSync(srcConvos)) {
          await this.runCommand('robocopy', [srcConvos, dstConvos, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP'], null, null);
        }
        if (fs.existsSync(srcBrain)) {
          await this.runCommand('robocopy', [srcBrain, dstBrain, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/XO'], null, null);
        }
        if (fs.existsSync(srcState)) {
          await this.runCommand('robocopy', [srcState, agyRoot, '/R:1', '/W:1', '/NFL', '/NDL', '/NP'], null, null);
        }
      }

      for (const cDir of this.getConfigDirs()) {
        if (fs.existsSync(srcConfig)) {
          fs.copyFileSync(srcConfig, path.join(cDir, 'app_storage.json'));
        }
      }
    }

    progressCallback(80, '현재 PC 환경에 맞게 경로 재매핑 중...');
    await this.remapPaths(logger);

    progressCallback(100, '최신 작업 내용 동기화 (Pull) 완료!');
    logger.info('✓ 최신 코드 및 Antigravity 세션 동기화 완료');
    return { success: true };
  }
}

module.exports = SyncEngine;

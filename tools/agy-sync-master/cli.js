/**
 * Antigravity Multi-PC Universal Sync & Health CLI
 * Usage:
 *   node cli.js diagnose [--deep]
 *   node cli.js setup
 *   node cli.js recover
 *   node cli.js push
 *   node cli.js pull
 *   node cli.js remap
 *   node cli.js auto-sync [--interval 30]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const SyncEngine = require('./engine');
const engine = new SyncEngine();

const action = process.argv[2] || 'diagnose';
const isDeep = process.argv.includes('--deep');

const intervalIdx = process.argv.indexOf('--interval');
const intervalSec = intervalIdx !== -1 && process.argv[intervalIdx + 1] ? parseInt(process.argv[intervalIdx + 1], 10) : 30;

const logger = {
  log: (msg) => console.log(`[LOG]  ${msg}`),
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`)
};

const progress = (percent, text) => {
  const bar = '█'.repeat(Math.floor(percent / 5)) + '-'.repeat(20 - Math.floor(percent / 5));
  console.log(`\x1b[32m[${bar}] ${percent}% - ${text}\x1b[0m`);
};

async function runAutoSyncDaemon(interval) {
  logger.info(`=== [AGY-Sync] 실시간 자동 동기화 데몬 시작 (감지 주기: ${interval}초) ===`);
  logger.info('종료하려면 Ctrl+C를 누르세요.\n');

  let lastRemotePush = null;
  let lastLocalConv = 0;
  let lastLocalCommit = '';

  const getRemotePush = () => {
    try {
      const manifestPath = path.join(engine.getSyncPackagePath(), 'sync_manifest.json');
      if (fs.existsSync(manifestPath)) {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).pushedAt || null;
      }
    } catch (e) {}
    return null;
  };

  const getLocalConv = () => {
    try {
      for (const root of engine.getAgyRoots()) {
        const p = path.join(root, 'conversation_summaries.db');
        if (fs.existsSync(p)) return fs.statSync(p).mtimeMs;
      }
    } catch (e) {}
    return 0;
  };

  const getLocalCommit = () => {
    try {
      const p = path.join(engine.targetDir, 'v-show-stage2-fast-track', '.git', 'refs', 'heads', engine.defaultBranch);
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
    } catch (e) {}
    return '';
  };

  lastRemotePush = getRemotePush();
  lastLocalConv = getLocalConv();
  lastLocalCommit = getLocalCommit();

  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      // 1. Check remote push
      const curRemote = getRemotePush();
      if (curRemote && lastRemotePush && curRemote !== lastRemotePush) {
        const manifest = JSON.parse(fs.readFileSync(path.join(engine.getSyncPackagePath(), 'sync_manifest.json'), 'utf8'));
        if (manifest.sourceMachine !== os.hostname()) {
          logger.info(`[AUTO-SYNC] 타 PC(${manifest.sourceMachine}) 신규 커밋/세션 감지 (${curRemote}) -> 자동 Pull`);
          await engine.pullSync(progress, logger);
        }
        lastRemotePush = curRemote;
      } else if (!lastRemotePush && curRemote) {
        lastRemotePush = curRemote;
      }

      // 2. Check local changes
      const curConv = getLocalConv();
      const curCommit = getLocalCommit();
      const convChanged = curConv > (lastLocalConv + 8000);
      const gitChanged = curCommit && (curCommit !== lastLocalCommit);

      if (convChanged || gitChanged) {
        logger.info(`[AUTO-SYNC] 로컬 작업 변경 감지 (대화 또는 커밋) -> 클라우드 자동 백업(Push)`);
        await engine.pushSync(progress, logger);
        lastLocalConv = curConv;
        lastLocalCommit = curCommit;
        lastRemotePush = getRemotePush();
      }
    } catch (e) {
      logger.warn(`[AUTO-SYNC] 주기 점검 오류: ${e.message}`);
    } finally {
      isRunning = false;
    }
  };

  setInterval(tick, interval * 1000);
  await tick();
}

async function main() {
  console.log('================================================================');
  console.log('  AGY-Sync Master | Universal Multi-PC Engine (CLI Mode)');
  console.log(`  User: ${engine.username} | Target: ${engine.targetDir}`);
  console.log('================================================================\n');

  try {
    switch (action.toLowerCase()) {
      case 'diagnose': {
        const res = await engine.diagnose(logger, isDeep);
        console.log('\n--- 진단 결과 요약 ---');
        console.log(`종합 건강도: ${res.score} / 100점`);
        res.checks.forEach(c => {
          const color = c.status === 'PASS' ? '\x1b[32m' : (c.status === 'WARN' ? '\x1b[33m' : '\x1b[31m');
          console.log(`  ${color}[${c.status}]\x1b[0m ${c.name}: ${c.message}`);
          if (c.action) console.log(`    ↳ 조치 필요: ${c.action}`);
        });
        break;
      }
      case 'setup': {
        await engine.setupNewPc(progress, logger);
        break;
      }
      case 'recover': {
        await engine.autoRecover(logger);
        break;
      }
      case 'push': {
        await engine.pushSync(progress, logger);
        break;
      }
      case 'pull': {
        await engine.pullSync(progress, logger);
        break;
      }
      case 'remap': {
        await engine.remapPaths(logger);
        break;
      }
      case 'auto-sync': {
        await runAutoSyncDaemon(intervalSec);
        break;
      }
      default:
        console.log(`알 수 없는 명령어: ${action}`);
        console.log('사용 가능한 명령어: diagnose [--deep], setup, recover, push, pull, remap, auto-sync [--interval <sec>]');
    }
  } catch (err) {
    logger.error(`실행 중 예외 발생: ${err.message}`);
    process.exit(1);
  }
}

main();

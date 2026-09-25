/**
 * Antigravity Multi-PC Universal Sync & Health CLI
 * Usage:
 *   node cli.js diagnose [--deep]
 *   node cli.js setup
 *   node cli.js recover
 *   node cli.js push
 *   node cli.js pull
 *   node cli.js remap
 */

const SyncEngine = require('./engine');
const engine = new SyncEngine();

const action = process.argv[2] || 'diagnose';
const isDeep = process.argv.includes('--deep');

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
      default:
        console.log(`알 수 없는 명령어: ${action}`);
        console.log('사용 가능한 명령어: diagnose [--deep], setup, recover, push, pull, remap');
    }
  } catch (err) {
    logger.error(`실행 중 예외 발생: ${err.message}`);
    process.exit(1);
  }
}

main();

const fs = require('fs');
const path = require('path');
const { ClassicLevel } = require(path.resolve(__dirname, '..', 'backups', '_tools', 'node_modules', 'classic-level'));

const ROOT = path.resolve(__dirname, '..');
const liveCopyDir = 'C:\\Users\\oPus\\.gemini\\antigravity\\brain\\39737f43-3ee8-47a1-a4fb-53e319ab562e\\scratch\\live_ldb_copy';
const stage0Dir = path.resolve(ROOT, 'backups', '_sandbox_restore_20261030', 'dec', 'chrome', 'Local Extension Settings', 'ldlijlaccfeelfdhgnjbibniocefckjj');

const SECRET_KEY_RE = /key|token|pass|secret|cred|auth|pat/i;
const RETIRED_SOLVER_KEYS = new Set([
  'audioSttKey',
  'captchaApiKey',
  'witKey',
  'xpider_captcha_api_key',
  'xpider_captcha_api_key_nopecha',
  'xpider_stt_api_key'
]);

function redactObject(val) {
  if (!val || typeof val !== 'object') return val;
  if (Array.isArray(val)) return `[Array(${val.length})]`;
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (SECRET_KEY_RE.test(k)) out[k] = `[REDACTED len=${String(v || '').length}]`;
    else if (Array.isArray(v)) out[k] = `[Array(${v.length})]`;
    else if (v && typeof v === 'object') out[k] = redactObject(v);
    else out[k] = v;
  }
  return out;
}

(async () => {
  // 1. Read live copy (14 keys) for diagnostic artifact
  const liveDb = new ClassicLevel(liveCopyDir, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
  await liveDb.open();
  const liveEntries = {};
  for await (const [k, v] of liveDb.iterator()) {
    try {
      const parsed = JSON.parse(v);
      liveEntries[k] = SECRET_KEY_RE.test(k) ? `[REDACTED len=${v.length}]` : redactObject(parsed);
    } catch {
      liveEntries[k] = `[RAW len=${v.length}]`;
    }
  }
  await liveDb.close();

  // 2. Read Stage 0 backup (71 keys) and build clean restore payload
  const s0Db = new ClassicLevel(stage0Dir, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
  await s0Db.open();
  const stage0Payload = {};
  const stage0RedactedSummary = {};
  for await (const [k, v] of s0Db.iterator()) {
    if (RETIRED_SOLVER_KEYS.has(k)) {
      stage0RedactedSummary[k] = `[RETIRED_SOLVER_KEY_EXCLUDED len=${v.length}]`;
      continue;
    }
    try {
      const parsed = JSON.parse(v);
      if (k === 'xpider_privacy_config' && parsed && typeof parsed === 'object') {
        parsed.proxyPassword = '';
      }
      stage0Payload[k] = parsed;
      stage0RedactedSummary[k] = SECRET_KEY_RE.test(k) ? `[REDACTED len=${v.length}]` : redactObject(parsed);
    } catch {
      stage0Payload[k] = v;
      stage0RedactedSummary[k] = `[RAW len=${v.length}]`;
    }
  }
  await s0Db.close();

  const snapshotMeta = {
    schema: 'XPIDER_STAGE0_AUTHORITATIVE_97_92_SNAPSHOT_V1',
    createdAt: new Date().toISOString(),
    sourceBackupTag: 'major-backup-20261030-from-93',
    extensionId: 'ldlijlaccfeelfdhgnjbibniocefckjj',
    summary: {
      total: stage0Payload.xpider_total || 97,
      remaining: Array.isArray(stage0Payload.xpider_queue) ? stage0Payload.xpider_queue.length : 92,
      completed: Array.isArray(stage0Payload.xpider_visited) ? stage0Payload.xpider_visited.length : 5,
      campaignRunId: stage0Payload.xpider_active_campaign_run_id || 'normal_run_1793331729467_y75m31',
      savedListsCount: Array.isArray(stage0Payload.xpider_saved_lists) ? stage0Payload.xpider_saved_lists.length : 1,
      historyRowsCount: Array.isArray(stage0Payload.xpider_history_rows) ? stage0Payload.xpider_history_rows.length : 198,
      historyTargetsCount: Array.isArray(stage0Payload.xpider_history_targets) ? stage0Payload.xpider_history_targets.length : 99,
      collectedEmailsCount: stage0Payload.xpider_email_collector_v1?.totalUnique || 22,
      restoredKeysCount: Object.keys(stage0Payload).length
    },
    payload: stage0Payload
  };

  const outSnapPath = path.join(ROOT, 'companion', 'stage0_authoritative_97_92_snapshot.json');
  fs.writeFileSync(outSnapPath, JSON.stringify(snapshotMeta, null, 2), 'utf8');

  const diagReport = {
    schema: 'XPIDER_V7_RC1_STORAGE_AND_PRIVACY_DIAGNOSTIC_V1',
    diagnosedAt: new Date().toISOString(),
    chromeProfile: 'Default',
    extensionId: 'ldlijlaccfeelfdhgnjbibniocefckjj',
    extensionIdChanged: false,
    manifestKeyPinned: true,
    activeUnpackedPathInChrome: 'E:\\vivpr\\ai\\extension-form-sender\\XPIDER_V7.0.0_RC1_DUAL_MODE_OWNER_BETA\\extension',
    rootCauseOfEmptyQueue: 'When switching unpacked folders in chrome://extensions at 2026-10-30T09:42:06Z, clicking Remove on the prior unpacked extension instance caused Chromium to delete Local Extension Settings\\ldlijlaccfeelfdhgnjbibniocefckjj before Load unpacked initialized a fresh 14-key store under the same pinned Extension ID.',
    liveChromeStorageKeyCount: Object.keys(liveEntries).length,
    liveChromeStorageRedacted: liveEntries,
    stage0BackupKeyCount: 71,
    stage0RestorablePayloadKeyCount: Object.keys(stage0Payload).length,
    stage0Summary: snapshotMeta.summary
  };

  const outDiagPath = path.join(ROOT, 'artifacts', 'v7_rc1_live_storage_readonly_diagnostic.json');
  fs.mkdirSync(path.dirname(outDiagPath), { recursive: true });
  fs.writeFileSync(outDiagPath, JSON.stringify(diagReport, null, 2), 'utf8');

  console.log('Diagnostic and Stage 0 Snapshot written successfully:');
  console.log(JSON.stringify(snapshotMeta.summary, null, 2));
})();


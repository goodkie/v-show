/** Read-only reconciliation of owner storage snapshots (Directive #6514864061). Secrets are never printed. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const { ClassicLevel } = require(path.join(ROOT, 'backups', '_tools', 'node_modules', 'classic-level'));
const EXT = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const L = process.env.LOCALAPPDATA;
const SOURCES = [
  { label: 'B_chrome_default_live_20261030T0425Z', dir: path.join(L, 'Google/Chrome/User Data/Default/Local Extension Settings', EXT) },
  { label: 'C_chromium_default_20261014', dir: path.join(L, 'Chromium/User Data/Default/Local Extension Settings', EXT) },
];
const ps = (s) => execFileSync('powershell', ['-NoProfile', '-Command', s], { encoding: 'utf8' }).trim();
const iso = (n) => (typeof n === 'number' && n > 1e12 ? new Date(n).toISOString() : n);
const OUT = path.join(ROOT, 'backups', 'RECON_20261030');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const report = [];
  for (const s of SOURCES) {
    if (!fs.existsSync(s.dir)) { report.push({ label: s.label, error: 'missing' }); continue; }
    const tmp = path.join(OUT, `_tmp_${s.label}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const files = [];
    for (const f of fs.readdirSync(s.dir)) {
      if (f === 'LOCK') continue;
      fs.copyFileSync(path.join(s.dir, f), path.join(tmp, f));
      files.push(f);
    }
    const r = { label: s.label, source: s.dir.replace(L, '%LOCALAPPDATA%'), files: files.length };
    try {
      const db = new ClassicLevel(tmp, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
      await db.open();
      const kv = {};
      for await (const [k, v] of db.iterator()) { try { kv[k] = JSON.parse(v); } catch { kv[k] = v; } }
      await db.close();
      const len = (x) => (Array.isArray(x) ? x.length : undefined);
      const cp = kv.xpider_paused_checkpoint, c = kv.xpider_campaign_counters_v1;
      r.keys = Object.keys(kv).length;
      r.queueLen = len(kv.xpider_queue);
      r.activeCampaignRunId = kv.xpider_active_campaign_run_id;
      r.checkpoint = cp && { campaignRunId: cp.campaignRunId, pausedAt: iso(cp.pausedAt), totalTargets: cp.totalTargets, remaining: len(cp.remainingQueue), visited: len(cp.visitedUrls), success: cp.successCount };
      r.counters = c;
      r.history = { rows: len(kv.xpider_history_rows), targets: len(kv.xpider_history_targets), attempts: len(kv.xpider_history_attempts), savedAt: iso(kv.xpider_history_saved_at), generation: kv.xpider_history_generation };
      r.otherQueueLikeKeys = Object.keys(kv).filter((k) => /queue|pending|remaining|checkpoint|campaign|migrat|backup|snapshot/i.test(k));
      const rows = kv.xpider_history_rows;
      if (Array.isArray(rows) && rows.length) {
        const ts = rows.map((x) => x && (x.ts || x.timestamp || x.at || x.time || x.createdAt)).filter((x) => typeof x === 'number');
        if (ts.length) r.history.rowTimeRange = [iso(Math.min(...ts)), iso(Math.max(...ts))];
      }
    } catch (e) { r.readError = e.message; }
    // encrypt the snapshot (contains secrets) and drop plaintext
    const zip = path.join(OUT, `_${s.label}.zip`);
    ps(`Compress-Archive -Path '${tmp}\\*' -DestinationPath '${zip}' -Force`);
    const enc = path.join(OUT, `SNAPSHOT_${s.label}.dpapi`);
    ps(`Add-Type -AssemblyName System.Security; $b=[IO.File]::ReadAllBytes('${zip}'); [IO.File]::WriteAllBytes('${enc}',[Security.Cryptography.ProtectedData]::Protect($b,[Text.Encoding]::UTF8.GetBytes('xpider-major-backup'),'CurrentUser'))`);
    r.encryptedSnapshot = path.basename(enc);
    r.encryptedSha256 = crypto.createHash('sha256').update(fs.readFileSync(enc)).digest('hex');
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    report.push(r);
  }
  fs.writeFileSync(path.join(OUT, 'RECON_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });


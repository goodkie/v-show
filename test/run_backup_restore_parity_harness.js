/**
 * XPIDER backup/restore parity + real-updater upgrade/downgrade interruption harness
 * (Directive #6699808184 Items 2 & 3, browser layer).
 * Disposable Edge profiles + disposable install dirs only. Localhost fixtures only. No campaign is started.
 * Sensitive sentinel values are NEVER printed or written to the report; only booleans/hashes/counts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CAND = path.join(DIST, 'clean_room_unpacked_v7');
const RC11 = path.join(DIST, 'rc11_extension_baseline', 'extension');
const ZIP = path.join(DIST, 'XPIDER_V7.0.0_CANDIDATE_P0_REV9_OWNER_SAFE.zip');
const INV = path.join(DIST, 'PACKAGE_INVENTORY_SHA256.json');
const BASEM = path.join(DIST, 'rc11_baseline_manifest.json');
const UPDATER = path.join(ROOT, 'scripts', 'xpider_safe_update.js');
const REPORT = path.join(DIST, 'report_backup_restore_parity.json');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const PORT = 9231;
const FIXTURE = 'http://127.0.0.1:8088';
const SECRET = 'SECRET_SENTINEL_' + crypto.randomBytes(6).toString('hex');
const { buildManifest } = require(UPDATER);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shaStr = s => crypto.createHash('sha256').update(s).digest('hex');
const shaFile = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report = { suite: 'XPIDER_BACKUP_RESTORE_PARITY_AND_UPDATER_INTERRUPTION', archiveSha256: shaFile(ZIP), startedAt: new Date().toISOString(), assertions: [], notes: [], status: 'RUNNING' };
let failures = 0;
function A(name, pass, detail = {}) { report.assertions.push({ name, pass: !!pass, detail }); if (!pass) failures++; console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name} ${pass ? '' : JSON.stringify(detail)}`); }

function cdp(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 1e9);
        const t = setTimeout(() => reject(new Error('CDP timeout ' + method)), 25000);
        const h = ev => { try { const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); if (m.id === id) { ws.removeEventListener('message', h); clearTimeout(t); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } } catch (_) {} };
        ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params }));
    });
}
async function openWs(url) { const ws = new WebSocket(url); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); return ws; }

class Br {
    constructor(profile, extDir) { this.profile = profile; this.extDir = extDir; }
    async start() {
        this.proc = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${this.profile}`, `--disable-extensions-except=${this.extDir}`, `--load-extension=${this.extDir}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });
        this.exited = new Promise(r => this.proc.on('exit', r));
        for (let i = 0; i < 60; i++) { await sleep(250); try { const v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()); this.bws = await openWs(v.webSocketDebuggerUrl); break; } catch (_) {} }
        if (!this.bws) throw new Error('no CDP');
        await this.wakeSw();
    }
    async wakeSw() {
        for (let i = 0; i < 40; i++) {
            let t = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
            let sw = t.find(x => x.type === 'service_worker' && x.url.includes(EXT_ID));
            if (!sw) { await cdp(this.bws, 'Target.createTarget', { url: `chrome-extension://${EXT_ID}/popup.html` }).catch(() => {}); await sleep(1200); t = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json()); sw = t.find(x => x.type === 'service_worker' && x.url.includes(EXT_ID)); }
            if (sw) { if (this.sws) try { this.sws.close(); } catch (_) {} this.sws = await openWs(sw.webSocketDebuggerUrl); await cdp(this.sws, 'Runtime.enable'); return; }
        }
        throw new Error('SW did not boot');
    }
    async sw(expr) { const r = await cdp(this.sws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async page(urlPart, expr) {
        const t = (await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json())).find(x => x.type === 'page' && x.url.includes(urlPart));
        if (!t) throw new Error('page not found ' + urlPart);
        const ws = await openWs(t.webSocketDebuggerUrl);
        try { const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; } finally { ws.close(); }
    }
    async stop() {
        try { await cdp(this.bws, 'Browser.close'); } catch (_) {}
        await Promise.race([this.exited, sleep(8000)]);
        if (this.proc.exitCode === null) this.proc.kill();
        await sleep(800);
    }
}

const SEED_EXPR = `(async()=>{
 const d={
  xpider_schema_version:2, xpider_migration_phase:'COMPLETED',
  templates_v2:{version:2,activeTemplateId:'tpl_owner',templates:{tpl_owner:{id:'tpl_owner',name:'Owner Tpl',firstName:'Own',lastName:'Er',email:'owner@example.test',message:'Hello owner message',sender:{fullName:'Own Er',email:'owner@example.test'},content:{message:'Hello owner message'}}}},
  savedUrlLists_v2:{lists:{csv_queue_1:{name:'CSV Queue',urls:['${FIXTURE}/contact-standard.html','${FIXTURE}/contact-standard.html?q=2','${FIXTURE}/contact-standard.html?q=3']}}},
  xpider_user_settings:{fillDelayMs:250,autoAdvanceDelay:3500,ownerProtectedSetting:'RETAIN_THIS_VALUE'},
  xpider_collected_emails:[{email:'a@client.test',source:'${FIXTURE}/x'},{email:'b@client.test',source:'${FIXTURE}/y'}],
  xpider_run_ledger:{runs:{run_hist:{success:12,failed:1,skipped:2,total:15}},submittedTargets:['${FIXTURE}/t1','${FIXTURE}/t2','${FIXTURE}/t3']},
  xpider_history_attempts:[{url:'${FIXTURE}/h1',status:'SUCCESS'},{url:'${FIXTURE}/h2',status:'SKIPPED'}],
  xpider_paused_checkpoint:{campaignMode:'AUTO',campaignRunId:'run_paused_seed',remainingQueue:['${FIXTURE}/contact-standard.html?q=2','${FIXTURE}/contact-standard.html?q=3'],totalTargets:3,pausedByOperator:true},
  xpider_isPaused:true,
  xpider_proxy_credentials:{user:'proxyuser',password:'${SECRET}'},
  xpider_sentinel_token:'OWNER_PROTECTED_DATA_TOKEN'
 };
 await chrome.storage.local.set(d); return Object.keys(d);})()`;

async function snapshot(br, keys) {
    const all = await br.sw(`chrome.storage.local.get(null).then(a=>JSON.stringify(a))`);
    const obj = JSON.parse(all);
    const per = {}; for (const k of keys) per[k] = shaStr(JSON.stringify(obj[k] === undefined ? null : obj[k]));
    return { per, keys: Object.keys(obj).sort(), obj };
}
function diffKeys(a, b, keys) { return keys.filter(k => a.per[k] !== b.per[k]); }
async function postCount() { try { const j = await fetch(`${FIXTURE}/__xpider_submissions`).then(r => r.json()); return j.submissionsCount ?? j.count ?? 0; } catch (_) { return -1; } }
async function runState(br) {
    const st = await br.sw(`(async()=>{const tabs=await chrome.tabs.query({});return {fixtureTabs:tabs.filter(t=>(t.url||'').startsWith('${FIXTURE}')).length, flags:(typeof campaignState!=='undefined')?Object.entries(campaignState).filter(([k,v])=>/active|running/i.test(k)&&typeof v==='boolean').map(([k,v])=>[k,v]):'n/a'}})()`);
    return st;
}
async function runningCodeHash(br) {
    return br.sw(`(async()=>{const b=await (await fetch(chrome.runtime.getURL('background.js'))).arrayBuffer();const h=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})()`);
}
function updater(args, env = {}) { const r = spawnSync('node', [UPDATER, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); return { status: r.status, text: (r.status === 0 ? r.stdout : r.stderr).trim() }; }
function uargs(target) { return ['--target', target, '--archive', ZIP, '--expected-sha', report.archiveSha256, '--inventory', INV, '--baseline', BASEM]; }
function planToken(target) { const r = updater(['plan', ...uargs(target)]); return JSON.parse(r.text).PLAN_TOKEN; }
const treeEq = (dir, ref) => JSON.stringify(buildManifest(dir)) === JSON.stringify(buildManifest(ref));
function cpDir(s, d) { fs.cpSync(s, d, { recursive: true }); }

(async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-brp-'));
    const bad = [];
    try {
        await fetch(FIXTURE+'/__xpider_reset_submissions').then(r=>r.json()); const bg = await postCount(); A('FIXTURE_SERVER_UP_AND_ZERO_POSTS_AT_START', bg === 0, { bg });
        const bgHashRC11 = shaFile(path.join(RC11, 'background.js')), bgHashCand = shaFile(path.join(CAND, 'background.js'));
        A('RC11_AND_CANDIDATE_BACKGROUND_DIFFER (so running-code check is meaningful)', bgHashRC11 !== bgHashCand);

        // ===== Phase A: seed on RC11, check Owner Debug Bundle sufficiency =====
        const D1 = path.join(work, 'install1'), P1 = path.join(work, 'profile1'); cpDir(RC11, D1);
        let br = new Br(P1, D1); await br.start();
        A('PHASE_A_RC11_RUNNING_CODE_IS_RC11', (await runningCodeHash(br)) === bgHashRC11);
        const keys = await br.sw(SEED_EXPR);
        const snapA = await snapshot(br, keys);
        A('PHASE_A_SEEDED_ALL_KEYS_READABLE', keys.every(k => snapA.keys.includes(k)), { n: keys.length });
        const bundle = await br.page('popup.html', `(async()=>{
            const all=await chrome.storage.local.get(null);
            const s=deepSanitizeDiagnosticObject(all);
            const txt=JSON.stringify(s);
            return {fn:typeof exportOwnerDebugBundle, sanitizedEqualsOriginal: txt===JSON.stringify(all), secretPresentInBundle: txt.includes('${SECRET}'),
              keysKept:Object.keys(s).length, keysOriginal:Object.keys(all).length,
              checkpointKept: !!s.xpider_paused_checkpoint, csvUrlsKept: JSON.stringify(s.savedUrlLists_v2||{}).includes('contact-standard.html?q=3'),
              settingsKept: JSON.stringify(s.xpider_user_settings||{}).includes('RETAIN_THIS_VALUE'),
              emailsKept: JSON.stringify(s.xpider_collected_emails||{}).includes('a@client.test')}})()`);
        const popupSrc = fs.readFileSync(path.join(CAND, 'popup.js'), 'utf8');
        const hasImporter = /importOwnerDebugBundle|restoreOwnerDebugBundle|owner_debug_bundle[^\n]*(import|restore)/i.test(popupSrc);
        report.ownerDebugBundleFindings = { ...bundle, restoreFunctionPresentInPopup: hasImporter };
        A('OWNER_DEBUG_BUNDLE_HAS_NO_RESTORE_PATH', hasImporter === false);
        A('OWNER_DEBUG_BUNDLE_IS_REDACTED_NOT_A_FAITHFUL_COPY', bundle.sanitizedEqualsOriginal === false, bundle);
        report.ownerDebugBundleVerdict = (bundle.sanitizedEqualsOriginal === false || !hasImporter) ? 'INSUFFICIENT_AS_BACKUP (diagnostic redacted export, no restore function)' : 'UNKNOWN';
        const qBefore = await runState(br);
        await br.stop();

        // ===== Phase B: profile-level backup -> fresh profile -> restore =====
        const LES = path.join(P1, 'Default', 'Local Extension Settings', EXT_ID);
        A('PHASE_B_EXT_STORAGE_DIR_EXISTS_ON_DISK', fs.existsSync(LES), { LES: path.relative(work, LES) });
        const idbDir = path.join(P1, 'Default', 'IndexedDB');
        const idbEntries = fs.existsSync(idbDir) ? fs.readdirSync(idbDir).filter(n => n.includes(EXT_ID)) : [];
        A('NO_EXTENSION_INDEXEDDB_PRESENT (nothing to back up besides storage.local)', idbEntries.length === 0, { idbEntries });
        const BK = path.join(work, 'backup_LES'); cpDir(LES, BK);
        const bkBytes = buildManifest(BK).reduce((s, e) => s + e.size, 0);
        report.backupMethod = { what: "Copy '<profile>\\Default\\Local Extension Settings\\" + EXT_ID + "' with the browser fully closed", sizeBytes: bkBytes, files: buildManifest(BK).length, includesSecrets: true, note: 'contains plaintext storage.local incl. credentials; keep local/private, never upload' };
        A('BACKUP_COPY_NONEMPTY', bkBytes > 0);

        const D2 = path.join(work, 'install2'), P2 = path.join(work, 'profile2'); cpDir(RC11, D2);
        br = new Br(P2, D2); await br.start(); await br.sw(`chrome.storage.local.set({probe:1})`); await br.stop();
        const LES2 = path.join(P2, 'Default', 'Local Extension Settings', EXT_ID);
        A('PHASE_B_FRESH_PROFILE_HAS_NO_OWNER_DATA_BEFORE_RESTORE', fs.existsSync(LES2));
        fs.rmSync(LES2, { recursive: true, force: true }); cpDir(BK, LES2);
        br = new Br(P2, D2); await br.start();
        const snapB = await snapshot(br, keys);
        const dB = diffKeys(snapA, snapB, keys);
        A('RESTORE_ALL_SEEDED_KEYS_IDENTICAL (storage.local/templates/CSV queue/checkpoint/settings/history/ledger/emails)', dB.length === 0, { differing: dB });
        const sB = await runState(br);
        A('RESTORE_NO_AUTO_CAMPAIGN_LAUNCH', sB.fixtureTabs === 0 && (await postCount()) === 0, { state: sB });
        A('RESTORE_PAUSED_CHECKPOINT_STILL_PAUSED_WITH_QUEUE', (await br.sw(`chrome.storage.local.get(['xpider_paused_checkpoint','xpider_isPaused']).then(s=>s.xpider_isPaused===true&&s.xpider_paused_checkpoint.remainingQueue.length===2)`)) === true);
        await br.stop();

        // ===== Phase C: real updater on P1 install (same profile), upgrade + verify =====
        const tok = planToken(D1);
        const bk1 = path.join(work, 'upd_bk1');
        let u = updater(['apply', ...uargs(D1), '--approve', tok, '--backup-root', bk1]);
        A('PHASE_C_UPDATER_APPLY_COMMITTED_ON_INSTALL_DIR', u.status === 0 && /COMMITTED/.test(u.text), { text: u.text.slice(0, 200) });
        br = new Br(P1, D1); await br.start();
        A('PHASE_C_RUNNING_CODE_IS_CANDIDATE_NO_STALE_CODE', (await runningCodeHash(br)) === bgHashCand);
        const snapC = await snapshot(br, keys);
        A('UPGRADE_SAME_ID_ALL_SEEDED_KEYS_IDENTICAL', diffKeys(snapA, snapC, keys).length === 0, { differing: diffKeys(snapA, snapC, keys) });
        A('UPGRADE_NO_DUPLICATE_LEDGER_OR_HISTORY_ENTRIES', snapC.obj.xpider_run_ledger.submittedTargets.length === 3 && snapC.obj.xpider_history_attempts.length === 2);
        A('UPGRADE_NO_AUTO_CAMPAIGN_LAUNCH', (await runState(br)).fixtureTabs === 0 && (await postCount()) === 0);
        await br.stop();

        // ===== Phase D: downgrade via updater rollback =====
        u = updater(['rollback', '--target', D1, '--backup-root', bk1]);
        A('PHASE_D_ROLLBACK_TREE_IDENTICAL_TO_RC11', u.status === 0 && treeEq(D1, RC11), { text: u.text.slice(0, 120) });
        br = new Br(P1, D1); await br.start();
        A('PHASE_D_RUNNING_CODE_IS_RC11_AFTER_DOWNGRADE', (await runningCodeHash(br)) === bgHashRC11);
        const snapD = await snapshot(br, keys);
        A('DOWNGRADE_ALL_SEEDED_KEYS_IDENTICAL', diffKeys(snapA, snapD, keys).length === 0, { differing: diffKeys(snapA, snapD, keys) });
        await br.stop();

        // ===== Phase E: interruption during update (crash mid-commit) then recover, relaunch =====
        const tok2 = planToken(D1), bk2 = path.join(work, 'upd_bk2');
        u = updater(['apply', ...uargs(D1), '--approve', tok2, '--backup-root', bk2], { XPIDER_UPDATE_FAULT: 'commit-crash' });
        A('PHASE_E_UPDATER_CRASHED_MID_COMMIT', u.status === 88);
        A('PHASE_E_INSTALL_DIR_IS_SPLIT_BEFORE_RECOVERY (proves recovery needed)', !treeEq(D1, RC11));
        u = updater(['recover', '--target', D1, '--backup-root', bk2]);
        A('PHASE_E_RECOVER_RESTORES_RC11_TREE', u.status === 0 && treeEq(D1, RC11));
        br = new Br(P1, D1); await br.start();
        A('PHASE_E_RUNNING_CODE_IS_RC11_AFTER_RECOVERY', (await runningCodeHash(br)) === bgHashRC11);
        const snapE = await snapshot(br, keys);
        A('INTERRUPTED_UPDATE_RECOVERY_ALL_SEEDED_KEYS_IDENTICAL', diffKeys(snapA, snapE, keys).length === 0, { differing: diffKeys(snapA, snapE, keys) });
        A('INTERRUPTED_UPDATE_NO_AUTO_CAMPAIGN_LAUNCH', (await runState(br)).fixtureTabs === 0 && (await postCount()) === 0);
        await br.stop();

        // ===== Phase F: wrong-ID target is refused by the updater; real storage untouched =====
        const D3 = path.join(work, 'install3'); cpDir(RC11, D3);
        const m = JSON.parse(fs.readFileSync(path.join(D3, 'manifest.json'), 'utf8')); delete m.key; fs.writeFileSync(path.join(D3, 'manifest.json'), JSON.stringify(m));
        u = updater(['plan', ...uargs(D3)]);
        A('PHASE_F_KEYLESS_TARGET_(FORK_RISK)_REFUSED', u.status === 3 && /MANIFEST_KEY_MISSING|TARGET_WRONG_ID/.test(u.text), { text: u.text.slice(0, 160) });
        report.notes.push('Selective/global reset UI flows, real Windows 10 desktop smoke, real NopeCHA interaction, live Decodo/DO egress: NOT_TESTED in this suite.');
    } catch (e) { failures++; report.error = e.stack; console.error(e); }
    finally {
        report.status = failures ? 'FAILED' : 'SUCCESS'; report.endedAt = new Date().toISOString(); report.total = report.assertions.length; report.failed = failures;
        fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
        try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
        console.log(`\n${report.total - failures}/${report.total} PASS -> ${REPORT}`);
        process.exit(failures ? 1 : 0);
    }
})();


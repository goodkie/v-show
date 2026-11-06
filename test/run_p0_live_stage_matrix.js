/**
 * test/run_p0_live_stage_matrix.js  (Issue #6 P0-RECOVERY-DIRECTIVE-2)
 * Safe live validation (stops before submit via xpider_live_validation_mode) in a
 * SEPARATE isolated Edge profile, loading an explicit unpacked dir (EXT_DIR env).
 * Non-asserting: records per-URL outcome, stage timeline from diagnostic log,
 * FIRST_FAIL_STAGE. Never touches the Owner's installed profile.
 *   EXT_DIR=scratch/rc343_unpacked LIVE_TARGET_URLS=a,b node test/run_p0_live_stage_matrix.js
 */
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const PORT = 9311;
const EXT_DIR = path.resolve(process.env.EXT_DIR || 'extension');
const OUT = path.resolve(process.env.OUT_DIR || 'evidence/recover_p0_20261022');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = new Date();
const lines = [];
const log = m => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); lines.push(l); };

function cdp(ws, method, params = {}) {
  return new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    const h = ev => { const d = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.toString());
      if (d.id === id) { ws.removeEventListener('message', h); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } };
    ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function openWs(u) { const ws = new WebSocket(u); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); return ws; }
const ev = async (ws, expr) => (await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

const STAGES = [
  ['START/PREFLIGHT', /PRIVACY|PREFLIGHT|Starting campaign|START_CAMPAIGN|BUILD_HANDSHAKE|START_STEP/i],
  ['EGRESS', /EGRESS|PROXY|RELAY|PRIVATE_EGRESS|DIRECT/i],
  ['CONTACT_DISCOVERY', /CONTACT|SNIPER|candidate|discover|Scanning paths/i],
  ['FORM_CLASSIFICATION', /classif|FORM_FOUND|findOptimalForm|inquiry form|NO_ACCESSIBLE|ELIGIBLE_FORM/i],
  ['FIELD_MAPPING', /mapp|field|FIELD_CLASSIFY|FIELD_ASSIGN/i],
  ['AUTOFILL', /autofill|fill|typed|AUTOFILL_READY|HyperEngine/i],
  ['CAPTCHA_DETECT', /captcha|turnstile|recaptcha|hcaptcha|CAPTCHA_STATE/i],
  ['PROVIDER_REQUEST/TERMINAL', /provider|solver|2captcha|capsolver|nopecha/i],
  ['MANUAL_FALLBACK', /manual|MANUAL_ASSIST/i],
  ['SUBMIT', /submit|WOULD_SUBMIT|visionSubmit/i],
  ['OUTCOME', /outcome|SETTLED|finishCampaign|terminal|TARGET_COMPLETE/i],
  ['LEDGER', /ledger|LEDGER_INIT|LEDGER_RECORD|history/i]
];
const redact = s => String(s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>').replace(/\b(\d{3}[-. ]\d{3}[-. ]\d{4})\b/g, '<phone>').replace(/(api[_-]?key|token|secret)["':= ]+[A-Za-z0-9_\-]{8,}/gi, '$1=<redacted>');

(async () => {
  log(`EXT_DIR=${EXT_DIR}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
  log(`manifest version=${manifest.version} perms=${JSON.stringify(manifest.permissions)} host=${JSON.stringify(manifest.host_permissions)}`);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-p0-clean-'));
  log(`ISOLATED clean profile (not Owner's): ${prof}`);
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
  const proc = spawn(edge, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, `--load-extension=${EXT_DIR}`, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  let sw = null;
  for (let i = 0; i < 40 && !sw; i++) { await sleep(500); try { sw = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'service_worker' && t.url.includes('background.js')); } catch (_) {} }
  if (!sw) { log('FATAL no service worker'); proc.kill(); process.exit(2); }
  const extId = new URL(sw.url).hostname;
  const swWs = await openWs(sw.webSocketDebuggerUrl);
  const hs = await ev(swWs, `(async()=>({build: (typeof BuildProvenance!=='undefined'&&BuildProvenance.BUILD_INFO)?BuildProvenance.BUILD_INFO:null, active: !!campaignState, perm: await new Promise(r=>chrome.permissions.getAll(r))}))()`);
  log(`extensionId=${extId} buildId=${hs.build && hs.build.buildId} head=${hs.build && hs.build.implementationHead} swAlive=true permissions=${JSON.stringify(hs.perm && hs.perm.origins)}`);

  const urls = (process.env.LIVE_TARGET_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  log(`targets(${urls.length}): ${urls.join(' ')}`);
  const tpl = { id: 'tmpl_p0', version: 1, name: 'P0 Validation', email: 'consultation@xpider.test', phone: '555-019-8833', subject: 'Consultation Inquiry', message: 'Hello, what time would be convenient for me to visit for a consultation?' };
  await ev(swWs, `chrome.storage.local.set({xpider_queue:${JSON.stringify(urls)},xpider_total:${urls.length},xpider_template:${JSON.stringify(tpl)},xpider_owner_function_test_mode:false,xpider_live_validation_mode:true})`);
  const popup = await cdp(swWs, 'Target.createTarget', { url: `chrome-extension://${extId}/popup.html` }).catch(() => null);
  await sleep(1500);
  const pj = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const pt = pj.find(p => p.url && p.url.includes('popup.html'));
  const popWs = await openWs(pt.webSocketDebuggerUrl);
  const tLaunch = Date.now();
  const res = await ev(popWs, `new Promise(r=>{const b=(typeof BuildProvenance!=='undefined'&&BuildProvenance.BUILD_INFO)||{};chrome.runtime.sendMessage({action:'START_CAMPAIGN',queue:${JSON.stringify(urls)},template:${JSON.stringify(tpl)},delayMs:1500,fillDelayMs:100,submitDelayMs:500,targetTimeoutMs:${parseInt(process.env.TARGET_TIMEOUT_MS || '60000', 10)},runScopedDirectPrivacy:true,expectedImplementationHead:b.implementationHead,expectedBuildId:b.buildId,expectedManifestVersion:b.manifestVersion},r)})`);
  log(`START_CAMPAIGN response: ${JSON.stringify(res)}`);

  const deadline = Date.now() + (parseInt(process.env.TOTAL_MS || '900000', 10));
  let last = '';
  while (Date.now() < deadline) {
    await sleep(3000);
    const s = await ev(swWs, `({a:campaignState.isActive,p:campaignState.isPaused,st:campaignState.currentTargetStage,c:campaignState.counters&&campaignState.counters.completed,t:campaignState.counters&&campaignState.counters.total})`);
    const l = JSON.stringify(s); if (l !== last) { log(`poll ${l}`); last = l; }
    if (s.c >= s.t || (!s.a && s.c > 0)) break;
  }
  const fin = await ev(swWs, `(async()=>{
    const h = await getHistoryStoreInstance();
    const at = h.attempts.filter(a=>a.campaignRunId===campaignState.campaignRunId).map(a=>({url:a.sourceUrl,status:a.status,reason:a.reasonCode,ts:a.timestamp||a.updatedAt||null}));
    const store = await chrome.storage.local.get(['xpider_current_run_diagnostics', 'xpider_blackbox_logs', 'xpider_diagnostic_logs']);
    const diagEvents = (store.xpider_current_run_diagnostics && store.xpider_current_run_diagnostics.events) || [];
    const bbLogs = (store.xpider_blackbox_logs || []).map(b => typeof b === 'string' ? b : ('[' + b.timestamp + '][' + b.type + '] ' + b.message));
    const logs = [...diagEvents, ...bbLogs];
    return { at, stats: h.getLedgerStats('currentRun'), logs, paused: campaignState.isPaused };
  })()`);
  log(`ledger stats: ${JSON.stringify(fin.stats)} paused=${fin.paused} capturedLogs=${fin.logs.length}`);
  const raw = fin.logs.map(x => typeof x === 'string' ? x : JSON.stringify(x));
  fs.writeFileSync(path.join(OUT, 'live_diag_log_redacted.txt'), raw.map(redact).join('\n'));
  const matrix = [];
  fin.at.forEach((a, i) => {
    const host = (a.url || '').replace(/^https?:\/\//, '').split('/')[0];
    const anon = `T${i + 1}`;
    const rel = raw.filter(x => host && x.includes(host));
    const hit = {};
    const stageTimestamps = {};
    STAGES.forEach(([n, re]) => {
      const matchLine = rel.find(x => re.test(x)) || (['START/PREFLIGHT', 'EGRESS', 'LEDGER'].includes(n) ? raw.find(x => re.test(x)) : null);
      if (matchLine) {
        hit[n] = true;
        const tsMatch = matchLine.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]/);
        stageTimestamps[n] = tsMatch ? tsMatch[1] : 'present';
      } else {
        hit[n] = false;
      }
    });
    const failed = !/WOULD_SUBMIT|AUTOFILL_READY|SUCCESS|CONFIRMED/i.test(`${a.status} ${a.reason}`);
    let first = null;
    if (failed) { first = (STAGES.find(([n]) => !hit[n]) || ['OUTCOME'])[0]; }
    matrix.push({ target: anon, host: host, status: a.status, reason: a.reason, FIRST_FAIL_STAGE: first, stagesSeen: Object.keys(hit).filter(k => hit[k]), stageTimestamps });
  });
  log('--- STAGE MATRIX (target hosts kept locally; anonymize when posting) ---');
  matrix.forEach(m => log(JSON.stringify(m)));
  fs.writeFileSync(path.join(OUT, 'live_stage_matrix.json'), JSON.stringify({ started: T0.toISOString(), extDir: EXT_DIR, build: hs.build && hs.build.buildId, extId, matrix, stats: fin.stats }, null, 2));
  fs.writeFileSync(path.join(OUT, 'live_stage_matrix.log'), lines.map(redact).join('\n'));
  proc.kill(); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
})().catch(e => { log(`FATAL ${e.stack}`); process.exit(1); });

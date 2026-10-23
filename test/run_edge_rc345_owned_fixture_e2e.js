/**
 * test/run_edge_rc345_owned_fixture_e2e.js
 * Issue #6 RC3.45 T+60: integrated REAL-BROWSER campaign on OWNED loopback fixtures.
 * Drives the real packaged extension engine via START_CAMPAIGN (no test-side field filling),
 * then reads the fixture server's independent submission log (ground truth) and the ledger.
 * Loopback only: no third-party submissions, no CAPTCHA bypass.
 *   EXT_DIR=extension node test/run_edge_rc345_owned_fixture_e2e.js
 */
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const CDP = 9341, FX = 8088;
const EXT_DIR = path.resolve(process.env.EXT_DIR || 'extension');
const OUT = path.resolve(process.env.OUT_DIR || 'evidence/rc3_45_e2e');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lines = [];
const log = m => { const l = `[${new Date().toISOString()}] ${m}`; console.log(l); lines.push(l); };
const TARGETS = (process.env.FIXTURES || 'contact-standard.html,contact-dropdown-checkbox.html,contact-numeric.html,subscribe-no-message.html,booking-no-message.html,no-contact-page.html').split(',').map(f => `http://127.0.0.1:${FX}/${f}`);

function cdp(ws, method, params = {}) {
  return new Promise((res, rej) => {
    const id = Math.floor(Math.random() * 1e9);
    const h = e => { const d = JSON.parse(typeof e.data === 'string' ? e.data : e.toString());
      if (d.id === id) { ws.removeEventListener('message', h); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); } };
    ws.addEventListener('message', h); ws.send(JSON.stringify({ id, method, params }));
  });
}
const openWs = async u => { const ws = new WebSocket(u); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); return ws; };
const ev = async (ws, expr) => { const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; };
const getJson = u => new Promise((res, rej) => http.get(u, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));

(async () => {
  let server, edge;
  const summary = { build: null, startRes: null, targets: TARGETS, submissions: null, ledger: null, verdict: 'UNKNOWN' };
  try {
    server = spawn(process.execPath, [path.resolve('owner-extension-test-site/server.js')], { stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(FX) }) });
    for (let i = 0; i < 20; i++) { try { await getJson(`http://127.0.0.1:${FX}/__xpider_health`); break; } catch (_) { await sleep(300); } }
    await getJson(`http://127.0.0.1:${FX}/__xpider_reset_submissions`).catch(() => {});
    log('Fixture server up (owned, loopback)');

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider-rc345-'));
    edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
      `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, `--load-extension=${EXT_DIR}`,
      '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });

    let sw = null;
    for (let i = 0; i < 40 && !sw; i++) {
      await sleep(500);
      try { sw = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(t => t.type === 'service_worker' && t.url.includes('background.js')); } catch (_) {}
    }
    if (!sw) throw new Error('service worker not found');
    const ws = await openWs(sw.webSocketDebuggerUrl);
    await cdp(ws, 'Runtime.enable');
    let bi = null;
    for (let i = 0; i < 20 && !bi; i++) { bi = await ev(ws, `(typeof BuildProvenance!=='undefined'&&BuildProvenance.BUILD_INFO)?BuildProvenance.BUILD_INFO:null`); if (!bi) await sleep(500); }
    summary.build = bi; log('Build: ' + JSON.stringify(bi));
    const testOnly = await ev(ws, `typeof BuildProvenance.isTestOnlyBuild==='function'?BuildProvenance.isTestOnlyBuild():null`);
    log('isTestOnlyBuild=' + testOnly);

    const tpl = { id: 'tmpl_rc345', version: 1, name: 'John Doe', firstName: 'John', lastName: 'Doe', email: 'johndoe.inquiry.test@gmail.com', phone: '203-555-0199', subject: 'Program Information Inquiry', message: 'Hello, I am interested in your classes and schedule. Please provide program details.' };
    const payload = {
      action: 'START_CAMPAIGN', source: 'USER_START_BUTTON', runScopedDirectPrivacy: true,
      expectedImplementationHead: bi.implementationHead, expectedBuildId: bi.buildId, expectedManifestVersion: bi.manifestVersion || 3,
      queue: TARGETS, template: tpl, templateId: tpl.id, templateVersion: 1,
      delayMs: 1500, fillDelayMs: 100, submitDelayMs: 500, fillMode: 'instant',
      skipPreviouslyAttempted: false, overrideSkipAttempted: true, ownerFunctionTestMode: !!testOnly
    };
    const extId = new URL(sw.url).hostname;
    const popupMeta = await cdp(ws, 'Target.createTarget', { url: `chrome-extension://${extId}/popup.html` });
    await sleep(2500);
    const popupT = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(p => p.id === popupMeta.targetId || (p.url || '').includes('popup.html'));
    if (!popupT) throw new Error('popup target not found');
    const pws = await openWs(popupT.webSocketDebuggerUrl);
    await cdp(pws, 'Runtime.enable');
    summary.startRes = await ev(pws, `new Promise(r=>chrome.runtime.sendMessage(${JSON.stringify(payload)},x=>r(x||{noResponse:true,err:(chrome.runtime.lastError||{}).message})))`);
    log('START_CAMPAIGN response: ' + JSON.stringify(summary.startRes));

    const deadline = Date.now() + (Number(process.env.E2E_TIMEOUT_MS) || 240000);
    let subs = { count: 0, submissions: [] };
    while (Date.now() < deadline) {
      await sleep(4000);
      subs = await getJson(`http://127.0.0.1:${FX}/__xpider_submissions`).catch(() => subs);
      const active = await ev(ws, `new Promise(r=>chrome.storage.local.get(['xpider_isActive'],s=>r(s.xpider_isActive)))`);
      const attempts = await ev(ws, `new Promise(r=>chrome.storage.local.get(['xpider_history_attempts'],s=>r((s.xpider_history_attempts||[]).filter(a=>!/^(PREPARING|FILLING|SUBMITTING|IN_PROGRESS|PENDING|RUNNING|WAITING)/.test(a.status||'PREPARING')).length)))`);
      log(`poll: serverSubmissions=${subs.count} campaignActive=${active} attemptsRecorded=${attempts}`);
      summary.finalActiveFlag = active;
      if (attempts >= TARGETS.length) { log('all targets settled'); break; }
    }
    summary.submissions = subs;
    const pl = await getJson(`http://127.0.0.1:${FX}/__rc345_payloads`).catch(() => ({ count: 0, payloads: [] }));
    summary.strictPayloads = pl;
    summary.semanticChecks = pl.payloads.map(p => {
      const f = p.fields, one = k => (f[k] || [])[0];
      return {
        nameFilled: !!one('your-name'), emailValid: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(one('your-email') || ''),
        phoneIsPhone: /^[0-9+\-() ]{7,}$/.test(one('your-phone') || ''),
        titleFilled: !!one('your-title'), messageFilled: !!one('your-message'),
        checkboxChecked: one('accept-terms') === 'agree',
        checkboxValueNotArbitraryString: one('accept-terms') === 'agree' || one('accept-terms') === undefined,
        titleNotPhone: !/^[0-9+\-() ]{7,}$/.test(one('your-title') || '')
      };
    });
    summary.ledger = await ev(ws, `new Promise(r=>chrome.storage.local.get(null,s=>{const o={};for(const k of Object.keys(s)){if(/ledger|history|visited|attempt|stats/i.test(k))o[k]=s[k];}r(o)}))`);
    const urls = (subs.submissions || []).map(s => s.url || s.path || JSON.stringify(s).slice(0, 80));
    const dups = urls.filter((u, i) => urls.indexOf(u) !== i);
    summary.verdict = (subs.count > 0 && dups.length === 0) ? 'SUBMISSIONS_RECORDED_NO_DUPLICATES' : (subs.count === 0 ? 'NO_SUBMISSION' : 'DUPLICATE_SUBMISSION');
    log(`VERDICT=${summary.verdict} count=${subs.count} dups=${dups.length}`);
  } catch (e) { summary.verdict = 'ERROR'; summary.error = e.message; log('ERROR ' + e.stack); }
  finally {
    fs.writeFileSync(path.join(OUT, 'e2e_summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT, 'e2e.log'), lines.join('\n'));
    try { if (edge) edge.kill(); } catch (_) {}
    try { if (server) server.kill(); } catch (_) {}
    process.exit(0);
  }
})();


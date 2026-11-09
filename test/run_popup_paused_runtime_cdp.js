'use strict';
// Popup paused-state scope runtime regression on real Edge/Chrome (disposable profile).
// Usage: node popup_paused_runtime_cdp.js <extensionDir> <browserExe> <outDir>
// GET_STATE responses are stubbed in-page (synthetic only); storage.get failure is simulated for the hydrate call.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn } = require('child_process');
const [extDir, exe, outDir] = process.argv.slice(2).map(p => path.resolve(p));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_popup_scope_'));
const results = [], sleep = ms => new Promise(r => setTimeout(r, ms));
const rec = (n, p, d) => { results.push({ name: n, pass: !!p, detail: d }); console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : '')); };
const getJson = u => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const put = u => new Promise((res, rej) => { const q = http.request(u, { method: 'PUT' }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(); });
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const hs = [];
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { const p = pend.get(j.id); pend.delete(j.id); j.error ? p.rej(new Error(JSON.stringify(j.error))) : p.res(j.result); } else if (j.method) hs.forEach(h => h(j)); };
  return new Promise(r => ws.onopen = () => r({
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { pend.delete(i); rej(new Error('CDP timeout ' + method)); }, 15000); pend.set(i, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: h => hs.push(h), close: () => ws.close()
  }));
}
let br;
(async () => {
  br = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--headless=new', '--enable-unsafe-extension-debugging', 'about:blank'], { stdio: 'ignore' });
  let ver; for (let i = 0; i < 40 && !ver; i++) { try { ver = await getJson(`http://127.0.0.1:${PORT}/json/version`); } catch { await sleep(500); } }
  rec('BROWSER_STARTED', !!ver, ver && ver.Browser); if (!ver) return;
  const bws = await cdp(ver.webSocketDebuggerUrl);
  const r = await bws.send('Extensions.loadUnpacked', { path: extDir }); const extId = r.id; await sleep(3000);
  rec('EXTENSION_LOADED', extId === 'ldlijlaccfeelfdhgnjbibniocefckjj', extId);
  const scenarios = [
    { name: 'IDLE', resp: { success: true, isActive: false, isPaused: false }, storageThrow: false },
    { name: 'PAUSED_BY_RESPONSE', resp: { success: true, isActive: false, isPaused: true }, storageThrow: false },
    { name: 'ACTIVE', resp: { success: true, isActive: true, isPaused: false }, storageThrow: false },
    { name: 'STORAGE_FETCH_THROWS_PAUSED_RESPONSE', resp: { success: true, isActive: false, isPaused: true }, storageThrow: true },
    { name: 'STORAGE_FETCH_THROWS_IDLE_RESPONSE', resp: { success: true, isActive: false, isPaused: false }, storageThrow: true },
  ];
  const summary = {};
  for (const sc of scenarios) {
    const url = `chrome-extension://${extId}/popup.html`;
    const t = await put(`http://127.0.0.1:${PORT}/json/new?about:blank`); const c = await cdp(t.webSocketDebuggerUrl);
    const errs = [];
    c.on(j => {
      if (j.method === 'Runtime.exceptionThrown') errs.push((j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text));
      if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push(j.params.args.map(a => a.value ?? a.description).join(' '));
    });
    await c.send('Runtime.enable'); await c.send('Page.enable');
    const stub = `(()=>{const resp=${JSON.stringify(sc.resp)};const throwStore=${sc.storageThrow};
      const orig=chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage=function(msg,cb){ if(msg&&msg.action==='GET_STATE'&&typeof cb==='function'){setTimeout(()=>cb(JSON.parse(JSON.stringify(resp))),0);return;} return orig.apply(null,arguments); };
      if(throwStore){const og=chrome.storage.local.get.bind(chrome.storage.local);chrome.storage.local.get=function(k){ if(Array.isArray(k)&&k.includes('xpider_isPaused')&&k.includes('xpider_paused_checkpoint')) return Promise.reject(new Error('simulated storage failure')); return og.apply(null,arguments); };}
    })();`;
    // Stub can only be installed once the extension origin is active: load origin first, then install on subsequent document via new-document hook.
    await c.send('Page.navigate', { url }); await sleep(2500);
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
    errs.length = 0;
    await c.send('Page.navigate', { url }); await sleep(3500);
    const ev = async e => (await c.send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
    const ui = await ev(`JSON.stringify({startRowHidden:document.getElementById('start-buttons-row')?.classList.contains('hidden'),multiHidden:document.getElementById('multi-actions')?.classList.contains('hidden'),resumeBtn:!!document.getElementById('resume-campaign-btn'),pausedFlag:window.__xpider_has_paused_checkpoint===true,url:location.href.slice(0,60)})`);
    const refErr = errs.filter(e => /isPausedState/.test(e));
    const shot = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, `popup_${sc.name}.png`), Buffer.from(shot.data, 'base64'));
    summary[sc.name] = { ui: JSON.parse(ui), errors: errs.slice(0, 5) };
    rec(`NO_isPausedState_REFERENCEERROR_${sc.name}`, refErr.length === 0, `ui=${ui} errors=${JSON.stringify(errs.slice(0, 3)).slice(0, 300)}`);
    c.close();
  }
  const u = x => summary[x].ui;
  rec('IDLE_SHOWS_START_ROW', u('IDLE').startRowHidden === false, JSON.stringify(u('IDLE')));
  rec('PAUSED_HIDES_START_ROW_AND_SHOWS_MULTI', u('PAUSED_BY_RESPONSE').startRowHidden === true && u('PAUSED_BY_RESPONSE').multiHidden === false && u('PAUSED_BY_RESPONSE').pausedFlag, JSON.stringify(u('PAUSED_BY_RESPONSE')));
  rec('ACTIVE_HIDES_START_ROW_AND_SHOWS_MULTI', u('ACTIVE').startRowHidden === true && u('ACTIVE').multiHidden === false, JSON.stringify(u('ACTIVE')));
  rec('STORAGE_THROW_PAUSED_FALLS_BACK_TO_RESPONSE_ISPAUSED', u('STORAGE_FETCH_THROWS_PAUSED_RESPONSE').startRowHidden === true && u('STORAGE_FETCH_THROWS_PAUSED_RESPONSE').pausedFlag, JSON.stringify(u('STORAGE_FETCH_THROWS_PAUSED_RESPONSE')));
  rec('STORAGE_THROW_IDLE_SHOWS_START_ROW', u('STORAGE_FETCH_THROWS_IDLE_RESPONSE').startRowHidden === false, JSON.stringify(u('STORAGE_FETCH_THROWS_IDLE_RESPONSE')));
  fs.writeFileSync(path.join(outDir, 'report_popup_paused_runtime.json'), JSON.stringify({ browser: ver.Browser, extDir, results, summary }, null, 2));
})().catch(e => { console.error('FATAL', e.message); rec('RUNNER_FATAL', false, e.message); }).finally(() => {
  const p = results.filter(r => r.pass).length; console.log(`\n${p}/${results.length} PASS`);
  try { br.kill(); } catch { } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } process.exit(p === results.length ? 0 : 1); }, 1500);
});

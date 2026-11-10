'use strict';
// Popup paused-state scope runtime regression on real Edge/Chrome (disposable profile) with LIVE background Service Worker.
// Usage: node test/run_popup_paused_runtime_cdp.js <extensionDir> <browserExe> <outDir>
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, execSync } = require('node:child_process');

function resolveCliArgs(argv) {
  const repoRoot = path.resolve(__dirname, '..');
  let extArg = null, exeArg = null, outArg = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ext' && argv[i + 1]) { extArg = argv[++i]; }
    else if ((a === '--browser' || a === '--browser-exe') && argv[i + 1]) { exeArg = argv[++i]; }
    else if (a === '--out' && argv[i + 1]) { outArg = argv[++i]; }
    else if (!a.startsWith('--')) { pos.push(a); }
  }
  const resolvedExt = path.resolve(extArg || pos[0] || path.join(repoRoot, 'extension'));
  let rawExe = exeArg || pos[1] || process.env.BROWSER_EXE || 'edge';
  if (/^(edge|msedge)$/i.test(rawExe)) {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome'
    ];
    rawExe = candidates.find(c => fs.existsSync(c)) || rawExe;
  }
  const resolvedExe = fs.existsSync(rawExe) ? path.resolve(rawExe) : rawExe;
  const resolvedOut = path.resolve(outArg || pos[2] || path.join(os.tmpdir(), 'xpider_popup_scope_out'));
  return [resolvedExt, resolvedExe, resolvedOut];
}

const [extDir, exe, outDir] = resolveCliArgs(process.argv.slice(2));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_popup_scope_'));
if (/Google[\\/]Chrome[\\/]User Data|Microsoft[\\/]Edge[\\/]User Data/i.test(profile)) {
  throw new Error('FATAL_PROFILE_SAFETY_VIOLATION: refusing to use non-disposable browser profile: ' + profile);
}
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rec = (n, p, d) => {
  results.push({ name: n, pass: !!p, detail: d });
  console.log((p ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : ''));
};
const getJson = u =>
  new Promise((res, rej) =>
    http.get(u, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch (e) { rej(e); }
      });
    }).on('error', rej)
  );
const put = u =>
  new Promise((res, rej) => {
    const q = http.request(u, { method: 'PUT' }, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => {
        try { res(JSON.parse(d)); } catch (e) { rej(e); }
      });
    });
    q.on('error', rej);
    q.end();
  });

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pend = new Map();
  const hs = [];
  ws.onmessage = m => {
    const j = JSON.parse(m.data);
    if (j.id && pend.has(j.id)) {
      const p = pend.get(j.id);
      pend.delete(j.id);
      j.error ? p.rej(new Error(JSON.stringify(j.error))) : p.res(j.result);
    } else if (j.method) {
      hs.forEach(h => h(j));
    }
  };
  return new Promise(r =>
    (ws.onopen = () =>
      r({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const i = ++id;
            const t = setTimeout(() => {
              pend.delete(i);
              rej(new Error('CDP timeout ' + method));
            }, 15000);
            pend.set(i, {
              res: v => { clearTimeout(t); res(v); },
              rej: e => { clearTimeout(t); rej(e); }
            });
            ws.send(JSON.stringify({ id: i, method, params }));
          }),
        on: h => hs.push(h),
        close: () => ws.close()
      }))
  );
}

let br;
(async () => {
  br = spawn(
    exe,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--headless=new',
      '--enable-unsafe-extension-debugging',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );
  let ver;
  for (let i = 0; i < 40 && !ver; i++) {
    try { ver = await getJson(`http://127.0.0.1:${PORT}/json/version`); } catch { await sleep(500); }
  }
  rec('BROWSER_STARTED', !!ver, ver && ver.Browser);
  if (!ver) return;
  const bws = await cdp(ver.webSocketDebuggerUrl);
  const r = await bws.send('Extensions.loadUnpacked', { path: extDir });
  const extId = r.id;
  await sleep(3000);
  rec('EXTENSION_LOADED', extId === 'ldlijlaccfeelfdhgnjbibniocefckjj', extId);

  // Locate live MV3 background service_worker target
  let swTarget = null;
  for (let i = 0; i < 20 && !swTarget; i++) {
    const list = await getJson(`http://127.0.0.1:${PORT}/json/list`);
    swTarget = list.find(x => x.type === 'service_worker' && x.url.includes(extId));
    if (!swTarget) await sleep(500);
  }
  rec('LIVE_BACKGROUND_SERVICE_WORKER_ATTACHED', !!swTarget, swTarget && swTarget.url);
  const swCdp = swTarget ? await cdp(swTarget.webSocketDebuggerUrl) : null;
  if (swCdp) await swCdp.send('Runtime.enable');

  const swEval = async expr => {
    if (!swCdp) return null;
    const res = await swCdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('SW eval error: ' + res.exceptionDetails.text);
    return res.result.value;
  };

  // --- PART A: REAL UNSTUBBED BACKGROUND SERVICE WORKER GET_STATE ---
  const liveBgScenarios = [
    {
      name: 'LIVE_BG_IDLE',
      setupSw: `
        campaignState.isActive = false;
        campaignState.isPaused = false;
        campaignState.pausedCheckpoint = null;
        campaignState.queue = [];
        chrome.storage.local.remove(['xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_queue']);
      `,
      storageThrow: false
    },
    {
      name: 'LIVE_BG_PAUSED_CHECKPOINT',
      setupSw: `
        campaignState.isActive = false;
        campaignState.isPaused = true;
        campaignState.campaignMode = 'SEMI_AUTO';
        campaignState.pausedCheckpoint = { remainingQueue: ['http://127.0.0.1:8088/contact-standard.html'], campaignMode: 'SEMI_AUTO' };
        chrome.storage.local.set({
          xpider_isPaused: true,
          xpider_campaign_mode: 'SEMI_AUTO',
          xpider_paused_checkpoint: { remainingQueue: ['http://127.0.0.1:8088/contact-standard.html'], campaignMode: 'SEMI_AUTO' }
        });
      `,
      storageThrow: false
    },
    {
      name: 'LIVE_BG_ACTIVE',
      setupSw: `
        campaignState.isActive = true;
        campaignState.isPaused = false;
        campaignState.campaignMode = 'AUTO';
        campaignState.queue = ['http://127.0.0.1:8088/contact-standard.html'];
        campaignState.totalTargets = 1;
        chrome.storage.local.set({ xpider_isPaused: false });
      `,
      storageThrow: false
    },
    {
      name: 'LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW',
      setupSw: `
        campaignState.isActive = false;
        campaignState.isPaused = true;
        campaignState.campaignMode = 'SEMI_AUTO';
        campaignState.pausedCheckpoint = { remainingQueue: ['http://127.0.0.1:8088/contact-standard.html'], campaignMode: 'SEMI_AUTO' };
      `,
      storageThrow: true
    },
    {
      name: 'LIVE_BG_IDLE_WITH_POPUP_STORAGE_THROW',
      setupSw: `
        campaignState.isActive = false;
        campaignState.isPaused = false;
        campaignState.pausedCheckpoint = null;
        campaignState.queue = [];
        chrome.storage.local.remove(['xpider_paused_checkpoint', 'xpider_isPaused', 'xpider_queue']);
      `,
      storageThrow: true
    }
  ];

  const summary = {};
  for (const sc of liveBgScenarios) {
    await swEval(sc.setupSw);
    await sleep(300);
    const liveGetStateAck = await swEval(`new Promise(r => _handleMainMessageInner({ action: 'GET_STATE' }, {}, r))`);
    const url = `chrome-extension://${extId}/popup.html`;
    const t = await put(`http://127.0.0.1:${PORT}/json/new?about:blank`);
    const c = await cdp(t.webSocketDebuggerUrl);
    const errs = [];
    c.on(j => {
      if (j.method === 'Runtime.exceptionThrown') errs.push(j.params.exceptionDetails.exception?.description || j.params.exceptionDetails.text);
      if (j.method === 'Runtime.consoleAPICalled' && j.params.type === 'error') errs.push(j.params.args.map(a => a.value ?? a.description).join(' '));
    });
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    if (sc.storageThrow) {
      await c.send('Page.navigate', { url });
      await sleep(2000);
      const storageThrowOnlyHook = `(()=>{
        const og = chrome.storage.local.get.bind(chrome.storage.local);
        chrome.storage.local.get = function(k) {
          if (Array.isArray(k) && k.includes('xpider_isPaused') && k.includes('xpider_paused_checkpoint')) {
            return Promise.reject(new Error('simulated popup storage.get failure with live background GET_STATE'));
          }
          return og.apply(null, arguments);
        };
      })();`;
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: storageThrowOnlyHook });
      errs.length = 0;
    }
    await c.send('Page.navigate', { url });
    await sleep(3500);
    const ev = async e => (await c.send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
    const ui = await ev(
      `JSON.stringify({startRowHidden:document.getElementById('start-buttons-row')?.classList.contains('hidden'),multiHidden:document.getElementById('multi-actions')?.classList.contains('hidden'),resumeBtn:!!document.getElementById('resume-campaign-btn'),pausedFlag:window.__xpider_has_paused_checkpoint===true,url:location.href.slice(0,60)})`
    );
    const refErr = errs.filter(e => /isPausedState/.test(e));
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, `popup_${sc.name}.png`), Buffer.from(shot.data, 'base64'));
    summary[sc.name] = {
      liveBackgroundGetState: {
        isActive: liveGetStateAck?.isActive,
        isPaused: liveGetStateAck?.isPaused,
        hasPausedCheckpoint: liveGetStateAck?.hasPausedCheckpoint
      },
      ui: JSON.parse(ui),
      errors: errs.slice(0, 5)
    };
    rec(
      `NO_isPausedState_REFERENCEERROR_${sc.name}`,
      refErr.length === 0,
      `bg=${JSON.stringify(summary[sc.name].liveBackgroundGetState)} ui=${ui} errors=${JSON.stringify(errs.slice(0, 3)).slice(0, 260)}`
    );
    c.close();
  }

  const u = x => summary[x].ui;
  rec('LIVE_BG_IDLE_SHOWS_START_ROW', u('LIVE_BG_IDLE').startRowHidden === false, JSON.stringify(u('LIVE_BG_IDLE')));
  rec(
    'LIVE_BG_PAUSED_HIDES_START_ROW_AND_SHOWS_MULTI',
    u('LIVE_BG_PAUSED_CHECKPOINT').startRowHidden === true && u('LIVE_BG_PAUSED_CHECKPOINT').multiHidden === false && u('LIVE_BG_PAUSED_CHECKPOINT').pausedFlag,
    JSON.stringify(u('LIVE_BG_PAUSED_CHECKPOINT'))
  );
  rec(
    'LIVE_BG_ACTIVE_HIDES_START_ROW_AND_SHOWS_MULTI',
    u('LIVE_BG_ACTIVE').startRowHidden === true && u('LIVE_BG_ACTIVE').multiHidden === false,
    JSON.stringify(u('LIVE_BG_ACTIVE'))
  );
  rec(
    'LIVE_BG_STORAGE_THROW_PAUSED_FALLS_BACK_TO_RESPONSE_ISPAUSED',
    u('LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW').startRowHidden === true && u('LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW').pausedFlag,
    JSON.stringify(u('LIVE_BG_PAUSED_WITH_POPUP_STORAGE_THROW'))
  );
  rec(
    'LIVE_BG_STORAGE_THROW_IDLE_SHOWS_START_ROW',
    u('LIVE_BG_IDLE_WITH_POPUP_STORAGE_THROW').startRowHidden === false,
    JSON.stringify(u('LIVE_BG_IDLE_WITH_POPUP_STORAGE_THROW'))
  );

  // Also test real PAUSE_CAMPAIGN / RESUME_CAMPAIGN message dispatch to live background service worker
  const pauseAck = await swEval(`new Promise(r => _handleMainMessageInner({ action: 'PAUSE_CAMPAIGN' }, {}, r))`);
  rec('LIVE_BG_PAUSE_CAMPAIGN_HANDLER_OPERATIONAL', pauseAck && pauseAck.success === true, JSON.stringify(pauseAck));

  const pass = results.filter(r => r.pass).length;
  let gitHeadSha = 'UNKNOWN', extensionTreeSha = 'UNKNOWN';
  try {
    gitHeadSha = execSync('git rev-parse HEAD', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
    extensionTreeSha = execSync('git rev-parse HEAD:extension', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
  } catch {}
  fs.writeFileSync(
    path.join(outDir, 'report_popup_paused_runtime.json'),
    JSON.stringify(
      {
        gitHeadSha,
        extensionTreeSha,
        nodeVersion: process.version,
        browser: ver.Browser,
        extDir,
        disposableProfileVerified: true,
        passed: pass,
        failed: results.length - pass,
        total: results.length,
        results,
        summary
      },
      null,
      2
    )
  );
})()
  .catch(e => {
    console.error('FATAL', e.message);
    rec('RUNNER_FATAL', false, e.message);
  })
  .finally(() => {
    const p = results.filter(r => r.pass).length;
    console.log(`\n${p}/${results.length} PASS`);
    try { br.kill(); } catch {}
    setTimeout(() => {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
      process.exit(p === results.length ? 0 : 1);
    }, 1500);
  });

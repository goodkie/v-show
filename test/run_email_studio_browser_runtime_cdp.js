'use strict';
// Real-browser runtime validation of the Email Studio page (Directive #6746969268 item 1).
// Usage: node scripts/email_studio_runtime_cdp.js <extensionDir> <browserExe> <outDir>
// Disposable temp profile only. No network sends. Synthetic data only.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { spawn, execSync } = require('child_process');
const [extDir, exe, outDir] = process.argv.slice(2).map(p => path.resolve(p));
fs.mkdirSync(outDir, { recursive: true });
const PORT = 9333 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_email_studio_'));
const results = [], consoleLog = [], requests = [];
const rec = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = u => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const put = u => new Promise((res, rej) => { const q = http.request(u, { method: 'PUT' }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(); });

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { const p = pend.get(j.id); pend.delete(j.id); j.error ? p.rej(new Error(JSON.stringify(j.error))) : p.res(j.result); } else if (j.method) handlers.forEach(h => h(j)); };
  return new Promise(r => ws.onopen = () => r({
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { pend.delete(i); rej(new Error('CDP timeout ' + method)); }, 15000); pend.set(i, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: h => handlers.push(h), close: () => ws.close()
  }));
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--headless=new', `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`, '--enable-unsafe-extension-debugging', 'about:blank'];
  const br = spawn(exe, args, { stdio: 'ignore' });
  const ver = await (async () => { for (let i = 0; i < 40; i++) { try { return await getJson(`http://127.0.0.1:${PORT}/json/version`); } catch { await sleep(500); } } })();
  if (!ver) { rec('BROWSER_STARTED', false); return finish(br); }
  rec('BROWSER_STARTED', true, ver.Browser + ' | profile=' + profile);
  // Try to ensure extension loaded (service worker target) ; fallback to CDP Extensions.loadUnpacked
  let extId = null;
  const browserWs = await cdp(ver.webSocketDebuggerUrl);
  for (let i = 0; i < 16 && !extId; i++) {
    const t = await getJson(`http://127.0.0.1:${PORT}/json/list`);
    const sw = t.find(x => /^chrome-extension:\/\/[a-p]{32}\//.test(x.url));
    if (sw) extId = sw.url.match(/chrome-extension:\/\/([a-p]{32})/)[1]; else await sleep(500);
  }
  let loadMode = 'load-extension flag';
  const builtin = extId; if (!extId || extId !== 'ldlijlaccfeelfdhgnjbibniocefckjj') {
    try { const r = await browserWs.send('Extensions.loadUnpacked', { path: extDir }); extId = r.id; loadMode = 'CDP Extensions.loadUnpacked (ignored pre-existing id ' + builtin + ')'; } catch (e) { loadMode = 'FAILED: ' + e.message.slice(0, 160); }
  }
  await sleep(3000);
  rec('EXTENSION_LOADED_UNPACKED', !!extId, `id=${extId} via ${loadMode}`);
  if (!extId) return finish(br);

  async function openPage(url) {
    const t = await put(`http://127.0.0.1:${PORT}/json/new?${encodeURI(url)}`);
    const c = await cdp(t.webSocketDebuggerUrl);
    c.on(j => {
      if (j.method === 'Runtime.consoleAPICalled') consoleLog.push({ page: url, type: j.params.type, text: j.params.args.map(a => a.value ?? a.description).join(' ') });
      if (j.method === 'Runtime.exceptionThrown') consoleLog.push({ page: url, type: 'exception', text: j.params.exceptionDetails.text + ' ' + (j.params.exceptionDetails.exception?.description || '') });
      if (j.method === 'Log.entryAdded') consoleLog.push({ page: url, type: 'log:' + j.params.entry.level, text: j.params.entry.text + ' ' + (j.params.entry.url || '') });
      if (j.method === 'Network.requestWillBeSent') requests.push({ page: url, url: j.params.request.url, method: j.params.request.method });
    });
    await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Network.enable'); await c.send('Page.enable'); await c.send('DOM.enable');
    for (let k = 0; k < 4; k++) { await sleep(1500); const u = await c.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }); if (String(u.result.value).startsWith('chrome-extension://')) break; await c.send('Page.navigate', { url }); }
    return c;
  }
  const ev = async (c, expr) => { const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
  const shot = async (c, name) => { const r = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name), Buffer.from(r.data, 'base64')); };

  // --- popup link
  const pop = await openPage(`chrome-extension://${extId}/popup.html`);
  console.log('DIAG popup', await ev(pop, `JSON.stringify({u:location.href,t:document.title,b:document.body?document.body.innerHTML.length:-1,rs:document.readyState,txt:(document.body?document.body.innerText:'').slice(0,160)})`));
  const link = await ev(pop, `(()=>{const a=document.getElementById('email-template-studio-link');return a?{href:a.getAttribute('href'),target:a.target,rel:a.rel,text:a.textContent.trim()}:null})()`);
  rec('POPUP_HAS_EMAIL_STUDIO_LINK', link && link.href === 'email-studio/index.html' && link.target === '_blank' && /noopener/.test(link.rel), JSON.stringify(link));
  const navIds = await ev(pop, `[...document.querySelectorAll('.nav-btn, [data-tab], nav a, nav button')].map(x=>(x.id||x.dataset.tab||x.textContent.trim()).slice(0,30)).slice(0,30)`);
  rec('POPUP_EXISTING_NAV_ITEMS_PRESENT', navIds.length >= 3, JSON.stringify(navIds));
  await shot(pop, 'popup_with_email_studio_link.png');
  const popErrors = consoleLog.filter(x => x.page.endsWith('popup.html') && /exception|error/.test(x.type));
  rec('POPUP_CONSOLE_ERRORS_RECORDED', true, `${popErrors.length} error/exception entries (info only: ${JSON.stringify(popErrors.slice(0, 3))})`);

  // --- studio
  const st = await openPage(`chrome-extension://${extId}/email-studio/index.html`);
  console.log('DIAG studio', await ev(st, `JSON.stringify({u:location.href,t:document.title,b:document.body?document.body.innerHTML.length:-1,rs:document.readyState,txt:(document.body?document.body.innerText:'').slice(0,160)})`));
  const base = await ev(st, `({title:document.title,checks:document.querySelectorAll('#checkList li').length,sandbox:document.getElementById('preview').getAttribute('sandbox'),srcdoc:document.getElementById('preview').srcdoc.length,inlineScripts:[...document.scripts].filter(s=>!s.src).length,inlineStyleTags:document.querySelectorAll('style').length})`);
  rec('STUDIO_RENDERS_UNDER_MV3_CSP', base.title === 'XPIDER Email Template Studio' && base.checks > 3 && base.srcdoc > 100 && base.inlineScripts === 0 && base.inlineStyleTags === 0, JSON.stringify(base));
  rec('PREVIEW_IFRAME_SANDBOX_EMPTY', base.sandbox === '', JSON.stringify(base.sandbox));
  await shot(st, 'studio_initial.png');

  // hook downloads/alerts
  await ev(st, `window.__dl=[];window.__alerts=[];window.alert=m=>window.__alerts.push(String(m));
    HTMLAnchorElement.prototype.click=function(){const n=this.download,u=this.href;fetch(u).then(r=>r.text()).then(t=>window.__dl.push({name:n,text:t}));};`);
  const setVal = (id, v) => ev(st, `(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);

  // escaping
  await setVal('heading', '<img src=x onerror=alert(1)>H"\'&');
  await setVal('body', '<script>window.__pwn=1</script>line1\n\nSecond <b>para</b>');
  const doc1 = await ev(st, `document.getElementById('preview').srcdoc`);
  rec('BODY_AND_HEADING_HTML_ESCAPED', !/<script>window\.__pwn/.test(doc1) && !/<img src=x/.test(doc1) && /&lt;script&gt;/.test(doc1) && /&lt;img/.test(doc1), 'no raw <script>/<img> in srcdoc');
  rec('NO_SCRIPT_EXECUTION_IN_STUDIO', (await ev(st, `window.__pwn===undefined`)) && (await ev(st, `document.getElementById('preview').contentWindow===null || (()=>{try{return document.getElementById('preview').contentWindow.__pwn===undefined}catch(e){return true}})()`)), 'window.__pwn undefined');

  // remote image + alt warnings
  await setVal('image', 'http://insecure.example.test/a.png');
  let lis = await ev(st, `[...document.querySelectorAll('#checkList li')].map(l=>l.className+'|'+l.textContent)`);
  rec('HTTP_IMAGE_FLAGGED_NOT_GOOD', lis.some(t => t.startsWith('warn') && /HTTPS/.test(t)), JSON.stringify(lis.filter(t => /HTTPS/.test(t))));
  await setVal('image', 'https://images.example.test/a.png'); await setVal('alt', '');
  lis = await ev(st, `[...document.querySelectorAll('#checkList li')].map(l=>l.className+'|'+l.textContent)`);
  rec('MISSING_ALT_FLAGGED', lis.some(t => t.startsWith('warn') && /alt/i.test(t)), JSON.stringify(lis.filter(t => /alt/i.test(t))));
  const doc2 = await ev(st, `document.getElementById('preview').srcdoc`);
  rec('REMOTE_IMAGE_DEFAULT_OFF', !/https:\/\/images\.example\.test\\/a\.png/.test(doc2), 'remote image is NOT included in preview before explicit opt-in');
  const previewRequestsBefore = requests.filter(r => /images\.example\.test/.test(r.url));
  rec('REMOTE_IMAGE_NO_REQUEST_BEFORE_OPTIN', previewRequestsBefore.length === 0, 'remote image requests before opt-in: ' + previewRequestsBefore.length);
  await ev(st, `document.getElementById('loadRemoteImages').click()`);
  const doc2OptIn = await ev(st, `document.getElementById('preview').srcdoc`);
  rec('HTTPS_IMAGE_REFERENCED_AFTER_OPTIN', /https:\/\/images\.example\.test\\/a\.png/.test(doc2OptIn), 'external image now shown after explicit opt-in');
  await setVal('alt', 'alt text');
  const imgReq = requests.filter(r => /images\.example\.test/.test(r.url));
  rec('HOSTED_IMAGE_PRIVACY_NETWORK_OBSERVATION', true, `requests to hosted image host observed after opt-in: ${imgReq.length} (test domain; not deliverability evidence)`);
  await ev(st, `document.getElementById('loadRemoteImages').click()`);

  // local image
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const pngPath = path.join(outDir, 'synthetic_1x1.png'); fs.writeFileSync(pngPath, png);
  await setVal('image', '');
  const root = await st.send('DOM.getDocument'); const q = await st.send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#imageFile' });
  await st.send('DOM.setFileInputFiles', { files: [pngPath], nodeId: q.nodeId }); await sleep(600);
  const doc3 = await ev(st, `document.getElementById('preview').srcdoc`);
  rec('LOCAL_IMAGE_PREVIEW_BLOB_ONLY', /blob:chrome-extension:\/\/|blob:/.test(doc3), 'preview uses blob: URL');
  await ev(st, `document.getElementById('exportHtml').click()`); await sleep(800);
  const alerts = await ev(st, `window.__alerts`); const dl = await ev(st, `window.__dl`);
  const html = (dl.find(d => d.name.endsWith('.html')) || {}).text || '';
  rec('EXPORT_HTML_WARNS_LOCAL_IMAGE_NOT_INCLUDED', alerts.length >= 1, JSON.stringify(alerts));
  rec('EXPORT_HTML_HAS_NO_BLOB_URL', html.length > 200 && !/blob:/.test(html), `html bytes=${html.length}`);
  await shot(st, 'studio_local_image_preview.png');

  // mobile/desktop
  await ev(st, `document.getElementById('mobile').click()`);
  const wM = await ev(st, `document.getElementById('preview').style.width`);
  await ev(st, `document.getElementById('desktop').click()`);
  const wD = await ev(st, `document.getElementById('preview').style.width`);
  rec('MOBILE_DESKTOP_TOGGLE', /360px/.test(wM) && wD === '100%', `mobile=${wM} desktop=${wD}`);
  await ev(st, `document.getElementById('mobile').click()`); await shot(st, 'studio_mobile_preview.png');

  // exports
  await setVal('kind', 'marketing'); await setVal('unsubscribe', 'https://vivpr.pro/unsubscribe/token'); await setVal('address', '1 Test St'); await setVal('reply', 'support@vivpr.pro');
  await ev(st, `window.__dl.length=0;document.getElementById('exportText').click();document.getElementById('exportJson').click();document.getElementById('exportHtml').click()`); await sleep(1000);
  const dl2 = await ev(st, `window.__dl`);
  const names = dl2.map(d => d.name).sort();
  rec('EXPORTS_HTML_TXT_JSON', JSON.stringify(names) === JSON.stringify(['xpider-vivpr-template.html', 'xpider-vivpr-template.json', 'xpider-vivpr-template.txt']), JSON.stringify(names));
  const j = dl2.find(d => d.name.endsWith('.json')); let jj = null; try { jj = JSON.parse(j.text); } catch { }
  rec('JSON_EXPORT_HAS_NO_SECRETS', jj && !/api[_-]?key|re_[A-Za-z0-9]{10,}|password/i.test(j.text), 'keys=' + (jj ? Object.keys(jj.template).join(',') : 'n/a'));
  const txt = dl2.find(d => d.name.endsWith('.txt'));
  rec('TXT_EXPORT_HAS_UNSUB_AND_ADDRESS', txt && /vivpr\.pro\/unsubscribe\/token/.test(txt.text) && /1 Test St/.test(txt.text), `bytes=${txt && txt.text.length}`);
  await shot(st, 'studio_marketing_checks.png');

  // network
  const bad = requests.filter(r => r.page.includes('email-studio') && /^https?:/.test(r.url) && !/images\.example\.test|insecure\.example\.test/.test(r.url) || (r.method !== 'GET' && !r.url.startsWith('chrome-extension://') && !r.url.startsWith('blob:') && !r.url.startsWith('data:')));
  rec('NO_NON_GET_OR_UNEXPECTED_NETWORK_FROM_STUDIO', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
  const studioErr = consoleLog.filter(x => x.page.includes('email-studio') && /exception|error/.test(x.type) && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(x.text));
  rec('NO_CSP_OR_JS_ERRORS_IN_STUDIO_CONSOLE', studioErr.length === 0 && !consoleLog.some(x => /Content Security Policy/i.test(x.text) && x.page.includes('email-studio')), JSON.stringify(studioErr.slice(0, 5)));
  finish(br, extId, ver.Browser);
})().catch(e => { console.error('FATAL', e); rec('RUNNER_FATAL', false, e.message); process.exitCode = 1; });

function finish(br, extId, browser) {
  const pass = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(outDir, 'report_email_studio_chrome_runtime.json'), JSON.stringify({ browser, extId, extDir, results, consoleLog, requests: requests.map(r => ({ url: r.url.slice(0, 120), method: r.method })) }, null, 2));
  console.log(`\n${pass}/${results.length} PASS -> ${path.join(outDir, 'report_email_studio_chrome_runtime.json')}`);
  try { br.kill(); } catch { }
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } process.exit(pass === results.length ? 0 : 1); }, 1500);
}


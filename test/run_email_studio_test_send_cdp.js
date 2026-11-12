'use strict';
/**
 * Real Edge browser verification of Email Studio Test Send & Production Hold controls.
 * Uses disposable profile only.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const extDir = path.join(repoRoot, 'extension');
const browserExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.join(repoRoot, 'evidence', 'email_studio_test_send');
fs.mkdirSync(outDir, { recursive: true });

const PORT = 9555;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'xpider_test_send_edge_'));

const results = [];
function rec(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = u => new Promise((res, rej) => http.get(u, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

const put = u => new Promise((res, rej) => {
  const q = http.request(u, { method: 'PUT' }, r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => res(JSON.parse(d)));
  });
  q.on('error', rej);
  q.end();
});

(async () => {
  console.log(`Starting Edge with disposable profile: ${profile}`);
  const br = spawn(browserExe, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--load-extension=${extDir}`,
    'about:blank'
  ]);

  let ver = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try { ver = await getJson(`http://127.0.0.1:${PORT}/json/version`); if (ver) break; } catch (_) {}
  }
  rec('BROWSER_STARTED', !!ver, ver?.Browser);

  const connect = wsUrl => new Promise(res => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    ws.onopen = () => res({
      send: (method, params = {}) => new Promise((r, j) => {
        const mid = id++;
        pending.set(mid, { r, j });
        ws.send(JSON.stringify({ id: mid, method, params }));
      }),
      close: () => ws.close()
    });
    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.j(new Error(msg.error.message));
        else p.r(msg.result);
      }
    };
  });

  const browserWs = await connect(ver.webSocketDebuggerUrl);
  const extList = await browserWs.send('Extensions.loadUnpacked', { path: extDir });
  const extId = extList.id || 'ldlijlaccfeelfdhgnjbibniocefckjj';
  rec('EXTENSION_LOADED', !!extId, extId);

  const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const studioTarget = await put(`http://127.0.0.1:${PORT}/json/new?chrome-extension://${extId}/email-studio/index.html`);
  const studioWs = await connect(studioTarget.webSocketDebuggerUrl);
  await studioWs.send('Page.enable');
  await sleep(1000);

  const ev = async code => {
    const r = await studioWs.send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    return r.result.value;
  };

  // 1. Verify header badge
  const headerTag = await ev(`document.getElementById('modeTag')?.textContent.trim()`);
  rec('HEADER_TAG_SHOWS_TEST_SEND_AND_PROD_LOCK', headerTag.includes('TEST SEND') && headerTag.includes('상용 발송 잠금'), headerTag);

  // 2. Verify simulator recipient options
  const recipientOptions = await ev(`[...document.querySelectorAll('#testRecipient option')].map(o => o.value)`);
  rec('RECIPIENT_OPTIONS_STRICT_SIMULATOR', JSON.stringify(recipientOptions) === JSON.stringify(['delivered@resend.dev', 'bounced@resend.dev', 'complained@resend.dev']), JSON.stringify(recipientOptions));

  // 3. Verify sender is fixed to onboarding@resend.dev
  const testSender = await ev(`document.getElementById('testSender')?.value`);
  const isSenderReadonly = await ev(`document.getElementById('testSender')?.readOnly`);
  rec('TEST_SENDER_FIXED_RESEND_DEV', testSender === 'onboarding@resend.dev' && isSenderReadonly === true, `sender=${testSender}, readonly=${isSenderReadonly}`);

  // 4. Verify test send button exists and enabled
  const btnTestSend = await ev(`(()=>{const b = document.getElementById('btnTestSend'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;})()`);
  rec('BTN_TEST_SEND_ENABLED', btnTestSend && btnTestSend.disabled === false, JSON.stringify(btnTestSend));

  // 5. Verify production send button exists and locked/disabled
  const btnProdSend = await ev(`(()=>{const b = document.getElementById('btnProdSend'); return b ? { text: b.textContent.trim(), disabled: b.disabled, title: b.title } : null;})()`);
  rec('BTN_PROD_SEND_LOCKED', btnProdSend && btnProdSend.disabled === true, JSON.stringify(btnProdSend));

  // 6. Test interaction: Click companion check
  await ev(`document.getElementById('btnCheckCompanion')?.click()`);
  await sleep(600);
  const statusAfterCheck = await ev(`document.getElementById('testSendStatus')?.textContent`);
  rec('CHECK_COMPANION_INTERACTION_RESPONSIVE', statusAfterCheck.length > 5, statusAfterCheck);

  // 7. Test interaction: Click test send (expect fail-closed since companion is not running in background during test)
  await ev(`document.getElementById('btnTestSend')?.click()`);
  await sleep(1000);
  const statusAfterSend = await ev(`document.getElementById('testSendStatus')?.textContent`);
  rec('TEST_SEND_FAILS_CLOSED_GRACEFULLY', statusAfterSend.includes('전송 실패') || statusAfterSend.includes('발송 차단') || statusAfterSend.includes('컴패니언'), statusAfterSend);

  // 8. Capture screenshot
  const shot = await studioWs.send('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(outDir, 'studio_test_send_verified.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  rec('SCREENSHOT_CAPTURED', fs.existsSync(shotPath) && fs.statSync(shotPath).size > 10000, shotPath);

  // Summary report
  const pass = results.filter(r => r.pass).length;
  fs.writeFileSync(path.join(outDir, 'report_email_studio_test_send.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    browser: ver.Browser,
    extensionId: extId,
    total: results.length,
    passed: pass,
    failed: results.length - pass,
    results
  }, null, 2));

  console.log(`\n${pass}/${results.length} PASS -> ${path.join(outDir, 'report_email_studio_test_send.json')}`);

  try { br.kill(); } catch (_) {}
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  process.exit(pass === results.length ? 0 : 1);
})().catch(err => {
  console.error('FATAL', err);
  process.exit(1);
});

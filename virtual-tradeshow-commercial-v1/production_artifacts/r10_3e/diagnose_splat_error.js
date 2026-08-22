const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function diagnoseSPZ() {
  const debugPort = 9311;
  const proc = spawn(chromePath, [
    '--remote-debugging-port=' + debugPort,
    '--no-sandbox',
    '--window-size=1400,900',
    'http://127.0.0.1:3000/wilo-demo.html'
  ]);

  await new Promise(r => setTimeout(r, 4000));

  const tabs = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + debugPort + '/json', res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });

  const target = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    const handler = (data) => {
      const res = JSON.parse(data.toString());
      if (res.id === id) {
        ws.off('message', handler);
        if (res.error) reject(res.error); else resolve(res.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await call('Runtime.enable');
  await call('Console.enable');

  // Collect console messages
  const messages = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Console.messageAdded') {
      const m = msg.params.message;
      messages.push('[' + m.level + '] ' + m.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
      messages.push('[console] ' + args);
    }
  });

  // Switch to Partial Preview
  await new Promise(r => setTimeout(r, 2000));
  await call('Runtime.evaluate', { expression: `switchViewerMode('PARTIAL_PREVIEW');` });

  // Wait and collect logs
  await new Promise(r => setTimeout(r, 15000));

  // Get Spark state
  const sparkState = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      sparkExists: typeof window.Spark !== 'undefined',
      sparkKeys: typeof window.Spark === 'object' ? Object.keys(window.Spark) : [],
      precisionViewerExists: typeof PrecisionSplatViewer !== 'undefined',
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      partialLoaded: window.__VSHOW_STATE__ && window.__VSHOW_STATE__.partialAuthentic3DPreview,
      loadingVisible: document.getElementById('partial-loading-state') && document.getElementById('partial-loading-state').style.display !== 'none',
      errorVisible: document.getElementById('partial-error-state') && document.getElementById('partial-error-state').style.display !== 'none'
    })`
  });

  console.log('\n=== SPARK STATE ===');
  console.log(sparkState.result.value);
  console.log('\n=== CONSOLE MESSAGES ===');
  messages.forEach(m => console.log(m));

  ws.close();
  proc.kill();
  process.exit(0);
}

diagnoseSPZ().catch(e => { console.error('Fatal:', e); process.exit(1); });

const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = 9250;

const p = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=' + cdpPort,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1400,900',
  'https://v-show-commercial-v1-production.up.railway.app/wilo-demo.html'
]);

setTimeout(async () => {
  try {
    const tabs = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });

    console.log('Tabs:', tabs.map(t => ({ title: t.title, url: t.url })));
    const targetTab = tabs.find(t => t.type === 'page' && t.url.includes('wilo-demo')) || tabs[0];
    const WebSocket = require('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/node_modules/ws');
    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = ++id;
        const handler = (data) => {
          const res = JSON.parse(data.toString());
          if (res.id === curId) {
            ws.off('message', handler);
            if (res.error) reject(res.error);
            else resolve(res.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const doc = await call('Runtime.evaluate', {
      expression: `({
        imgSrc: document.getElementById('wilo-photo-image')?.src,
        imgComplete: document.getElementById('wilo-photo-image')?.complete,
        imgNaturalWidth: document.getElementById('wilo-photo-image')?.naturalWidth,
        imgNaturalHeight: document.getElementById('wilo-photo-image')?.naturalHeight,
        viewBadge: document.getElementById('photo-view-badge')?.textContent,
        viewsCount: window.boothViews?.length,
        vshowState: window.__VSHOW_STATE__
      })`,
      returnByValue: true
    });
    console.log('Production DOM State Evaluation:', JSON.stringify(doc.result.value, null, 2));

    const shot = await call('Page.captureScreenshot', { format: 'png' });
    console.log('Screenshot length:', shot.data?.length);
    const fs = require('fs');
    const path = require('path');
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(path.join('E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/production_artifacts/r9d5', 'R9D5_PROD_15.png'), buf);
    fs.writeFileSync(path.join('C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8', 'R9D5_PROD_15.png'), buf);
    console.log('Successfully saved R9D5_PROD_15.png (' + (buf.length/1024).toFixed(1) + ' KB)');

    ws.close();
    p.kill();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    p.kill();
    process.exit(1);
  }
}, 3000);

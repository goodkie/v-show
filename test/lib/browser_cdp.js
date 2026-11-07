'use strict';
// Shared CDP browser helper for disposable-profile suites (Chrome or Edge).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const KIND = (process.env.XPIDER_BROWSER || 'chrome').toLowerCase();
const BIN = KIND === 'chrome' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EXT_ID = 'ldlijlaccfeelfdhgnjbibniocefckjj';
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    constructor(profile, extDir, port) { this.profile = profile; this.extDir = extDir; this.port = port || 9241; }
    async start(url = 'about:blank') {
        const extFlags = KIND === 'chrome' ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${this.extDir}`, `--load-extension=${this.extDir}`];
        this.proc = spawn(BIN, [`--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`, ...extFlags, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', url], { stdio: 'ignore' });
        this.exited = new Promise(r => this.proc.on('exit', r));
        for (let i = 0; i < 60; i++) { await sleep(250); try { const v = await fetch(`http://127.0.0.1:${this.port}/json/version`).then(r => r.json()); this.bws = await openWs(v.webSocketDebuggerUrl); break; } catch (_) {} }
        if (!this.bws) throw new Error('no CDP');
        if (KIND === 'chrome') await cdp(this.bws, 'Extensions.loadUnpacked', { path: this.extDir });
        await this.wakeSw();
    }
    async targets() { return fetch(`http://127.0.0.1:${this.port}/json`).then(r => r.json()); }
    async wakeSw() {
        for (let i = 0; i < 40; i++) {
            let sw = (await this.targets()).find(x => x.type === 'service_worker' && x.url.includes(EXT_ID));
            if (!sw) { await cdp(this.bws, 'Target.createTarget', { url: `chrome-extension://${EXT_ID}/popup.html` }).catch(() => {}); await sleep(1200); sw = (await this.targets()).find(x => x.type === 'service_worker' && x.url.includes(EXT_ID)); }
            if (sw) {
                if (this.sws) try { this.sws.close(); } catch (_) {}
                this.sws = await openWs(sw.webSocketDebuggerUrl);
                await cdp(this.sws, 'Runtime.enable');
                const r = await cdp(this.sws, 'Runtime.evaluate', { expression: `typeof chrome !== 'undefined' && !!chrome.storage`, returnByValue: true }).catch(() => null);
                if (r && r.result && r.result.value === true) return;
            }
            await sleep(400);
        }
        throw new Error('SW did not boot');
    }
    async sw(expr) { const r = await cdp(this.sws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
    async openPopup() {
        const r = await cdp(this.bws, 'Target.createTarget', { url: `chrome-extension://${EXT_ID}/popup.html` }); await sleep(2500);
        this.popupId = r.targetId; return r.targetId;
    }
    async page(urlPart, expr, awaitPromise = true) {
        const t = (await this.targets()).find(x => x.type === 'page' && x.url.includes(urlPart));
        if (!t) throw new Error('page not found ' + urlPart);
        const ws = await openWs(t.webSocketDebuggerUrl);
        try {
            const r = await cdp(ws, 'Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
            if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
            return r.result.value;
        } finally { ws.close(); await sleep(100); }
    }
    async shot(urlPart, file) {
        const t = (await this.targets()).find(x => x.type === 'page' && x.url.includes(urlPart)); if (!t) return null;
        const ws = await openWs(t.webSocketDebuggerUrl);
        try { const r = await cdp(ws, 'Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; } finally { ws.close(); await sleep(100); }
    }
    async version() { return (await cdp(this.bws, 'Browser.getVersion')).product; }
    async stop() {
        try { await cdp(this.bws, 'Browser.close'); } catch (_) {}
        await Promise.race([this.exited, sleep(8000)]);
        if (this.proc.exitCode === null) this.proc.kill();
        await sleep(800);
    }
}
module.exports = { Br, cdp, openWs, sleep, KIND, BIN, EXT_ID };


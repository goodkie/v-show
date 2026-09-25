/**
 * Antigravity Multi-PC Universal Sync Dashboard Server
 * Native Node.js HTTP server (ZERO external npm dependencies)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');
const SyncEngine = require('./engine');

const PORT = process.env.PORT || 3900;
const engine = new SyncEngine();

// SSE Clients for real-time progress and logs
let sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => {
    try { res.write(payload); } catch (e) {}
  });
}

const logger = {
  log: (msg) => broadcast('log', { level: 'INFO', message: msg, time: new Date().toLocaleTimeString() }),
  info: (msg) => broadcast('log', { level: 'INFO', message: msg, time: new Date().toLocaleTimeString() }),
  warn: (msg) => broadcast('log', { level: 'WARN', message: msg, time: new Date().toLocaleTimeString() }),
  error: (msg) => broadcast('log', { level: 'ERROR', message: msg, time: new Date().toLocaleTimeString() })
};

function sendProgress(percent, statusText) {
  broadcast('progress', { percent, statusText });
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. SSE Stream for Real-time Progress & Logs
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': ping\n\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter(c => c !== res);
    });
    return;
  }

  // 2. Status API
  if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hostname: os.hostname(),
      username: engine.username,
      targetDir: engine.targetDir,
      gdriveRoot: engine.gdriveRoot,
      syncPackage: engine.syncPackageName,
      branch: engine.defaultBranch,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 3. Diagnose API
  if (pathname === '/api/diagnose') {
    try {
      const isDeep = parsedUrl.query.deep === '1';
      const report = await engine.diagnose(logger, isDeep);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 4. Remap Paths API
  if (pathname === '/api/remap' && req.method === 'POST') {
    try {
      sendProgress(20, '경로 동적 리매핑 시작...');
      const out = await engine.remapPaths(logger);
      sendProgress(100, '경로 동적 리매핑 완료');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 5. Setup New PC API
  if (pathname === '/api/setup' && req.method === 'POST') {
    try {
      const out = await engine.setupNewPc(sendProgress, logger);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`설치 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 6. Auto Recover API
  if (pathname === '/api/recover' && req.method === 'POST') {
    try {
      sendProgress(30, '손상 팩파일 격리 및 Git Refetch 중...');
      const out = await engine.autoRecover(logger);
      sendProgress(100, 'Git 데이터베이스 복구 완료');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`복구 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 7. Push API
  if (pathname === '/api/push' && req.method === 'POST') {
    try {
      const out = await engine.pushSync(sendProgress, logger);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`Push 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // 8. Pull API
  if (pathname === '/api/pull' && req.method === 'POST') {
    try {
      const out = await engine.pullSync(sendProgress, logger);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      logger.error(`Pull 중 오류 발생: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`  [AGY-Sync Master] Universal Multi-PC Dashboard Active!`);
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`  Network URL: http://${getLocalIp()}:${PORT}`);
  console.log(`================================================================`);
});

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * server.js
 * 
 * Lightweight local test HTTP server for XPIDER Owner Extension Functional Test Kit.
 * Serves controlled test pages strictly on localhost (127.0.0.1:8088).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8088;
const HOST = '127.0.0.1';
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS & No-Cache
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(BASE_DIR, safePath);

  // Security check: ensure file is inside BASE_DIR
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('========================================================================');
  console.log(`  XPIDER CONTROLLED TEST SITE SERVER RUNNING AT http://${HOST}:${PORT}`);
  console.log('========================================================================');
  console.log(`  Portal URL:   http://${HOST}:${PORT}/index.html`);
  console.log(`  Case A:       http://${HOST}:${PORT}/contact-standard.html`);
  console.log(`  Case B:       http://${HOST}:${PORT}/contact-dropdown-checkbox.html`);
  console.log(`  Case C:       http://${HOST}:${PORT}/contact-numeric.html`);
  console.log(`  Case D:       http://${HOST}:${PORT}/subscribe-no-message.html`);
  console.log(`  Case E:       http://${HOST}:${PORT}/booking-no-message.html`);
  console.log(`  Case F:       http://${HOST}:${PORT}/no-contact-page.html`);
  console.log('========================================================================');
  console.log('  Press Ctrl+C to stop the test server.');
});

module.exports = server;

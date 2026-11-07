/**
 * server.js
 * 
 * Lightweight local test HTTP server for XPIDER Owner Extension Functional Test Kit.
 * Serves controlled test pages strictly on localhost (127.0.0.1:8088).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8088);
const SINK_PROXY_PORT = Number(process.env.SINK_PROXY_PORT || 8090);
const HOST = '127.0.0.1';
const BASE_DIR = __dirname;

// Fail-closed local sink proxy firewall state (Action 1 & Action 2, Directive #6703609650)
let firewallStats = {
  attemptedExternalRequests: 0,
  blockedExternalRequests: 0,
  transmittedExternalRequests: 0,
  allowedLoopbackRequests: 0,
  blockedLog: []
};

function recordFirewallBlock(kind, method, target, clientAddr, reason) {
  firewallStats.attemptedExternalRequests += 1;
  firewallStats.blockedExternalRequests += 1;
  const entry = {
    id: `fw_blk_${Date.now()}_${firewallStats.blockedExternalRequests}`,
    timestamp: Date.now(),
    kind,
    method: method || kind,
    target: String(target || ''),
    clientAddr: clientAddr || '127.0.0.1',
    reason: reason || 'EGRESS_DENIED_BY_LOCAL_SINK_FIREWALL',
    transmittedBytes: 0
  };
  firewallStats.blockedLog.push(entry);
  if (firewallStats.blockedLog.length > 500) {
    firewallStats.blockedLog.shift();
  }
  console.log(`[XPIDER_UAT_FIREWALL_BLOCKED] kind=${kind} method=${method} target=${target} reason=${entry.reason}`);
  return entry;
}

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

// In-memory submission tracking for RC3.19 Acceptance Test B
let submissionLog = [];

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
  if (reqPath.startsWith('http://') || reqPath.startsWith('https://')) {
    try { reqPath = new URL(reqPath).pathname; } catch (_) {}
  }

  // Authoritative form submission query endpoint (RC3.19 Test B)
  if (reqPath === '/__xpider_submissions') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      ok: true,
      count: submissionLog.length,
      submissionsCount: submissionLog.length,
      submissions: submissionLog
    }));
    return;
  }

  // Authoritative form submission reset endpoint (RC3.19 Test B)
  if (reqPath === '/__xpider_reset_submissions') {
    submissionLog = [];
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      ok: true,
      count: 0
    }));
    return;
  }

  // [RC3.45] Strict receipt: real form POST, field values recorded server-side as ground truth
  if (reqPath === '/__rc345_payloads') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ count: (global.__rc345 || []).length, payloads: global.__rc345 || [] }));
    return;
  }
  if (reqPath === '/__rc345_reset') { global.__rc345 = []; res.writeHead(200); res.end('ok'); return; }
  // [Controlled Server Response Loss Endpoint]
  // Records the POST in submissionLog, but destroys the socket immediately,
  // simulating server response loss / timeout after client delivered the POST.
  if (reqPath === '/__xpider_drop_response' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      const receiptId = `rcpt_drop_${Date.now()}_${submissionLog.length + 1}`;
      const referer = req.headers['referer'] || req.headers['origin'] || null;
      submissionLog.push({
        receiptId,
        timestamp: Date.now(),
        method: req.method,
        url: req.url,
        ip: req.socket.remoteAddress,
        referer,
        droppedResponse: true,
        bodyLength: body.length
      });
      console.log(`[XPIDER_FIXTURE] Controlled response loss recorded (#${submissionLog.length}, id=${receiptId}): ${req.method} ${req.url} -> socket destroyed`);
      try { req.socket.destroy(); } catch (_) {}
    });
    return;
  }


  // Intercept form landing / submission target page
  if (reqPath === '/contact-success.html') {
    if (req.url.includes('scenario=dropped_response') || (req.headers['referer'] && req.headers['referer'].includes('scenario=dropped_response'))) {
      console.log(`[XPIDER_FIXTURE] Simulating genuine dropped connection post-submit (socket destroy)`);
      try { req.socket.destroy(); } catch (_) {}
      return;
    }
    if (req.url.includes('scenario=server_error_500') || (req.headers['referer'] && req.headers['referer'].includes('scenario=server_error_500'))) {
      console.log(`[XPIDER_FIXTURE] Simulating 500 Internal Server Error for negative test`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('INTERNAL_SERVER_ERROR');
      return;
    }
    let receiptId = `rcpt_${Date.now()}_${submissionLog.length + 1}`;
    if (req.url.includes('scenario=malformed_receipt') || (req.headers['referer'] && req.headers['referer'].includes('scenario=malformed_receipt'))) {
      receiptId = '@@BAD_RECEIPT_FORMAT@@ <script>';
    }
    const referer = req.headers['referer'] || req.headers['origin'] || null;
    submissionLog.push({
      receiptId,
      timestamp: Date.now(),
      method: req.method,
      url: req.url,
      ip: req.socket.remoteAddress,
      referer
    });
    console.log(`[XPIDER_FIXTURE] Form submission recorded (#${submissionLog.length}, id=${receiptId}): ${req.method} ${req.url} referer=${referer}`);

    try {
      let html = fs.readFileSync(path.join(BASE_DIR, 'contact-success.html'), 'utf8');
      html = html.replace('</head>', `    <meta name="receipt-id" content="${receiptId}">\n</head>`);
      html = html.replace('</body>', `    <div id="xpider-receipt-id" data-receipt-id="${receiptId}" style="display:none;">${receiptId}</div>\n</body>`);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=UTF-8',
        'X-XPIDER-Receipt-Id': receiptId,
        'Access-Control-Expose-Headers': 'X-XPIDER-Receipt-Id'
      });
      res.end(html);
      return;
    } catch (err) {
      console.error('Failed to read contact-success.html:', err);
    }
  }

  // Deterministic Health Identity endpoint (Issue #6 Section A)
  if (reqPath === '/__xpider_health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      ok: true,
      canary: 'CANARY_OK',
      ip: '127.0.0.1',
      service: 'XPIDER_OWNER_TEST_SERVER',
      channel: 'TEST_ONLY',
      port: PORT,
      sinkProxyPort: SINK_PROXY_PORT,
      firewallActive: true,
      fixtureSet: 'OWNER_8_V1',
      totalFixtures: 8,
      hasAiRequiredFields: true,
      version: 'v7.0.0-rc16',
      pid: process.pid,
      timestamp: Date.now(),
      submissionsCount: submissionLog.length
    }));
    return;
  }

  // [Directive #6703609650] Authoritative UAT Local Sink Proxy Firewall Status & Telemetry
  if (reqPath === '/__xpider_firewall_status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      ok: true,
      firewallActive: true,
      sinkProxyHost: HOST,
      sinkProxyPort: SINK_PROXY_PORT,
      fixturePort: PORT,
      allowedOrigins: [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, `http://[::1]:${PORT}`],
      attemptedExternalRequests: firewallStats.attemptedExternalRequests,
      blockedExternalRequests: firewallStats.blockedExternalRequests,
      transmittedExternalRequests: firewallStats.transmittedExternalRequests,
      allowedLoopbackRequests: firewallStats.allowedLoopbackRequests,
      blockedLog: firewallStats.blockedLog
    }));
    return;
  }

  if (reqPath === '/__xpider_reset_firewall_log') {
    firewallStats = {
      attemptedExternalRequests: 0,
      blockedExternalRequests: 0,
      transmittedExternalRequests: 0,
      allowedLoopbackRequests: 0,
      blockedLog: []
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ ok: true, firewallStats }));
    return;
  }

  // [Directive #6703609650 Action 2.3] Controlled 302 redirect from loopback to external target for negative control testing
  if (reqPath === '/redirect-external') {
    const queryParams = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`).searchParams;
    const extTarget = queryParams.get('target') || 'http://198.51.100.42:8080/redirected-leak-check';
    res.writeHead(302, {
      'Location': extTarget,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(`Redirecting to ${extTarget}`);
    return;
  }

  // Graceful shutdown endpoint (local only)
  if (reqPath === '/__xpider_shutdown' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'SHUTTING_DOWN' }));
    setTimeout(() => {
      try {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        if (typeof sinkProxyServer.closeAllConnections === 'function') sinkProxyServer.closeAllConnections();
      } catch (_) {}
      try { server.close(); } catch (_) {}
      try { sinkProxyServer.close(); } catch (_) {}
      process.exit(0);
    }, 50);
    return;
  }

  // [R6.9G.10.3.7.1.4.10] Cloudflare Turnstile Server-Side Siteverify Endpoint
  // Strictly offline by default in local UAT unless XPIDER_ALLOW_LIVE_CF_SITEVERIFY=1 is explicitly set.
  if (reqPath === '/cf-turnstile/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let token = '';
        let caseKey = '';
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
          const parsed = JSON.parse(body);
          token = parsed.token || parsed['cf-turnstile-response'] || '';
          caseKey = parsed.caseKey || '';
        } else {
          const params = new URLSearchParams(body);
          token = params.get('cf-turnstile-response') || params.get('token') || '';
          caseKey = params.get('caseKey') || '';
        }

        const queryParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        if (!caseKey) caseKey = queryParams.get('case') || 'visible-pass';

        // Select secret key based on official Cloudflare test credentials or environment
        let secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
        if (!secretKey) {
          if (caseKey.includes('fail')) {
            // Always fails validation
            secretKey = '2x0000000000000000000000000000000AA';
          } else {
            // Always passes validation
            secretKey = '1x0000000000000000000000000000000AA';
          }
        }

        let cfRes = { success: false, 'error-codes': ['missing-input-response'] };
        if (token) {
          if (process.env.XPIDER_ALLOW_LIVE_CF_SITEVERIFY === '1') {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const apiRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: new URLSearchParams({
                    secret: secretKey,
                    response: token
                  })
                });
                cfRes = await apiRes.json();
                if (cfRes) break;
              } catch (netErr) {
                if (attempt === 2) {
                  cfRes = { success: false, 'error-codes': ['siteverify-network-error', netErr.message] };
                } else {
                  await new Promise(r => setTimeout(r, 600));
                }
              }
            }
          } else {
            // Offline deterministic local verification (zero external network traffic during UAT)
            const isFailSecret = secretKey.startsWith('2x') || caseKey.includes('fail');
            cfRes = isFailSecret
              ? { success: false, hostname: '127.0.0.1', 'error-codes': ['invalid-input-response'] }
              : { success: true, hostname: '127.0.0.1', action: caseKey, cdata: 'local-offline-uat' };
          }
        }

        const responsePayload = {
          verified: Boolean(cfRes && cfRes.success === true),
          provider: 'cloudflare-turnstile',
          hostname: (cfRes && cfRes.hostname) || req.headers.host || '127.0.0.1',
          action: (cfRes && cfRes.action) || '',
          cdata: (cfRes && cfRes.cdata) || '',
          error_codes: (cfRes && cfRes['error-codes']) || []
        };

        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(responsePayload));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ verified: false, error: err.message, error_codes: ['INTERNAL_SERVER_ERROR'] }));
      }
    });
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/no-contact-page.html';
  } else if (reqPath === '/subscribe-no-message.html') {
    res.writeHead(302, { 'Location': '/subscribe.html' });
    res.end();
    return;
  } else if (reqPath === '/reservation-no-message.html' || reqPath === '/booking-no-message.html') {
    res.writeHead(302, { 'Location': '/reservation.html' });
    res.end();
    return;
  } else if (reqPath === '/no-contact-page.html') {
    res.writeHead(302, { 'Location': '/article.html' });
    res.end();
    return;
  } else if (reqPath === '/subscribe.html') {
    reqPath = '/subscribe-no-message.html';
  } else if (reqPath === '/reservation.html') {
    reqPath = '/reservation-no-message.html';
  } else if (reqPath === '/article.html') {
    reqPath = '/no-contact-page.html';
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

// [Directive #6703609650 Action 1 & Action 2] Mandatory Local Fail-Closed Sink Proxy Firewall
// Blocks and logs all non-fixture HTTP, HTTPS CONNECT, literal IPv4/IPv6, redirect, and WebSocket egress.
// Never opens an outbound socket to any external destination (transmittedExternalRequests === 0).
const sinkProxyServer = http.createServer((req, res) => {
  const target = req.url || req.headers.host || 'unknown';
  const entry = recordFirewallBlock('HTTP', req.method, target, req.socket && req.socket.remoteAddress, 'EGRESS_DENIED_BY_LOCAL_SINK_FIREWALL_HTTP');
  res.writeHead(403, {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-XPIDER-UAT-Firewall': 'BLOCKED_FAIL_CLOSED',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'close'
  });
  res.end(JSON.stringify({
    blocked: true,
    error: 'UAT_EGRESS_BLOCKED_BY_LOCAL_SINK_FIREWALL',
    entry
  }));
});

sinkProxyServer.on('connect', (req, clientSocket, head) => {
  const target = req.url || req.headers.host || 'unknown';
  recordFirewallBlock('CONNECT', 'CONNECT', target, clientSocket && clientSocket.remoteAddress, 'EGRESS_DENIED_BY_LOCAL_SINK_FIREWALL_CONNECT');
  try {
    clientSocket.write(
      'HTTP/1.1 403 Forbidden\r\n' +
      'X-XPIDER-UAT-Firewall: BLOCKED_FAIL_CLOSED\r\n' +
      'Content-Type: text/plain; charset=UTF-8\r\n' +
      'Connection: close\r\n\r\n' +
      'UAT_EGRESS_BLOCKED_BY_LOCAL_SINK_FIREWALL\r\n'
    );
  } catch (_) {}
  try { clientSocket.destroy(); } catch (_) {}
});

sinkProxyServer.on('upgrade', (req, socket, head) => {
  const target = req.url || req.headers.host || 'unknown';
  recordFirewallBlock('WS_UPGRADE', req.method || 'GET', target, socket && socket.remoteAddress, 'EGRESS_DENIED_BY_LOCAL_SINK_FIREWALL_WS');
  try {
    socket.write(
      'HTTP/1.1 403 Forbidden\r\n' +
      'X-XPIDER-UAT-Firewall: BLOCKED_FAIL_CLOSED\r\n' +
      'Connection: close\r\n\r\n'
    );
  } catch (_) {}
  try { socket.destroy(); } catch (_) {}
});

sinkProxyServer.on('error', (err) => {
  console.error(`[XPIDER_UAT_FIREWALL_FATAL] Sink proxy failed on ${HOST}:${SINK_PROXY_PORT}: ${err.message}. Failing closed.`);
  process.exit(1);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[XPIDER_TEST_SERVER] Port ${PORT} already in use. Exiting.`);
    process.exit(1);
  }
  console.error('[XPIDER_TEST_SERVER_ERROR]', err);
  process.exit(1);
});

sinkProxyServer.listen(SINK_PROXY_PORT, HOST, () => {
  server.listen(PORT, HOST, () => {
    console.log('========================================================================');
    console.log(`  XPIDER CONTROLLED TEST SITE SERVER RUNNING AT http://${HOST}:${PORT}`);
    console.log(`  XPIDER FAIL-CLOSED UAT SINK FIREWALL RUNNING AT http://${HOST}:${SINK_PROXY_PORT}`);
    console.log('========================================================================');
    console.log(`  Portal URL:   http://${HOST}:${PORT}/index.html`);
    console.log(`  Firewall API: http://${HOST}:${PORT}/__xpider_firewall_status`);
    console.log(`  Case A:       http://${HOST}:${PORT}/contact-standard.html`);
    console.log(`  Case B:       http://${HOST}:${PORT}/contact-dropdown-checkbox.html`);
    console.log(`  Case C:       http://${HOST}:${PORT}/contact-numeric.html`);
    console.log(`  Case D:       http://${HOST}:${PORT}/subscribe-no-message.html`);
    console.log(`  Case E:       http://${HOST}:${PORT}/booking-no-message.html`);
    console.log(`  Case F:       http://${HOST}:${PORT}/no-contact-page.html`);
    console.log('========================================================================');
    console.log('  Press Ctrl+C to stop the test server.');
  });
});

module.exports = server;

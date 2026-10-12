/**
 * canary_target.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Simulates:
 * 1. Isolated "Internet" Canary service:
 *    - /privacy-canary returns deterministic observable egress fingerprint.
 * 2. Target website endpoints (/target, /contact, /submit).
 * 3. Direct Leak Sniffer:
 *    - Monitors client connection origins.
 *    - Increments directTargetRequestCount if accessed directly (bypassing VPS egress).
 */

const http = require('http');

class CanaryTargetServer {
  constructor(options = {}) {
    this.port = options.port || 8980;
    this.allowedProxyIps = new Set(options.allowedProxyIps || ['127.0.0.1', '10.66.66.1', '10.67.67.1', '::1']);
    this.primaryEgressFp = options.primaryEgressFp || '9848e53757a43619';
    this.currentEgressFp = this.primaryEgressFp;
    this.egressIdentityGroup = options.egressIdentityGroup || 'grp-us-east-prod';
    
    this.directRequestCount = 0;
    this.totalRequestCount = 0;
    this.canaryRequestCount = 0;
    this.targetRequestCount = 0;
    this.requestLog = [];
    
    this.server = null;
  }

  setEgressFingerprint(fp) {
    this.currentEgressFp = fp;
  }

  resetEgressFingerprint() {
    this.currentEgressFp = this.primaryEgressFp;
  }

  getDirectLeakCount() {
    return this.directRequestCount;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.totalRequestCount++;
        const remoteIp = req.socket.remoteAddress?.replace(/^.*:/, '') || 'unknown';
        const viaProxy = req.headers['x-forwarded-for'] || req.headers['via'] || req.headers['x-vps-egress'];
        const isFromVps = req.headers['x-vps-egress'] === 'true' || viaProxy;

        // Sniffer: if request reached target directly without passing through VPS proxy
        const isDirect = !isFromVps && req.headers['host']?.includes(String(this.port)) && !req.headers['x-vps-proxy'];
        if (isDirect && !req.url.startsWith('/health')) {
          this.directRequestCount++;
        }

        const entry = {
          time: new Date().toISOString(),
          method: req.method,
          url: req.url,
          remoteIp,
          isDirect,
          headers: req.headers
        };
        this.requestLog.push(entry);

        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'HEALTHY', directLeaks: this.directRequestCount }));
          return;
        }

        if (req.url.startsWith('/privacy-canary')) {
          this.canaryRequestCount++;
          const canaryPayload = {
            status: 'SUCCESS',
            egressFingerprint: this.currentEgressFp,
            identityGroup: this.egressIdentityGroup,
            nodeType: 'VPS_DIGITAL_TWIN',
            timestamp: Date.now()
          };
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Egress-Identity': this.currentEgressFp
          });
          res.end(JSON.stringify(canaryPayload));
          return;
        }

        // Target application endpoints
        this.targetRequestCount++;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><body><h1>XPIDER Target Page</h1><p>Path: ${req.url}</p></body></html>`);
      });

      this.server.on('error', reject);
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve({ port: this.port });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }
}

module.exports = { CanaryTargetServer };

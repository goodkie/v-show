/**
 * vps_egress.js
 * 
 * Part of XPIDER Software Digital-Twin Lab (Directive #6116387233).
 * Simulates the controlled VPS egress gateway:
 * 1. Squid-compliant HTTP CONNECT proxy for WireGuard (10.66.66.1:3128 -> WG_PROXY_PORT).
 * 2. Squid-compliant HTTP CONNECT proxy for OpenVPN TCP/443 (10.67.67.1:3128 -> OVPN_PROXY_PORT).
 * 3. Public Exposure Test Seam:
 *    - Port 3128 on public/external interfaces is explicitly CLOSED/REFUSED.
 * 4. Transparent TLS passthrough: zero ssl-bump, zero MITM CA.
 */

const http = require('http');
const net = require('net');

class VpsEgressNode {
  constructor(options = {}) {
    this.wgProxyPort = options.wgProxyPort || 8982;
    this.ovpnProxyPort = options.ovpnProxyPort || 8984;
    this.publicProxyPort = options.publicProxyPort || 8986; // Simulated public IP port
    
    this.wgServer = null;
    this.ovpnServer = null;
    this.publicBlockedServer = null;

    this.isRunning = false;
    this.stats = {
      wgRequests: 0,
      ovpnRequests: 0,
      connectTunnels: 0,
      bytesTransferred: 0
    };
  }

  _createProxyServer(tag, counterKey) {
    const server = http.createServer((req, res) => {
      this.stats[counterKey]++;
      
      const parsedUrl = new URL(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);
      const targetHost = parsedUrl.hostname;
      const targetPort = parsedUrl.port || 80;

      const proxyReq = http.request({
        host: targetHost,
        port: targetPort,
        method: req.method,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          ...req.headers,
          'x-vps-egress': 'true',
          'x-vps-proxy': tag,
          'via': `1.1 vps-squid-digital-twin (${tag})`
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`Squid Proxy Gateway Error (${tag}): ${err.message}`);
      });

      req.pipe(proxyReq);
    });

    // RFC 7231 / 9110 HTTP CONNECT Tunneling (TLS without MITM)
    server.on('connect', (req, clientSocket, head) => {
      this.stats[counterKey]++;
      this.stats.connectTunnels++;

      const [targetHost, targetPortStr] = req.url.split(':');
      const targetPort = parseInt(targetPortStr, 10) || 443;

      const serverSocket = net.connect(targetPort, targetHost, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: XPIDER-Squid-DigitalTwin\r\n\r\n');
        if (head && head.length > 0) {
          serverSocket.write(head);
        }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on('error', (err) => {
        clientSocket.write(`HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\n\r\nSquid Connect Error: ${err.message}`);
        clientSocket.end();
      });

      clientSocket.on('error', () => {
        serverSocket.destroy();
      });
    });

    return server;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.wgServer = this._createProxyServer('WG_PRIMARY', 'wgRequests');
      this.ovpnServer = this._createProxyServer('OVPN_FALLBACK', 'ovpnRequests');

      let started = 0;
      const onStarted = () => {
        started++;
        if (started === 2) {
          this.isRunning = true;
          resolve({
            wgProxyPort: this.wgProxyPort,
            ovpnProxyPort: this.ovpnProxyPort
          });
        }
      };

      this.wgServer.listen(this.wgProxyPort, '127.0.0.1', onStarted);
      this.ovpnServer.listen(this.ovpnProxyPort, '127.0.0.1', onStarted);

      // Explicitly NOT listening on publicProxyPort so TCP connect is ECONNREFUSED
    });
  }

  stopWg() {
    return new Promise((resolve) => {
      if (!this.wgServer) return resolve();
      if (typeof this.wgServer.closeAllConnections === 'function') {
        this.wgServer.closeAllConnections();
      }
      this.wgServer.close(() => {
        this.wgServer = null;
        resolve();
      });
    });
  }

  restartWg() {
    return new Promise((resolve, reject) => {
      this.stopWg().then(() => {
        setTimeout(() => {
          this.wgServer = this._createProxyServer('WG_PRIMARY', 'wgRequests');
          this.wgServer.listen(this.wgProxyPort, '127.0.0.1', () => resolve());
          this.wgServer.on('error', reject);
        }, 100);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      let pending = 0;
      const done = () => {
        pending--;
        if (pending <= 0) {
          this.isRunning = false;
          resolve();
        }
      };

      if (this.wgServer) {
        pending++;
        this.wgServer.close(done);
        this.wgServer = null;
      }
      if (this.ovpnServer) {
        pending++;
        this.ovpnServer.close(done);
        this.ovpnServer = null;
      }
      if (pending === 0) resolve();
    });
  }
}

module.exports = { VpsEgressNode };

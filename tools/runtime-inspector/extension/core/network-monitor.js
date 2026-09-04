/**
 * Runtime Inspector — Universal Network Monitor
 * Module: core/network-monitor.js
 *
 * Intercepts fetch() and XMLHttpRequest. Captures URL, status, duration,
 * headers (sanitized), and response metadata. Never captures credentials.
 */

class UniversalNetworkMonitor {
  constructor(eventBus, redactionEngine, options = {}) {
    this.eventBus = eventBus;
    this.redaction = redactionEngine;
    this.captureBody = options.captureBody === true;
    this.bodyFieldWhitelist = options.bodyFieldWhitelist || [];
    this.isAttached = false;
    this.originalFetch = null;
    this.originalXHR = null;
  }

  attach() {
    if (this.isAttached || typeof window === 'undefined') return;
    this.isAttached = true;
    this.hookFetch();
    this.hookXHR();
  }

  detach() {
    if (!this.isAttached || typeof window === 'undefined') return;
    if (this.originalFetch) window.fetch = this.originalFetch;
    if (this.originalXHR) window.XMLHttpRequest = this.originalXHR;
    this.isAttached = false;
  }

  sanitizeBody(body) {
    if (!body || !this.captureBody) return null;
    if (typeof body === 'string') {
      try {
        const json = JSON.parse(body);
        return this.redaction.sanitizeObject(json);
      } catch (e) {
        return this.redaction.sanitizeString(body.slice(0, 300));
      }
    }
    if (typeof body === 'object') {
      return this.redaction.sanitizeObject(body);
    }
    return null;
  }

  hookFetch() {
    if (!window.fetch) return;
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (input, init = {}) {
      const startTime = performance.now();
      const rawUrl = typeof input === 'string' ? input : (input.url || input.href || '');
      const sanitizedUrl = self.redaction.sanitizeUrl(rawUrl);
      const method = (init.method || (input.method) || 'GET').toUpperCase();

      const correlationId = init.headers?.['x-correlation-id'] || 
                            init.headers?.['X-Correlation-Id'] || 
                            self.eventBus.createCorrelationId('REQ');

      // Pre-flight event
      self.eventBus.emit('NETWORK', 'FETCH_START', {
        method,
        url: sanitizedUrl,
        initiator: 'fetch',
        startTime: Date.now()
      }, { correlationId, severity: 'INFO' });

      try {
        const response = await self.originalFetch.apply(this, arguments);
        const durationMs = Math.round(performance.now() - startTime);
        const status = response.status;
        const ok = response.ok;
        const contentType = response.headers.get('content-type') || '';

        // Clone response to inspect metadata if needed
        let responseSize = 0;
        const contentLength = response.headers.get('content-length');
        if (contentLength) responseSize = parseInt(contentLength, 10);

        self.eventBus.emit('NETWORK', 'FETCH_COMPLETE', {
          method,
          url: sanitizedUrl,
          status,
          ok,
          durationMs,
          contentType,
          responseSize,
          initiator: 'fetch'
        }, {
          correlationId,
          severity: status >= 500 ? 'ERROR' : (status >= 400 ? 'WARN' : 'INFO')
        });

        return response;
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        self.eventBus.emit('NETWORK', 'FETCH_ERROR', {
          method,
          url: sanitizedUrl,
          durationMs,
          errorName: err.name,
          errorMessage: self.redaction.sanitizeString(err.message),
          initiator: 'fetch'
        }, { correlationId, severity: 'ERROR' });
        throw err;
      }
    };
  }

  hookXHR() {
    if (!window.XMLHttpRequest) return;
    const self = this;
    const realXHR = window.XMLHttpRequest;
    this.originalXHR = realXHR;

    window.XMLHttpRequest = function () {
      const xhr = new realXHR();
      let method = 'GET';
      let rawUrl = '';
      let startTime = 0;
      let correlationId = null;

      const origOpen = xhr.open;
      xhr.open = function (m, u) {
        method = (m || 'GET').toUpperCase();
        rawUrl = u || '';
        correlationId = self.eventBus.createCorrelationId('XHR');
        return origOpen.apply(this, arguments);
      };

      const origSend = xhr.send;
      xhr.send = function (body) {
        startTime = performance.now();
        const sanitizedUrl = self.redaction.sanitizeUrl(rawUrl);

        self.eventBus.emit('NETWORK', 'XHR_START', {
          method,
          url: sanitizedUrl,
          initiator: 'xmlhttprequest'
        }, { correlationId, severity: 'INFO' });

        xhr.addEventListener('loadend', () => {
          const durationMs = Math.round(performance.now() - startTime);
          const status = xhr.status;
          const ok = status >= 200 && status < 300;
          const contentType = xhr.getResponseHeader('content-type') || '';

          self.eventBus.emit('NETWORK', 'XHR_COMPLETE', {
            method,
            url: sanitizedUrl,
            status,
            ok,
            durationMs,
            contentType,
            initiator: 'xmlhttprequest'
          }, {
            correlationId,
            severity: status >= 500 ? 'ERROR' : (status >= 400 ? 'WARN' : 'INFO')
          });
        });

        return origSend.apply(this, arguments);
      };

      return xhr;
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalNetworkMonitor };
} else {
  window.UniversalNetworkMonitor = UniversalNetworkMonitor;
}

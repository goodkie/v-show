/**
 * Runtime Inspector — Universal Console & Error Monitor
 * Module: core/console-monitor.js
 *
 * Intercepts console methods, window.onerror, and unhandled promises.
 * Classifies noise: BROWSER_EXTENSION_NOISE, THIRD_PARTY_NOISE, APP_ERROR.
 */

class UniversalConsoleMonitor {
  constructor(eventBus, redactionEngine) {
    this.eventBus = eventBus;
    this.redaction = redactionEngine;
    this.isAttached = false;
    this.originalConsole = {};

    this.extensionNoisePatterns = [
      new RegExp('chrome-extension://', 'i'),
      new RegExp('moz-extension://', 'i'),
      new RegExp('safari-extension://', 'i'),
      /__REACT_DEVTOOLS/i,
      /redux-devtools/i,
      /lastpass/i,
      /grammarly/i
    ];

    this.thirdPartyPatterns = [
      /google-analytics.com/i,
      /googletagmanager.com/i,
      /sentry.io/i,
      /clarity.ms/i,
      /hotjar.com/i
    ];
  }

  classifyNoise(message, stack) {
    const combined = (message || '') + ' ' + (stack || '');
    if (this.extensionNoisePatterns.some(p => p.test(combined))) {
      return 'BROWSER_EXTENSION_NOISE';
    }
    if (this.thirdPartyPatterns.some(p => p.test(combined))) {
      return 'THIRD_PARTY_NOISE';
    }
    return 'APP_ERROR';
  }

  attach() {
    if (this.isAttached || typeof window === 'undefined') return;
    this.isAttached = true;
    this.hookConsole();
    this.hookGlobalErrors();
  }

  detach() {
    if (!this.isAttached || typeof window === 'undefined') return;
    ['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
      if (this.originalConsole[level]) {
        console[level] = this.originalConsole[level];
      }
    });
    this.isAttached = false;
  }

  hookConsole() {
    const levels = ['error', 'warn', 'info', 'log'];
    levels.forEach(level => {
      this.originalConsole[level] = console[level];
      const self = this;

      console[level] = function (...args) {
        try {
          const rawMessage = args.map(a => {
            if (typeof a === 'string') return a;
            try { return JSON.stringify(a); } catch (e) { return String(a); }
          }).join(' ');

          const sanitizedMessage = self.redaction.sanitizeString(rawMessage);
          const stack = new Error().stack || '';
          const classification = level === 'error' ? self.classifyNoise(rawMessage, stack) : 'CONSOLE';

          // Emit event
          self.eventBus.emit('CONSOLE', 'CONSOLE_' + level.toUpperCase(), {
            level,
            message: sanitizedMessage,
            classification,
            argCount: args.length
          }, {
            severity: level === 'error' ? 'ERROR' : (level === 'warn' ? 'WARN' : 'INFO')
          });
        } catch (err) {}

        return self.originalConsole[level].apply(this, args);
      };
    });
  }

  hookGlobalErrors() {
    const self = this;

    window.addEventListener('error', (event) => {
      const message = self.redaction.sanitizeString(event.message || 'Script Error');
      const filename = self.redaction.sanitizeUrl(event.filename || '');
      const lineno = event.lineno || 0;
      const colno = event.colno || 0;
      const stack = self.redaction.sanitizeString(event.error?.stack || '');
      const classification = self.classifyNoise(message, stack);

      self.eventBus.emit('ERROR', 'UNHANDLED_EXCEPTION', {
        message,
        filename,
        lineno,
        colno,
        stack: stack.split('\n').slice(0, 10).join('\n'),
        classification
      }, { severity: 'CRITICAL' });
    });

    window.addEventListener('unhandledrejection', (event) => {
      let reason = event.reason;
      let message = 'Unhandled Promise Rejection';
      let stack = '';

      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack || '';
      } else if (typeof reason === 'string') {
        message = reason;
      } else {
        try { message = JSON.stringify(reason); } catch (e) { message = String(reason); }
      }

      const sanitizedMessage = self.redaction.sanitizeString(message);
      const sanitizedStack = self.redaction.sanitizeString(stack);
      const classification = self.classifyNoise(sanitizedMessage, sanitizedStack);

      self.eventBus.emit('ERROR', 'UNHANDLED_PROMISE_REJECTION', {
        message: sanitizedMessage,
        stack: sanitizedStack.split('\n').slice(0, 10).join('\n'),
        classification
      }, { severity: 'ERROR' });
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalConsoleMonitor };
} else {
  window.UniversalConsoleMonitor = UniversalConsoleMonitor;
}

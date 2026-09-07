/**
 * Runtime Inspector — Performance, Storage, DOM & Interaction Monitors
 * Module: core/monitors.js
 */

var UniversalPerformanceMonitor = class UniversalPerformanceMonitor {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  collectMetrics() {
    const metrics = {
      timestamp: Date.now(),
      memory: null,
      timing: null,
      navigation: null
    };

    if (typeof performance !== 'undefined') {
      if (performance.memory) {
        metrics.memory = {
          usedJSHeapSizeMb: Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)),
          totalJSHeapSizeMb: Math.round(performance.memory.totalJSHeapSize / (1024 * 1024)),
          jsHeapSizeLimitMb: Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024))
        };
      }
      if (performance.timing) {
        metrics.timing = {
          loadTimeMs: performance.timing.loadEventEnd - performance.timing.navigationStart,
          domReadyMs: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
        };
      }
    }
    return metrics;
  }
};

var UniversalStorageMonitor = class UniversalStorageMonitor {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  getStorageMetadata() {
    const result = { localStorage: [], sessionStorage: [] };
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const val = localStorage.getItem(key) || '';
          result.localStorage.push({
            key,
            sizeBytes: val.length,
            isLikelySecret: /token|key|secret|auth|jwt/i.test(key)
          });
        }
      }
      if (typeof sessionStorage !== 'undefined') {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          const val = sessionStorage.getItem(key) || '';
          result.sessionStorage.push({
            key,
            sizeBytes: val.length,
            isLikelySecret: /token|key|secret|auth|jwt/i.test(key)
          });
        }
      }
    } catch (e) {}
    return result;
  }
};

var UniversalInteractionMonitor = class UniversalInteractionMonitor {
  constructor(eventBus, redactionEngine) {
    this.eventBus = eventBus;
    this.redaction = redactionEngine;
    this.isAttached = false;
  }

  attach() {
    if (this.isAttached || typeof document === 'undefined') return;
    this.isAttached = true;

    // Track user clicks on buttons, links, and role=button
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a, [role="button"], input[type="submit"]');
      if (!target) return;

      // DO NOT record password inputs or confidential text
      if (target.type === 'password') return;

      const tag = target.tagName.toLowerCase();
      const id = target.id ? ('#' + target.id) : '';
      const text = (target.innerText || target.value || target.getAttribute('aria-label') || '').trim().slice(0, 50);

      this.eventBus.emit('INTERACTION', 'USER_CLICK', {
        tag,
        elementId: id,
        text: this.redaction.sanitizeString(text),
        className: target.className ? String(target.className).slice(0, 60) : ''
      }, { severity: 'INFO' });
    }, true);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalPerformanceMonitor, UniversalStorageMonitor, UniversalInteractionMonitor };
} else {
  window.UniversalPerformanceMonitor = UniversalPerformanceMonitor;
  window.UniversalStorageMonitor = UniversalStorageMonitor;
  window.UniversalInteractionMonitor = UniversalInteractionMonitor;
}

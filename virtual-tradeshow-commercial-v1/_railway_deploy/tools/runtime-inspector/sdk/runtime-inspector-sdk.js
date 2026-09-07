/**
 * Runtime Inspector — Universal Embedded Client SDK
 * Module: sdk/runtime-inspector-sdk.js
 *
 * Lightweight, zero-dependency client SDK for applications to voluntarily emit
 * high-level domain events and register adapters.
 *
 * Production-Safe: Zero overhead when Runtime Inspector extension is not active.
 */

(function () {
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) return;

  window.RuntimeInspector = window.RuntimeInspector || {
    version: '1.0.0',

    emit: function (category, type, payload, options) {
      if (window.__RUNTIME_INSPECTOR__ && typeof window.__RUNTIME_INSPECTOR__.emit === 'function') {
        return window.__RUNTIME_INSPECTOR__.emit(category, type, payload, options);
      }
      return null;
    },

    createCorrelationId: function (prefix) {
      if (window.__RUNTIME_INSPECTOR__ && typeof window.__RUNTIME_INSPECTOR__.createCorrelationId === 'function') {
        return window.__RUNTIME_INSPECTOR__.createCorrelationId(prefix);
      }
      return (prefix || 'ACTION') + '-' + Date.now();
    },

    markProblem: function (annotation) {
      if (window.__RUNTIME_INSPECTOR__ && typeof window.__RUNTIME_INSPECTOR__.markProblem === 'function') {
        return window.__RUNTIME_INSPECTOR__.markProblem(annotation);
      }
    },

    registerAdapter: function (adapter) {
      window.__RUNTIME_INSPECTOR_ADAPTERS__ = window.__RUNTIME_INSPECTOR_ADAPTERS__ || [];
      window.__RUNTIME_INSPECTOR_ADAPTERS__.push(adapter);
    }
  };

  // Aliased short name
  window.RI = window.RuntimeInspector;
})();

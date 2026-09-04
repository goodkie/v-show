/**
 * Runtime Inspector V1.2 — Page Bootstrap Loader
 * Module: extension/bootstrap.js
 *
 * Runs in Content Script context. Deterministically injects Core, Adapters,
 * and Page Bridge scripts into the document execution context in strict dependency order.
 */

(function () {
  const is3DZ = (url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.includes('v-show') || host.includes('localhost') || host.includes('127.0.0.1');
    } catch (e) {
      return false;
    }
  };

  const RuntimeInspectorBootstrap = {
    isBootstrapping: false,
    isBootstrapped: false,

    injectScript(relPath) {
      return new Promise((resolve, reject) => {
        try {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL(relPath);
          script.async = false;
          script.onload = () => {
            script.remove();
            resolve();
          };
          script.onerror = (err) => {
            console.error('[RI Bootstrap] Error loading:', relPath, err);
            reject(new Error(`Failed to load: ${relPath}`));
          };
          const target = document.head || document.documentElement || document.body;
          if (target) {
            target.appendChild(script);
          } else {
            // If DOM not ready yet, wait for DOMContentLoaded
            window.addEventListener('DOMContentLoaded', () => {
              (document.head || document.documentElement).appendChild(script);
            }, { once: true });
          }
        } catch (e) {
          reject(e);
        }
      });
    },

    async run(sessionInfo = {}) {
      const root = document.documentElement || document.body;
      if (root && root.dataset.riBootstrapped === 'true') return;
      if (root) root.dataset.riBootstrapped = 'true';
      if (this.isBootstrapping || this.isBootstrapped) return;
      this.isBootstrapping = true;

      // Pass session metadata to page context via DOM dataset
      try {
        const root = document.documentElement || document.body;
        if (root) {
          root.dataset.riSessionInfo = JSON.stringify({
            sessionId: sessionInfo.sessionId || '',
            pageSegmentId: sessionInfo.pageSegmentId || '',
            recording: Boolean(sessionInfo.recording),
            privacyMode: sessionInfo.privacyMode || 'STANDARD',
            adapterId: is3DZ(window.location.href) ? '3dz' : 'generic',
            url: window.location.href
          });
        }
      } catch (e) {}

      // Emit bootstrap started event
      window.postMessage({
        type: 'RI_PAGE_BOOTSTRAP_STARTED',
        url: window.location.href,
        sessionId: sessionInfo.sessionId,
        pageSegmentId: sessionInfo.pageSegmentId,
        timestamp: Date.now()
      }, '*');

      const coreDependencies = [
        'core/event-bus.js',
        'core/redaction.js',
        'core/network-monitor.js',
        'core/console-monitor.js',
        'core/canvas-monitor.js',
        'core/monitors.js',
        'core/screenshot-manager.js',
        'core/exporter.js',
        'core/runtime-core.js'
      ];

      try {
        // 1. Inject Universal Core Dependencies in strict order
        for (const dep of coreDependencies) {
          await this.injectScript(dep);
        }

        // 2. Inject Domain-matched Adapters
        if (is3DZ(window.location.href)) {
          const adapterScripts = [
            'adapters/3dz/probes.js',
            'adapters/3dz/actions.js',
            'adapters/3dz/adapter.js'
          ];
          for (const adp of adapterScripts) {
            await this.injectScript(adp);
          }
        }

        // 3. Inject Page Bridge
        await this.injectScript('page-bridge.js');

        this.isBootstrapped = true;
        this.isBootstrapping = false;
        console.log('[RI Bootstrap] Deterministic page-context injection complete.');
      } catch (err) {
        this.isBootstrapping = false;
        console.error('[RI Bootstrap] Bootstrap sequence failed:', err);
        window.postMessage({
          type: 'RI_PAGE_CAPTURE_BOOTSTRAP_FAILED',
          error: err.message,
          timestamp: Date.now()
        }, '*');
      }
    }
  };

  if (typeof window !== 'undefined') {
    window.RuntimeInspectorBootstrap = RuntimeInspectorBootstrap;
  }
})();

/**
 * Runtime Inspector — Universal Runtime Core
 * Module: core/runtime-core.js
 *
 * Coordinates event bus, monitors, adapters, and exporter.
 */

if (typeof require !== 'undefined') {
  var { RedactionEngine } = require('./redaction');
  var { UniversalEventBus } = require('./event-bus');
  var { UniversalNetworkMonitor } = require('./network-monitor');
  var { UniversalConsoleMonitor } = require('./console-monitor');
  var { UniversalCanvasMonitor, UniversalWebGLMonitor } = require('./canvas-monitor');
  var { UniversalPerformanceMonitor, UniversalStorageMonitor, UniversalInteractionMonitor } = require('./monitors');
  var { DiagnosticExporter } = require('./exporter');
}

var RuntimeInspectorCore = class RuntimeInspectorCore {
  constructor(options = {}) {
    this.privacyMode = options.privacyMode || 'STANDARD';
    this.redaction = new RedactionEngine({ privacyMode: this.privacyMode });
    this.eventBus = new UniversalEventBus({ sessionId: options.sessionId });
    
    this.networkMonitor = new UniversalNetworkMonitor(this.eventBus, this.redaction);
    this.consoleMonitor = new UniversalConsoleMonitor(this.eventBus, this.redaction);
    this.canvasMonitor = new UniversalCanvasMonitor(this.eventBus);
    this.webglMonitor = new UniversalWebGLMonitor(this.eventBus);
    this.perfMonitor = new UniversalPerformanceMonitor(this.eventBus);
    this.storageMonitor = new UniversalStorageMonitor(this.eventBus);
    this.interactionMonitor = new UniversalInteractionMonitor(this.eventBus, this.redaction);

    this.exporter = new DiagnosticExporter(this);
    this.adapters = [];
    this.activeAdapter = null;
    this.isInitialized = false;
  }

  detectEnvironment() {
    if (typeof window === 'undefined') return 'unknown';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'localhost';
    if (host.includes('staging') || host.includes('dev')) return 'development';
    return 'production';
  }

  registerAdapter(adapter) {
    this.adapters.push(adapter);
    if (typeof window !== 'undefined' && window.__RUNTIME_INSPECTOR__) {
      window.__RUNTIME_INSPECTOR__.adapters[adapter.id] = adapter;
    }
  }

  resolveActiveAdapter() {
    if (typeof window === 'undefined') return null;
    const loc = window.location;
    for (const adapter of this.adapters) {
      try {
        if (adapter.match(loc)) {
          this.activeAdapter = adapter;
          this.eventBus.emit('APP', 'ADAPTER_MATCHED', {
            adapterId: adapter.id,
            adapterName: adapter.name,
            version: adapter.version
          });
          return adapter;
        }
      } catch (e) {
        console.warn(`[Adapter ${adapter.id} match error]`, e);
      }
    }
    this.activeAdapter = null;
    this.eventBus.emit('APP', 'GENERIC_MODE_ACTIVE', { url: loc.href });
    return null;
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.networkMonitor.attach();
    this.consoleMonitor.attach();
    this.webglMonitor.attach();
    this.interactionMonitor.attach();

    this.resolveActiveAdapter();
    this.eventBus.emit('APP', 'RUNTIME_INSPECTOR_READY', {
      version: this.eventBus.version,
      adapter: this.activeAdapter ? this.activeAdapter.id : 'GENERIC'
    });
  }

  startRecording() {
    this.eventBus.start();
  }

  stopRecording() {
    this.eventBus.stop();
  }

  markProblem(annotation = '') {
    return this.eventBus.markProblem(annotation);
  }

  captureSnapshot() {
    return this.exporter.generateDiagnosticBundle({ mode: 'SNAPSHOT' });
  }

  exportDiagnostic(options = {}) {
    return this.exporter.generateDiagnosticBundle(options);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RuntimeInspectorCore };
} else {
  window.RuntimeInspectorCore = RuntimeInspectorCore;
}

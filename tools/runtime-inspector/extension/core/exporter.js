/**
 * Runtime Inspector — Exporter & ChatGPT Summary Generator
 * Module: core/exporter.js
 *
 * Generates diagnostic.json, summary.txt, timeline.json, network.json, errors.json.
 * Automatically analyzes failure stages and validates redactions before export.
 */

class DiagnosticExporter {
  constructor(runtimeCore) {
    this.core = runtimeCore;
    this.redaction = runtimeCore.redaction;
  }

  determineFirstFailedStage(timeline, errors, network) {
    // Stage sequence: INTERACTION -> NETWORK -> STATE -> RENDER
    const stages = ['INTERACTION', 'NETWORK', 'STATE_UPDATE', 'RENDER'];
    
    // Check network errors first
    const hasNetworkError = network.some(n => n.payload?.status >= 400 || n.type === 'FETCH_ERROR' || n.type === 'XHR_ERROR');
    const firstNetFail = network.find(n => n.payload?.status >= 400 || n.type === 'FETCH_ERROR');

    // Check JS errors
    const hasJsError = errors.length > 0;
    const firstJsError = errors[0];

    // Check canvas/render failure
    const canvasReport = this.core.canvasMonitor.probeAllCanvases();
    const hasCanvasBlank = canvasReport.some(c => c.isVisible && c.pixelStats?.isUniformlyBackground);

    if (hasNetworkError && (!hasJsError || firstNetFail.timestamp <= errors[0].timestamp)) {
      return {
        stage: 'NETWORK',
        detail: `HTTP ${firstNetFail.payload?.status || 'Error'} on ${firstNetFail.payload?.url}`
      };
    }

    if (hasCanvasBlank && !hasJsError) {
      return {
        stage: 'RENDER',
        detail: 'Canvas visible but uniformly background/black/white'
      };
    }

    if (hasJsError) {
      return {
        stage: 'RUNTIME_EXCEPTION',
        detail: firstJsError.payload?.message || 'Uncaught Error'
      };
    }

    return {
      stage: 'NONE_DETECTED',
      detail: 'No hard failures logged during capture window'
    };
  }

  generateDiagnosticBundle(options = {}) {
    const session = {
      sessionId: this.core.eventBus.sessionId,
      startTime: new Date(this.core.eventBus.startTime).toISOString(),
      captureTime: new Date().toISOString(),
      durationMs: Date.now() - this.core.eventBus.startTime,
      mode: options.mode || 'SNAPSHOT',
      privacyMode: this.redaction.privacyMode
    };

    const appInfo = this.core.activeAdapter ? this.core.activeAdapter.getAppInfo() : {
      appId: 'generic-web-app',
      appName: typeof document !== 'undefined' ? document.title : 'Generic Web App',
      url: typeof window !== 'undefined' ? window.location.href : '',
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      environment: this.core.detectEnvironment()
    };

    const timeline = this.core.eventBus.eventsBuffer.getAll();
    const errors = this.core.eventBus.errorsBuffer.getAll();
    const network = this.core.eventBus.networkBuffer.getAll();
    const failureAnalysis = this.determineFirstFailedStage(timeline, errors, network);

    const diagnostic = {
      schemaVersion: '1.0.0',
      inspectorVersion: this.core.eventBus.version,
      session,
      app: this.redaction.sanitizeObject(appInfo),
      environment: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        platform: typeof navigator !== 'undefined' ? navigator.platform : '',
        language: typeof navigator !== 'undefined' ? navigator.language : '',
        viewport: typeof window !== 'undefined' ? {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        } : null
      },
      diagnostics: {
        firstFailedStage: failureAnalysis.stage,
        primaryFailure: failureAnalysis.detail
      },
      adapter: this.core.activeAdapter ? {
        id: this.core.activeAdapter.id,
        name: this.core.activeAdapter.name,
        version: this.core.activeAdapter.version,
        matched: true,
        appState: this.core.activeAdapter.getRuntimeState(),
        probes: this.core.activeAdapter.getCustomProbes(),
        summary: this.core.activeAdapter.summarize()
      } : { matched: false },
      errors,
      network,
      timeline,
      visual: {
        canvases: this.core.canvasMonitor.probeAllCanvases(),
        webgl: this.core.webglMonitor.getReport()
      },
      performance: this.core.perfMonitor.collectMetrics(),
      storage: this.core.storageMonitor.getStorageMetadata(),
      redaction: {
        sanitized: true,
        redactionCount: this.redaction.redactionCount,
        privacyMode: this.redaction.privacyMode
      }
    };

    // Sanitize entire payload before export
    const sanitizedDiagnostic = this.redaction.sanitizeObject(diagnostic);

    // Run leak scanner
    const leakCheck = this.redaction.scanForLeaks(sanitizedDiagnostic);
    if (!leakCheck.passed) {
      throw new Error(`EXPORT_BLOCKED: Sensitive data detected: ${leakCheck.suspectedLeaks.join(', ')}`);
    }
    sanitizedDiagnostic.redaction.secretScanPassed = true;

    const summaryText = this.generateChatGPTTextSummary(sanitizedDiagnostic);

    return {
      diagnostic: sanitizedDiagnostic,
      summaryText,
      manifest: {
        version: '1.0.0',
        generatedAt: session.captureTime,
        sessionId: session.sessionId,
        files: ['diagnostic.json', 'summary.txt', 'timeline.json', 'network.json', 'errors.json']
      }
    };
  }

  generateChatGPTTextSummary(diag) {
    const app = diag.app || {};
    const sess = diag.session || {};
    const diagState = diag.diagnostics || {};
    const errCount = (diag.errors || []).length;
    const netFailCount = (diag.network || []).filter(n => n.payload?.status >= 400 || n.type?.includes('ERROR')).length;
    const lastAction = (diag.timeline || []).filter(e => e.category === 'INTERACTION').slice(-1)[0];
    const lastReq = (diag.network || []).slice(-1)[0];

    let adapterSection = 'None (Generic Mode)';
    if (diag.adapter?.matched) {
      adapterSection = `ID: ${diag.adapter.id} v${diag.adapter.version}\n`;
      if (diag.adapter.summary) {
        adapterSection += Object.entries(diag.adapter.summary).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n');
      }
    }

    return `============================================================
RUNTIME_INSPECTOR_REPORT (ChatGPT Optimized)
============================================================

APP=${app.appName || 'Unknown'}
APP_ID=${app.appId || 'generic-app'}
ENVIRONMENT=${app.environment || 'unknown'}
URL=${app.url || 'unknown'}

SESSION_ID=${sess.sessionId}
SESSION_START=${sess.startTime}
CAPTURE_TIME=${sess.captureTime}
DURATION_MS=${sess.durationMs}
PRIVACY_MODE=${sess.privacyMode}

------------------------------------------------------------
DIAGNOSTIC VERDICT
------------------------------------------------------------
FIRST_FAILED_STAGE=${diagState.firstFailedStage}
PRIMARY_FAILURE=${diagState.primaryFailure}

ERROR_COUNT=${errCount}
NETWORK_FAILURE_COUNT=${netFailCount}

LAST_USER_ACTION=${lastAction ? `${lastAction.payload?.tag || ''} ${lastAction.payload?.elementId || ''} (${lastAction.payload?.text || ''})` : 'None'}

LAST_REQUEST=${lastReq ? `${lastReq.payload?.method || ''} ${lastReq.payload?.url || ''}` : 'None'}
LAST_REQUEST_STATUS=${lastReq ? (lastReq.payload?.status || 'Error') : 'None'}

------------------------------------------------------------
TOP ERRORS
------------------------------------------------------------
${(diag.errors || []).slice(0, 5).map((e, idx) => `[${idx+1}] ${e.payload?.message || 'Error'} (Line ${e.payload?.lineno || '?'})`).join('\n') || 'None'}

------------------------------------------------------------
ADAPTER SPECIFIC RUNTIME STATE
------------------------------------------------------------
${adapterSection}

------------------------------------------------------------
SAFETY & REDACTION
------------------------------------------------------------
SENSITIVE_DATA_REDACTED=${diag.redaction?.sanitized}
REDACTION_COUNT=${diag.redaction?.redactionCount}
SECRET_SCAN_STATUS=PASS
============================================================`;
  }

  exportBundle(options = {}) {
    const result = this.generateDiagnosticBundle(options);
    if (options.outputDir && typeof require !== 'undefined') {
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(options.outputDir)) {
        fs.mkdirSync(options.outputDir, { recursive: true });
      }
      fs.writeFileSync(path.join(options.outputDir, 'diagnostic.json'), JSON.stringify(result.diagnostic, null, 2), 'utf8');
      fs.writeFileSync(path.join(options.outputDir, 'summary.txt'), result.summaryText, 'utf8');
      fs.writeFileSync(path.join(options.outputDir, 'timeline.json'), JSON.stringify(result.diagnostic.timeline, null, 2), 'utf8');
      fs.writeFileSync(path.join(options.outputDir, 'network.json'), JSON.stringify(result.diagnostic.network, null, 2), 'utf8');
      fs.writeFileSync(path.join(options.outputDir, 'errors.json'), JSON.stringify(result.diagnostic.errors, null, 2), 'utf8');
    }
    return result;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DiagnosticExporter };
} else {
  window.DiagnosticExporter = DiagnosticExporter;
}

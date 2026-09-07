/**
 * Runtime Inspector — Universal Canvas & WebGL Diagnostics
 * Module: core/canvas-monitor.js
 *
 * Samples visible canvases, validates non-blank ratio, black/white/transparent pixels,
 * and tracks WebGL context state, max texture sizes, and gl.getError().
 */

var UniversalCanvasMonitor = class UniversalCanvasMonitor {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  probeAllCanvases() {
    if (typeof document === 'undefined') return [];
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return canvases.map((canvas, index) => this.probeCanvas(canvas, index));
  }

  probeCanvas(canvas, index = 0) {
    const rect = canvas.getBoundingClientRect();
    const width = canvas.width;
    const height = canvas.height;
    const hasComputedStyle = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function';
    const isVisible = rect.width > 0 && rect.height > 0 && (!hasComputedStyle || window.getComputedStyle(canvas).display !== 'none');

    let pixelStats = {
      sampled: false,
      blackRatio: 0,
      whiteRatio: 0,
      transparentRatio: 0,
      validContentRatio: 0,
      isUniformlyBackground: true
    };

    if (isVisible && width > 0 && height > 0) {
      pixelStats = this.samplePixelDistribution(canvas);
    }

    const report = {
      index,
      id: canvas.id || `canvas-${index}`,
      width,
      height,
      clientWidth: Math.round(rect.width),
      clientHeight: Math.round(rect.height),
      isVisible,
      pixelStats
    };

    return report;
  }

  samplePixelDistribution(canvas) {
    try {
      if (typeof canvas.getContext === 'function') {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (gl && typeof gl.readPixels === 'function') {
          const sampleW = Math.min(32, gl.drawingBufferWidth || canvas.width || 32);
          const sampleH = Math.min(32, gl.drawingBufferHeight || canvas.height || 32);
          const pixels = new Uint8Array(sampleW * sampleH * 4);
          gl.readPixels(0, 0, sampleW, sampleH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return this.analyzePixels(pixels);
        }
      }

      if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        // Fallback direct 2d context read if canvas has getContext
        if (typeof canvas.getContext === 'function') {
          const ctx2d = canvas.getContext('2d');
          if (ctx2d && typeof ctx2d.getImageData === 'function') {
            const imgData = ctx2d.getImageData(0, 0, Math.min(32, canvas.width), Math.min(32, canvas.height));
            return this.analyzePixels(imgData.data);
          }
        }
        return { sampled: false, isUniformlyBackground: true, blackRatio: 1.0 };
      }

      // Use small offscreen scratch canvas to downsample and analyze
      const sampleSize = 32;
      const offscreen = document.createElement('canvas');
      offscreen.width = sampleSize;
      offscreen.height = sampleSize;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { sampled: false, reason: 'no_2d_context' };

      ctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
      const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
      return this.analyzePixels(imgData.data);
    } catch (err) {
      return { sampled: false, error: err.message, isUniformlyBackground: true, blackRatio: 1.0 };
    }
  }

  analyzePixels(data) {
    let blackCount = 0;
    let whiteCount = 0;
    let transparentCount = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 10) {
        transparentCount++;
      } else if (r < 32 && g < 32 && b < 32) {
        blackCount++;
      } else if (r > 235 && g > 235 && b > 235) {
        whiteCount++;
      }
    }
    const blackRatio = Number((blackCount / totalPixels).toFixed(3));
    const whiteRatio = Number((whiteCount / totalPixels).toFixed(3));
    const transparentRatio = Number((transparentCount / totalPixels).toFixed(3));
    const validContentRatio = Number((1.0 - (blackRatio + transparentRatio)).toFixed(3));
    const isUniformlyBackground = blackRatio > 0.98 || whiteRatio > 0.98 || transparentRatio > 0.98;

    return {
      sampled: true,
      blackRatio,
      whiteRatio,
      transparentRatio,
      validContentRatio: Math.max(0, validContentRatio),
      isUniformlyBackground
    };
  }
}

var UniversalWebGLMonitor = class UniversalWebGLMonitor {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.contexts = [];
    this.isAttached = false;
    this.shaderDiagnostics = {
      compileErrors: [],
      linkErrors: []
    };
  }

  attach() {
    if (this.isAttached || typeof HTMLCanvasElement === 'undefined') return;
    this.isAttached = true;
    const self = this;

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const ctx = origGetContext.apply(this, arguments);
      if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
        self.registerContext(this, ctx, type);
      }
      return ctx;
    };
  }

  registerContext(canvas, gl, type) {
    if (this.contexts.some(c => c.canvas === canvas)) return;
    const self = this;

    const contextRecord = {
      canvas,
      gl,
      type,
      lost: gl.isContextLost ? gl.isContextLost() : false,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0,
      vendor: gl.getParameter(gl.VENDOR) || 'Unknown',
      renderer: gl.getParameter(gl.RENDERER) || 'Unknown'
    };

    this.contexts.push(contextRecord);

    // 1. Intercept Shader Compilation & Diagnostics
    if (!gl.__riShaderHooked) {
      gl.__riShaderHooked = true;

      const origShaderSource = gl.shaderSource;
      if (origShaderSource) {
        gl.shaderSource = function (shader, source) {
          try { shader.__riSource = source; } catch (e) {}
          return origShaderSource.apply(this, arguments);
        };
      }

      const origCompileShader = gl.compileShader;
      if (origCompileShader) {
        gl.compileShader = function (shader) {
          const res = origCompileShader.apply(this, arguments);
          try {
            const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
            const shaderType = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'VERTEX_SHADER' : 'FRAGMENT_SHADER';
            if (!success) {
              const infoLog = (gl.getShaderInfoLog(shader) || '').trim();
              const callStack = new Error().stack || '';

              let owner = 'Three.js / Material';
              if (callStack.includes('PhotoImmersive')) owner = 'PhotoImmersiveViewer';
              else if (callStack.includes('spatialPreview') || callStack.includes('initSpatialPreviewWebGL')) owner = 'Spatial Preview';
              else if (callStack.includes('cylinder') || callStack.includes('Cylinder')) owner = 'legacy cylindrical renderer';

              const errRecord = {
                canvasId: canvas.id || 'unnamed',
                shaderType,
                compileStatus: false,
                infoLog,
                callSite: callStack.split('\n').slice(1, 4).map(s => s.trim()).join(' -> '),
                owner,
                timestamp: Date.now()
              };

              self.shaderDiagnostics.compileErrors.push(errRecord);

              self.eventBus.emit('WEBGL', 'WEBGL_SHADER_COMPILE_ERROR', errRecord, {
                severity: 'ERROR',
                source: 'webgl-monitor'
              });
            }
          } catch (e) {}
          return res;
        };
      }

      const origLinkProgram = gl.linkProgram;
      if (origLinkProgram) {
        gl.linkProgram = function (program) {
          const res = origLinkProgram.apply(this, arguments);
          try {
            const success = gl.getProgramParameter(program, gl.LINK_STATUS);
            if (!success) {
              const infoLog = (gl.getProgramInfoLog(program) || '').trim();
              const callStack = new Error().stack || '';
              const errRecord = {
                canvasId: canvas.id || 'unnamed',
                linkStatus: false,
                infoLog,
                callSite: callStack.split('\n').slice(1, 4).map(s => s.trim()).join(' -> '),
                timestamp: Date.now()
              };

              self.shaderDiagnostics.linkErrors.push(errRecord);

              self.eventBus.emit('WEBGL', 'WEBGL_PROGRAM_LINK_ERROR', errRecord, {
                severity: 'ERROR',
                source: 'webgl-monitor'
              });
            }
          } catch (e) {}
          return res;
        };
      }
    }

    canvas.addEventListener('webglcontextlost', (e) => {
      contextRecord.lost = true;
      this.eventBus.emit('WEBGL', 'WEBGL_CONTEXT_LOST', {
        canvasId: canvas.id || 'unnamed',
        type
      }, { severity: 'CRITICAL' });
    });

    canvas.addEventListener('webglcontextrestored', () => {
      contextRecord.lost = false;
      this.eventBus.emit('WEBGL', 'WEBGL_CONTEXT_RESTORED', {
        canvasId: canvas.id || 'unnamed',
        type
      }, { severity: 'INFO' });
    });

    this.eventBus.emit('WEBGL', 'WEBGL_CONTEXT_INITIALIZED', {
      canvasId: canvas.id || 'unnamed',
      type,
      maxTextureSize: contextRecord.maxTextureSize,
      maxRenderbufferSize: contextRecord.maxRenderbufferSize
    }, { severity: 'INFO' });
  }

  getShaderDiagnostics() {
    return this.shaderDiagnostics;
  }

  getReport() {
    return {
      contexts: this.contexts.map(c => ({
        canvasId: c.canvas.id || 'unnamed',
        type: c.type,
        contextLost: c.gl.isContextLost ? c.gl.isContextLost() : c.lost,
        maxTextureSize: c.maxTextureSize,
        maxRenderbufferSize: c.maxRenderbufferSize,
        drawingBufferWidth: c.gl.drawingBufferWidth || 0,
        drawingBufferHeight: c.gl.drawingBufferHeight || 0,
        lastErrorCode: c.gl.getError ? c.gl.getError() : 0
      })),
      shaderDiagnostics: this.shaderDiagnostics
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalCanvasMonitor, UniversalWebGLMonitor };
} else {
  window.UniversalCanvasMonitor = UniversalCanvasMonitor;
  window.UniversalWebGLMonitor = UniversalWebGLMonitor;
}

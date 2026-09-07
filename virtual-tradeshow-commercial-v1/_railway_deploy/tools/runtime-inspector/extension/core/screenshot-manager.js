/**
 * Runtime Inspector V1.2 — Screenshot Manager
 * Module: core/screenshot-manager.js
 *
 * Captures visible tab, masks sensitive DOM regions via OffscreenCanvas,
 * computes SHA256, correlates with problem markers/canvas probes,
 * and produces metadata references for diagnostic bundles.
 */

var ScreenshotManager = class ScreenshotManager {
  constructor(options = {}) {
    this.privacyMode = options.privacyMode || 'STANDARD';
    this.autoScreenshotOnProblemMarker = options.autoScreenshotOnProblemMarker !== false;
    this.autoScreenshotOnSnapshot = options.autoScreenshotOnSnapshot !== false;
    this.autoScreenshotOnError = options.autoScreenshotOnError === true;
    this.captureDelayMs = options.captureDelayMs || 150;
  }

  generateScreenshotId(sessionId, index = 1) {
    const padded = String(index).padStart(4, '0');
    return `SHOT-${sessionId}-${padded}`;
  }

  async sha256(arrayBuffer) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuf));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'sha256_unavailable';
  }

  async dataUrlToArrayBuffer(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.arrayBuffer();
  }

  /**
   * Masks sensitive rectangular areas on an image.
   * Uses OffscreenCanvas in Service Worker or document Canvas in DOM context.
   */
  async maskSensitiveRegions(dataUrl, sensitiveRects = [], viewport = {}) {
    if (!sensitiveRects || sensitiveRects.length === 0) {
      const arrayBuffer = await this.dataUrlToArrayBuffer(dataUrl);
      const hash = await this.sha256(arrayBuffer);
      return {
        maskedDataUrl: dataUrl,
        arrayBuffer,
        sha256: hash,
        redactionApplied: false,
        maskedCount: 0
      };
    }

    try {
      const arrayBuffer = await this.dataUrlToArrayBuffer(dataUrl);
      let width = viewport.width || 1920;
      let height = viewport.height || 1080;

      if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
        const blob = new Blob([arrayBuffer], { type: 'image/png' });
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);

        // Draw opaque black rectangles over sensitive areas
        ctx.fillStyle = '#000000';
        for (const rect of sensitiveRects) {
          const rx = Math.max(0, Math.floor(rect.x));
          const ry = Math.max(0, Math.floor(rect.y));
          const rw = Math.min(width - rx, Math.ceil(rect.width));
          const rh = Math.min(height - ry, Math.ceil(rect.height));
          ctx.fillRect(rx, ry, rw, rh);

          // Draw a small privacy label if space permits
          if (rw > 60 && rh > 14) {
            ctx.fillStyle = '#ff4444';
            ctx.font = '10px monospace';
            ctx.fillText('[REDACTED]', rx + 4, ry + Math.min(rh - 4, 12));
            ctx.fillStyle = '#000000';
          }
        }

        const maskedBlob = await canvas.convertToBlob({ type: 'image/png' });
        const maskedBuffer = await maskedBlob.arrayBuffer();
        const hash = await this.sha256(maskedBuffer);

        return {
          arrayBuffer: maskedBuffer,
          blob: maskedBlob,
          sha256: hash,
          width,
          height,
          redactionApplied: true,
          maskedCount: sensitiveRects.length
        };
      }
    } catch (err) {
      console.warn('[ScreenshotManager] Masking error, falling back to original:', err);
    }

    const fallbackBuf = await this.dataUrlToArrayBuffer(dataUrl);
    const fallbackHash = await this.sha256(fallbackBuf);
    return {
      arrayBuffer: fallbackBuf,
      sha256: fallbackHash,
      redactionApplied: false,
      maskedCount: 0
    };
  }

  buildMetadata(params) {
    const {
      screenshotId,
      sessionId,
      pageSegmentId,
      timestamp,
      correlationId,
      problemMarkerId,
      trigger,
      url,
      title,
      viewport,
      devicePixelRatio,
      width,
      height,
      sha256,
      privacyMode,
      redactionApplied,
      canvasProbeId
    } = params;

    const fileName = `screenshots/${screenshotId}.png`;

    return {
      screenshotId,
      sessionId,
      pageSegmentId: pageSegmentId || 'seg-default',
      timestamp: timestamp || new Date().toISOString(),
      correlationId: correlationId || null,
      problemMarkerId: problemMarkerId || null,
      canvasProbeId: canvasProbeId || null,
      trigger: trigger || 'MANUAL',
      url: url || '',
      title: title || '',
      viewport: viewport || { width: 1920, height: 1080 },
      devicePixelRatio: devicePixelRatio || 1,
      width: width || 1920,
      height: height || 1080,
      mimeType: 'image/png',
      sha256: sha256 || '',
      privacyMode: privacyMode || this.privacyMode,
      redactionApplied: Boolean(redactionApplied),
      file: fileName,
      fileName
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ScreenshotManager };
} else if (typeof window !== 'undefined') {
  window.ScreenshotManager = ScreenshotManager;
} else if (typeof self !== 'undefined') {
  self.ScreenshotManager = ScreenshotManager;
}

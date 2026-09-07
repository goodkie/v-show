/**
 * Mobile Runtime Inspector — Rolling 60-Second In-Memory Diagnostic Buffer
 * Module: adapters/mobile/mobile-buffer.js
 */

class MobileRollingBuffer {
  constructor(options = {}) {
    this.maxAgeMs = options.maxAgeMs || 60000; // 60 seconds rolling window
    this.maxItems = options.maxItems || 300;
    this.events = [];
    this.consoleLogs = [];
    this.networkRequests = [];
    this.checkpoints = [];
  }

  _pruneList(list, now) {
    const cutoff = now - this.maxAgeMs;
    while (list.length > 0 && list[0].timestamp < cutoff) {
      list.shift();
    }
    if (list.length > this.maxItems) {
      list.splice(0, list.length - this.maxItems);
    }
  }

  prune() {
    const now = Date.now();
    this._pruneList(this.events, now);
    this._pruneList(this.consoleLogs, now);
    this._pruneList(this.networkRequests, now);
    this._pruneList(this.checkpoints, now);
  }

  addEvent(category, type, payload = {}) {
    const now = Date.now();
    this.events.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      category,
      type,
      payload
    });
    this.prune();
  }

  addConsole(level, message, details = null) {
    const now = Date.now();
    this.consoleLogs.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      level,
      message,
      details
    });
    this.prune();
  }

  addNetwork(req = {}) {
    const now = Date.now();
    this.networkRequests.push({
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      ...req
    });
    this.prune();
  }

  addCheckpoint(checkpointType, data = {}) {
    const now = Date.now();
    // Prevent duplicate spam of same checkpoint within 5 seconds
    const recentDuplicate = this.checkpoints.slice(-5).find(
      c => c.checkpointType === checkpointType && now - c.timestamp < 5000
    );
    if (recentDuplicate) return null;

    const checkpoint = {
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      checkpointType,
      data
    };
    this.checkpoints.push(checkpoint);
    this.addEvent('CHECKPOINT', checkpointType, data);
    this.prune();
    return checkpoint;
  }

  freezeSnapshot() {
    this.prune();
    return {
      capturedAt: new Date().toISOString(),
      windowSeconds: Math.round(this.maxAgeMs / 1000),
      eventCount: this.events.length,
      events: JSON.parse(JSON.stringify(this.events)),
      consoleCount: this.consoleLogs.length,
      consoleLogs: JSON.parse(JSON.stringify(this.consoleLogs)),
      networkCount: this.networkRequests.length,
      networkRequests: JSON.parse(JSON.stringify(this.networkRequests)),
      checkpointCount: this.checkpoints.length,
      checkpoints: JSON.parse(JSON.stringify(this.checkpoints))
    };
  }

  clear() {
    this.events = [];
    this.consoleLogs = [];
    this.networkRequests = [];
    this.checkpoints = [];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MobileRollingBuffer };
} else {
  window.MobileRollingBuffer = MobileRollingBuffer;
}

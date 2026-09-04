/**
 * Runtime Inspector — Universal Event Bus
 * Module: core/event-bus.js
 *
 * Exposes window.__RUNTIME_INSPECTOR__ and maintains bounded ring buffers
 * for zero memory leak operation.
 */

var BoundedBuffer = class BoundedBuffer {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  push(item) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
    return item;
  }

  getAll() {
    return [...this.buffer];
  }

  getRecent(durationMs) {
    const cutoff = Date.now() - durationMs;
    return this.buffer.filter(item => item.timestamp >= cutoff);
  }

  clear() {
    this.buffer = [];
  }

  get length() {
    return this.buffer.length;
  }
};

var UniversalEventBus = class UniversalEventBus {
  constructor(options = {}) {
    this.version = '1.0.0';
    this.sessionId = options.sessionId || ('RI-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8));
    this.startTime = Date.now();
    this.isRecording = false;

    this.maxEvents = options.maxEvents || 5000;
    this.maxNetwork = options.maxNetwork || 2000;
    this.maxErrors = options.maxErrors || 500;

    this.eventsBuffer = new BoundedBuffer(this.maxEvents);
    this.networkBuffer = new BoundedBuffer(this.maxNetwork);
    this.errorsBuffer = new BoundedBuffer(this.maxErrors);
    this.interactionsBuffer = new BoundedBuffer(1000);

    this.subscribers = new Map();
    this.correlationCounter = 0;

    this.exposeGlobal();
  }

  exposeGlobal() {
    if (typeof window !== 'undefined') {
      window.__RUNTIME_INSPECTOR__ = {
        version: this.version,
        sessionId: this.sessionId,
        eventBus: this,
        isRecording: () => this.isRecording,
        start: () => this.start(),
        stop: () => this.stop(),
        emit: (category, type, payload, options) => this.emit(category, type, payload, options),
        createCorrelationId: (prefix) => this.createCorrelationId(prefix),
        getEvents: (ms) => ms ? this.eventsBuffer.getRecent(ms) : this.eventsBuffer.getAll(),
        getNetwork: (ms) => ms ? this.networkBuffer.getRecent(ms) : this.networkBuffer.getAll(),
        getErrors: () => this.errorsBuffer.getAll(),
        getInteractions: () => this.interactionsBuffer.getAll(),
        adapters: {}
      };
    }
  }

  start() {
    this.isRecording = true;
    this.emit('APP', 'RECORDING_STARTED', { sessionId: this.sessionId, startTime: this.startTime });
  }

  stop() {
    this.emit('APP', 'RECORDING_STOPPED', { sessionId: this.sessionId, durationMs: Date.now() - this.startTime });
    this.isRecording = false;
  }

  createCorrelationId(prefix = 'ACTION') {
    this.correlationCounter++;
    return `${prefix}-${Date.now()}-${this.correlationCounter}`;
  }

  emit(category, type, payload = {}, options = {}) {
    const event = {
      id: 'ev-' + Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      category: category || 'CUSTOM',
      type: type || 'UNKNOWN',
      severity: options.severity || 'INFO',
      source: options.source || 'runtime-core',
      correlationId: options.correlationId || null,
      payload: payload
    };

    // Buffer assignment
    this.eventsBuffer.push(event);

    if (category === 'NETWORK') {
      this.networkBuffer.push(event);
    } else if (category === 'ERROR') {
      this.errorsBuffer.push(event);
    } else if (category === 'INTERACTION') {
      this.interactionsBuffer.push(event);
    }

    this.notifySubscribers(event);
    return event;
  }

  subscribe(filterCategory, callback) {
    if (!this.subscribers.has(filterCategory)) {
      this.subscribers.set(filterCategory, new Set());
    }
    this.subscribers.get(filterCategory).add(callback);
    return () => {
      const set = this.subscribers.get(filterCategory);
      if (set) set.delete(callback);
    };
  }

  notifySubscribers(event) {
    const specific = this.subscribers.get(event.category);
    if (specific) {
      specific.forEach(cb => {
        try { cb(event); } catch (e) { console.error('[EventBus Subscriber Error]', e); }
      });
    }
    const wildcard = this.subscribers.get('*');
    if (wildcard) {
      wildcard.forEach(cb => {
        try { cb(event); } catch (e) { console.error('[EventBus Wildcard Error]', e); }
      });
    }
  }

  markProblem(annotation = '') {
    const correlationId = this.createCorrelationId('PROBLEM');
    return this.emit('APP', 'USER_PROBLEM_MARKER', {
      annotation,
      timestamp: Date.now(),
      markerId: correlationId
    }, {
      severity: 'WARN',
      correlationId
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalEventBus, BoundedBuffer };
} else {
  window.UniversalEventBus = UniversalEventBus;
}

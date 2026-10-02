/**
 * RI Live Diagnostic Helper — Server-side In-Memory Diagnostic Store & Endpoints
 * Round 118 P0 Diagnostic Command (Issue #4 Comment #424)
 *
 * Hard Governance Invariants:
 * - Read-only observational diagnostics on Preview only.
 * - Disabled in Production (v-show-commercial-v1).
 * - Bounded in-memory store (max 50 sessions, 15-minute TTL).
 * - ZERO customer data / DB / candidate persistence.
 * - Cache-Control: no-store on all diagnostic responses.
 */

const MAX_RI_SESSIONS = 50;
const RI_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

const riSessions = new Map();
let latestRiSessionId = null;

function resetStore() {
  riSessions.clear();
  latestRiSessionId = null;
}

function cleanExpiredRiSessions(now = Date.now()) {
  for (const [id, s] of riSessions.entries()) {
    if (now - (s.updatedAt || s.createdAt || 0) > RI_SESSION_TTL_MS) {
      riSessions.delete(id);
      if (latestRiSessionId === id) {
        latestRiSessionId = null;
        // Point to most recently updated remaining session if any
        let newest = null;
        let newestTime = 0;
        for (const [remId, remS] of riSessions.entries()) {
          const t = remS.updatedAt || remS.createdAt || 0;
          if (t > newestTime) {
            newestTime = t;
            newest = remId;
          }
        }
        latestRiSessionId = newest;
      }
    }
  }
}

function isProductionBlocked(req) {
  if (process.env.RI_DIAGNOSTICS_DISABLED === 'true') return true;
  if (process.env.RAILWAY_SERVICE_NAME === 'v-show-commercial-v1' && process.env.RI_DIAGNOSTICS_FORCE_PREVIEW !== 'true') {
    return true;
  }
  return false;
}

function buildAssistantFormat(session) {
  const intervals = session.summary.eventIntervals || [];
  const intervalStats = intervals.length > 0 ? {
    min: Math.min(...intervals),
    max: Math.max(...intervals),
    avg: Math.round((intervals.reduce((a, b) => a + b, 0) / intervals.length) * 10) / 10
  } : { min: 0, max: 0, avg: 0 };

  const betas = session.summary.betaValues || [];
  const betaRange = betas.length > 0 ? {
    min: Math.round(Math.min(...betas) * 10) / 10,
    max: Math.round(Math.max(...betas) * 10) / 10
  } : { min: 0, max: 0 };

  const gammas = session.summary.gammaValues || [];
  const gammaRange = gammas.length > 0 ? {
    min: Math.round(Math.min(...gammas) * 10) / 10,
    max: Math.round(Math.max(...gammas) * 10) / 10
  } : { min: 0, max: 0 };

  const rawAlpha = session.summary.rawAlphaSequence || [];

  return {
    sessionId: session.sessionId,
    commitSha: session.commitSha,
    startedAt: session.startedAt,
    durationMs: Math.max(0, (session.updatedAt || Date.now()) - (session.createdAt || Date.now())),
    eventCount: session.summary.eventCount,
    acceptedDeltaCount: session.summary.acceptedDeltaCount,
    rejectedDeltaCount: session.summary.rejectedDeltaCount,
    acceptedDegrees: Math.round((session.summary.acceptedDegrees || 0) * 10) / 10,
    physicalProgress: Math.round((session.summary.physicalProgress || 0) * 10) / 10,
    uiProgress: Math.round((session.summary.uiProgress || 0) * 10) / 10,
    maxAbsDelta: Math.round((session.summary.maxAbsDelta || 0) * 10) / 10,
    eventIntervalStats: intervalStats,
    firstAlpha: rawAlpha.length > 0 ? rawAlpha[0] : null,
    lastAlpha: rawAlpha.length > 0 ? rawAlpha[rawAlpha.length - 1] : null,
    rawAlphaSequence: rawAlpha,
    normalizedDeltaSequence: session.summary.normalizedDeltaSequence || [],
    accumulatedRotationSequence: session.summary.accumulatedRotationSequence || [],
    betaRange,
    gammaRange,
    rotationDirection: session.summary.rotationDirection || null,
    directionLocked: Boolean(session.summary.directionLocked),
    closureState: session.summary.closureState || 'IDLE',
    closureConfirmed: Boolean(session.summary.closureConfirmed),
    closureDiagnostics: session.summary.closureDiagnostics || [],
    sessionEpoch: session.summary.sessionEpoch || 0,
    stateTransitions: session.stateTransitions || [],
    errors: session.errors || [],
    environment: session.environment || {},
    events: session.events || []
  };
}

function setupRiLiveDiagnostics(app, options = {}) {
  const getGitCommitSha = options.getGitCommitSha || (() => process.env.RAILWAY_GIT_COMMIT_SHA || 'UNKNOWN');

  // Handle incoming batch POST from client
  const handleBatchPost = (req, res) => {
    if (isProductionBlocked(req)) {
      return res.status(403).json({ error: 'RI live diagnostic helper is disabled in production' });
    }

    const body = req.body || {};
    const sessionId = body.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid sessionId' });
    }

    cleanExpiredRiSessions();

    let session = riSessions.get(sessionId);
    if (!session) {
      if (riSessions.size >= MAX_RI_SESSIONS) {
        const oldestKey = riSessions.keys().next().value;
        riSessions.delete(oldestKey);
      }
      session = {
        sessionId,
        commitSha: body.commitSha || getGitCommitSha(),
        startedAt: body.startedAt || new Date().toISOString(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        environment: body.environment || {},
        events: [],
        closures: [],
        stateTransitions: [],
        errors: [],
        summary: {
          eventCount: 0,
          acceptedDeltaCount: 0,
          rejectedDeltaCount: 0,
          acceptedDegrees: 0,
          physicalProgress: 0,
          uiProgress: 0,
          maxAbsDelta: 0,
          eventIntervals: [],
          rawAlphaSequence: [],
          normalizedDeltaSequence: [],
          accumulatedRotationSequence: [],
          betaValues: [],
          gammaValues: [],
          rotationDirection: null,
          directionLocked: false,
          closureState: 'IDLE',
          closureConfirmed: false,
          closureDiagnostics: [],
          sessionEpoch: 0
        }
      };
      riSessions.set(sessionId, session);
    }

    latestRiSessionId = sessionId;
    session.updatedAt = Date.now();
    if (body.environment && Object.keys(body.environment).length > 0) {
      session.environment = Object.assign({}, session.environment, body.environment);
    }

    // Process orientation events
    if (Array.isArray(body.events)) {
      for (const ev of body.events) {
        if (!ev || typeof ev !== 'object') continue;
        if (session.events.length < 10000) {
          session.events.push(ev);
        }
        session.summary.eventCount++;
        if (ev.accepted) {
          session.summary.acceptedDeltaCount++;
        } else {
          session.summary.rejectedDeltaCount++;
        }

        if (ev.cumulativeAcceptedDegrees !== undefined) {
          session.summary.acceptedDegrees = ev.cumulativeAcceptedDegrees;
        } else if (ev.accumulatedRotation !== undefined) {
          session.summary.acceptedDegrees = ev.accumulatedRotation;
        }

        if (ev.progressPercent !== undefined) {
          session.summary.physicalProgress = ev.progressPercent;
          session.summary.uiProgress = ev.progressPercent;
        }
        if (ev.uiProgress !== undefined) {
          session.summary.uiProgress = ev.uiProgress;
        }

        if (ev.normalizedDelta !== undefined) {
          const absD = Math.abs(ev.normalizedDelta);
          if (absD > session.summary.maxAbsDelta) session.summary.maxAbsDelta = absD;
          session.summary.normalizedDeltaSequence.push(Math.round(ev.normalizedDelta * 100) / 100);
        }

        if (ev.alpha !== undefined && Number.isFinite(ev.alpha)) {
          session.summary.rawAlphaSequence.push(Math.round(ev.alpha * 100) / 100);
        }
        if (ev.accumulatedRotation !== undefined && Number.isFinite(ev.accumulatedRotation)) {
          session.summary.accumulatedRotationSequence.push(Math.round(ev.accumulatedRotation * 100) / 100);
        }
        if (ev.eventInterval !== undefined && Number.isFinite(ev.eventInterval) && ev.eventInterval > 0) {
          session.summary.eventIntervals.push(Math.round(ev.eventInterval));
        }
        if (ev.beta !== undefined && Number.isFinite(ev.beta)) {
          session.summary.betaValues.push(Math.round(ev.beta * 10) / 10);
        }
        if (ev.gamma !== undefined && Number.isFinite(ev.gamma)) {
          session.summary.gammaValues.push(Math.round(ev.gamma * 10) / 10);
        }
        if (ev.rotationDirection) {
          session.summary.rotationDirection = ev.rotationDirection;
        }
        if (ev.directionLocked !== undefined) {
          session.summary.directionLocked = Boolean(ev.directionLocked);
        }
        if (ev.captureState) {
          session.summary.closureState = ev.captureState;
        }
        if (ev.closureConfirmed !== undefined) {
          session.summary.closureConfirmed = Boolean(ev.closureConfirmed);
        }
        if (ev.sessionEpoch !== undefined) {
          session.summary.sessionEpoch = ev.sessionEpoch;
        }
      }
    }

    // Process closure events
    if (Array.isArray(body.closures)) {
      for (const cl of body.closures) {
        if (!cl || typeof cl !== 'object') continue;
        if (session.closures.length < 500) session.closures.push(cl);
        session.summary.closureDiagnostics.push(cl);
        if (cl.closureConfirmed) session.summary.closureConfirmed = true;
      }
    }

    // Process state transitions
    if (Array.isArray(body.stateTransitions)) {
      for (const st of body.stateTransitions) {
        if (!st || typeof st !== 'object') continue;
        if (session.stateTransitions.length < 500) session.stateTransitions.push(st);
      }
    }

    // Process errors
    if (Array.isArray(body.errors)) {
      for (const er of body.errors) {
        if (session.errors.length < 500) session.errors.push(er);
      }
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      ok: true,
      sessionId,
      eventsReceived: Array.isArray(body.events) ? body.events.length : 0,
      totalEvents: session.summary.eventCount,
      acceptedDeltaCount: session.summary.acceptedDeltaCount,
      rejectedDeltaCount: session.summary.rejectedDeltaCount,
      acceptedDegrees: session.summary.acceptedDegrees
    });
  };

  app.post('/api/ri-debug/batch', handleBatchPost);
  app.post('/api/ri-debug/session', handleBatchPost);
  app.post('/api/ri-debug/telemetry', handleBatchPost);

  // GET /api/ri-debug/latest
  app.get('/api/ri-debug/latest', (req, res) => {
    if (isProductionBlocked(req)) {
      return res.status(403).json({ error: 'RI live diagnostic helper is disabled in production' });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    cleanExpiredRiSessions();

    if (!latestRiSessionId || !riSessions.has(latestRiSessionId)) {
      return res.status(404).json({ error: 'No active RI diagnostic session recorded yet' });
    }
    const session = riSessions.get(latestRiSessionId);
    if (req.query.format === 'assistant') {
      return res.json(buildAssistantFormat(session));
    }
    return res.json(session);
  });

  // GET /api/ri-debug/:sessionId
  app.get('/api/ri-debug/:sessionId', (req, res) => {
    if (isProductionBlocked(req)) {
      return res.status(403).json({ error: 'RI live diagnostic helper is disabled in production' });
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    cleanExpiredRiSessions();

    const sessionId = req.params.sessionId;
    const session = riSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: `Session ${sessionId} not found or expired` });
    }
    if (req.query.format === 'assistant') {
      return res.json(buildAssistantFormat(session));
    }
    return res.json(session);
  });

  // Optional SSE stream: GET /api/ri-debug/:sessionId/stream
  app.get('/api/ri-debug/:sessionId/stream', (req, res) => {
    if (isProductionBlocked(req)) {
      return res.status(403).json({ error: 'RI live diagnostic helper is disabled in production' });
    }
    const sessionId = req.params.sessionId;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    const interval = setInterval(() => {
      const s = riSessions.get(sessionId);
      if (s) {
        res.write(`data: ${JSON.stringify({ type: 'summary', summary: s.summary, eventCount: s.events.length })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'expired' })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    req.on('close', () => clearInterval(interval));
  });
}

module.exports = {
  setupRiLiveDiagnostics,
  riSessions,
  cleanExpiredRiSessions,
  buildAssistantFormat,
  isProductionBlocked,
  resetStore,
  MAX_RI_SESSIONS,
  RI_SESSION_TTL_MS
};

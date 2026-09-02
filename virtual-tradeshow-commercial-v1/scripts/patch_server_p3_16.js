const fs = require('fs');
const path = require('path');

const targets = ['_clean_deploy', '_railway_deploy', 'app_build'];
const baseDir = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';

targets.forEach(dir => {
  const serverPath = path.join(baseDir, dir, 'server/index.js');
  let code = fs.readFileSync(serverPath, 'utf8');

  // 1. Release ID
  code = code.replace(
    'releaseId: "C11.16-P3.15-R4"',
    'releaseId: "C11.16-P3.16"'
  );

  // 2. GET /booth-3d/sources - include both sources and allSources
  code = code.replace(
    `    const sources = db.listBoothSources(projectId);
    res.json({ success: true, sources });`,
    `    const sources = db.listBoothSources(projectId);
    res.json({ success: true, sources, allSources: sources });`
  );

  // 3. POST /booth-3d/sources - include both sources and allSources
  code = code.replace(
    `    res.json({ success: true, source: sourceRecord, allSources: db.listBoothSources(projectId) });`,
    `    const allSources = db.listBoothSources(projectId);
    res.json({ success: true, source: sourceRecord, sources: allSources, allSources });`
  );

  // 4. Server-Side 422 gating on booth-3d/regenerate
  const oldGate = `    const sources = db.listBoothSources(projectId);
    if (sources.length < minRequired && !isDev) {
      return res.status(400).json({
        error: \`Insufficient source photos. \${qualityTier} requires at least \${minRequired} photos (Current: \${sources.length}).\`,
        code: 'INSUFFICIENT_SOURCE_PHOTOS',
        required: minRequired,
        current: sources.length
      });
    }`;

  const newGate = `    const sources = db.listBoothSources(projectId);
    const seenHashes = new Set();
    const uniqueSources = (sources || []).filter(s => {
      const k = s.hash || s.url || s.id;
      if (!k || seenHashes.has(k)) return false;
      seenHashes.add(k);
      return true;
    });
    if (uniqueSources.length < minRequired) {
      return res.status(422).json({
        error: \`Insufficient unique source photos. \${qualityTier} requires at least \${minRequired} photos (Current unique: \${uniqueSources.length}).\`,
        code: 'INSUFFICIENT_SOURCE_PHOTOS',
        required: minRequired,
        received: uniqueSources.length
      });
    }`;

  code = code.replace(oldGate, newGate);

  // 5. Global API 404 & Error Handler before SPA fallback
  const fallbackTarget = "app.get('*', (req, res) => {";
  const api404Block = `// C11.16-P3.16: Canonical Global API 404 Handler (returns JSON for ANY HTTP method)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API_ROUTE_NOT_FOUND',
    code: 'API_ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method
  });
});

// C11.16-P3.16: Canonical Global API Error Handler (prevents default Express HTML)
app.use((err, req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    console.error('[API Unhandled Error]', req.method, req.path, err);
    return res.status(err.status || 500).json({
      error: err.message || 'INTERNAL_SERVER_ERROR',
      code: err.code || 'API_INTERNAL_ERROR'
    });
  }
  next(err);
});

app.get('*', (req, res) => {`;

  if (!code.includes("code: 'API_ROUTE_NOT_FOUND'")) {
    code = code.replace(fallbackTarget, api404Block);
  }

  fs.writeFileSync(serverPath, code, 'utf8');
  console.log(`[OK] Patched server cleanly at ${serverPath}`);
});

const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const DIRS = ['_clean_deploy', '_railway_deploy', 'app_build'];

DIRS.forEach(dir => {
  // 1. db.js: update countActiveProduct3dQaJobs to ignore stale jobs > 10m
  const dbPath = path.join(ROOT, dir, 'server/db.js');
  let dbSrc = fs.readFileSync(dbPath, 'utf8');

  const oldQaCount = `  countActiveProduct3dQaJobs(accountId) {
    const data = this.read();
    return (data.product3dJobs || []).filter(j =>
      j.accountId === accountId &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status)
    ).length;
  }`;

  const newQaCount = `  countActiveProduct3dQaJobs(accountId) {
    const data = this.read();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return (data.product3dJobs || []).filter(j =>
      j.accountId === accountId &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status) &&
      new Date(j.createdAt).getTime() > tenMinutesAgo
    ).length;
  }`;

  if (dbSrc.includes(oldQaCount)) {
    dbSrc = dbSrc.replace(oldQaCount, newQaCount);
    fs.writeFileSync(dbPath, dbSrc, 'utf8');
    console.log(`[OK] Updated countActiveProduct3dQaJobs in ${dir}/server/db.js`);
  }

  // 2. index.js: add startup stale job cleanup & activeJob 10m window
  const indexPath = path.join(ROOT, dir, 'server/index.js');
  let indexSrc = fs.readFileSync(indexPath, 'utf8');

  const oldActiveJobCheck = `    const existingJobs = db.listProduct3dJobs(projectId);
    const activeJob = existingJobs.find(j =>
      String(j.productSlotIndex) === String(slotIndex) &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status)
    );`;

  const newActiveJobCheck = `    const existingJobs = db.listProduct3dJobs(projectId);
    const tenMinsAgo = Date.now() - 10 * 60 * 1000;
    const activeJob = existingJobs.find(j =>
      String(j.productSlotIndex) === String(slotIndex) &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status) &&
      new Date(j.createdAt).getTime() > tenMinsAgo
    );`;

  if (indexSrc.includes(oldActiveJobCheck)) {
    indexSrc = indexSrc.replace(oldActiveJobCheck, newActiveJobCheck);
  }

  // Add startup cleanup before server.listen
  const startupMarker = `server.listen(PORT, '0.0.0.0', () => {`;
  const startupCleanup = `// Startup cleanup for stale Product 3D jobs from previous process restarts
try {
  const staleJobs = (db.read().product3dJobs || []).filter(j =>
    ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status) &&
    (Date.now() - new Date(j.createdAt).getTime() > 10 * 60 * 1000)
  );
  staleJobs.forEach(j => {
    db.updateProduct3dJob(j.id, { status: 'FAILED', error: 'JOB_TIMED_OUT_ACROSS_RESTART' });
  });
  if (staleJobs.length > 0) console.log(\`[Product3D] Cleaned up \${staleJobs.length} stale uncompleted jobs on startup.\`);
} catch (e) {
  console.error('[Product3D] Startup stale job check error:', e.message);
}

server.listen(PORT, '0.0.0.0', () => {`;

  if (!indexSrc.includes('// Startup cleanup for stale Product 3D jobs from previous process restarts')) {
    indexSrc = indexSrc.replace(startupMarker, startupCleanup);
    console.log(`[OK] Added startup job cleanup to ${dir}/server/index.js`);
  }

  fs.writeFileSync(indexPath, indexSrc, 'utf8');
});

console.log('All lifecycle patches applied.');

/**
 * Virtual Trade Show Commercial V1 — Reconstruction Worker Runner (JS Test Driver)
 * Validates Worker API Claim, Progress, and Completion Protocol ($0 Zero-Cost Mode)
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const WORKER_SECRET = process.env.WORKER_SECRET || 'dev-worker-secret-key-2026';
const WORKER_ID = 'test-driver-worker-01';

async function runWorkerDriver() {
  console.log('======================================================');
  console.log(' Starting Reconstruction Worker Driver Protocol Test');
  console.log(' Server:', SERVER_URL);
  console.log(' Worker ID:', WORKER_ID);
  console.log('======================================================\n');

  const headers = {
    'Authorization': `Bearer ${WORKER_SECRET}`,
    'Content-Type': 'application/json'
  };

  // 1. Claim Job
  console.log('1. Polling and Claiming Next Pending Job...');
  const claimRes = await fetch(`${SERVER_URL}/api/worker/jobs/claim`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ workerId: WORKER_ID })
  });

  if (claimRes.status === 204) {
    console.log('No pending jobs found in queue.');
    return;
  }

  const job = await claimRes.json();
  const jobId = job.jobId || job.job.id;
  const boothId = job.boothId || job.job.boothId;
  console.log(`✔ Claimed Job: ${jobId} (Booth: ${boothId})`);

  // 2. Report Progress Stages
  const stages = [
    { progress: 15, stage: 'colmap_feature_extraction' },
    { progress: 35, stage: 'colmap_matching' },
    { progress: 60, stage: 'colmap_mapping' },
    { progress: 80, stage: 'splat_training' },
    { progress: 95, stage: 'splat_export' }
  ];

  for (const s of stages) {
    console.log(`Reporting stage [${s.stage}] -> ${s.progress}%`);
    await fetch(`${SERVER_URL}/api/worker/jobs/${jobId}/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        progress: s.progress,
        currentStage: s.stage,
        diagnostics: {
          registeredImages: job.sourcePhotoCount || 3,
          totalImages: job.sourcePhotoCount || 3,
          sparsePoints: 50000 + s.progress * 600
        }
      })
    });
    await new Promise(r => setTimeout(r, 400));
  }

  // 3. Complete Job
  console.log('3. Completing Job with Output Metadata...');
  const compRes = await fetch(`${SERVER_URL}/api/worker/jobs/${jobId}/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      output: {
        type: 'gaussian_splat',
        url: `/uploads/models/${boothId}_splat.ply`,
        format: 'ply',
        sizeBytes: 15800000
      },
      diagnostics: {
        registeredImages: job.sourcePhotoCount || 3,
        totalImages: job.sourcePhotoCount || 3,
        sparsePoints: 108400,
        warnings: []
      }
    })
  });
  const compData = await compRes.json();
  console.log(`✔ Job Completed: ${compData.job.status}, Format: ${compData.job.output.format}`);
  console.log('\n======================================================');
  console.log(' WORKER PROTOCOL TEST PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

runWorkerDriver();

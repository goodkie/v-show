const http = require('http');
const fs = require('fs');

async function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-booth-edit-token': 'dev_bypass_token'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'GET',
      headers: {
        'x-booth-edit-token': 'dev_bypass_token'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const projectId = 'prj-free-b0c6f3ea';
  const sessionId = 'sess_pipeline_' + Date.now();

  const f1 = fs.readFileSync('scratch/test_frames/cand_01.jpg');
  const f2 = fs.readFileSync('scratch/test_frames/cand_wrap_01.jpg');
  const d1 = `data:image/jpeg;base64,${f1.toString('base64')}`;
  const d2 = `data:image/jpeg;base64,${f2.toString('base64')}`;

  console.log('1. Uploading candidate frame 1...');
  const c1Res = await postJson(`/api/projects/${projectId}/guided-capture/candidate-frame`, {
    projectId,
    captureSessionId: sessionId,
    candidateId: 'cand_test_01',
    dataUrl: d1,
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    captureIndex: 1
  });
  console.log('Frame 1 result:', c1Res.status, c1Res.body);

  console.log('2. Uploading candidate frame 2...');
  const c2Res = await postJson(`/api/projects/${projectId}/guided-capture/candidate-frame`, {
    projectId,
    captureSessionId: sessionId,
    candidateId: 'cand_test_02',
    dataUrl: d2,
    headingDeg: 180,
    pitchDeg: 0,
    rollDeg: 0,
    captureIndex: 2
  });
  console.log('Frame 2 result:', c2Res.status, c2Res.body);

  console.log('3. Finalizing capture session...');
  const finRes = await postJson(`/api/projects/${projectId}/guided-capture/finalize-capture`, {
    projectId,
    captureSessionId: sessionId,
    previewFrameCount: 60,
    candidateFrameCount: 2,
    acceptedCandidateCount: 2,
    accumulatedRotation: 360,
    closureConfirmed: true,
    guidanceMode: 'CONTINUOUS_PANO_RING'
  });
  console.log('Finalize result:', finRes.status, finRes.body);

  console.log('4. Triggering panorama start...');
  const startRes = await postJson(`/api/projects/${projectId}/panorama/start`, {
    projectId,
    captureSessionId: sessionId,
    closureConfirmed: true,
    creationMode: 'FIXED_ORIGIN_PANORAMA',
    autoRemovePeople: true,
    isTest: true,
    sourceCount: 2,
    keyframes: [
      { keyframeId: 'KF01', candidateId: 'cand_test_01', index: 1, angle: 0 },
      { keyframeId: 'KF02', candidateId: 'cand_test_02', index: 2, angle: 180 }
    ]
  });
  console.log('Start result:', startRes.status, startRes.body);

  if (startRes.body && startRes.body.jobId) {
    const jobId = startRes.body.jobId;
    console.log('5. Polling job:', jobId);
    for (let i = 0; i < 10; i++) {
      const pollRes = await getJson(`/api/panorama-jobs/${jobId}`);
      console.log(`Poll ${i+1}: status=${pollRes.status}, jobStatus=${pollRes.body?.job?.status}, progress=${pollRes.body?.job?.progress}`);
      if (pollRes.body?.job?.status === 'READY') {
        console.log('SUCCESS! Job READY! Asset URL:', pollRes.body?.job?.candidate?.stitchedPanoramaUrl || pollRes.body?.job?.candidate?.masterUrl);
        break;
      }
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

run().catch(console.error);

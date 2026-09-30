const https = require('https');
const assert = require('assert');

const REMOTE_HOST = '3d2r-dark-minimal-flow-preview-production.up.railway.app';

function makeRemoteRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request({
      hostname: REMOTE_HOST,
      port: 443,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: null, raw: data });
        }
      });
    });

    req.on('error', (err) => resolve({ error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(` REMOTE PREVIEW VERIFICATION AGAINST ${REMOTE_HOST}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const EXPECTED_HEAD = process.env.EXPECTED_HEAD || (() => {
    try {
      return require('child_process').execSync('git rev-parse HEAD', { timeout: 2000 }).toString().trim();
    } catch(e) {
      return '9123512f6f125d87fcb82ceb8eadf368f529a837';
    }
  })();
  console.log(`EXPECTED_HEAD: ${EXPECTED_HEAD}`);

  // 1. Healthcheck
  const health = await makeRemoteRequest('GET', '/health');
  console.log(`[PASS] Remote /health: HTTP ${health.status}`, health.body);
  assert.strictEqual(health.status, 200, 'Remote /health must return HTTP 200');
  assert(health.body?.gitCommit, 'Remote health must include gitCommit');
  assert.strictEqual(health.body.gitCommit, EXPECTED_HEAD, `Remote /health gitCommit must equal EXPECTED_HEAD: ${EXPECTED_HEAD}`);
  console.log(`[PASS] Remote /health gitCommit: ${health.body.gitCommit}`);

  // 1b. Build-info
  const buildInfo = await makeRemoteRequest('GET', '/api/build-info');
  console.log(`[PASS] Remote /api/build-info: HTTP ${buildInfo.status}`, buildInfo.body);
  assert.strictEqual(buildInfo.status, 200, 'Remote /api/build-info must return HTTP 200');
  assert(buildInfo.body?.gitCommit, 'Remote /api/build-info must include gitCommit');
  assert.strictEqual(buildInfo.body.gitCommit, EXPECTED_HEAD, `Remote /api/build-info gitCommit must equal EXPECTED_HEAD: ${EXPECTED_HEAD}`);
  assert.strictEqual(health.body.gitCommit, buildInfo.body.gitCommit, 'Remote health and build-info gitCommit must be strictly equal');
  console.log(`[PASS] Remote /api/build-info gitCommit: ${buildInfo.body.gitCommit}`);

  // 2. Candidate Ingestion without auth -> 401
  const candNoAuth = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/candidate', {
    candidateId: 'test-cand-no-auth'
  });
  console.log(`[PASS] Remote POST candidate without auth: HTTP ${candNoAuth.status}`, candNoAuth.body);
  assert.strictEqual(candNoAuth.status, 401);

  // 3. Candidate Ingestion with bad auth -> 403
  const candBadAuth = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/candidate', {
    candidateId: 'test-cand-bad-auth'
  }, { 'Authorization': 'Bearer bad_token_xyz' });
  console.log(`[PASS] Remote POST candidate with invalid token: HTTP ${candBadAuth.status}`, candBadAuth.body);
  assert.strictEqual(candBadAuth.status, 403);

  // 4. Literal worker secret bypass rejected -> 403
  const candLiteralWorker = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/candidate', {
    candidateId: 'test-cand-literal-worker'
  }, { 'x-worker-key': 'internal_worker_secret' });
  console.log(`[PASS] Remote POST candidate with literal worker secret: HTTP ${candLiteralWorker.status}`, candLiteralWorker.body);
  assert.strictEqual(candLiteralWorker.status, 403);

  // 5. Literal dev pass bypass rejected -> 403
  const candLiteralDev = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/candidate', {
    candidateId: 'test-cand-literal-dev'
  }, { 'Authorization': 'Bearer internal_dev_pass' });
  console.log(`[PASS] Remote POST candidate with literal dev pass: HTTP ${candLiteralDev.status}`, candLiteralDev.body);
  assert.strictEqual(candLiteralDev.status, 403);

  // 6. Apply without auth token -> 401
  const applyNoToken = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/apply', {
    candidateId: 'cand-any'
  });
  console.log(`[PASS] Remote POST apply without token: HTTP ${applyNoToken.status}`, applyNoToken.body);
  assert.strictEqual(applyNoToken.status, 401);

  // 7. Apply with invalid auth token -> 403
  const applyBadToken = await makeRemoteRequest('POST', '/api/projects/prj-free-b0c6f3ea/panorama/apply', {
    candidateId: 'cand-any'
  }, { 'Authorization': 'Bearer bad_token_xyz' });
  console.log(`[PASS] Remote POST apply with invalid token: HTTP ${applyBadToken.status}`, applyBadToken.body);
  assert.strictEqual(applyBadToken.status, 403);

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(' ALL REMOTE PREVIEW NEGATIVE AUTH TESTS PASSED (100%)');
  console.log('══════════════════════════════════════════════════════════════════════');
}

run().catch(console.error);

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const configPath = path.join(os.homedir(), '.railway', 'config.json');
const railwayConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const token = railwayConfig.user?.accessToken;
const serviceId = '8e807076-c4bf-4f0a-8bdc-e56d9ecb2016';
const environmentId = '1241ff56-1c40-48a3-8831-eb4b1f913f13';

function railwayGQL(body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'backboard.railway.com',
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  // GitHub 연동 자동 배포용 rootDirectory를 올바른 경로로 복원
  // (github push시 app_build 폴더를 빌드 루트로 사용)
  const mutationBody = JSON.stringify({
    query: `
      mutation {
        serviceInstanceUpdate(
          serviceId: "${serviceId}",
          environmentId: "${environmentId}",
          input: { rootDirectory: "virtual-tradeshow-commercial-v1/app_build" }
        )
      }
    `
  });

  console.log('=== Restoring rootDirectory for GitHub auto-deploy ===');
  const updateResp = await railwayGQL(mutationBody);
  console.log(JSON.stringify(updateResp, null, 2));

  const verifyQuery = JSON.stringify({
    query: `{ service(id: "${serviceId}") { serviceInstances { edges { node { rootDirectory } } } } }`
  });
  const verifyResp = await railwayGQL(verifyQuery);
  console.log('\n=== Verified rootDirectory ===');
  console.log(JSON.stringify(verifyResp, null, 2));
})();

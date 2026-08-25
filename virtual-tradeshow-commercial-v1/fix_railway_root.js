const https = require('https');

const token = 'eN5OiTxpb8l6M2H7v895ihuzSHVw2M3bBNitN4pda50';
const serviceId = '8e807076-c4bf-4f0a-8bdc-e56d9ecb2016';
const instanceId = '52b53681-53f8-441d-b583-16d607de0e7d';
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
  // serviceInstanceUpdate 타입 확인
  const introQuery = JSON.stringify({ query: '{ __type(name: "ServiceInstanceUpdateInput") { inputFields { name type { name kind } } } }' });
  const introResp = await railwayGQL(introQuery);
  console.log('=== ServiceInstanceUpdateInput Fields ===');
  console.log(JSON.stringify(introResp, null, 2));

  // rootDirectory를 빈 문자열로 업데이트
  const mutationBody = JSON.stringify({
    query: `
      mutation {
        serviceInstanceUpdate(
          serviceId: "${serviceId}",
          environmentId: "${environmentId}",
          input: { rootDirectory: "" }
        )
      }
    `
  });

  console.log('\n=== Updating rootDirectory to empty... ===');
  const updateResp = await railwayGQL(mutationBody);
  console.log(JSON.stringify(updateResp, null, 2));

  // 확인
  const verifyQuery = JSON.stringify({
    query: `{ service(id: "${serviceId}") { serviceInstances { edges { node { rootDirectory } } } } }`
  });
  const verifyResp = await railwayGQL(verifyQuery);
  console.log('\n=== Verification ===');
  console.log(JSON.stringify(verifyResp, null, 2));
})();

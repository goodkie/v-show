const https = require('https');

const token = 'eN5OiTxpb8l6M2H7v895ihuzSHVw2M3bBNitN4pda50';
const serviceId = '8e807076-c4bf-4f0a-8bdc-e56d9ecb2016';

// Service 타입의 모든 필드 조회
const query1 = JSON.stringify({ query: '{ __type(name: "Service") { fields { name } } }' });

// Service 상세 조회
const query2 = JSON.stringify({
  query: `{ service(id: "${serviceId}") { id name } }`
});

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
  // 1. Service 타입 필드 조회
  const typeResp = await railwayGQL(query1);
  console.log('=== Service Type Fields ===');
  if (typeResp.data && typeResp.data.__type) {
    typeResp.data.__type.fields.forEach(f => console.log(' -', f.name));
  } else {
    console.log(JSON.stringify(typeResp, null, 2));
  }

  // 2. 서비스 기본 조회
  const serviceResp = await railwayGQL(query2);
  console.log('\n=== Service Basic ===');
  console.log(JSON.stringify(serviceResp, null, 2));

  // 3. 서비스 설정 더 자세히
  const query3 = JSON.stringify({
    query: `{ service(id: "${serviceId}") { id name serviceInstances { edges { node { id environmentId buildCommand startCommand rootDirectory } } } } }`
  });
  const instanceResp = await railwayGQL(query3);
  console.log('\n=== Service Instances (rootDirectory) ===');
  console.log(JSON.stringify(instanceResp, null, 2));
})();

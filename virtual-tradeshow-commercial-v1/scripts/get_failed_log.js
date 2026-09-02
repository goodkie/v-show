const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '07f2abbb-1ac5-4dee-b767-9f42be901ac0';

function queryGql(q) {
  return new Promise((resolve) => {
    const req = https.request('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.write(JSON.stringify({ query: q }));
    req.end();
  });
}

async function main() {
  const d1 = await queryGql(`query {
    deployment(id: "${deploymentId}") {
      id
      status
      meta
    }
  }`);
  console.log('Deployment:', JSON.stringify(d1, null, 2));

  // Also query build logs or deployment logs
  const d2 = await queryGql(`query {
    buildLogs(deploymentId: "${deploymentId}", limit: 100) {
      message
    }
  }`);
  if (d2.data?.buildLogs?.length) {
    console.log('Build Logs:');
    d2.data.buildLogs.slice(-20).forEach(l => console.log(l.message));
  }
}
main();

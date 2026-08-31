const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '3ee1609e-720b-438b-b8d1-1a1d5f1917cc';

let count = 0;
const max = 35;

function check() {
  count++;
  const query = `query { deployment(id: "${deploymentId}") { id status } }`;
  const req = https.request('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token }
  }, (res) => {
    let b = '';
    res.on('data', d => b += d);
    res.on('end', () => {
      try {
        const data = JSON.parse(b);
        const status = data.data.deployment.status;
        console.log(`[Deploy Poll ${count}] Status: ${status}`);

        if (status === 'SUCCESS') {
          console.log('\n🎉 SUCCESS! Latest commit ebff3da is successfully deployed to Railway Production!');
          process.exit(0);
        } else if (status === 'FAILED' || status === 'CRASHED') {
          console.error('❌ Deployment failed with status:', status);
          process.exit(1);
        }
      } catch(e) { console.log('Parse error:', b); }

      if (count < max) setTimeout(check, 5000);
      else process.exit(1);
    });
  });
  req.on('error', (err) => {
    console.error('Request error:', err.message);
    if (count < max) setTimeout(check, 5000);
  });
  req.write(JSON.stringify({ query }));
  req.end();
}

check();
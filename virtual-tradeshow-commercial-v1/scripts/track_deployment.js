const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '6ce6f617-d5cf-4fa3-993c-2755e3e33ab2';

let count = 0;
const max = 30;

function checkDeployment() {
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
        console.log(`[Deploy Status Poll ${count}] Status: ${status}`);

        if (status === 'SUCCESS') {
          console.log('🎉 Deployment succeeded! Railway is now serving the latest 3D2 container!');
          process.exit(0);
        } else if (status === 'FAILED' || status === 'CRASHED') {
          console.error('❌ Deployment failed with status:', status);
          process.exit(1);
        }
      } catch(e) { console.log('Error parsing response:', b); }

      if (count < max) setTimeout(checkDeployment, 5000);
      else process.exit(1);
    });
  });
  req.on('error', (err) => {
    console.error('Request error:', err.message);
    if (count < max) setTimeout(checkDeployment, 5000);
  });
  req.write(JSON.stringify({ query }));
  req.end();
}

checkDeployment();
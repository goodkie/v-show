const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '1a08a67b-82f4-4c0b-bb6e-cfac4f338827';

const query = `query { buildLogs(deploymentId: "${deploymentId}") { message } }`;
const req = https.request('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token }
}, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => {
    try {
      const data = JSON.parse(b);
      const logs = (data.data?.buildLogs || []).map(l => l.message);
      console.log('Total build logs:', logs.length);
      console.log('Recent Build Logs:\n', logs.slice(-10).join('\n'));
    } catch(e) { console.log(b); }
  });
});
req.write(JSON.stringify({ query }));
req.end();
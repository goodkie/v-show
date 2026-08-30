const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '4ddbd101-e184-4787-b2e8-39f1a24cbfb9';

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
      const logs = data.data.buildLogs.map(l => l.message);
      console.log('Build Logs:\n', logs.slice(-10).join('\n'));
    } catch(e) { console.log(b); }
  });
});
req.write(JSON.stringify({ query }));
req.end();
const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '12d58958-3e14-4ca8-b156-42a5c4504799';

const query = JSON.stringify({
  query: `query {
    deploymentLogs(deploymentId: "${deploymentId}", limit: 500) {
      timestamp
      message
    }
  }`
});

const req = https.request('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    try {
      const d = JSON.parse(b);
      const logs = d.data?.deploymentLogs || [];
      console.log('Total Logs:', logs.length);
      logs.forEach(l => {
        if (l.message.includes('projects') || l.message.includes('Error') || l.message.includes('TypeError') || l.message.includes('Product3D')) {
          console.log(`[${l.timestamp}] ${l.message}`);
        }
      });
      if (logs.length > 0) {
        console.log('\nLast 15 log lines:');
        logs.slice(-15).forEach(l => console.log(`[${l.timestamp}] ${l.message}`));
      }
    } catch(e) { console.log('Parse error:', e, b); }
  });
});
req.write(query);
req.end();

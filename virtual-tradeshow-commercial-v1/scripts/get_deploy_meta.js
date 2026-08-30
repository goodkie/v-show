const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const deploymentId = '6ce6f617-d5cf-4fa3-993c-2755e3e33ab2';

const query = `query { deployment(id: "${deploymentId}") { id status meta } }`;
const req = https.request('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token }
}, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => console.log('Deployment Meta:\n', b));
});
req.write(JSON.stringify({ query }));
req.end();
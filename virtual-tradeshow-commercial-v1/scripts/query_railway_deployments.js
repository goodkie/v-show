const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const serviceId = '8e807076-c4bf-4f0a-8bdc-e56d9ecb2016';
const environmentId = '1241ff56-1c40-48a3-8831-eb4b1f913f13';

const query = JSON.stringify({
  query: `query {
    deployments(input: { serviceId: "${serviceId}", environmentId: "${environmentId}" }, first: 5) {
      edges {
        node {
          id
          status
          createdAt
          meta
        }
      }
    }
  }`
});

const req = https.request('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Project-Access-Token': token
  }
}, res => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => console.log('Deployments:\n', JSON.stringify(JSON.parse(b), null, 2)));
});
req.on('error', console.error);
req.write(query);
req.end();

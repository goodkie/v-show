const https = require('https');

const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';
const serviceId = '8e807076-c4bf-4f0a-8bdc-e56d9ecb2016';
const environmentId = '1241ff56-1c40-48a3-8831-eb4b1f913f13';
const projectId = '4c4094c5-e6c2-4996-bbd8-e9e254828069';

const query = `
query {
  deployments(
    input: {
      projectId: "${projectId}"
      serviceId: "${serviceId}"
      environmentId: "${environmentId}"
    }
    first: 5
  ) {
    edges {
      node {
        id
        status
        createdAt
        meta
      }
    }
  }
}
`;

const req = https.request('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Project-Access-Token': token
  }
}, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => console.log('Deployments:\n', b));
});

req.on('error', console.error);
req.write(JSON.stringify({ query }));
req.end();
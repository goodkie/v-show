const https = require('https');

const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';

const query = `
query {
  project(id: "4c4094c5-e6c2-4996-bbd8-e9e254828069") {
    id
    name
    services {
      edges {
        node {
          id
          name
        }
      }
    }
    environments {
      edges {
        node {
          id
          name
        }
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
  res.on('end', () => console.log('Railway GraphQL Response:\n', b));
});

req.on('error', console.error);
req.write(JSON.stringify({ query }));
req.end();
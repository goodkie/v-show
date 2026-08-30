const https = require('https');
const token = '8bed6af7-cd5d-4d2b-a652-acfba822a9d7';

const query = `
query {
  __type(name: "Mutation") {
    fields {
      name
      args {
        name
        type {
          name
          kind
          ofType { name kind }
        }
      }
    }
  }
}
`;

const req = https.request('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token }
}, (res) => {
  let b = '';
  res.on('data', d => b += d);
  res.on('end', () => {
    try {
      const data = JSON.parse(b);
      const fields = data.data.__type.fields.filter(f => f.name.toLowerCase().includes('deploy'));
      console.log('Deploy Mutations:\n', JSON.stringify(fields, null, 2));
    } catch(e) { console.log(b); }
  });
});
req.write(JSON.stringify({ query }));
req.end();
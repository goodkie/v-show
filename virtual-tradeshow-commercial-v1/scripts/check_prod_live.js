const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function checkProd() {
  console.log('Testing live Railway Production health...');
  const health = await fetchJson('https://v-show-commercial-v1-production.up.railway.app/api/health');
  console.log('Production /api/health Response:', JSON.stringify(health, null, 2));

  console.log('\nTesting live Railway email dispatcher config check...');
  const mailerCheck = await new Promise((resolve, reject) => {
    const postData = JSON.stringify({ email: 'audit-test-probe@3dz-verify.site', businessName: 'Probe Diagnostics' });
    const req = https.request('https://v-show-commercial-v1-production.up.railway.app/api/free-funnel/email/send-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
  console.log('Production /api/free-funnel/email/send-verification response:', JSON.stringify(mailerCheck, null, 2));
}

checkProd().catch(err => console.error('Prod check error:', err));
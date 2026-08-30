const fs = require('fs');
const p = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_suite.js';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(
  `  const verifyLinkRes = await new Promise((resolve) => {
    http.get(BASE_URL + emailRes2.verifyUrl, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
  });`,
  `  const parsedUrl = new URL(emailRes2.verifyUrl);
  const localVerifyUrl = \`\${BASE_URL}\${parsedUrl.pathname}\${parsedUrl.search}\`;
  console.log(' - Requesting local verify URL:', localVerifyUrl);
  const verifyLinkRes = await new Promise((resolve) => {
    http.get(localVerifyUrl, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
  });`
);

fs.writeFileSync(p, code, 'utf8');
console.log('Fixed magic link URL resolution in run_c11_11_p0_suite.js successfully');
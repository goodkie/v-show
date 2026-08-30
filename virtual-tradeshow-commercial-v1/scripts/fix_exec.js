const fs = require('fs');
const p = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_suite.js';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(
  `  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });`,
  `  let execPath = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
  if (!fs.existsSync(execPath)) {
    execPath = 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe';
  }
  console.log(' - Using browser executable:', execPath);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });`
);

fs.writeFileSync(p, code, 'utf8');
console.log('Configured executablePath in run_c11_11_p0_suite.js successfully');
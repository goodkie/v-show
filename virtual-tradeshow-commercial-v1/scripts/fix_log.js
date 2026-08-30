const fs = require('fs');
const p = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_r1_acceptance.js';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(
  `  const uncaughtErrors = [];
  page.on('pageerror', err => {
    uncaughtErrors.push(err.message);
    console.log('  [UNCAUGHT JS ERROR]', err.message);
  });`,
  `  const uncaughtErrors = [];
  page.on('pageerror', err => {
    uncaughtErrors.push(err.message);
    console.log('  [UNCAUGHT JS ERROR]', err.message);
  });
  page.on('console', msg => {
    console.log('  [BROWSER CONSOLE]', msg.type(), msg.text());
  });`
);

fs.writeFileSync(p, code, 'utf8');
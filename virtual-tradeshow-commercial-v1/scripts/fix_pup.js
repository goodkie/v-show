const fs = require('fs');
const path = require('path');
const p = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/run_c11_11_p0_suite.js';
let content = fs.readFileSync(p, 'utf8');
content = content.replace(
  "const puppeteer = require('./virtual-tradeshow-commercial-v1/app_build/node_modules/puppeteer');",
  "const puppeteer = require(path.resolve(__dirname, '../app_build/node_modules/puppeteer'));"
);
fs.writeFileSync(p, content, 'utf8');
console.log('Fixed puppeteer path in run_c11_11_p0_suite.js successfully');
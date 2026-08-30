const fs = require('fs');
const path = require('path');

const files = [
  'E:/vivpr/ai/v-show/package.json',
  'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/package.json',
  'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/package.json',
  'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/package.json',
  'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/package.json'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let raw = fs.readFileSync(f);
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
      console.log(`Fixing UTF-8 BOM in ${f}`);
      raw = raw.slice(3);
      fs.writeFileSync(f, raw);
    }
  }
});
console.log('✅ All package.json BOMs cleaned!');
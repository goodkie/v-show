const fs = require('fs');

const commit = '1cc7b9b';
const files = [
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/client/index.html',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/client/index.html',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html'
];

// Also fix embed_commit.js so future embeds use P3.16
const embedPath = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/scripts/embed_commit.js';
let embedSrc = fs.readFileSync(embedPath, 'utf8');
embedSrc = embedSrc.replace('releaseId: \\"C11.16-P3.15-R4\\"', 'releaseId: \\"C11.16-P3.16\\"');
fs.writeFileSync(embedPath, embedSrc, 'utf8');
console.log('Fixed embed_commit.js');

// Fix each HTML file directly
files.forEach(f => {
  let src = fs.readFileSync(f, 'utf8');
  // Replace the releaseId in the __3DZ_BUILD_INFO__ block
  src = src.replace('releaseId: "C11.16-P3.15-R4"', 'releaseId: "C11.16-P3.16"');
  fs.writeFileSync(f, src, 'utf8');
  const check = (src.match(/window\.__3DZ_BUILD_INFO__[^\n]+/) || [])[0];
  console.log(f.split('/').slice(-3).join('/'), ':', check);
});

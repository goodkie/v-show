const fs = require('fs');
const dirs = ['_clean_deploy', '_railway_deploy', 'app_build'];
dirs.forEach(dir => {
  const path = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/' + dir + '/client/index.html';
  let html = fs.readFileSync(path, 'utf8');
  html = html.replace('releaseId: "C11.16-P3.15-R4"', 'releaseId: "C11.16-P3.16"');
  fs.writeFileSync(path, html, 'utf8');
  const check = (html.match(/window\.__3DZ_BUILD_INFO__[^\n]+/) || [])[0] || 'NOT FOUND';
  console.log(dir, ':', check);
});

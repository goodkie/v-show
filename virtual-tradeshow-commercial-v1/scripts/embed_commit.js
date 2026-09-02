const fs = require('fs');

const commit = '92174ce';
const files = [
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/client/index.html',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/client/index.html',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/index.html',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_clean_deploy/server/index.js',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/_railway_deploy/server/index.js',
  'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/index.js'
];

const scriptBlock = `<script>
  window.__3DZ_BUILD_INFO__ = { gitCommit: "${commit}", releaseId: "C11.16-P3.15-R2" };
  fetch('/api/build-info').then(function(r){return r.json();}).then(function(d){if(d&&d.gitCommit)window.__3DZ_BUILD_INFO__.gitCommit=d.gitCommit;}).catch(function(){});
  </script>`;

files.forEach(f => {
  let src = fs.readFileSync(f, 'utf8');
  if (f.endsWith('index.html')) {
    // Replace the script tag
    const idx = src.indexOf('window.__3DZ_BUILD_INFO__');
    if (idx > 0) {
      const scriptStart = src.lastIndexOf('<script', idx);
      const scriptEnd = src.indexOf('</script>', idx) + 9;
      src = src.substring(0, scriptStart) + scriptBlock + src.substring(scriptEnd);
    }
  } else {
    src = src.replace(/gitCommit:\s*["'][a-zA-Z0-9_\-]+["']/g, `gitCommit: "${commit}"`);
  }
  fs.writeFileSync(f, src, 'utf8');
  console.log('Embedded commit in', f);
});

console.log('Done embedding commit.');

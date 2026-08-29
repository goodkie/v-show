const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const serverIndexPath = path.join(baseDir, 'app_build', 'server', 'index.js');
let serverJs = fs.readFileSync(serverIndexPath, 'utf8');

const debugRoute = `
app.get('/api/debug/assets-scan', (req, res) => {
  const scan = (d) => {
    if (!fs.existsSync(d)) return ['NOT_EXISTS: ' + d];
    try {
      return fs.readdirSync(d, { recursive: true });
    } catch(e) {
      return ['ERROR: ' + e.message];
    }
  };
  res.json({
    cwd: process.cwd(),
    dirname: __dirname,
    clientAssets: scan(path.join(__dirname, '..', 'client', 'assets')),
    rootAssets: scan(path.join(__dirname, '..', 'assets'))
  });
});
`;

serverJs = serverJs.replace("app.get('/api/debug/video-assets'", `${debugRoute.trim()}\n\napp.get('/api/debug/video-assets'`);

fs.writeFileSync(serverIndexPath, serverJs, 'utf8');
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_clean_deploy', 'server', 'index.js'));
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_railway_deploy', 'server', 'index.js'));

console.log('✅ Added /api/debug/assets-scan endpoint');

const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const serverIndexPath = path.join(baseDir, 'app_build', 'server', 'index.js');
let serverJs = fs.readFileSync(serverIndexPath, 'utf8');

const testRoute = `
app.get('/api/debug/test-asset', (req, res) => {
  const rel = (req.query.path || '').replace(/^[/\\]+/, '');
  const searchDirs = [
    path.join(__dirname, '..', 'client', 'assets'),
    path.join(__dirname, '..', 'assets'),
    path.join(process.cwd(), 'client', 'assets'),
    path.join(process.cwd(), 'assets'),
    path.join(process.cwd(), 'app_build', 'client', 'assets')
  ];
  const checks = searchDirs.map(d => {
    const full = path.join(d, rel);
    return {
      dir: d,
      fullPath: full,
      exists: fs.existsSync(full),
      isFile: fs.existsSync(full) ? fs.statSync(full).isFile() : false
    };
  });
  res.json({ rel, checks });
});
`;

serverJs = serverJs.replace("app.get('/api/debug/assets-scan'", `${testRoute.trim()}\n\napp.get('/api/debug/assets-scan'`);

fs.writeFileSync(serverIndexPath, serverJs, 'utf8');
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_clean_deploy', 'server', 'index.js'));
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_railway_deploy', 'server', 'index.js'));

console.log('✅ Added /api/debug/test-asset endpoint');

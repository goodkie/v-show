const fs = require('fs');
let srv = fs.readFileSync('app_build/server/index.js', 'utf8');

const debugRoute = `
app.get('/api/debug/video-assets', (req, res) => {
  const root = path.resolve(__dirname, '..');
  const clientDir = path.resolve(__dirname, '..', 'client');
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { recursive: true });
  };
  res.json({
    __dirname,
    root,
    clientDir,
    clientExists: fs.existsSync(clientDir),
    clientFiles: scan(clientDir).filter(f => f.endsWith('.mp4') || f.endsWith('.jpg'))
  });
});
`;

if (!srv.includes('/api/debug/video-assets')) {
  srv = srv.replace('app.use(express.static(', `${debugRoute}\n\napp.use(express.static(`);
  fs.writeFileSync('app_build/server/index.js', srv, 'utf8');
  fs.writeFileSync('_railway_deploy/server/index.js', srv, 'utf8');
}

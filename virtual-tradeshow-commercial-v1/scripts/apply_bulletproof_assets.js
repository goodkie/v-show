const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const clientAssets = path.join(baseDir, 'app_build', 'client', 'assets');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. client/assets 를 루트 assets 및 client/assets 로 이중 복사하여 어떤 경로로 요청되어도 100% 찾도록 보장
copyRecursive(clientAssets, path.join(baseDir, '_clean_deploy', 'assets'));
copyRecursive(clientAssets, path.join(baseDir, '_clean_deploy', 'client', 'assets'));
copyRecursive(clientAssets, path.join(baseDir, '_railway_deploy', 'assets'));
copyRecursive(clientAssets, path.join(baseDir, '_railway_deploy', 'client', 'assets'));

// 2. server/index.js 미들웨어 강화
const serverIndexPath = path.join(baseDir, 'app_build', 'server', 'index.js');
let serverJs = fs.readFileSync(serverIndexPath, 'utf8');

const bulletproofAssetMiddleware = `
// =====================================================================
// ³DNa Universal Bulletproof Asset Streaming Middleware
// =====================================================================
app.use('/assets', (req, res, next) => {
  const rel = req.path.replace(/^[/\\]+/, '');
  const searchDirs = [
    path.join(__dirname, '..', 'client', 'assets'),
    path.join(__dirname, '..', 'assets'),
    path.join(process.cwd(), 'client', 'assets'),
    path.join(process.cwd(), 'assets'),
    path.join(process.cwd(), 'app_build', 'client', 'assets')
  ];

  for (const dir of searchDirs) {
    const full = path.join(dir, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return res.sendFile(full);
    }
  }
  next();
});
`;

serverJs = serverJs.replace(/\/\/ =====================================================================\s*\/\/ ³DNa Universal High-Speed Asset Streaming Middleware[\s\S]*?next\(\);\s*\}\);/, bulletproofAssetMiddleware.trim());

fs.writeFileSync(serverIndexPath, serverJs, 'utf8');
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_clean_deploy', 'server', 'index.js'));
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_railway_deploy', 'server', 'index.js'));

console.log('✅ Double-synced all assets to root and client, and applied bulletproof asset middleware!');

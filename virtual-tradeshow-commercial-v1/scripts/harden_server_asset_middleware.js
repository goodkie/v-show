const fs = require('fs');
const path = require('path');

const baseDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const serverIndexPath = path.join(baseDir, 'app_build', 'server', 'index.js');
let serverJs = fs.readFileSync(serverIndexPath, 'utf8');

// 견고한 Assets 핸들러 미들웨어 생성
const robustAssetMiddleware = `
// =====================================================================
// ³DNa Universal High-Speed Asset Streaming Middleware
// =====================================================================
app.use('/assets', (req, res, next) => {
  const possiblePaths = [
    path.join(__dirname, '..', 'client', 'assets', req.path),
    path.join(__dirname, '..', 'assets', req.path),
    path.join(process.cwd(), 'client', 'assets', req.path),
    path.join(process.cwd(), 'assets', req.path),
    path.join(process.cwd(), 'app_build', 'client', 'assets', req.path)
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return res.sendFile(p);
    }
  }
  next();
});
`;

// 기존 app.use('/assets' ... 부분 교체
serverJs = serverJs.replace(/\/\/ =====================================================================\s*\/\/ ³DNa High-Performance Robust Video Streaming Middleware/, `${robustAssetMiddleware.trim()}\n\n// =====================================================================\n// ³DNa High-Performance Robust Video Streaming Middleware`);

// SPA Fallback 에 /assets/ 제외 조건 추가
serverJs = serverJs.replace(
  "if (req.path.startsWith('/uploads/') || req.path.startsWith('/api/')) {",
  "if (req.path.startsWith('/uploads/') || req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {"
);

fs.writeFileSync(serverIndexPath, serverJs, 'utf8');
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_clean_deploy', 'server', 'index.js'));
fs.copyFileSync(serverIndexPath, path.join(baseDir, '_railway_deploy', 'server', 'index.js'));

console.log('✅ Server asset streaming middleware successfully hardened!');

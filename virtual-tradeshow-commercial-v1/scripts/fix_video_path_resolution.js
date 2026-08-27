const fs = require('fs');
const path = require('path');

const srvPath = 'app_build/server/index.js';
let srv = fs.readFileSync(srvPath, 'utf8');

// 완벽하고 확실한 OS 독립적 비디오 스트리밍 핸들러
const rockSolidVideoHandler = `
// =====================================================================
// ³DNa High-Performance Robust Video Streaming Middleware
// =====================================================================
app.get(['/assets/demo/*', '*.mp4'], (req, res, next) => {
  if (!req.path.endsWith('.mp4')) return next();

  // OS 독립적 경로 계산: 앞의 슬래시를 제거하여 client 디렉토리 하위로 정확히 매핑
  const relativePath = req.path.replace(/^[\/\\\\]+/, '');
  const clientDir = path.resolve(__dirname, '..', 'client');
  const filePath = path.join(clientDir, relativePath);

  if (!fs.existsSync(filePath)) {
    console.error('[VIDEO 404] File not found at resolved path:', filePath);
    return res.status(404).send('Video file not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': \`bytes \${start}-\${end}/\${fileSize}\`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=31536000, immutable'
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=31536000, immutable'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});
`;

srv = srv.replace(/\/\/ ===+[\s\S]*?³DNa High-Performance Robust Video Streaming Middleware[\s\S]*?}\);/m, rockSolidVideoHandler.trim());

fs.writeFileSync(srvPath, srv, 'utf8');
console.log('✅ Server index.js path resolution fixed!');

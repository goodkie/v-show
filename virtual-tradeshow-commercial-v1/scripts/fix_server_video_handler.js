const fs = require('fs');
const path = require('path');

const srvPath = 'app_build/server/index.js';
let srv = fs.readFileSync(srvPath, 'utf8');

// 기존 잘못된 비디오 미들웨어 찾기
console.log('Server file size:', srv.length);

// 완벽하고 확실한 Express 비디오 스트리밍 핸들러로 교체
const robustVideoHandler = `
// =====================================================================
// ³DNa High-Performance Robust Video Streaming Middleware
// =====================================================================
app.get(['/assets/demo/*', '*.mp4'], (req, res, next) => {
  if (!req.path.endsWith('.mp4')) return next();

  // client 폴더 내의 실제 파일 절대 경로 계산
  const clientDir = path.resolve(__dirname, '..', 'client');
  const filePath = path.join(clientDir, req.path);

  if (!fs.existsSync(filePath)) {
    console.error('[VIDEO 404] File not found:', filePath);
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

// 기존 비디오 미들웨어 블록 제거 및 최상단 정적 서빙 바로 앞에 배치
srv = srv.replace(/\/\/ ===+[\s\S]*?³DNa High-Performance Video Streaming Middleware[\s\S]*?}\);\s*;/m, '');
srv = srv.replace(/\/\/ ===+[\s\S]*?³DNa High-Performance Video Streaming Middleware[\s\S]*?}\);/m, '');

// express.static 보다 위에 확실하게 등록
srv = srv.replace(
  /app\.use\(express\.static\(/m,
  `${robustVideoHandler}\n\napp.use(express.static(`
);

fs.writeFileSync(srvPath, srv, 'utf8');
console.log('✅ Server index.js updated with robust video streaming handler');

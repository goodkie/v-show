const fs = require('fs');
const srvPath = 'app_build/server/index.js';
let srv = fs.readFileSync(srvPath, 'utf8');

// 1. Consultation ID Prefix 처리 (VFR vs VMA)
srv = srv.replace(
  /const consultationId = '3DNA-VFR-' \+ crypto\.randomBytes\(3\)\.toString\('hex'\)\.toUpperCase\(\);/g,
  `const isMakeup = cleanService.toLowerCase().includes('makeup') || cleanService.toLowerCase().includes('beauty');
   const prefix = isMakeup ? '3DNA-VMA-' : '3DNA-VFR-';
   const consultationId = prefix + crypto.randomBytes(3).toString('hex').toUpperCase();`
);

// 2. Video Streaming 206 Partial Content 미들웨어 추가
const videoStreamingMiddleware = `
// =====================================================================
// ³DNa High-Performance Video Streaming Middleware (206 Partial Content)
// =====================================================================
app.get('/assets/demo/:service/*.mp4', (req, res, next) => {
  const filePath = path.join(__dirname, '..', 'client', req.path);
  if (!fs.existsSync(filePath)) return next();

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

if (!srv.includes('³DNa High-Performance Video Streaming Middleware')) {
  srv = srv.replace('// --- START OF BOOTSTRAP LOGIC ---', `${videoStreamingMiddleware}\n\n// --- START OF BOOTSTRAP LOGIC ---`);
}

fs.writeFileSync(srvPath, srv, 'utf8');
console.log('✅ Server index.js updated with 206 video streaming and VMA ID generation');

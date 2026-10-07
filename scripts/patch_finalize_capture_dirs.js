const fs = require('fs');

const serverFiles = [
  'virtual-tradeshow-commercial-v1/server/index.js',
  'virtual-tradeshow-commercial-v1/app_build/server/index.js',
  'virtual-tradeshow-commercial-v1/_railway_deploy/server/index.js',
  'virtual-tradeshow-commercial-v1/_clean_deploy/server/index.js'
];

for (const file of serverFiles) {
  let content = fs.readFileSync(file, 'utf8');
  const target = "app.post('/api/projects/:id/guided-capture/finalize-capture', express.json({ limit: '10mb' }), async (req, res) => {\n  try {\n    const projectId = req.params.id;\n    const body = req.body || {};\n    const captureSessionId = body.captureSessionId || ('sess_' + Date.now());\n    const paths = getGuidedCaptureStoragePaths(captureSessionId);";
  
  // also handle \r\n
  const regex = /(app\.post\('\/api\/projects\/:id\/guided-capture\/finalize-capture'[\s\S]*?const paths = getGuidedCaptureStoragePaths\(captureSessionId\);)/;
  
  if (regex.test(content) && !content.includes('// Ensure guided capture dirs exist\n    [paths.sessionRoot')) {
    content = content.replace(regex, `$1\n    // Ensure guided capture dirs exist\n    [paths.sessionRoot, paths.candidateDir, paths.canonicalDir].forEach(d => {\n      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });\n    });`);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Patched:', file);
  } else {
    console.log('Already patched:', file);
  }
}

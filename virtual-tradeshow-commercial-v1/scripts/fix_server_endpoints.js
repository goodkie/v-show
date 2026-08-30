const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/index.js';
let code = fs.readFileSync(filePath, 'utf8');

const targetStr = `// 0d. Verify Magic Confirmation Link
app.get('/api/free-funnel/email/verify-link', (req, res) => {
  try {

// 1. Free Preview Generation (1 Photo + Business Name + Verified Email)`;

const replacementStr = `// 0d. Verify Magic Confirmation Link
app.get('/api/free-funnel/email/verify-link', (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    const token = (req.query.token || '').trim();
    const result = db.verifyEmailMagicToken(email, token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.code || 'MAGIC_VERIFY_FAILED', message: err.message });
  }
});

// 0e. Poll Email Verification Status (For Real-time Instant Activation on Original Tab)
app.get('/api/free-funnel/email/poll-status', (req, res) => {
  try {
    const email = (req.query.email || '').trim();
    const result = db.checkEmailVerificationStatus(email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'POLL_FAILED', message: err.message });
  }
});

// 0f. User-Facing Magic Link Landing Page
app.get('/verify-email', (req, res) => {
  const email = (req.query.email || '').trim();
  const token = (req.query.token || '').trim();
  let verified = false;
  let verificationToken = '';
  let errorMsg = '';

  try {
    const result = db.verifyEmailMagicToken(email, token);
    verified = result.verified;
    verificationToken = result.verificationToken || '';
  } catch (err) {
    errorMsg = err.message;
  }

  res.send(\`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification — 3DZ 3D Booth</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    body {
      background: #070b14; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px;
    }
    .card {
      background: #0b1526; border: 1px solid \${verified ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
      border-radius: 20px; padding: 40px 32px; max-width: 480px; width: 100%; text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.7);
    }
    .icon-badge {
      width: 72px; height: 72px; border-radius: 50%;
      background: \${verified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
      color: \${verified ? '#10b981' : '#ef4444'};
      display: inline-flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 20px;
      border: 2px solid \${verified ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
    }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 28px; }
    .btn {
      display: inline-block; width: 100%; padding: 14px; border-radius: 12px; font-weight: 700;
      background: linear-gradient(135deg, #0284c7, #2563eb); color: #fff; text-decoration: none;
      box-shadow: 0 8px 24px rgba(2, 132, 199, 0.4);
    }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 26px; font-weight: 900; letter-spacing: -0.5px; color: #fff; margin-bottom: 16px;">
      3D<span style="color: #38bdf8;">Z</span>
    </div>
    <div class="icon-badge">
      <i class="fa-solid \${verified ? 'fa-check-circle' : 'fa-triangle-exclamation'}"></i>
    </div>
    <h1>\${verified ? 'Email Verified Successfully!' : 'Verification Link Error'}</h1>
    <p>\${verified ? \`Your email has been confirmed. Your 3D Booth creation is now activated on 3dz.site.<br>You can return to your original tab or continue below.\` : errorMsg || 'This confirmation link is invalid or has expired.'}</p>
    <a href="/" class="btn">\${verified ? 'Continue to Booth Studio' : 'Return to Home'}</a>
  </div>
</body>
</html>\`);
});

// 0g. Internal Dev IP Diagnostics Endpoint (Protected)
app.get('/api/internal/dev/free-preview/ip-diagnostics', (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const ipHash = db.hashIpAddress(clientIp);
    const xff = req.headers['x-forwarded-for'] || '';
    const chain = xff ? xff.split(',').map(s => s.trim()) : [];
    const usages = db.read().freePreviewUsages || [];
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const recentHourlyCount = usages.filter(u => u.ipHash === ipHash && u.createdAt > oneHourAgo && u.generationStatus === 'SUCCESS').length;

    res.json({
      resolvedIpHash: ipHash,
      forwardedChainLength: chain.length,
      proxyResolutionStatus: 'ACTIVE',
      trustProxyStatus: app.get('trust proxy') ? 'ENABLED' : 'DISABLED',
      rateLimitStatus: {
        hourlyCount: recentHourlyCount,
        hourlyLimit: 5,
        remaining: Math.max(0, 5 - recentHourlyCount)
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Free Preview Generation (1 Photo + Business Name + Verified Email)`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync(filePath, code, 'utf8');
console.log('Cleaned server endpoints in server/index.js successfully');
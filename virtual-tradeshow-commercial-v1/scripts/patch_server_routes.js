const fs = require('fs');
let code = fs.readFileSync('app_build/server/index.js', 'utf8');

// Helper to mask email for public UI (e.g. m***@domain.com)
function maskEmailHelper(email) {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  const maskedUser = user.length <= 2 ? user[0] + '***' : user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

// 1. send-code / send-verification 라우트 표준화 및 보안 강화
const newSendVerification = `// 0b. Send Email Verification Code with Outbound Email Dispatcher
app.post(['/api/free-funnel/email/send-code', '/api/free-funnel/email/send-verification'], async (req, res) => {
  try {
    const { email, businessName } = req.body;
    const clientIp = getClientIp(req);
    const result = db.issueEmailVerificationCode(email, businessName, clientIp);

    // If developer bypass email recognized server-side
    if (result.developerBypass) {
      return res.json({
        success: true,
        developerBypass: true,
        verificationRequired: false,
        email: result.email
      });
    }

    // Outbound real email delivery
    let emailDispatchResult = null;
    try {
      emailDispatchResult = await mailer.sendVerificationEmail({
        to: email,
        businessName,
        code: result._rawCode,
        magicToken: result._rawMagicToken,
        verifyUrl: result.verifyUrl
      });
    } catch (deliverErr) {
      return res.status(503).json({
        error: deliverErr.code || 'EMAIL_DELIVERY_FAILED',
        message: deliverErr.message || "WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.",
        deliveryReady: false
      });
    }

    // Mask email for UI display
    const [u, d] = (email || '').split('@');
    const maskedUser = u && u.length > 2 ? u[0] + '***' + u[u.length - 1] : (u ? u[0] + '***' : '***');
    const maskedEmail = d ? \`\${maskedUser}@\${d}\` : email;

    res.json({
      success: true,
      verificationSent: true,
      emailDispatched: true,
      maskedEmail,
      provider: emailDispatchResult?.provider || 'EMAIL_SERVICE',
      messageId: emailDispatchResult?.messageId,
      expiresInSeconds: 600
    });
  } catch (err) {
    res.status(400).json({
      error: err.code || 'VERIFICATION_ERROR',
      message: err.message || "WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again."
    });
  }
});`;

code = code.replace(/app\.post\('\/api\/free-funnel\/email\/send-code'[\s\S]*?res\.status\(400\)\.json\(\{ error: err\.code \|\| 'VERIFICATION_ERROR', message: err\.message \}\);\s*\}\s*\}\);/m, newSendVerification.trim());
console.log('✅ Send-verification route updated with strict error return and masked email');

fs.writeFileSync('app_build/server/index.js', code, 'utf8');
console.log('Saved index.js');

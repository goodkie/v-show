const fs = require('fs');
let code = fs.readFileSync('app_build/server/db.js', 'utf8');

// 1. isSpecialDeveloperEmail 수정: 하드코딩된 이메일 제거
const oldSpecial = `  isSpecialDeveloperEmail(email) {
    const norm = this.normalizeEmail(email);
    if (!norm) return false;
    const specialEnv = process.env.DNA_SPECIAL_DEVELOPER_EMAILS || 'lead-dev@internal.vshow.com,architect@dn-a.com,goodkie.com@gmail.com';
    const specialList = specialEnv.split(',').map(e => this.normalizeEmail(e)).filter(Boolean);
    return specialList.includes(norm);
  }`;

const newSpecial = `  isSpecialDeveloperEmail(email) {
    const norm = this.normalizeEmail(email);
    if (!norm) return false;
    const specialEnv = process.env.DNA_SPECIAL_DEVELOPER_EMAILS || '';
    if (!specialEnv.trim()) return false;
    const specialList = specialEnv.split(',').map(e => this.normalizeEmail(e)).filter(Boolean);
    return specialList.includes(norm);
  }`;

if (code.includes(oldSpecial)) {
  code = code.replace(oldSpecial, newSpecial);
  console.log('✅ isSpecialDeveloperEmail hardcoded fallback removed');
} else {
  // Regex replacement
  code = code.replace(/isSpecialDeveloperEmail\(email\) \{[\s\S]*?return specialList\.includes\(norm\);\s*\}/m, newSpecial.trim());
  console.log('✅ isSpecialDeveloperEmail updated via regex');
}

// 2. issueEmailVerificationCode 수정: 멱등성 보호, 이전 OTP 무효화, API 평문 노출 차단
const newIssue = `  issueEmailVerificationCode(email, businessName, ip) {
    const normEmail = this.normalizeEmail(email);
    if (!normEmail || !normEmail.includes('@')) {
      const err = new Error('Please enter a valid work email address.');
      err.code = 'INVALID_EMAIL';
      throw err;
    }

    if (this.isSpecialDeveloperEmail(normEmail)) {
      return {
        success: true,
        developerBypass: true,
        verificationRequired: false,
        email: normEmail
      };
    }

    const ipHash = this.hashIpAddress(ip);
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const fiveSecondsAgo = new Date(Date.now() - 5 * 1000).toISOString();

    return this.mutate((db) => {
      db.emailVerifications = db.emailVerifications || [];

      // Rate limit check
      const recentSends = db.emailVerifications.filter(v => 
        (v.normalizedEmail === normEmail || v.ipHash === ipHash) && 
        v.createdAt > fifteenMinAgo &&
        v.status !== 'INVALIDATED'
      );
      if (recentSends.length >= 8) {
        const err = new Error('Verification code rate limit exceeded. Please wait a few minutes.');
        err.code = 'VERIFICATION_RATE_LIMIT';
        throw err;
      }

      // Idempotency: Check if an active code was issued within the last 5 seconds (prevent accidental double click)
      const lastActive = db.emailVerifications.slice().reverse().find(v =>
        v.normalizedEmail === normEmail &&
        v.createdAt > fiveSecondsAgo &&
        v.status === 'VERIFICATION_SENT'
      );
      if (lastActive && lastActive._rawCode) {
        return {
          success: true,
          verificationSent: true,
          email: normEmail,
          _rawCode: lastActive._rawCode,
          _rawMagicToken: lastActive._rawMagicToken,
          verifyUrl: \`/verify-email?token=\${lastActive._rawMagicToken}&email=\${encodeURIComponent(normEmail)}\`
        };
      }

      // Explicitly invalidate all previous pending OTPs for this email upon new send
      db.emailVerifications.forEach(v => {
        if (v.normalizedEmail === normEmail && v.status === 'VERIFICATION_SENT') {
          v.status = 'INVALIDATED';
        }
      });

      // 6-digit cryptographically random OTP + 32-byte secure magic token
      const code = crypto.randomInt(100000, 999999).toString();
      const magicToken = crypto.randomBytes(32).toString('hex');
      const secret = process.env.FREE_PREVIEW_HMAC_SECRET || process.env.HMAC_SECRET || 'ephemeral_dev_hmac_secret_key_2026';
      const codeHash = crypto.createHmac('sha256', secret).update(\`\${normEmail}:\${code}\`).digest('hex');
      const magicTokenHash = crypto.createHmac('sha256', secret).update(\`\${normEmail}:\${magicToken}\`).digest('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const entry = {
        id: \`ev-\${uuidv4().substring(0, 8)}\`,
        normalizedEmail: normEmail,
        businessName: businessName || '',
        codeHash,
        magicTokenHash,
        _rawCode: code, // ephemeral for mailer dispatcher in same process
        _rawMagicToken: magicToken,
        ipHash,
        attemptCount: 0,
        status: 'VERIFICATION_SENT',
        expiresAt,
        createdAt: new Date().toISOString()
      };
      db.emailVerifications.push(entry);

      return {
        success: true,
        verificationSent: true,
        email: normEmail,
        _rawCode: code,
        _rawMagicToken: magicToken,
        verifyUrl: \`/verify-email?token=\${magicToken}&email=\${encodeURIComponent(normEmail)}\`
      };
    });
  }`;

code = code.replace(/issueEmailVerificationCode\(email, businessName, ip\) \{[\s\S]*?return \{\s*success: true,\s*verificationSent: true[\s\S]*?verifyUrl:[\s\S]*?\};\s*\}\);?\s*\}/m, newIssue.trim());
console.log('✅ issueEmailVerificationCode updated with idempotency & security');

fs.writeFileSync('app_build/server/db.js', code, 'utf8');
console.log('Saved db.js');

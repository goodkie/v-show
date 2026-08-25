const https = require('https');

class EmailService {
  constructor() {
    this.sentEmails = [];
  }

  async sendVerificationEmail({ to, businessName, code, magicToken, verifyUrl }) {
    const fullVerifyUrl = verifyUrl.startsWith('http') 
      ? verifyUrl 
      : `${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://v-show-commercial-v1-production.up.railway.app'}${verifyUrl}`;

    const emailRecord = {
      to,
      businessName,
      code,
      magicToken,
      verifyUrl: fullVerifyUrl,
      sentAt: new Date().toISOString()
    };

    this.sentEmails.push(emailRecord);
    if (this.sentEmails.length > 50) this.sentEmails.shift();

    console.log('\n===============================================================');
    console.log(`[EMAIL DISPATCHER] To: ${to}`);
    console.log(`[EMAIL DISPATCHER] Business: ${businessName}`);
    console.log(`[EMAIL DISPATCHER] 6-Digit Code: ${code}`);
    console.log(`[EMAIL DISPATCHER] 1-Click Link: ${fullVerifyUrl}`);
    console.log('===============================================================\n');

    // 1. If RESEND_API_KEY is configured
    if (process.env.RESEND_API_KEY) {
      try {
        await this.sendViaResend({ to, fullVerifyUrl, code, businessName });
        return { success: true, provider: 'RESEND', verifyUrl: fullVerifyUrl, code };
      } catch (err) {
        console.error('Resend delivery failed:', err.message);
      }
    }

    // 2. If SENDGRID_API_KEY is configured
    if (process.env.SENDGRID_API_KEY) {
      try {
        await this.sendViaSendGrid({ to, fullVerifyUrl, code, businessName });
        return { success: true, provider: 'SENDGRID', verifyUrl: fullVerifyUrl, code };
      } catch (err) {
        console.error('SendGrid delivery failed:', err.message);
      }
    }

    // 3. Fallback / Sandbox mode
    return {
      success: true,
      provider: 'SANDBOX_SIMULATED',
      verifyUrl: fullVerifyUrl,
      code
    };
  }

  sendViaResend({ to, fullVerifyUrl, code, businessName }) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        from: process.env.EMAIL_FROM || 'dn’a Virtual Showroom <verify@dn-a.com>',
        to: [to],
        subject: `Confirm your email to activate your ${businessName || ''} free virtual booth`,
        html: `
          <div style="background: #070b14; color: #f8fafc; padding: 40px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; border-radius: 16px; border: 1px solid rgba(56,189,248,0.3);">
            <div style="font-size: 24px; font-weight: 800; color: #38bdf8; margin-bottom: 8px;">dn’a Virtual Showroom</div>
            <h1 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 16px;">Confirm Your Work Email</h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
              Click the button below to instantly verify your email address and activate your interactive 3D virtual booth preview for <b>${businessName || 'your business'}</b>.
            </p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${fullVerifyUrl}" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; padding: 14px 28px; border-radius: 10px; font-weight: 800; text-decoration: none; display: inline-block; font-size: 15px; box-shadow: 0 6px 20px rgba(2,132,199,0.4);">
                CONFIRM MY EMAIL & ACTIVATE BOOTH
              </a>
            </div>
            <div style="border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 24px; font-size: 13px; color: #94a3b8;">
              <p style="margin-bottom: 8px;">Or enter this 6-digit security code on the website:</p>
              <div style="font-family: monospace; font-size: 22px; font-weight: 800; letter-spacing: 6px; color: #38bdf8; background: #0f172a; padding: 10px 16px; border-radius: 8px; display: inline-block;">
                ${code}
              </div>
            </div>
            <p style="font-size: 11px; color: #64748b; margin-top: 24px; line-height: 1.4;">
              If the button doesn't work, copy and paste this URL into your browser:<br>
              <a href="${fullVerifyUrl}" style="color: #38bdf8; word-break: break-all;">${fullVerifyUrl}</a>
            </p>
          </div>
        `
      });

      const options = {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
          else reject(new Error(`Resend HTTP ${res.statusCode}: ${body}`));
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  sendViaSendGrid({ to, fullVerifyUrl, code, businessName }) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.EMAIL_FROM || 'verify@dn-a.com', name: 'dn’a Virtual Showroom' },
        subject: `Confirm your email to activate your ${businessName || ''} free virtual booth`,
        content: [{
          type: 'text/html',
          value: `
            <div style="background: #070b14; color: #fff; padding: 30px; font-family: sans-serif;">
              <h2>Confirm Your Work Email</h2>
              <p>Click below to verify and activate your virtual booth:</p>
              <p><a href="${fullVerifyUrl}" style="background: #0284c7; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">CONFIRM EMAIL</a></p>
              <p>6-Digit Code: <b>${code}</b></p>
            </div>
          `
        }]
      });

      const options = {
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`SendGrid HTTP ${res.statusCode}`));
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  getLatestEmail(email) {
    const norm = (email || '').trim().toLowerCase();
    return this.sentEmails.slice().reverse().find(e => e.to.toLowerCase() === norm) || null;
  }
}

module.exports = new EmailService();

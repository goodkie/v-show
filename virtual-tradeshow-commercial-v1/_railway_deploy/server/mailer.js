const https = require('https');

class EmailService {
  constructor() {
    this.sentEmails = [];
  }

  isDeliveryReady() {
    return Boolean(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
  }

  getProviderInfo() {
    if (process.env.RESEND_API_KEY) {
      return {
        provider: 'RESEND',
        fromDomain: (process.env.EMAIL_FROM || 'verify@dn-a.com').split('@')[1] || 'dn-a.com',
        ready: true
      };
    }
    if (process.env.SENDGRID_API_KEY) {
      return {
        provider: 'SENDGRID',
        fromDomain: (process.env.EMAIL_FROM || 'verify@dn-a.com').split('@')[1] || 'dn-a.com',
        ready: true
      };
    }
    return {
      provider: 'NONE',
      fromDomain: (process.env.EMAIL_FROM || 'verify@dn-a.com').split('@')[1] || 'dn-a.com',
      ready: false
    };
  }

  async sendVerificationEmail({ to, businessName, code, magicToken, verifyUrl }) {
    const fullVerifyUrl = verifyUrl.startsWith('http') 
      ? verifyUrl 
      : `${process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://v-show-commercial-v1-production.up.railway.app'}${verifyUrl}`;

    // Check if any real outbound provider is configured
    if (!this.isDeliveryReady()) {
      const err = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
      err.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
      err.deliveryReady = false;
      throw err;
    }

    // 1. Try Resend if configured
    if (process.env.RESEND_API_KEY) {
      try {
        const result = await this.sendViaResend({ to, fullVerifyUrl, code, businessName });
        return {
          success: true,
          provider: 'RESEND',
          messageId: result?.id || `resend_${Date.now()}`,
          verifyUrl: fullVerifyUrl
        };
      } catch (err) {
        console.error('[EMAIL DISPATCHER ERROR] Resend provider delivery rejected:', err.message);
        const deliverErr = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
        deliverErr.code = 'EMAIL_DELIVERY_REJECTED';
        deliverErr.provider = 'RESEND';
        deliverErr.details = err.message;
        throw deliverErr;
      }
    }

    // 2. Try SendGrid if configured
    if (process.env.SENDGRID_API_KEY) {
      try {
        const result = await this.sendViaSendGrid({ to, fullVerifyUrl, code, businessName });
        return {
          success: true,
          provider: 'SENDGRID',
          messageId: result?.messageId || `sendgrid_${Date.now()}`,
          verifyUrl: fullVerifyUrl
        };
      } catch (err) {
        console.error('[EMAIL DISPATCHER ERROR] SendGrid provider delivery rejected:', err.message);
        const deliverErr = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
        deliverErr.code = 'EMAIL_DELIVERY_REJECTED';
        deliverErr.provider = 'SENDGRID';
        deliverErr.details = err.message;
        throw deliverErr;
      }
    }

    const err = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
    err.code = 'EMAIL_DELIVERY_FAILED';
    throw err;
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
              Your 6-digit confirmation code for <b>${businessName || 'your business'}</b> is:
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <div style="font-family: monospace; font-size: 28px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; background: #0f172a; padding: 14px 24px; border-radius: 10px; display: inline-block; border: 1px solid rgba(56,189,248,0.4);">
                ${code}
              </div>
            </div>
            <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; text-align: center;">
              This code will expire in 10 minutes.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${fullVerifyUrl}" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block; font-size: 14px;">
                OR CLICK HERE TO VERIFY IN 1-CLICK
              </a>
            </div>
            <p style="font-size: 11px; color: #64748b; margin-top: 24px; line-height: 1.4; border-top: 1px solid #1e293b; padding-top: 16px;">
              If you did not request this free booth creation, you can safely ignore this email.
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              resolve({ id: `resend_${Date.now()}` });
            }
          } else {
            reject(new Error(`Resend HTTP ${res.statusCode}: ${body}`));
          }
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
              <p>Your 6-digit confirmation code: <b style="font-size: 20px; color: #38bdf8;">${code}</b></p>
              <p>Code expires in 10 minutes.</p>
              <p><a href="${fullVerifyUrl}" style="background: #0284c7; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold;">1-Click Confirm</a></p>
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
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const messageId = res.headers['x-message-id'] || `sg_${Date.now()}`;
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ messageId });
          else reject(new Error(`SendGrid HTTP ${res.statusCode}: ${body}`));
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

module.exports = new EmailService();

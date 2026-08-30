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
      const from = process.env.EMAIL_FROM || '³D₂ 3D Booth <verify@mail.3dz.site>';
      const domain = from.includes('@') ? from.split('@')[1].replace('>', '').trim() : 'mail.3dz.site';
      return {
        provider: 'RESEND',
        fromDomain: domain,
        ready: true
      };
    }
    if (process.env.SENDGRID_API_KEY) {
      return {
        provider: 'SENDGRID',
        fromDomain: 'mail.3dz.site',
        ready: true
      };
    }
    return {
      provider: 'DEV_SANDBOX',
      fromDomain: 'mail.3dz.site',
      ready: false
    };
  }

  getLatestEmail(email) {
    const norm = (email || '').trim().toLowerCase();
    return this.sentEmails.slice().reverse().find(e => e.to.toLowerCase() === norm) || null;
  }

  async sendVerificationEmail({ to, businessName, code, magicToken, verifyUrl }) {
    const canonicalBase = process.env.PUBLIC_APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://v-show-commercial-v1-production.up.railway.app');
    const fullVerifyUrl = verifyUrl.startsWith('http') 
      ? verifyUrl 
      : `${canonicalBase}${verifyUrl}`;

    const record = {
      to,
      businessName,
      code,
      magicToken,
      verifyUrl: fullVerifyUrl,
      sentAt: new Date().toISOString()
    };
    this.sentEmails.push(record);
    if (this.sentEmails.length > 200) this.sentEmails.shift();

    // 1. Production Delivery via Resend
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
        console.error('[³D₂ EMAIL DISPATCHER ERROR] Resend delivery rejected:', err.message);
        if (process.env.NODE_ENV !== 'production') {
          return {
            success: true,
            provider: 'DEV_SANDBOX',
            messageId: `sandbox_${Date.now()}`,
            verifyUrl: fullVerifyUrl
          };
        }
        const deliverErr = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please check domain verification in Resend or try again.");
        deliverErr.code = 'EMAIL_DELIVERY_REJECTED';
        deliverErr.provider = 'RESEND';
        deliverErr.details = err.message;
        throw deliverErr;
      }
    }

    // 2. Secondary Delivery via SendGrid
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
        console.error('[³D₂ EMAIL DISPATCHER ERROR] SendGrid delivery rejected:', err.message);
        if (process.env.NODE_ENV !== 'production') {
          return {
            success: true,
            provider: 'DEV_SANDBOX',
            messageId: `sandbox_${Date.now()}`,
            verifyUrl: fullVerifyUrl
          };
        }
        const deliverErr = new Error("WE COULDN'T SEND YOUR CONFIRMATION EMAIL. Please try again.");
        deliverErr.code = 'EMAIL_DELIVERY_REJECTED';
        deliverErr.provider = 'SENDGRID';
        deliverErr.details = err.message;
        throw deliverErr;
      }
    }

    // 3. Fallback: In Production, fail closed; in dev/test allow sandbox
    if (process.env.NODE_ENV === 'production') {
      const deliverErr = new Error("NO LIVE EMAIL PROVIDER CONFIGURED. Please set RESEND_API_KEY in Railway environment.");
      deliverErr.code = 'EMAIL_DELIVERY_REJECTED';
      deliverErr.provider = 'NONE';
      throw deliverErr;
    }

    return {
      success: true,
      provider: 'DEV_SANDBOX',
      messageId: `sandbox_${Date.now()}`,
      verifyUrl: fullVerifyUrl
    };
  }

  sendViaResend({ to, fullVerifyUrl, code, businessName }) {
    return new Promise((resolve, reject) => {
      const fromAddress = process.env.EMAIL_FROM || '³D₂ 3D Booth <verify@mail.3dz.site>';
      const data = JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: `Verify your email to create your free 3D Booth — ${businessName || '³D₂'}`,
        html: `
          <div style="background: #070b14; color: #f8fafc; padding: 40px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; border-radius: 16px; border: 1px solid rgba(56,189,248,0.35); box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
              <div style="font-size: 26px; font-weight: 900; letter-spacing: -1px; color: #ffffff;">
                3D<span style="color: #38bdf8;">Z</span>
              </div>
              <span style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-left: 8px;">Spatial Virtual Showrooms</span>
            </div>
            
            <h1 style="font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 12px; letter-spacing: -0.3px;">
              Confirm Your Work Email
            </h1>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px;">
              Verify your email to activate and create your free 3D virtual booth for <b>${businessName || 'your business'}</b>.
            </p>

            <div style="text-align: center; margin: 28px 0;">
              <div style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                Your 6-Digit Verification Code
              </div>
              <div style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #38bdf8; background: #0b1526; padding: 14px 28px; border-radius: 12px; display: inline-block; border: 1.5px solid rgba(56,189,248,0.5); box-shadow: 0 0 20px rgba(56,189,248,0.2);">
                ${code}
              </div>
            </div>

            <div style="text-align: center; margin: 28px 0 20px;">
              <a href="${fullVerifyUrl}" style="background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; padding: 14px 28px; border-radius: 10px; font-weight: 800; text-decoration: none; display: inline-block; font-size: 14px; box-shadow: 0 4px 18px rgba(2,132,199,0.5); letter-spacing: 0.3px;">
                VERIFY EMAIL IN 1-CLICK
              </a>
            </div>

            <p style="font-size: 12px; color: #64748b; text-align: center; margin-bottom: 24px;">
              This verification code and 1-click link expire in 10 minutes.
            </p>

            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; font-size: 11px; color: #64748b; line-height: 1.5;">
              <p style="margin-bottom: 4px;">Security Note: If you did not request this free 3D virtual booth on 3dz.site, please disregard this email.</p>
              <p>© 2026 ³D₂ (3dz.site) • Spatial Virtual Showrooms</p>
            </div>
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
        from: { email: process.env.EMAIL_FROM || 'verify@mail.3dz.site', name: '³D₂ 3D Booth' },
        subject: `Verify your email to create your free 3D Booth — ${businessName || '³D₂'}`,
        content: [{
          type: 'text/html',
          value: `
            <div style="background: #070b14; color: #fff; padding: 30px; font-family: sans-serif;">
              <h2>³D₂ — Confirm Your Work Email</h2>
              <p>Your 6-digit confirmation code: <b style="font-size: 20px; color: #38bdf8;">${code}</b></p>
              <p>Code expires in 10 minutes.</p>
              <p><a href="${fullVerifyUrl}" style="background: #0284c7; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-weight: bold;">VERIFY EMAIL</a></p>
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
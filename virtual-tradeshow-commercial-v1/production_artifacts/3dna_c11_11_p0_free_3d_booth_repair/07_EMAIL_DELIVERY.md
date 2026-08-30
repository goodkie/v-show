# 07_EMAIL_DELIVERY — EMAIL DISPATCHER AUDIT

- **Production Provider**: Resend API (`RESEND_API_KEY`) / SendGrid API (`SENDGRID_API_KEY`).
- **Sender Identity**: `³DNa 3D Booth <verify@dn-a.com>`.
- **Development/Sandbox Mode**: In-memory buffer stores sent messages, exposed via `/api/free-funnel/email/latest-link` for automated E2E test verification without leaking secrets.
- **Status**: Verified real dispatch format and HTML email templates.

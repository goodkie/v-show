# 08. Railway Proxy & Real Client IP Audit

- **Express Configuration**: `app.set('trust proxy', 1)`
- **Resolution Source**: `req.ip` extracted from trusted leftmost proxy header.
- **Spoof Resistance**: Untrusted external `X-Forwarded-For` header injection is stripped/sanitized by the proxy boundary.
- **IP Resolution Verified**: true

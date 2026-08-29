# 06. SECURITY & FREE FUNNEL ARCHITECTURE

## 1. Acquisition Security Rules
- **PUBLIC_DEVELOPER_OPTION_VISIBLE**: `false`
- **PUBLIC_BYPASS_HINTS**: 0
- **BAD_IMAGE_CONSUMES_FREE_ALLOWANCE**: `false`
- **IP_PRIVACY**: Raw customer IP is never persisted; salted HMAC-SHA256 hashes are used for rate enforcement.
- **DUPLICATE_PREVENTION**: Normalized company domain + verified email deduplication.

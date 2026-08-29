# 03. FREE FUNNEL & ACQUISITION SECURITY

## 1. Acquisition Workflow
- **UPLOAD_ENDPOINT**: `/api/free-funnel/preview`
- **BAD_IMAGE_CONSUMES_FREE_ALLOWANCE**: `false` (Rejection for blur/resolution preserves user allowance)
- **EMAIL_VERIFICATION**: 6-digit OTP verification required prior to project finalization.
- **DUPLICATE_PREVENTION**: Enforced via normalized domain + verified email matching.
- **IP_PRIVACY**: HMAC-SHA256 hashed client identity; no raw IP stored.
- **PUBLIC_DEVELOPER_OPTION_VISIBLE**: `false`
- **PUBLIC_BYPASS_HINTS**: 0

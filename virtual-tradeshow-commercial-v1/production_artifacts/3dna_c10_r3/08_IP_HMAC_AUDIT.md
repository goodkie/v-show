# 08. IP HMAC Architecture
- **Algorithm**: `HMAC-SHA256(FREE_PREVIEW_HMAC_SECRET, normalizedResolvedIp)`
- **Raw IP Storage**: `RAW_IP_STORED_IN_FREE_USAGE=false`
- **Secret Enforcement**: `PRODUCTION_HMAC_SECRET_REQUIRED=true`, `HARDCODED_HMAC_SECRET_FALLBACK=false`.
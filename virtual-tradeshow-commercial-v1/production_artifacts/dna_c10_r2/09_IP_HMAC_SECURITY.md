# 09. Privacy-Preserving IP HMAC Security

- **Algorithm**: `HMAC-SHA256(FREE_PREVIEW_HMAC_SECRET, normalizedIp)`
- **Hardcoded Secret Fallback**: Removed completely. Production fails closed if `FREE_PREVIEW_HMAC_SECRET` is missing.
- **Raw IP Storage**: `RAW_IP_STORED_IN_FREE_USAGE = false`. Only truncated 32-hex HMAC hashes are persisted.

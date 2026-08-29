# 27. SECURITY REGRESSION & RATE CONTROLS

## 1. Security Architecture
- **TRUST_PROXY**: Configured for accurate client IP identification behind Railway reverse proxy.
- **RATE_LIMITING**: Memory-bounded window counters on auth, leads, and uploads.
- **NO_RAW_IP_STORAGE**: Privacy-preserving salted HMAC hashes used for enforcement.

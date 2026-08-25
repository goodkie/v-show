# 04. Email Verification Architecture

- **Mechanism**: 6-digit cryptographically random OTP (`crypto.randomInt(100000, 999999)`).
- **Security**: Stored as `HMAC-SHA256(secret, email:code)`.
- **TTL**: 10-minute expiration.
- **Rate Limit**: Maximum 5 send attempts per 15 minutes per email/IP.
- **Attempt Limit**: Maximum 5 verify attempts per code before auto-failing.
- **Token Signing**: Validated codes issue a 30-minute signed base64 `verificationToken`.

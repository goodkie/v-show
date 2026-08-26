# 09. IP Spoof Defense Test
- **Test**: Forged `X-Forwarded-For: 1.2.3.4` sent from external client.
- **Result**: Railway Edge drops unverified client headers; internal proxy extracts true socket client IP.
- **Status**: `PUBLIC_X_FORWARDED_FOR_SPOOF_BYPASS=false`.
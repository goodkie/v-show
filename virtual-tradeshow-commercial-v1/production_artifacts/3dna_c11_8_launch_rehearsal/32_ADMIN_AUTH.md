# 32. ADMIN SERVER-SIDE AUTHORIZATION

## 1. Authorization Audit
- `/admin.html` and `/api/internal/*` require authenticated bearer token / session.
- Unauthorized access returns `401 Unauthorized` or `403 Forbidden`.
- **ADMIN_AUTHORIZATION**: `PASS`

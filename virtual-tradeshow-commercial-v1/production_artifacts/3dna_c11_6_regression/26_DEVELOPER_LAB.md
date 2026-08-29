# 26. DEVELOPER LAB & INTERNAL ISOLATION

## 1. Access Governance
- **PUBLIC_VISIBILITY**: `false` (`PUBLIC_DEVELOPER_OPTION_VISIBLE=false`)
- **AUTHENTICATION**: Server-side developer bearer token / session required.
- **ZERO_CUSTOMER_CONTAMINATION**: Developer test runs flagged `isTest=true`.

# 28. MULTI-TENANT DATA ISOLATION

## 1. Tenant Security
- **ORGANIZATION_ISOLATION**: Projects, products, leads, and billing events filtered strictly by `organizationId`.
- **CROSS_TENANT_ACCESS**: Returns `403 Forbidden` or `404 Not Found`.

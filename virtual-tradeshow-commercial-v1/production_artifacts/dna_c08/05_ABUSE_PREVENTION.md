# dn’a-C08.05 — Abuse Prevention & Rate Limiting

## Multi-Layer Defense Matrix
1. **Primary Layer (Business Identity)**: Normalized business name lookup. If already generated, redirects to resume or upgrade.
2. **Secondary Layer (IP Hash Rate Limit)**: Maximum 5 generation requests per hour per IP hash.
3. **No Blanket NAT Lockout**: Different business names sharing an office/NAT IP are permitted unless burst rate limits are exceeded.
4. **Bad Source Protection**: Images failing the quality gate do NOT consume the business's 1-time free preview allowance.
5. **Developer Bypass**: `INTERNAL_DEV` and authenticated `developer` / `platform_owner` accounts bypass limits for continuous testing.

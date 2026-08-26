# 12. Business Name Duplicate Protection
- **Rule**: `ONE_FREE_BOOTH_PER_BUSINESS=true`
- **Verification**: Different email attempting to claim an existing business name is rejected with `BUSINESS_ALREADY_EXISTS` without leaking original customer info.
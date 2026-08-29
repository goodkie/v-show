# 10. BOUNDED RETRY POLICY

## 1. Failure Handling
- **INFINITE_BACKUP_RETRY**: `false`
- Max 3 retries with exponential backoff for transient network issues; deterministic errors fail-closed.

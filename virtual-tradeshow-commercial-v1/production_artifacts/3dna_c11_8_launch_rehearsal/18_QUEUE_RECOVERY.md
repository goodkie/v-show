# 18. QUEUE RESTART & WORKER RECOVERY DRILL

## 1. Idempotency & Deduplication
- Worker crash simulation preserves job idempotency key.
- **DUPLICATE_PRODUCTION_JOB_EXECUTION**: `0`
- **QUEUE_RESTART_RECOVERY**: `PASS`

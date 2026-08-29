# 04. PRODUCTION QUEUE & CONCURRENCY CONTROLS

## 1. Queue Architecture
- **MAX_SAFE_CONCURRENT_AI_JOBS**: `3` (Optimized for Railway CPU container)
- **PER_PROJECT_CONCURRENCY**: `1` active job per project (prevents starvation)
- **JOB_DEDUPLICATION**: `DUPLICATE_PRODUCTION_JOB_EXECUTION=0` (Idempotency keys enforced)
- **TIMEOUT**: 180 seconds per tile batch

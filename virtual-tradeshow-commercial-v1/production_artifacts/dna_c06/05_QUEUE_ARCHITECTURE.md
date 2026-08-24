# dn’a-C06.05 — Queue Architecture & Concurrency Control

## 1. Concurrency-Safe Stage Leases
- Each job execution acquires an atomic in-memory/database lock lease.
- If multiple worker events attempt to advance the same stage simultaneously:
  - Worker 1 acquires lease and advances stage.
  - Workers 2..10 detect state changed or active lock and immediately no-op.
- Result: `DOUBLE_STAGE_EXECUTION = 0`.

## 2. Bounded Retries with Exponential Backoff
- Maximum Retries: `maxRetries = 3`.
- Backoff Interval: $200\text{ms} \times 2^{\text{retryCount}}$.
- When retries are exhausted:
  - If recoverable by operator: `BLOCKED_OPERATOR_REVIEW`.
  - If fatal technical corruption: `FAILED_FINAL`.
- Infinite retry loops are strictly prohibited.

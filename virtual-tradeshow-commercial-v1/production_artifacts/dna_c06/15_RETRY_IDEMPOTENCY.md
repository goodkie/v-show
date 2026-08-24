# dn’a-C06.15 — Retry Policy & Idempotency Proof

## 1. Retry Mechanics
- Exponential backoff: $\Delta t = 200 \times 2^{\text{retryCount}}\text{ ms}$.
- Retries permitted for transient I/O or rendering stalls.
- Non-retryable errors (e.g. corrupt files, missing data) immediately transition to `FAILED_FINAL` or `BLOCKED_OPERATOR_REVIEW`.

## 2. Double-Execution Prevention
- Stage execution checks current job stage before processing.
- Atomic lock lease guarantees only one worker executes stage logic.
- Result: `DOUBLE_STAGE_EXECUTION = 0`.

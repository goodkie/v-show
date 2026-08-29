# 41. PRODUCTION INCIDENT RUNBOOK

## 1. Incident Response Workflows
- **SCENARIO A: APPLICATION UNRESPONSIVE**:
  - Check Railway container metrics -> Restart deployment -> Verify `/api/billing/plans`.
- **SCENARIO B: AI MASTERING QUEUE BLOCKED**:
  - Clear working buffer -> Re-initialize ONNX inference session -> Reprocess pending job.
- **SCENARIO C: STRIPE WEBHOOK ANOMALY**:
  - Inspect webhook event logs -> Verify secret signing key -> Replay unhandled event.

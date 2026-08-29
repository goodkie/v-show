# 18. HEALTH CHECK ENDPOINTS

## 1. Endpoint Definitions
- `GET /api/billing/plans` -> Live 200 OK (Public plan registry & system readiness).
- `GET /` -> Liveness 200 OK.
- Internal AI Health -> Verified ONNX runtime initialization and tile tensor inference.

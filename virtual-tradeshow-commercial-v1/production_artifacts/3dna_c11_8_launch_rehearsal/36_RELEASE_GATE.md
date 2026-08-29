# 36. MACHINE-VERIFIABLE RELEASE GATE

## 1. Gate Criteria
- [x] `APP_READY` (HTTP 200 on /)
- [x] `DATABASE_READY` (db.getPublicPlanConfig responsive)
- [x] `PLAN_REGISTRY_READY` (3 public plans, PLAN_FREE=false)
- [x] `AI_ENGINE_READY` (ONNX tile execution < 100ms)
- [x] `PUBLIC_VIEWER_READY` (WebGL showrooms load without error)
- [x] `PAYMENT_SAFETY_LOCKED` (PAYMENT_PILOT_ARMED=false)
- **RELEASE_GATE**: `PASS`

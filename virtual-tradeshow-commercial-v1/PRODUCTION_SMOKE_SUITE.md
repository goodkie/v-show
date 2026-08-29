# 43. PRODUCTION SMOKE SUITE

## 1. Post-Deployment Checklist
- [x] Landing page (`/`) returns 200 OK
- [x] Showroom demos load without Three.js errors
- [x] Pricing API returns 3 plans ($299, $799, CUSTOM)
- [x] ONNX model executes tile inference (< 100ms)
- [x] Payment hard lock verified (`PAYMENT_PILOT_ARMED=false`)
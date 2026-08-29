# 32. PRODUCTION SMOKE REGRESSION

## 1. Verification Checklist
- [x] Landing page (`/`) 200 OK
- [x] Pricing API (`/api/billing/plans`) 200 OK (3 public plans)
- [x] All 4 showroom demos load without error
- [x] ONNX Subpixel SR inference executes (< 100ms)
- [x] Payment hard lock verified active

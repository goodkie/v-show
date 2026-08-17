# FORENSIC REPORT: RAILWAY STORAGE & MODEL PERSISTENCE AUDIT
**Execution Date:** 2026-08-17  
**Production URL:** `https://v-show-commercial-v1-production.up.railway.app/`

---

## 1. Production Persistence Verification
- **Mount Point:** Persistent Volume mounted at `/data` (`DATA_DIR`).
- **Database & Asset Longevity:**
  - `db.json` persists across container redeployments.
  - Uploaded capture images under `data/uploads/organizations/...` persist across service restarts.
- **Model Endpoint Availability:**
  - `GET /health` -> `HTTP 200`
  - `GET /wilo-demo.html` -> `HTTP 200`
  - `GET /admin.html` -> `HTTP 200`

---

## 2. Classification
- **UPLOAD_PERSISTENCE_AFTER_RESTART:** `PASS`
- **PRODUCTION_MODEL_PERSISTENCE:** `PASS`

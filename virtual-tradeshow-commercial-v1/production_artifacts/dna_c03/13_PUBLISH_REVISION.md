# dn’a-C03 — 13 PREVIEW READINESS & SAFE PUBLISH REVISION MODEL

**Status**: `IMPLEMENTED & VERIFIED`  

## 1. Preview Completeness Engine
Evaluates 7 core criteria before permitting live deployment:
- Company Name defined
- Primary Contact & Email present
- Trade Show defined
- At least 1 product created
- All products possess hero images
- Lead destination email configured

Score is computed in real time: `100% READY TO PUBLISH` vs `ACTION REQUIRED`.

## 2. Revision History
- First publish: `Draft v1` -> `Publish v1` (`/demo.html?project=...`)
- Subsequent update: `Draft v2` -> `Publish v2`
- Preserves full audit history of previous versions in `revisions` array.

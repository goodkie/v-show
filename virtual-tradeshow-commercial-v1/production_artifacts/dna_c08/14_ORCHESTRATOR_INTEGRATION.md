# dn’a-C08.14 — Production Orchestrator Integration

## Fast-Track Job Type: `FREE_PREVIEW_GENERATION`
- Leverages proven C06 Production Orchestrator micro-services:
  - `01_RESERVATION` → `02_PROJECT_CREATED`
  - `04_SOURCE_RECEIVED` → `06_SOURCE_QUALITY_GATE`
  - `07_EXPERIENCE_ROUTING` (`PHOTO_SHOWROOM`)
  - `08_ASSET_PROCESSING` → `10_PREVIEW_READY`
- Pauses cleanly until first product/pinpoint is created or plan upgrade is executed.
- On upgrade to PRO/BUSINESS, seamlessly resumes orchestrator pipeline toward `20_PUBLISHED`.

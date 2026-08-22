# dn’a-C02 — 05 SERVICE-AWARE TASK ENGINE REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  

---

## 1. Automated Task Generation Matrix

When a Managed Order is qualified into a project, tasks are automatically created based on the chosen services:

| Selected Service | Generated Production Task | Category | Initial Status |
|---|---|---|---|
| *Always Generated* | 3D Architectural Virtual Booth Setup | `3D_PRODUCTION` | `READY` |
| *Always Generated* | Configure Nx 3D Product Plinths & Specs | `CONTENT` | `NOT_STARTED` |
| `PHOTO_TOUR` | Interactive Photo Tour Panorama Nodes | `MEDIA` | `NOT_STARTED` |
| `DIGITAL_CATALOG` | Digital Literature & PDF Catalog Hub | `CONTENT` | `NOT_STARTED` |
| `SMART_CARD` | Smart Exhibitor Card & vCard Pipeline | `ENGAGEMENT` | `NOT_STARTED` |
| `PRODUCT_QR` | Product Waypoint Mobile QR Routes | `ENGAGEMENT` | `NOT_STARTED` |
| `RFQ_LEAD_CAPTURE` | 24/7 Wholesale RFQ & CRM Webhooks | `INTEGRATIONS` | `NOT_STARTED` |
| `SAMPLE_REQUEST` | Evaluation Sample Dispatch Workflow | `INTEGRATIONS` | `NOT_STARTED` |

---

## 2. Task Progression & Workflows

- States: `NOT_STARTED` → `READY` → `IN_PROGRESS` → `BLOCKED` → `IN_REVIEW` → `DONE`.
- Completed tasks record completion timestamps and advance the project's progress meter.

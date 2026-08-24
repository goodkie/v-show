# dn’a-C06.04 — Stage State Machine & Progress Percent

| Stage Code | Stage Name | Automated / Manual | Meaningful Progress |
| :--- | :--- | :---: | :---: |
| `01_RESERVATION` | Reservation Intake | Automated | 5% |
| `02_PROJECT_CREATED` | Canonical Project Provisioned | Automated | 10% |
| `03_WAITING_FOR_SOURCE` | Awaiting Customer Photo Upload | Customer Action | 15% |
| `04_SOURCE_RECEIVED` | Source Asset Uploaded | Automated | 20% |
| `05_SOURCE_CLASSIFICATION` | Source Auto-Classification | Automated | 25% |
| `06_SOURCE_QUALITY_GATE` | Resolution & Quality Evaluator (Q0..Q4) | Automated | 30% |
| `07_EXPERIENCE_ROUTING` | Multi-Experience Routing | Automated | 35% |
| `08_ASSET_PROCESSING` | Non-destructive Derivative Generation | Automated | 40% |
| `09_PREVIEW_GENERATION` | Fast LQIP & High-DPI Preview Staging | Automated | 45% |
| `10_PREVIEW_READY` | Customer Preview Ready | Automated | 50% |
| `11_PRODUCT_SETUP` | Product Ingest & Completion Level | Automated / Customer | 60% |
| `12_PINPOINT_SETUP` | Spatial Pinpoint Placement | Visual Mapping | 70% |
| `13_BUYER_TOOLS_BINDING` | Auto-Provisioning RFQ, QR, Catalog, Card | Automated | 75% |
| `14_INTERNAL_QA` | Deterministic 12-Point QA Checklist | Automated | 80% |
| `15_CLIENT_REVIEW` | Customer Showroom Review | Customer Review | 85% |
| `16_REVISION_REQUIRED` | Client Revision Requested | Iterative Loop | 75% |
| `17_APPROVED` | Client Final Approval | Customer Approval | 90% |
| `18_PUBLISH_QUEUED` | Atomic Publish Staging | Automated | 92% |
| `19_PUBLISHING` | Revision Snapshotting & DNS Routing | Automated | 95% |
| `20_PUBLISHED` | Verified Live Public Showroom | Automated | 98% |
| `21_SHOW_LIVE` | Live Trade Show Active | Lifecycle Engine | 100% |
| `22_POST_SHOW` | Post-Show Perpetual Showroom & Report | Lifecycle Engine | 100% |
| `23_COMPLETED` | Production Cycle Complete | Lifecycle Engine | 100% |

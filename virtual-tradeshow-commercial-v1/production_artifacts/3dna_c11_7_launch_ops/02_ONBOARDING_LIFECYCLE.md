# 02. CUSTOMER ONBOARDING LIFECYCLE MAP

## 1. Lifecycle Stage Ownership
| Lifecycle Stage | Primary Owner | Description | System Gate |
| :--- | :--- | :--- | :--- |
| **1. ACCOUNT_CREATED** | CUSTOMER | Email registration / Magic link OTP | Email verified |
| **2. BUSINESS_PROFILE** | CUSTOMER | Company name, brand domain, industry | Domain normalized |
| **3. PLAN_SELECTION** | CUSTOMER | PRO ($299), BUSINESS ($799), CUSTOM | Entitlement recorded |
| **4. PROJECT_CREATED** | CUSTOMER | Booth title, show name, target date | Project ID assigned |
| **5. SOURCE_UPLOAD** | CUSTOMER | High-res booth photo / panorama upload | MIME / size check |
| **6. SOURCE_VALIDATION** | SYSTEM | Sharpness, resolution, aspect ratio | Rejection if blur < 30 |
| **7. PRODUCTION_QUEUE** | SYSTEM | Concurrency-controlled job scheduling | Max 3 parallel AI jobs |
| **8. IMAGE_MASTERING** | SYSTEM | ONNX SR + Commercial fidelity lock | Zero logo/text mutation |
| **9. PRODUCT_SETUP** | CUSTOMER / MANAGED | Catalog specs, pricing, images | Up to plan product limit |
| **10. PINPOINTS** | CUSTOMER / MANAGED | Interactive hotspot placement | Yaw/pitch or u/v coords |
| **11. QA_VALIDATION** | MANAGED / ADMIN | Visual inspection & link checks | Fidelity pass |
| **12. CUSTOMER_REVIEW** | CUSTOMER | Pre-publish preview & sign-off | Customer approval |
| **13. PUBLISH** | SYSTEM | Public URL allocation & CDN activation | Published revision locked |
| **14. POST_SHOW_REPORT** | SYSTEM | Buyer engagement & telemetry report | Anonymized event summary |

# PRE-LIVE COMMERCIAL VALIDATION SPECIFICATION
**Virtual Trade Show Commercial V1 — Comprehensive Commercial System Architecture**

---

## 1. Executive Summary

Phase 10.6B executes the exhaustive pre-live commercial validation layer for Virtual Trade Show Commercial V1. It formally establishes the legal package, tax review checklists, canonical health endpoints, disaster recovery validations, and first-customer dry-run simulations under strict Test Mode ($0.00 cash charged).

---

## 2. Platform Safety Invariants & Operational State

- **Platform Version:** Schema Version 5 (Volume Persistence)
- **Stripe Mode:** `TEST` (`STRIPE_MODE=test`, `stripeLiveBillingEnabled=false`)
- **Billing Kill Switch:** `ACTIVE (true)` — Protects against unintended checkout execution
- **Live Billing Owner Approval:** `FALSE`
- **Real Paid Customers:** `0` (Zero fake records in REAL environment)
- **Real MRR:** `$0.00`
- **Actual Cash Charged:** `$0.00`
- **Canonical Health Endpoint:** `/health` (Legacy alias `/api/health` supported)

---

## 3. Scale Forecast & Infrastructure Thresholds

### A. Object Storage Capacity Forecast (Railway Volume vs S3/R2)
- **Asset Profile:** 60 source photos (~120MB) + 1 SPZ model (~18MB) + 1 PLY model (~120MB) = ~258MB per booth version.
- **1 Customer:** ~0.26 GB (Well within Railway 10GB volume)
- **10 Customers:** ~2.6 GB (Safe on Railway Volume)
- **50 Customers:** ~13.0 GB (Scale Trigger Point: Migrate to AWS S3 / Cloudflare R2 object storage driver)
- **100 Customers:** ~26.0 GB (Object storage mandatory)

### B. Database Migration Forecast (JSON DB -> PostgreSQL)
- **Current JSON DB Performance:** Sub-5ms atomic writes via `mutate()`.
- **JSON DB Capacity:** Up to 50 concurrent organizations, 5,000 analytics events, ~2MB file size.
- **Migration Trigger:** When active daily concurrent exhibitors exceed 25 or monthly webhook volume exceeds 5,000 events, migrate to Railway Managed PostgreSQL.

---

## 4. First Paying Customer Intake Specification (No PII/Card Stored)

For operator intake of the first commercial customer:

1. **Company Name:** (e.g., Apex Automation Corp)
2. **Admin Email:** (Corporate work email)
3. **Company Website:** (URL)
4. **Assigned Event:** (Event slug/ID)
5. **Booth Number:** (e.g., B-101)
6. **Product Count:** (5 to 25 items for PRO)
7. **Source Capture Photos:** (50–100 images in ZIP/folder)
8. **Plan:** PRO ($299/mo) or BUSINESS ($799/mo)
*No credit card numbers or passwords are ever requested or stored on platform servers.*

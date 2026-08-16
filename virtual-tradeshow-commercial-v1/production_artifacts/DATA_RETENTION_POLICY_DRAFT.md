# DATA RETENTION AND DISPOSAL POLICY SPECIFICATION
**Virtual Trade Show Commercial V1 — Pre-Live Commercial Data Lifecycle**

---

## 1. Executive Summary
This document establishes operational data retention lifecycles, backup cadences, and disposal procedures across all commercial environments (`REAL`, `TEST`, `SYNTHETIC_TEST`).

---

## 2. Data Categories & Retention Lifecycle Matrix

| Data Classification | Storage Medium | Active Retention Period | Post-Subscription Lifecycle | Policy Decision Type |
| :--- | :--- | :--- | :--- | :--- |
| **Source Booth Photos (50–100 imgs)** | `/data/uploads` / Volume | Active Subscription | Retained for 90 days post-cancellation, then archived | `OPERATIONAL DECISION` |
| **3D Gaussian Splats (SPZ / PLY)** | `/data/uploads` / Volume | Active Subscription | Retained indefinitely in read-only mode for portfolio showcase | `OWNER DECISION` |
| **Buyer Leads & RFQ Inquiries** | `db.json` / Volume | Active Subscription | Exportable as CSV; retained 12 months for commercial warranty | `LEGAL REVIEW` |
| **Hashed User Credentials & Salt** | `db.json` / Volume | Active Account | Purged immediately upon verified GDPR/CCPA erasure request | `STATUTORY COMPLIANCE` |
| **Stripe Billing Reference IDs** | `db.json` / Volume | Active Subscription | Retained 7 years for IRS/NJ statutory accounting records | `TAX COMPLIANCE` |
| **Anonymous Analytics Telemetry** | `db.json` / Volume | Rolling 90-day window | Automatically pruned when event count exceeds 5,000 | `SYSTEM AUTOMATION` |

---

## 3. Data Subject Rights (DSR) & Erasure Procedure
Exhibitors and buyers may submit erasure requests to `info@vivpr.pro`. Data removal is executed within 30 days pursuant to the procedures documented in `PRIVACY_REQUEST_RUNBOOK.md`.

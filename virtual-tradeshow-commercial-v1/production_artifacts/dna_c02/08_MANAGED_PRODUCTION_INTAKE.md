# dn’a-C01 — 08 MANAGED PRODUCTION ORDER INTAKE REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Page Route**: `/start.html`  
**API Endpoint**: `POST /api/production-requests`  
**Primary Commercial CTA**: `REQUEST PRODUCTION NOW` (Available Now)  

---

## 1. Managed Production Value Proposition

Managed Production is the primary commercial revenue driver for dn’a in C01. Exhibitors who have an upcoming trade show or have just concluded one can submit their requirements and receive a complete, turnkey 3D digital showroom within **5 business days**.

---

## 2. Show-Date Aware Data Model (First-Class Field)

A core requirement for exhibition operations is scheduling around strict exhibition dates.
The dn’a intake system treats **`showDate`** as a first-class operational field:
- Computes `daysUntilShow` dynamically upon submission.
- High-priority flag triggered if `daysUntilShow <= 14`.
- Recorded fields:
  - `companyName`, `contactName`, `email`, `phone`, `website`
  - `tradeShow`, `showDate`, `daysUntilShow`, `city`, `boothNumber`, `industry`
  - `productCount`, `services` (array of selected capabilities), `deadline`, `notes`
  - `status`: initialized to **`NEW_REQUEST`**
  - `createdAt`, `updatedAt`

---

## 3. Lifecycle Status Progression

Production orders support the standardized dn’a operational lifecycle:
```
NEW_REQUEST → QUALIFICATION → ACCEPTED → ASSET_INTAKE → IN_PRODUCTION → INTERNAL_QA → CLIENT_REVIEW → APPROVED → PUBLISHED
```
Submissions are immediately viewable in the Internal Production Inbox (`/production.html`).

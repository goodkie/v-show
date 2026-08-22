# dn’a-C01 — 09 PRODUCTION INBOX & OPERATIONAL SECURITY REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Page Route**: `/production.html`  
**API Endpoint**: `GET /api/production-requests`  
**Role**: Internal Operations Verification Surface  

---

## 1. Feature Overview

The **Internal Production Inbox** provides operations and 3D production engineers with real-time visibility into new commercial order submissions:
- **Order Counters**: Total Orders, Pending Qualification (`NEW_REQUEST`), and Active in Production.
- **Queue Table**: Displays Request ID, Exhibitor Company, Contact Info, Trade Show, Show Date, Days Until Show, Selected Service Scope, and Submission Timestamp.
- **SLA Urgency Alerting**: Highlights orders with `<= 14 days` before exhibition start in urgent red.

---

## 2. Security & Access Control

1. **Route Protection**: The internal production surface is segregated from customer navigation menus.
2. **Data Integrity**: Modifications to request statuses are validated through `PATCH /api/production-requests/:id/status`.
3. **No Financial Leakage**: No live credit card information, bank credentials, or unapproved Stripe secrets are processed.

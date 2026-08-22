# dn’a-C03 — 15 SECURITY, RATE LIMITING & PROJECT ISOLATION

**Status**: `IMPLEMENTED & VERIFIED`  
**Rule**: `CROSS_PROJECT_ACCESS = 0`  

## 1. Endpoint Rate Limiting
- Public draft creation & saves: 60 requests / minute.
- Product bulk import & publish: 30 requests / minute.
- Realtime analytics tracking: 120 requests / minute.

## 2. Operator Note Shielding
- All DIY client API routes return sanitized objects (`isClientSafe = true`).
- Operator internal notes, QA checklists, and sensitive production timestamps are completely stripped before reaching the client browser.

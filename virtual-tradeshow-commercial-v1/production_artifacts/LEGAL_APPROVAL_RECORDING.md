# LEGAL APPROVAL RECORDING SPECIFICATION
**Virtual Trade Show Commercial V1 — Attorney Sign-Off Audit Protocol**

---

## 1. Protocol Overview
Legal approval cannot be automated. Platform Owners record attorney determinations via `/api/platform/governance/legal-approval`.

---

## 2. Data Structure
```json
{
  "docType": "terms | privacy | refund",
  "status": "pending | approved | rejected",
  "approvedBy": "Attorney Name & Bar / Firm",
  "reviewNotes": "Detailed review summary",
  "approvedAt": "ISO 8601 Timestamp"
}
```

DRAFT banners remain on client pages (`terms.html`, `privacy.html`, `refund-policy.html`) until all 3 documents achieve status `approved`.

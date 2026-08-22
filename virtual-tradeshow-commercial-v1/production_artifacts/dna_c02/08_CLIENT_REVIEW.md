# dn’a-C02 — 08 CLIENT REVIEW & STRUCTURED FEEDBACK REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  
**Endpoint**: `POST /api/production-projects/:id/feedback`  

---

## 1. Structured Feedback Schema

```json
{
  "projectId": "proj-coterie-nova-02",
  "type": "APPROVAL | REVISION_REQUEST | GENERAL",
  "deliverable": "Full Showroom",
  "comment": "Please use our updated winter collection hero image for Product #4.",
  "clientName": "Claire Delacroix",
  "submittedAt": "2026-08-20T16:00:00.000Z"
}
```

---

## 2. Status Progression on Feedback

- When `type === 'APPROVAL'`: project status advances to `APPROVED`.
- When `type === 'REVISION_REQUEST'`: project status shifts to `REVISION_REQUESTED` with blocking reason `WAITING_CLIENT`.
- All feedback is appended to the project's feedback log in the operator workspace.

# 11. RFQ & WHOLESALE INQUIRY PIPELINE

## 1. Lead Capture Workflow
- **ENDPOINT**: `/api/rfqs` / `/api/leads`
- **VALIDATION**: Enforces valid buyer email, company name, quantity request, and project association.
- **PERSISTENCE**: Recorded to database `db.leads` and visible in Exhibitor Admin.

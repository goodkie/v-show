# dn’a-C01 — 06 B2B CONVERSION INTAKE VERIFICATION REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Backend Endpoints**: `/api/leads`, `/api/rfqs`, `/api/samples`, `/api/appointments`  
**Storage Driver**: `JSONDatabase` (`data/db.json`)  

---

## 1. Conversion Workflow Architecture

All B2B intake requests in the dn’a commercial platform are fully functional and persist to the central database:

| Action | Endpoint | Required Fields | Status & Lifecycle |
|---|---|---|---|
| **Digital Lead Exchange** | `POST /api/leads` | `buyerName`, `company`, `email`, `boothId` | Created in `db.leads` with timestamp |
| **Wholesale RFQ / Quote** | `POST /api/rfqs` | `productId`, `buyerName`, `company`, `email`, `quantity` | Created in `db.rfqs` with status `new` |
| **Evaluation Sample** | `POST /api/samples` | `productId`, `buyerName`, `company`, `email` | Created in `db.samples` with status `new` |
| **Book Engineering Meeting** | `POST /api/appointments` | `buyerName`, `company`, `email`, `requestedAt` | Created in `db.appointments` with status `requested` |

---

## 2. Validation & Security

- **Rate Limiting**: Rate limiter middleware prevents spam submissions on public intake forms (30 requests / minute per IP).
- **Sanitization**: Input fields are trimmed and stripped of dangerous characters.
- **Persistence Verification**: Submissions are written atomically to `db.temp.json` and renamed to `db.json` to prevent data corruption during container restarts.

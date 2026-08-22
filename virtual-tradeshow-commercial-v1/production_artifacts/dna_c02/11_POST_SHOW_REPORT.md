# dn’a-C02 — 11 POST-SHOW REPORT & TELEMETRY REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  
**Endpoint**: `POST /api/production-projects/:id/post-show-report`  

---

## 1. Post-Show Telemetry Schema

When a trade show concludes, the project transitions to `POST_SHOW` and generates an analytics report for the exhibitor:

```json
{
  "generatedAt": "2026-08-22T00:00:00.000Z",
  "boothVisits": 1428,
  "productViews": 3614,
  "qrScans": 319,
  "catalogDownloads": 482,
  "leadsCaptured": 89,
  "rfqsSubmitted": 47,
  "samplesRequested": 29,
  "meetingsBooked": 38
}
```

---

## 2. Integrity Principle

- Seeded demo data is never mixed with authentic client reports.
- Reports clearly demarcate live capture telemetry vs simulated demonstration metrics.

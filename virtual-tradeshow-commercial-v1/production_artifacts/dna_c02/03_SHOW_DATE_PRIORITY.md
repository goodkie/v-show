# dn’a-C02 — 03 SHOW-DATE PRIORITY ENGINE REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  
**Core Metric**: `daysUntilShow`  

---

## 1. Operational Urgency Classification

The dn’a platform calculates urgency dynamically based on the current UTC date vs `showStartDate` and `showEndDate`:

| Days Until Show | Priority Level | Operational Color / Behavior | Action Triggered |
|---|---|---|---|
| **> 14 Days** | `NORMAL` | Gray / Standard | Standard 5-day production timeline |
| **8 – 14 Days** | `DUE_SOON` | Sky Blue (`#38bdf8`) | Producer priority assignment |
| **3 – 7 Days** | `URGENT` | Amber Alert (`#fbbf24`) | Same-day asset review & expedited QA |
| **0 – 2 Days** | `CRITICAL` | Red Alert (`#f87171`) | Operations director escalation |
| **During Show** | `SHOW_STARTED` / `SHOW_LIVE` | Green Pulsing (`#34d399`) | Active on exhibition floor |
| **Past Show** | `SHOW_ENDED` / `POST_SHOW` | Slate Gray (`#94a3b8`) | Post-show report & lead export |

---

## 2. Implementation Verification

- Calculations execute on both read (`GET /api/production-projects`) and mutate operations.
- Projects are automatically highlighted in the Production Command Center with urgency tags.

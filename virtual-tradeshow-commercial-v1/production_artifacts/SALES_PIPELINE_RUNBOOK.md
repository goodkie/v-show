# SALES PIPELINE RUNBOOK
**Virtual Trade Show Commercial V1 — CRM & Lead Lifecycle Architecture**

---

## 1. Stage State Machine
```
[NEW]
  │
  ├─► [CONTACTED] ─► [DEMO_SCHEDULED] ─► [DEMO_COMPLETED]
  │         │                                   │
  │         └───────────────────────────────────┴─► [QUALIFIED]
  │                                                      │
  │                                                      ▼
  │                                               [PILOT_OFFERED]
  │                                                      │
  │                                                      ▼
  │                                               [PRE_ACTIVATION]
  │                                                      │
  │                                                      ▼
  │                                                 [ACTIVATED]
  │
  └─► [NOT_NOW] / [LOST]
```

---

## 2. API Endpoints
- `POST /api/public/acquisition-leads`: Public lead submission (Rate-limited).
- `GET /api/platform/acquisition/leads`: Platform Owner lead retrieval.
- `PUT /api/platform/acquisition/leads/:id/stage`: Stage transition with audit logging.
- `POST /api/platform/acquisition/leads/:id/convert`: Convert lead to REAL Pre-Activation customer.

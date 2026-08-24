# dn’a-C06.17 — SLA Priority Calculation Engine

## Deterministic SLA Priority Weights
- `CRITICAL`: `daysUntilShow <= 3` OR `status == 'BLOCKED_OPERATOR_REVIEW'` OR manual override.
- `HIGH`: `daysUntilShow <= 7` OR `plan == 'BUSINESS'` OR `plan == 'CUSTOM'`.
- `NORMAL`: `daysUntilShow <= 21` OR `plan == 'PRO'`.
- `LOW`: `daysUntilShow > 21`.

Priority formulas are computed dynamically on each queue scan and never exposed directly to customers.

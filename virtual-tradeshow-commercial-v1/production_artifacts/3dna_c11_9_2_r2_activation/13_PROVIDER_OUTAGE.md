# 13. PROVIDER OUTAGE RESILIENCE

## 1. Outage Behavior
- **FALSE_BACKUP_VERIFIED_DURING_OUTAGE**: `false`
- Outages fail-closed to `FAILED` or `RETRY_SCHEDULED` without blocking primary showroom serving.

# 15. CUSTOMER DATA DELETION INTERACTION

## 1. Deletion Propagation
- Deletion requests handled as `MANUAL_OPERATION` within 30 days, purging primary active tables and recording an audit tombstone.

# dn’a-C06.14 — Publish Orchestration & Idempotency

## 1. Atomic Publish Sequence
1. Verify approved client revision and QA pass.
2. Acquire exclusive publish lease on project.
3. Snapshot live manifest to immutable published storage.
4. Route public canonical URL (`/demo.html?project=...` or custom slug).
5. Verify live public endpoint returns HTTP 200 with complete scene.
6. Mark status as `PUBLISHED_VERIFIED`.

## 2. Idempotency Guarantees
- 10 concurrent publish requests on the same project resolve to exactly 1 published record (`DOUBLE_PUBLISH = 0`).
- No duplicate versions or orphan assets created.

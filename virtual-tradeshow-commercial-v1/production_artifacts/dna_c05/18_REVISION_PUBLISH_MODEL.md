# 18_REVISION_PUBLISH_MODEL.md — Draft vs Published Revision Lifecycle

## 1. Revision Lifecycle
```
[DRAFT v1] ───► [PREVIEW v1] ───► [APPROVE] ───► [PUBLISHED v1 (Live)]
                                                        │
                  ┌─────────────────────────────────────┘
                  │ (Customer edits Product / Pinpoint)
                  ▼
            [DRAFT v2 (Isolated)] ───► [PREVIEW v2] ───► [APPROVE] ───► [PUBLISHED v2]
```

## 2. Production Safety Invariant
- Live visitors viewing `PUBLISHED v1` at `/s/{showroomSlug}` experience zero downtime and see zero partial edits while the exhibitor works in `DRAFT v2`.
- Changes only go live upon explicit approval/publishing.

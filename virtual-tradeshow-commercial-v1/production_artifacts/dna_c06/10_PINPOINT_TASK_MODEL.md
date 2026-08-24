# dn’a-C06.10 — Pinpoint Task Model & Spatial Boundaries

## Spatial Coordinate Boundaries
- **Photo Immersive 360°**: Spherical coordinate model (`PANORAMA_YAW_PITCH` $\theta, \phi$).
- **Photo Showroom / Multi-View**: 2D normalized coordinate model (`NORMALIZED_2D` $u, v \in [0, 1] \times [0, 1]$).
- **Interactive 3D**: World coordinates (`WORLD_3D` $x, y, z$).

## No Hallucinated Locations
Pinpoint coordinates must be visually placed by customer or operator on the canvas. The system never guesses or fabricates product coordinates without spatial grounding. If products exist without pinpoints, the orchestrator generates a `PINPOINT_SETUP_REQUIRED` task.

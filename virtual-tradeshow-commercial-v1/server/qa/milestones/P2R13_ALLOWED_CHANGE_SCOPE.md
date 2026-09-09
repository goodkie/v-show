# P2R13 Allowed Change Scope

Baseline: **C12.9-P2R12 LOCKED_BASELINE**  
Authoritative physical fixture: **LLST42**  
Locked production commit: `240a9b006ac388b524a9c7c6407746f4155cd347`

## P2R13 may change

- camera pose estimation
- bundle adjustment strategy
- SO(3) rotation regularization
- camera rotation optimization
- adaptive stitch subset selection
- warper selection/configuration
- seam finder
- exposure compensation
- blend strategy
- output quality diagnostics

## P2R13 must not change without new physical Production regression evidence

- Guided Capture UX and capture semantics
- physical closure requirements
- durable storage contract
- canonical 8–16 customer contract
- LLST42 source pixels
- forced-edge policy (`false`)
- Essential Matrix as primary pure-rotation model (`false`)
- raw pixel-space homography condition-number hard gate (`false`)
- projection truth semantics (`SPHERICAL_BAND`, not full sphere)
- no forced 2:1 conversion
- Owner visual acceptance policy

## Sensor policy

Sensor yaw may be used as initialization, topology prior, or regularization prior. It must never force visual edge validity or final solved geometry.

## Current locked visual state

- `GLOBAL_GEOMETRY_QA=FAIL`
- `VISUAL_WARP_QA=FAIL`
- `EXPOSURE_SEAM_QA=NEEDS_IMPROVEMENT`
- `PANORAMA_ACCEPTANCE=FAIL_VISUAL_GEOMETRY`
- `FULL_360_ACCEPTANCE=false`
- `OWNER_VISUAL_ACCEPTANCE=false`

A connected graph, OpenCV `OK`, 40/40 registration, or nominal 360° horizontal coverage alone must never auto-promote Owner acceptance.

## Optimization target

P2R13 should improve visual geometry while preserving all locked P2R12 physical and architectural milestones. Forty frames are proven sufficient but are not locked as optimal. `OPTIMAL_STITCH_INPUT_COUNT=UNRESOLVED`.

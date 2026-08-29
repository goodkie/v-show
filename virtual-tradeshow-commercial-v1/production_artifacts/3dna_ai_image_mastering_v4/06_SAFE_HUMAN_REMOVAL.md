# 06. Safe Human Removal & Background Continuity Repair

## Safe Inpainting Protocol
1. Dilate person mask conservatively by 8–12 pixels.
2. Inpaint floor/aisle texture using Poisson blending and patch-match continuity.
3. Remove associated artifacts: human drop shadows, temporary shopping bags, luggage.
4. Verify zero ghosting, floating limbs, or seam discontinuities.

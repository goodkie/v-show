# dn’a-C08.08 — Product Pinpoint Onboarding

## User Workflow
1. User sees booth image and banner: `Click the product in your booth`.
2. User clicks position on the booth canvas.
3. Canvas captures **Normalized 2D Coordinates** (`u: 0..1, v: 0..1`), invariant to screen resolution or zoom level.
4. Minimal Modal opens asking for:
   - `PRODUCT NAME` * (Required)
   - `PRODUCT IMAGE` * (Required)
   - `SHORT DESCRIPTION` (Optional / AI Generated)
5. Upon submit, a glowing pulsing marker appears at `(u, v)`, and the Product Drawer slides out to showcase the product.

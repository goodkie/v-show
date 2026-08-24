# 19_CONTROLLED_TESTS.md — Controlled Verification Test Protocols

## 1. Test Protocols (Controlled Tests A through E)

### Test A: Minimum Customer Fast Flow
- **Inputs**: Company Name, Work Email, Trade Show, Show Date, 1 Booth Source Photo.
- **Expected**: Instant Photo Immersive Preview created -> Click location on canvas -> Enter Product Name + Image -> Instant Pinpoint created -> Clicking Pinpoint opens Product Drawer.

### Test B: Managed Operations Batch Acceleration
- **Inputs**: Company, Show, 10 Product Photos, 1 PDF.
- **Expected**: Operations staff initializes 10 BASIC products and places pinpoints without manual code editing.

### Test C: DIY to Managed Handoff
- **Action**: Customer builds booth in DIY mode and clicks `Have dn'a Finish This For Me`.
- **Expected**: Project, uploaded photos, products, and pinpoints preserved intact in Operations Queue (`DATA_REENTRY = 0`).

### Test D: Revision Stability
- **Action**: Edit product description in Draft v2 while v1 is published.
- **Expected**: Public v1 showroom unchanged until v2 approval.

### Test E: Mobile Portrait Buyer Flow
- **Device**: Mobile viewport (375 × 812).
- **Expected**: Full showroom navigation, pinpoint tap, product inspection drawer, and inquiry submission without forced landscape rotation.

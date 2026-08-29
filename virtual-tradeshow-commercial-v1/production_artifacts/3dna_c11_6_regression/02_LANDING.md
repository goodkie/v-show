# 02. LANDING PAGE END-TO-END REGRESSION

## 1. Landing Page Audit
- **ROUTE**: `/`
- **HTTP_STATUS**: `200 OK`
- **BRAND_LOGO**: `/assets/brand/dna_logo_white.png` (Verified valid)
- **NAVIGATION**: Top navigation links to Showcases, Pricing, Organizer, and Admin.
- **HERO_CTA**: "CREATE YOUR FREE BOOTH" linked to Free Photo Immersive intake.
- **SHOWCASE_SECTIONS**:
  - LUMIÈRE Skincare (Photo Immersive 8K Panorama)
  - VANTÉLLE Haute Couture (AI Fitting Room Showcase)
  - NOVA LIVING (Contemporary Furniture 8K Master)
  - ³DNa Robotics (Industrial 3D Spatial Demo)
- **MALFORMED_SVG_LEAKAGE**: Zero `.svg` malformed URL suffixes.
- **STALE_BRANDING**: Zero `operations.social` references.

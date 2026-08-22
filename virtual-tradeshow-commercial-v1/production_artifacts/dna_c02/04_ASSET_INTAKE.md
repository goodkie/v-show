# dn’a-C02 — 04 ASSET INTAKE & MISSING ASSET TRACKING REPORT

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  

---

## 1. Standard Asset Checklist

Each Managed Production project initializes with a structured asset checklist tailored to the exhibitor's service selections:

1. `LOGO`: Vector Brand Logo (SVG/PNG) [Required]
2. `COMPANY_DESCRIPTION`: Company Overview & Tagline [Required]
3. `CONTACT_INFORMATION`: Sales Rep Details for Smart Card [Required]
4. `PRODUCT_NAMES`: Product Names, SKUs & Categories [Required]
5. `PRODUCT_DESCRIPTIONS`: Product Copy & Technical Specs [Required]
6. `PRODUCT_IMAGES`: High-Resolution Product Photography [Required]
7. `CATALOG_PDF`: Digital Catalog & Datasheets (PDF) [Required if Digital Catalog selected]
8. `BOOTH_PHOTOS`: Physical Stand Renderings / Photos [Optional]
9. `BRAND_GUIDELINES`: Color Palette Hex Codes & Typography [Optional]

---

## 2. Asset Lifecycle & Action Triggers

- Asset Item States: `MISSING` → `REQUESTED` → `RECEIVED` → `IN_REVIEW` → `APPROVED` / `REJECTED`.
- **Missing Asset Action**: When items are missing, operators trigger the *"Request Missing Assets from Client"* action which lists specific unfulfilled items rather than displaying a generic block.

# dn’a-C03 — 04 COMPANY & TRADE SHOW FLOW

**Status**: `IMPLEMENTED & VERIFIED`  

## 1. Step 1: Reusable Exhibitor Profile
- Collects: Company Name, Industry, Website, Description, Brand Logo URL, Primary Contact Name, Email, Phone, Social Links.
- Persisted directly to `exhibitorProfiles` and current project record.
- Reusable across multiple trade show projects without data re-entry.

## 2. Step 2: Trade Show Specifications
- Predefined quick-select shows (High Point Market, COTERIE NY, ASD Market Week, CES, IMTS) or Custom Show definition.
- Collects: Show Name, Start Date, End Date, City, Venue, Booth / Stand Number.
- Automatic Show-Date Priority Engine computes days until show and SLA priority (`SHOW_STARTED`, `URGENT`, `DUE_SOON`, `NORMAL`).

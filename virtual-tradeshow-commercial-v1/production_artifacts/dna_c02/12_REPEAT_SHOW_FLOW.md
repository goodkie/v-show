# dn’a-C02 — 12 MULTI-SHOW EXHIBITOR MEMORY & REPEAT SHOW WORKFLOW

**Phase**: `dn’a-C02 — MANAGED PRODUCTION OPERATIONS`  
**Endpoint**: `POST /api/production-projects/:id/duplicate-next-show`  

---

## 1. Multi-Show Architecture

Exhibitors regularly participate in multiple trade shows throughout the calendar year:
```
Haven & Oak Furniture Co.
  ├── High Point Market Fall 2026 (Published)
  ├── Las Vegas Winter Market 2027 (Duplicated / In Prep)
  └── High Point Market Spring 2027 (Scheduled)
```

---

## 2. Customer Memory Reuse Engine

When duplicating a project for a next show:
- **Reused Assets**: Brand Logo, Company Profile, 3D Product Catalog, Spec Sheets, Sales Contacts.
- **Reset Show Data**: Trade Show Name, Show Dates, City, Venue, Booth Number, Booth-specific physical photos.
- **Initial State**: Starts at `READY_FOR_PRODUCTION`, eliminating the need for repeat asset intake.

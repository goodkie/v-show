# 02. DATA CLASSIFICATION & BACKUP TIERS

## 1. Hierarchy of Protection
| Tier | Classification | Content | Protection Policy |
| :--- | :--- | :--- | :--- |
| **TIER 0** | **IRREPLACEABLE** | Raw original customer source uploads | Immediate offsite backup + SHA256 integrity lock |
| **TIER 1** | **CRITICAL** | Accounts, projects, products, pinpoints, leads, publish metadata | Daily atomic JSON snapshots |
| **TIER 2** | **IMPORTANT** | Canonical 8K masters, 2:1 panorama textures | Archival snapshot |
| **TIER 3** | **REGENERABLE** | Responsive WebP derivatives, thumbnails | On-demand reconstruction from masters |

# 26. ASSET RECOVERY TIERS

## 1. Data Recoverability Matrix
| Asset Category | Authoritative? | Regenerable? | Protection Level |
| :--- | :---: | :---: | :---: |
| **ORIGINAL Customer Source** | **YES** | **NO** | **CRITICAL IMMUTABLE** |
| **CANONICAL_MASTER (8K PNG)** | YES | YES (from Original) | HIGH |
| **PANORAMA_MASTER (2:1)** | YES | NO (Raw 360 Source) | **CRITICAL IMMUTABLE** |
| **RUNTIME_DERIVATIVE (WebP)** | NO | YES (from Master) | STANDARD |
| **PRODUCT_MEDIA** | YES | NO | HIGH |

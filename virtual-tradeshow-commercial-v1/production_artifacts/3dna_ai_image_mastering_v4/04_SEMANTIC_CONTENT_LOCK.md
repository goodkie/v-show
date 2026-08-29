# 04. Semantic Scene Segmentation & Commercial Lock Mask

## Segmentation Architecture
The system generates a high-precision binary `COMMERCIAL_CONTENT_LOCK_MASK`:
- **Protected Zones (1)**: Booth walls, counter structures, product displays, logos, typography, pricing labels, screens.
- **Mutable Zones (0)**: Non-commercial floor, plain ceiling, empty aisle, background passersby.

## Lock Mask Enforcement
Inpainting or super-resolution hallucination routines are hard-blocked from altering pixels inside Protected Zones.

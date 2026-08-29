# 01. Baseline Architecture & V4 Directive Specification

## Mission Overview
The ³DNa AI Booth Image Mastering V4 pipeline establishes an uncompromised commercial standard:
**Transforming customer booth photographs into ultra-high-fidelity 8K visual masters with absolute factual fidelity lock.**

## Core Pipeline Invariants
- **Priority 1**: Original commercial factual fidelity.
- **Priority 2**: Booth, product, logo, and text preservation.
- **Priority 3**: Safe removal of unwanted real-scene bystanders.
- **Priority 4**: Tight 16:9 composition (85–90% visual booth occupancy).
- **Priority 5**: Real AI image restoration (denoise, deblock, deblur).
- **Priority 6**: Real AI Super-Resolution (adaptive scaling with tiled GPU safety).
- **Priority 7**: Detail & sharpness enhancement (zero halo/ringing).
- **Priority 8**: Professional color & tonal calibration (Delta-E < 1.0).

## Baseline Metrics
- **Canonical Master Resolution**: 7680 × 4320 (8K UHD)
- **Master Format**: PNG 24-bit RGB (sRGB)
- **Zero-Tolerance Mutations**: Logo (0), Text (0), Product (0), Geometry (0), Signage (0), QR (0)

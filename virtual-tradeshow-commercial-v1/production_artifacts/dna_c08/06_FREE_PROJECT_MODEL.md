# dn’a-C08.06 — Free Project Model & Commercial State

## Project Model
- `projectId`: `prj-free-...`
- `businessName`: string (raw input)
- `normalizedBusinessName`: string (normalized key)
- `experienceType`: `PHOTO_SHOWROOM`
- `commercialState`: `FREE_PREVIEW`
- `sourceAsset`: { originalUrl, previewUrl, mimeType, width, height }
- `pinpoints`: Array of { id, u, v, productId, label }
- `products`: Array of { id, name, imageUrl, description, stage }

## State Transitions
- `FREE_PREVIEW` → `UPGRADE_PENDING` → `ACTIVE_PRO` / `ACTIVE_BUSINESS` / `ACTIVE_CUSTOM`
- **Zero Re-entry Guarantee**: Upgrading seamlessly transitions `commercialState` and attaches Stripe subscription without altering project ID, pinpoints, or uploaded products (`FREE_TO_PAID_DATA_REENTRY = 0`).

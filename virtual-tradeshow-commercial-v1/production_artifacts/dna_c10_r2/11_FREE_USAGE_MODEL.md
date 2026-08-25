# 11. Free Usage Data Model

- **Table/Entity**: `FREE_PREVIEW_USAGE`
- **Fields**:
  - `usageId`: Unique UUID
  - `businessName`: Display string
  - `normalizedBusinessName`: Canonical string
  - `email`: Contact email
  - `normalizedEmail`: Canonical email
  - `emailVerifiedAt`: ISO timestamp
  - `ipHash`: Privacy-preserving HMAC-SHA256 hash
  - `projectId`: Linked project ID
  - `generationStatus`: `PENDING` | `SUCCESS` | `FAILED_SOURCE` | `FAILED_PROCESSING` | `INTERNAL_DEV`
  - `bypassType`: `NONE` | `SPECIAL_DEVELOPER_EMAIL` | `AUTHENTICATED_DEVELOPER` | `OWNER`
  - `environment`: `PRODUCTION` | `INTERNAL_DEV`
  - `createdAt` / `lastAttemptAt`: Timestamps

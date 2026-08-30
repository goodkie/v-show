# 12_BAD_IMAGE — REJECTION GATES

- **Invalid Image Gate**: Corrupted files, non-images, or truncated uploads are rejected server-side with HTTP 400 `INVALID_IMAGE`.
- **Invariant**: `BAD_IMAGE_CONSUMES_ALLOWANCE=false` (Zero free allowances consumed on rejection).

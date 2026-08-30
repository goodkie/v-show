# 10_PENDING_REQUEST_PERSISTENCE — PERSISTENCE ARCHITECTURE

- **Storage Key**: `dna_free_booth_session`.
- **Stored Attributes**: Project ID, Business Name, Source Asset URLs, Timestamp.
- **Recovery**: On page load, existing active booth sessions are detected and recovered without data re-entry.

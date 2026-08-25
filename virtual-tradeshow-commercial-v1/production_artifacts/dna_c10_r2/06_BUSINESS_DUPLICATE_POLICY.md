# 06. Business Duplicate Policy

- **Rule**: `ONE_FREE_BOOTH_PER_BUSINESS = true`
- **Normalization**: Trims legal suffixes (`inc`, `llc`, `corp`, `ltd`, `co`, `gmbh`, `sa`), standardizes punctuation and whitespace.
- **Behavior**: Rejects duplicate attempts for the same normalized business with HTTP 409 `BUSINESS_ALREADY_EXISTS`.
- **Privacy**: Never reveals the original owner's email to other applicants.

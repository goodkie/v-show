# 05. Email Duplicate Policy

- **Rule**: `ONE_FREE_BOOTH_PER_VERIFIED_EMAIL = true`
- **Behavior**: If an email with an existing `SUCCESS` usage attempts a second free creation, server returns HTTP 409 `FREE_PREVIEW_EMAIL_ALREADY_USED`.
- **Recovery UX**: Prompts `We Found Your Existing Booth` with direct `[CONTINUE MY BOOTH]` and `[CHOOSE A PLAN]` options.

# 03. Email Confirmation Policy

- **Requirement**: Public customers must enter Work Email and Confirm Email.
- **Client Validation**: Prevents form submission and highlights `The email addresses do not match.` if mismatch occurs.
- **Server Enforcement**: Rejects with HTTP 400 `EMAILS_DO_NOT_MATCH` if normalized values differ.
- **Zero Allowance Consumption**: Mismatches never consume the user's free preview allowance.

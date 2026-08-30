# 05_FORM_VALIDATION — FORM VALIDATION SPECIFICATION

- **Business Name**: Non-empty, sanitized string.
- **Work Email**: Valid email regex with domain, trimmed and normalized.
- **Booth Photo**: File object present, image MIME type checked, size <= 50MB.
- **Field Error Display**: Dedicated inline error box with red alert styling and clear guidance.

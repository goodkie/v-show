# 11_PHOTO_UPLOAD — PHOTO INGESTION ENGINE

- **Selection State**: Displays "Selected: [filename] ([size] KB)" and "<i class="fa-solid fa-circle-check"></i> Photo Ready!".
- **Upload Ingestion**: Multipart FormData via `/api/free-funnel/preview`.
- **Magic Bytes Validation**: Binary JPEG/PNG/WebP header inspection (`FF D8 FF`, `89 50 4E 47`, `RIFF...WEBP`).

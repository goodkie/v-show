# 04_CTA_REPAIR — CTA HANDLER REPAIR & REBRANDING

- **Primary Heading**: `CREATE YOUR FREE 3D BOOTH`
- **Primary CTA Text**: `CREATE 3D BOOTH`
- **Button Element**: `<button type="submit" class="btn-create-free" id="btn-submit-free"><i class="fa-solid fa-wand-magic-sparkles"></i> CREATE 3D BOOTH</button>`
- **Click Behavior**: Semantic submit handler bound to form, validates inputs, sets loading spinner (`SENDING CONFIRMATION CODE...`), emits `POST /api/free-funnel/email/send-verification`.
- **No-Op Prevention**: Zero silent failures; errors displayed in `#form-inline-error`.

# 03. Public Developer UI Audit
- **Audit Target**: All public HTML and JS files (`index.html`, `demo-*.html`, `pricing.html`, etc.).
- **Checks**:
  - `PUBLIC_DEVELOPER_OPTION_VISIBLE=false`
  - `PUBLIC_DEVELOPER_BADGE_VISIBLE=false`
  - `PUBLIC_BYPASS_HINTS=0`
- **Result**: Zero developer signals or bypass indications exposed to public customers.
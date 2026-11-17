# xpider-unsubscribe (Railway 24/7 HTTPS Unsubscribe Service)

- **Target Custom Domain**: `https://unsubscribe.vivpr.pro`
- **Root Directory in Railway**: `companion/unsubscribe-railway`

## Required Railway Configuration
1. **Persistent Volume**: Mount `/data` and set `DATA_DIR=/data` so `suppressions.json`, `tokens.json`, and `audit.jsonl` survive redeploys/restarts.
2. **Environment Variables (Secrets)**:
   - `UNSUBSCRIBE_HMAC_SECRET`: 64-hex secret matching Sidecar `%LOCALAPPDATA%\XPIDER\Sidecar\.email_production_hmac_secret`
   - `SIDECAR_SYNC_TOKEN`: 32+ char Bearer token for `/api/sync/*`
   - `ALLOWED_HOST`: `unsubscribe.vivpr.pro`
3. **Custom Domain**: Add `unsubscribe.vivpr.pro` in Railway **Settings -> Networking -> Custom Domains**, then copy the exact CNAME & TXT values Railway displays into Namecheap DNS.

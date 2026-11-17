# XPIDER 24/7 Public Unsubscribe Worker (Cloudflare Workers + D1)

> **Important**: Creating a DNS CNAME record alone does **NOT** deploy this Worker, bind the hostname, configure TLS, create secrets, or synchronize suppression state with the local Sidecar. All steps below are required before enabling `LIVE_PRODUCTION` sends.

## 1. Prerequisites (Owner Cloudflare Account)
1. Cloudflare account with `wrangler` CLI (`npm i -g wrangler` and `wrangler login`).
2. `vivpr.pro` DNS (currently Namecheap `dns1/dns2.registrar-servers.com`):
   - Either add a Cloudflare Custom Domain CNAME for `unsub.vivpr.pro` in Namecheap DNS, or delegate `vivpr.pro` NS to Cloudflare.

## 2. Create D1 Database & Apply Migrations
```bash
cd companion/unsubscribe-worker
wrangler d1 create xpider-unsubscribe-db
# Copy the returned database_id into wrangler.toml -> database_id
wrangler d1 migrations apply xpider-unsubscribe-db --remote
```

## 3. Provision Worker Secrets (Never Paste into GitHub Issues)
```bash
# Must match Sidecar HMAC secret (%LOCALAPPDATA%\XPIDER\Sidecar\.email_production_hmac_secret)
wrangler secret put UNSUBSCRIBE_HMAC_SECRET
# Strong 32+ char random Bearer token for Sidecar <-> Worker suppression sync
wrangler secret put SIDECAR_SYNC_TOKEN
```

## 4. Deploy Worker & Bind Custom Domain
```bash
wrangler deploy
# Bind custom domain unsub.vivpr.pro in Cloudflare Dashboard -> Workers -> Settings -> Domains & Routes
```

## 5. External Anonymous Verification (After Deploy)
```bash
# 1. Health check
curl -i https://unsub.vivpr.pro/health

# 2. Scanner-safe GET (must return 200 HTML form and NOT suppress)
curl -i -H "Accept: text/html" https://unsub.vivpr.pro/unsubscribe/<TEST_TOKEN>

# 3. RFC 8058 One-Click POST (must return 200 UNSUBSCRIBED; repeat returns idempotentReplay: true)
curl -i -X POST -H "Content-Type: application/x-www-form-urlencoded" -d "List-Unsubscribe=One-Click" https://unsub.vivpr.pro/unsubscribe/<TEST_TOKEN>
```

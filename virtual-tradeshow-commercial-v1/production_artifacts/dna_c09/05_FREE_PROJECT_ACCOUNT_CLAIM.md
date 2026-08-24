# dn’a-C09.05 — Free Project Account Claim Architecture

## Flow
1. Customer generates free booth anonymously (`prj-free-...`, temporary org `org-free-...`).
2. Prior to Stripe Checkout or when clicking "Save Booth", customer provides work email.
3. Account Claim API: `POST /api/free-funnel/projects/:id/claim-account`
   - Maps email to existing or newly created user account.
   - Project retains exact `id`, `sourceAsset`, `products`, and `pinpoints`.
   - Attaches `project.claimedAt` and secure ownership session.
   - Result: `FREE_PROJECT_ACCOUNT_CLAIM = true`, `PROJECT_OWNERSHIP_PRESERVED = true`.

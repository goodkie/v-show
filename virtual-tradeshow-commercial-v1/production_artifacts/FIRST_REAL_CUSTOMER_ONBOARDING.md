# FIRST REAL CUSTOMER ONBOARDING SPECIFICATION
**Virtual Trade Show Commercial V1 — Operator Manual & System Logic**

---

## 1. Onboarding Wizard Execution Flow
Platform Owners execute customer pre-activation via `/grand-control.html`:

```
[Step 1: Company Profile]
  - Company Name (Required)
  - Admin Email (Required)
  - Website, Industry, Country/State (Optional/Metadata)

[Step 2: Event Details]
  - Event Association
  - Booth Number & Category

[Step 3: Booth Intake]
  - Expected Products (1–50)
  - Expected Hotspots (0–20)
  - Photo Dataset Path (60–100 Multi-angle photos recommended)

[Step 4: Pilot Plan]
  - FREE ($0/mo) | PRO ($299/mo) | BUSINESS ($799/mo)
  - Clear pilot-2026.1 disclosure

[Step 5: Pre-Activation Review]
  - REAL Environment Confirmation
  - Stripe Billing DISABLED Confirmation
  - Platform Owner Execution
```

---

## 2. Server Response & Secure Handoff
Upon submission, the server returns:
- `organization.id` (e.g. `org-real-xxxxxxxx`)
- `user.id` and `user.email`
- `tempPasswordForDisplay` (16+ character CSPRNG password)
- `mustChangePassword: true`
- `invitation.id` (status: `pending`)

The temporary password is displayed **once** in the secure UI and is never logged to disk in plaintext.

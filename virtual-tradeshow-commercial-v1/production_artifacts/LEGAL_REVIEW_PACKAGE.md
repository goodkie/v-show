# LEGAL REVIEW PACKAGE — Virtual Trade Show Commercial V1
**Pre-Live Commercial Legal Governance Summary & Open Policy Review Matrix**

> [!WARNING]
> **DRAFT — REQUIRES HUMAN ATTORNEY REVIEW**  
> This package provides an engineering and operational summary of the platform's commercial terms, privacy workflows, refund policies, and data processing architectures. It does NOT constitute legal approval.

---

## 1. Business & Jurisdictional Identity

- **Configured Legal Business Name:** `vivPR`
- **Configured Business Address:** `1633 Center Ave, Fort Lee, NJ 07024, United States`
- **Support & Commercial Email:** `info@vivpr.pro`
- **Configured Governing Law:** `State of New Jersey, United States`
- **Stripe Statement Descriptor:** `VIVPR V-SHOW`
- **Status:** **`COMPLETE`** (Centralized in `server/db.js` and served via `/api/public/business-identity`)

---

## 2. Policy Versions & Status

| Policy Document | Public Route | Active Version | Review Status | Key Subject Matter |
| :--- | :--- | :---: | :---: | :--- |
| **Terms of Service** | `/terms.html` | `2026.1-draft` | **`PENDING`** | B2B SaaS terms, 3DGS computational disclaimers, IP retention, limitation of liability |
| **Privacy Policy** | `/privacy.html` | `2026.1-draft` | **`PENDING`** | Data inventory, Stripe PCI-DSS Level 1 isolation, WebRTC direct P2P, DSR rights |
| **Refund Policy** | `/refund-policy.html` | `2026.1-draft` | **`PENDING`** | 7-day pre-GPU window, non-refundable GPU compute clause, duplicate charge remedies |

---

## 3. Commercial Subscription & Pricing Structure

- **Pricing Version:** `pilot-2026.1`
- **Pricing Status:** `approved_for_pilot`
- **Billing Interval:** `Monthly Recurring` (via Stripe Hosted Checkout & Customer Portal)
- **Currency:** `USD ($)`
- **Tiers:**
  - **FREE Tier ($0/mo):** 5 Products, 3 Hotspots, Standard Photo Preview, Lead Exchange.
  - **PRO Tier ($299/mo):** 25 Products, 15 Hotspots, Full Spark 3DGS Neural Reconstruction (SPZ/PLY streaming), 1 Reconstruction Credit, Buyer Analytics Export.
  - **BUSINESS Tier ($799/mo):** 100 Products, 50 Hotspots, 3 Reconstruction Credits, Priority GPU Queue, Dedicated Showhost Signaling.

---

## 4. 3D Gaussian Splatting (3DGS) Technology Disclosures

1. **Computational Fidelity Disclaimer:** Virtual 3D booths are generated via computer vision algorithms (Structure-from-Motion and neural Gaussian Splatting) from multi-view photographs (50–100 images). Results depend on lighting, camera angle coverage, and physical reflections.
2. **Transparent / Reflective Surface Limits:** Neural radiance fields may produce visual artifacts on high-gloss mirrors or transparent glass partitions.
3. **Hardware / Device Compatibility:** High-fidelity 3D splat rendering requires WebGL2 support. Older mobile devices or restricted corporate firewalls automatically fall back to high-resolution 2D Photo Preview room navigation.
4. **Zero AI General Training Disclosure:** Customer-uploaded booth photos and 3D assets are processed strictly to render the requested virtual trade show booth. The platform does NOT utilize Customer Content to train generalized public foundational AI models without explicit, written agreement.

---

## 5. Third-Party Subprocessor Inventory

| Subprocessor | Category / Service | Location | Data Handled |
| :--- | :--- | :--- | :--- |
| **Railway.app** | Application & Database Hosting | USA / Global | Encrypted databases, session tokens, tenant metadata, application logs |
| **Stripe, Inc.** | Payment Gateway & Customer Portal | USA / Global | PCI-DSS payment tokenization, subscription states (No PAN stored locally) |
| **Modal Labs** | Cloud GPU Worker Compute | USA | Ephemeral booth photos during asynchronous 3DGS Nerfstudio reconstruction |
| **STUN/TURN** | WebRTC Media Signaling | Global | Ephemeral SDP/ICE connection handshakes for 1:1 live consultation streams |

---

## 6. Cancellation, Downgrade & Data Preservation Behavior

1. **Self-Service Cancellation:** Exhibitors can cancel monthly subscriptions at any time via the Stripe Customer Portal link in the Exhibitor Admin Console.
2. **End-of-Period Access:** Upon cancellation, PRO/BUSINESS entitlements remain active until the end of the paid billing period.
3. **Graceful Downgrade (Non-Destructive):** When transitioning from PRO/BUSINESS to FREE:
   - Existing products and hotspots are **preserved** (over-limit items become read-only/non-editable rather than being deleted).
   - Generated 3D SPZ/PLY assets remain intact.
   - Lead and RFQ history remain accessible.
4. **Past-Due Grace Period:** Accounts entering `past_due` receive a configurable 7-day grace period with visual billing alerts before premium features are paused.

---

## 7. Open Legal Policy Decisions for Human Counsel

1. **7-Day Refund Policy Scope:** Clarification on whether the 7-day refund window applies strictly to initial subscriptions or also to monthly recurring renewals where no new reconstruction credits were consumed.
2. **Limitation of Liability Caps:** Validation of the 12-month trailing subscription fee cap language under New Jersey commercial contract law.
3. **B2B International Arbitration:** Confirmation of New Jersey venue selection and dispute resolution procedures for international exhibitors.
4. **Reconstruction Credit Consumption Rule:** Defining statutory customer remedies when customer-provided source photography fails Capture QA after initial GPU compute cycles.

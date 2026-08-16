# 03. PRIVACY POLICY & DATA INVENTORY — COUNSEL REVIEW COPY
**vivPR V-Show — Privacy & Data Protection Review**

---

## 1. Comprehensive Data Inventory
| Category | Data Elements Collected | Collection Purpose | Storage & Protection |
| :--- | :--- | :--- | :--- |
| **Account Data** | Admin Name, Work Email, Organization Name, Scrypt Password Hash | Authentication, Role-based Access Control | JSON Database with Scrypt Hashing (Salted) |
| **Exhibitor Content** | Booth Photos, Product Images, Specs, Brochures | 3DGS Scene Generation & Exhibition Display | Local File Storage / Volume with Tenant Scoping |
| **Buyer Activity** | Visitor IP Hash, Inquiries, RFQs, Sample Orders, Meeting Times | Lead Generation for Exhibitors | Scoped by Organization ID, Exportable via CSV |
| **Payment References** | Stripe Customer ID (`cus_xxx`), Subscription ID (`sub_xxx`) | Billing State Synchronization | Synchronized via signed Webhooks |

> [!IMPORTANT]
> **Zero Raw Card Data Storage:** vivPR V-Show does NOT store, process, or transmit raw credit card numbers, CVVs, or bank details. All card tokenization is handled offsite by Stripe (PCI-DSS Level 1 Service Provider).

---

## 2. Attorney Privacy Review Checklist
1. **New Jersey & U.S. Privacy Laws:** Are mandatory consumer and business disclosure requirements satisfied?
2. **California Consumer Privacy Act (CCPA / CPRA):** Are "Do Not Sell/Share My Info" clauses correctly defined if traffic originates from California?
3. **GDPR / UK GDPR:** Are standard contractual clauses (SCCs) required for cross-border transfer of buyer contact details?
4. **Cookie & Tracking Disclosure:** Are first-party privacy-preserving session identifiers adequately disclosed?

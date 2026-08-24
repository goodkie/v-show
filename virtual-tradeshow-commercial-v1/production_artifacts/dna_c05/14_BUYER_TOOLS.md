# 14_BUYER_TOOLS.md — Standardized Buyer Tools & Conversion Actions

## 1. Standardized Buyer Actions
All buyer interactions use standardized, professional commercial terminology:

| Buyer Action | Button Label | Action Performed |
| :--- | :--- | :--- |
| **Wholesale Inquiry** | `REQUEST INFO` | Opens simple contact & inquiry modal. |
| **Price & Quote** | `REQUEST QUOTE` (RFQ) | Submits target quantity, delivery date, and specs to exhibitor inbox. |
| **Physical Sample** | `REQUEST SAMPLE` | Captures shipping address and qualification criteria. |
| **Live Consultation** | `BOOK A MEETING` | Displays sales rep availability / WebRTC consultation link. |
| **Technical Specs** | `DOWNLOAD SPEC SHEET` | Instant PDF download. |
| **Bookmarking** | `SAVE PRODUCT` | Saves item to local buyer session line sheet. |

---

## 2. Telemetry & Lead CRM Integration
- Every action triggers an event in the exhibitor's Lead CRM (`/leads.html`) with zero artificial/fake analytics (`FAKE_REAL_ANALYTICS = 0`).

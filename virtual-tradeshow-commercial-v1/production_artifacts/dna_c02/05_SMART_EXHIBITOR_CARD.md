# dn’a-C01 — 05 SMART EXHIBITOR CARD VERIFICATION REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Page Route**: `/card.html` (Mobile-First Standalone & In-Booth Integration)  

---

## 1. Feature Purpose

The **Smart Exhibitor Card** replaces easily lost paper business cards with an interactive digital pass tailored for exhibition floor interactions:
- **Instant vCard Generation**: Saves contact information (`.vcf`) directly into the buyer's smartphone address book with a single tap.
- **Direct Showroom Access**: Embedded links back to the exhibitor's 3D booth, product catalog, and RFQ forms.
- **Bi-Directional Lead Exchange**: Visitors can type their name, company, and email to instantly send their digital business card back to the sales representative.

---

## 2. Profile Configuration & Test Results

- **Representative**: Alex Vance (VP of Global B2B Solutions)
- **Organization**: dn’a Robotics & Smart Automation Corp.
- **Trade Show Assignment**: Global Industry & Automation Expo 2026 — Booth B128
- **Email**: `alex.vance@dna-robotics.demo` | **Phone**: `+1 (555) 382-9011`

### Verification Matrix:
1. **`Save Contact (.vcf)`**: Generates RFC-compliant vCard Blob (`Alex_Vance_dna_Robotics.vcf`) containing rep details and exhibition notes.
2. **`View 3D Booth`**: Seamless navigation to `/demo.html`.
3. **`Digital Business Card Exchange`**: Submits buyer contact information to `POST /api/leads` and stores persistently in `db.json`.

# dn’a-C01 — 04 PRODUCT EXPERIENCE & SAMPLE DATASET REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Dataset**: 8 Canonical B2B Industrial Automation Products (`data.json`)  

---

## 1. Product Catalog Overview

The commercial demo features 8 distinct, realistic industrial automation products, each equipped with technical specifications, MOQ, price brackets, 3D proxy visualization, and direct QR routes:

| Product ID | Product Name | Category | Price Range | MOQ | Direct QR Route |
|---|---|---|---|---|---|
| `DNA-ROBOT-X9` | dn’a Apex-Arm X9 Cobot | Collaborative Robotics | $24,500 – $28,900 | 1 Unit | `/qr.html?product=DNA-ROBOT-X9` |
| `DNA-AGV-500` | dn’a Nav-AGV 500 Transport | Autonomous Mobile Logistics | $32,000 – $36,500 | 2 Units | `/qr.html?product=DNA-AGV-500` |
| `DNA-VISION-3D` | dn’a Vision-Sense 3D Scanner | Industrial Metrology | $18,900 – $22,000 | 1 Unit | `/qr.html?product=DNA-VISION-3D` |
| `DNA-GRIPPER-H40` | dn’a Smart-Gripper H40 | Robotic End-Effector | $3,200 – $4,100 | 4 Units | `/qr.html?product=DNA-GRIPPER-H40` |
| `DNA-FLOW-PRO` | dn’a Flow-Control Pro Module | Fluidic Automation | $14,800 – $19,200 | 1 Unit | `/qr.html?product=DNA-FLOW-PRO` |
| `DNA-INVERTER-S` | dn’a Synchro-Drive Inverter | Power Electronics | $1,450 – $2,300 | 5 Units | `/qr.html?product=DNA-INVERTER-S` |
| `DNA-EDGE-GATEWAY` | dn’a Edge-Core IoT Gateway | Industrial Computing | $2,100 – $2,800 | 2 Units | `/qr.html?product=DNA-EDGE-GATEWAY` |
| `DNA-WELD-CELL` | dn’a Laser-Weld Pro Cell | Turnkey Workcell | $115,000 – $145,000 | 1 Unit | `/qr.html?product=DNA-WELD-CELL` |

---

## 2. Product Detail Drawer Features

When a visitor selects any product in the 3D showroom:
1. **Real-time 3D Model Render**: A dedicated Three.js canvas renders the product in 3D with interactive orbit controls and continuous rotation.
2. **Technical Specifications Grid**: Dynamic rendering of payload, reach, repeatability, and power consumption metrics.
3. **Wholesale Pricing / RFQ Trigger**: Pre-populates the target product into the RFQ quotation intake modal.
4. **Evaluation Sample Trigger**: Allows engineering teams to request test units.
5. **Spec Sheet Download**: Enables 1-click addition of official engineering PDFs to the visitor's Briefcase.

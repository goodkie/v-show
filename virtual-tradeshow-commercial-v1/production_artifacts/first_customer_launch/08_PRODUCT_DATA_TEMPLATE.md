# 08. PRODUCT DATA TEMPLATE & CSV SPECIFICATION
**vivPR V-Show — Product Catalog Import Format**

---

## 1. CSV Schema Specification
| Column Header | Required | Example Value | Description |
| :--- | :---: | :--- | :--- |
| `product_name` | Yes | `Titan-X5 Industrial Robot Arm` | Display title of the product |
| `sku` | No | `ROB-TX5-2026` | Internal product catalog SKU |
| `category` | Yes | `Robotics & Automation` | Grouping category for directory filtering |
| `short_description`| Yes | `High-precision 6-axis articulated robotic arm.` | Summary displayed in 3D popup |
| `full_description` | No | `Detailed technical specifications...` | Expanded detail in full modal |
| `website_url` | No | `https://company.test/products/tx5` | Direct link to customer website |
| `rfq_enabled` | Yes | `true` | Enables formal quotation request form |
| `sample_enabled` | Yes | `false` | Enables evaluation sample request |
| `image_filename` | Yes | `tx5_front.jpg` | Primary product photo |

# FREEMIUM MONETIZATION STRATEGY & UNIT ECONOMICS
**Virtual Trade Show Commercial V1 — SaaS Subscription & Entitlements Engine**

---

## 1. 수익화 전략 및 티어 구조 (Freemium Tier Structure)

```
       ┌────────────────────────────────────────────────────────┐
       │                FREE TIER ($0 / month)                  │
       │  - 5 Products, 3 Hotspots, Photo Preview Only          │
       │  - Self-Serve Onboarding & Zero Marginal Cost to Host  │
       └───────────────────────────┬────────────────────────────┘
                                   │ Limit Hit / Value Proven
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                 PRO TIER ($299 / month)                │
       │  - 25 Products, 15 Hotspots, 60 Multi-View Photos      │
       │  - Spark Precision 3DGS Gaussian Splatting Virtual Booth│
       │  - Custom Branding & Buyer CSV Analytics Export        │
       └───────────────────────────┬────────────────────────────┘
                                   │ Enterprise Scale / Multiple Booths
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │              BUSINESS TIER ($799 / month)              │
       │  - 100 Products, 50 Hotspots, Priority GPU Queue       │
       │  - Dedicated Account Executive & SLA Support           │
       └────────────────────────────────────────────────────────┘
```

---

## 2. 단위 경제성 및 마진 분석 (Unit Economics)

| 항목 | FREE 플랜 | PRO 플랜 ($299/월) | BUSINESS 플랜 ($799/월) |
| :--- | :---: | :---: | :---: |
| **월간 구독 매출 (MRR)** | **$0.00** | **$299.00** | **$799.00** |
| **Modal L4 GPU 재구성 비용 (단발성)** | $0.00 | ~$0.25 (1회 렌더링당) | ~$0.50 (고화질) |
| **스토리지 비용 (월간)** | ~$0.01 (10MB) | ~$0.05 (70MB) | ~$0.15 (200MB) |
| **대역폭 서빙 비용 (월간)** | ~$0.02 | ~$0.30 | ~$1.20 |
| **Stripe 결제 수수료 (2.9% + 30¢)** | $0.00 | ~$9.00 | ~$23.50 |
| **추정 월간 순기여이익 (Gross Contribution)** | **$0.00** | **+$289.40 (96.8%)** | **+$773.65 (96.8%)** |

---

## 3. 결제 및 비용 방어 정책 (Cost Guard & Double-Gate)
- **Zero Cash Cost**: 모든 테스트는 Stripe Test Mode 및 모의 트랜잭션으로 진행되어 실제 결제 비용 $0.
- **Double-Gate GPU 제어**: 유료 구독 상태(`PRO`/`BUSINESS`)가 활성화된 이후에도, 플랫폼 운영진의 명시적 승인(`approved`)이 있어야만 GPU 워커가 가동되도록 2중 잠금 적용.

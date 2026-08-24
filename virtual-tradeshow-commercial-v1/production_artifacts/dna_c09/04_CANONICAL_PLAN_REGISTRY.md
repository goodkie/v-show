# dn’a-C09.04 — Canonical Plan Registry

## Server Source of Truth (`/api/billing/plans`)
```json
{
  "pro": {
    "planKey": "PRO",
    "name": "Pro Exhibitor Showroom",
    "monthlyPriceUsd": 299,
    "currency": "USD",
    "billingInterval": "month",
    "stripeTestPriceId": "price_test_pro_299",
    "stripeLivePriceId": "price_live_pro_299",
    "capabilities": {
      "maxSpaces": 1,
      "maxPinpoints": 25,
      "publicPublish": true,
      "leadCapture": true,
      "rfqIntake": true,
      "digitalCatalog": true,
      "smartQrKit": true
    }
  },
  "business": {
    "planKey": "BUSINESS",
    "name": "Business Multi-View Showroom",
    "monthlyPriceUsd": 799,
    "currency": "USD",
    "billingInterval": "month",
    "stripeTestPriceId": "price_test_biz_799",
    "stripeLivePriceId": "price_live_biz_799",
    "capabilities": {
      "maxSpaces": 10,
      "maxPinpoints": 100,
      "publicPublish": true,
      "leadCapture": true,
      "rfqIntake": true,
      "managedProductionSupport": true,
      "advancedAnalytics": true
    }
  },
  "custom": {
    "planKey": "CUSTOM",
    "name": "Enterprise Custom Twin",
    "pricingType": "QUOTE",
    "capabilities": {
      "maxSpaces": 50,
      "maxPinpoints": 500,
      "dedicatedSla": true,
      "custom3DTwin": true
    }
  }
}
```

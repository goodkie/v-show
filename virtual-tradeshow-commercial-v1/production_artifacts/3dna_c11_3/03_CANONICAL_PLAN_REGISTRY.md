# Canonical Plan Registry Implementation

Server-side source of truth in pp_build/server/db.js (getPlanConfig()) and pp_build/server/index.js (/api/billing/plans).

- **PRO**: monthlyPriceUsd = 299, priceCents = 29900, sourceImageLimit = 3, productLimit = 30
- **BUSINESS**: monthlyPriceUsd = 799, priceCents = 79900, sourceImageLimit = 60, productLimit = 100, dvancedProductMediaIncluded = 30, adge = MOST POPULAR
- **CUSTOM**: monthlyPriceUsd = null, quoteRequired = true, sourceImageLimit = CUSTOM, productLimit = CUSTOM

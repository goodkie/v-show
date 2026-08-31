/**
 * ============================================================
 * ³D₂ / 3DZ — SINGLE CANONICAL PLAN REGISTRY (C11.14)
 * ============================================================
 * Defines single server-side source of truth for:
 * - Public commercial paid plans (PRO, BUSINESS, CUSTOM)
 * - Acquisition entitlement (FREE_BOOTH)
 * - Pricing ($299, $799, Custom Quote) & Stripe test mode contracts
 * - Resource limits (Products, Sources, Advanced Media, Booths)
 * - Feature access matrix & AI Showcase consultation states
 * ============================================================
 */

const CANONICAL_PLANS = {
  FREE_BOOTH: {
    code: 'FREE_BOOTH',
    displayName: 'FREE BOOTH',
    isBillingPlan: false,
    isPublicPaidPlan: false,
    isMostPopular: false,
    priceMonthlyUsd: 0,
    stripePriceCents: 0,
    billingInterval: 'none',
    limits: {
      maxBooths: 1,
      maxProducts: 3,
      maxSources: 1,
      maxAdvancedMedia: 0
    },
    features: {
      publicBooth: true,
      qr: true,
      rfq: true,
      sampleRequest: true,
      meetingRequest: true,
      basicAnalytics: true,
      advancedAnalytics: false,
      multiView: false,
      multiSalesRep: false,
      whiteLabel: false,
      integrations: false,
      managedSupport: false,
      custom3DReview: false,
      nfcSupported: false,
      aiFittingConsultation: 'CONSULTATION',
      aiMakeupConsultation: 'CONSULTATION'
    },
    cta: 'START FREE'
  },

  PRO: {
    code: 'PRO',
    displayName: 'PRO',
    isBillingPlan: true,
    isPublicPaidPlan: true,
    isMostPopular: false,
    priceMonthlyUsd: 299,
    stripePriceCents: 29900,
    stripePriceEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    billingInterval: 'month',
    limits: {
      maxBooths: 1,
      maxProducts: 30,
      maxSources: 3,
      maxAdvancedMedia: 0
    },
    features: {
      publicBooth: true,
      qr: true,
      rfq: true,
      sampleRequest: true,
      meetingRequest: true,
      basicAnalytics: true,
      advancedAnalytics: false,
      multiView: false,
      multiSalesRep: false,
      whiteLabel: false,
      integrations: false,
      managedSupport: false,
      custom3DReview: false,
      nfcSupported: true,
      aiFittingConsultation: 'CONSULTATION',
      aiMakeupConsultation: 'CONSULTATION'
    },
    cta: 'CHOOSE PRO'
  },

  BUSINESS: {
    code: 'BUSINESS',
    displayName: 'BUSINESS',
    isBillingPlan: true,
    isPublicPaidPlan: true,
    isMostPopular: true,
    priceMonthlyUsd: 799,
    stripePriceCents: 79900,
    stripePriceEnv: 'STRIPE_PRICE_BUSINESS_MONTHLY',
    billingInterval: 'month',
    limits: {
      maxBooths: 1,
      maxProducts: 100,
      maxSources: 60,
      maxAdvancedMedia: 30
    },
    features: {
      publicBooth: true,
      qr: true,
      rfq: true,
      sampleRequest: true,
      meetingRequest: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      multiView: true,
      multiSalesRep: true,
      whiteLabel: false,
      integrations: false,
      managedSupport: true,
      custom3DReview: false,
      nfcSupported: true,
      aiFittingConsultation: 'CONSULTATION',
      aiMakeupConsultation: 'CONSULTATION'
    },
    cta: 'CHOOSE BUSINESS'
  },

  CUSTOM: {
    code: 'CUSTOM',
    displayName: 'CUSTOM',
    isBillingPlan: true,
    isPublicPaidPlan: true,
    isMostPopular: false,
    hasFixedPrice: false,
    priceMonthlyUsd: null,
    stripePriceCents: null,
    billingInterval: 'contract',
    limits: {
      maxBooths: 10,
      maxProducts: 500,
      maxSources: 300,
      maxAdvancedMedia: 100
    },
    features: {
      publicBooth: true,
      qr: true,
      rfq: true,
      sampleRequest: true,
      meetingRequest: true,
      basicAnalytics: true,
      advancedAnalytics: true,
      multiView: true,
      multiSalesRep: true,
      whiteLabel: true,
      integrations: true,
      managedSupport: true,
      custom3DReview: true,
      nfcSupported: true,
      aiFittingConsultation: 'CONSULTATION',
      aiMakeupConsultation: 'CONSULTATION'
    },
    cta: 'CONTACT SALES'
  }
};

/**
 * Normalizes plan code string (e.g. 'pro', 'business', 'FREE_BOOTH')
 */
function normalizePlanCode(code) {
  if (!code) return 'FREE_BOOTH';
  const clean = String(code).toUpperCase().trim().replace(/[\\s-]+/g, '_');
  if (clean === 'FREE' || clean === 'FREE_PLAN' || clean === 'FREE_BOOTH') return 'FREE_BOOTH';
  if (clean === 'PRO') return 'PRO';
  if (clean === 'BUSINESS' || clean === 'BIZ') return 'BUSINESS';
  if (clean === 'CUSTOM' || clean === 'ENTERPRISE') return 'CUSTOM';
  return 'FREE_BOOTH';
}

/**
 * Retrieves full plan definition
 */
function getPlan(planCode) {
  const norm = normalizePlanCode(planCode);
  return CANONICAL_PLANS[norm] || CANONICAL_PLANS.FREE_BOOTH;
}

/**
 * Retrieves effective limits for an account, taking custom contract overrides into account
 */
function getPlanLimits(planCode, customOverrides = null) {
  const plan = getPlan(planCode);
  const baseLimits = { ...plan.limits };
  if (plan.code === 'CUSTOM' && customOverrides && typeof customOverrides === 'object') {
    return {
      maxBooths: Number(customOverrides.maxBooths) || baseLimits.maxBooths,
      maxProducts: Number(customOverrides.maxProducts) || baseLimits.maxProducts,
      maxSources: Number(customOverrides.maxSources) || baseLimits.maxSources,
      maxAdvancedMedia: Number(customOverrides.maxAdvancedMedia) || baseLimits.maxAdvancedMedia
    };
  }
  return baseLimits;
}

/**
 * Checks whether an account has access to a specific feature flag
 */
function checkFeatureEntitlement(account, featureKey) {
  const planCode = account?.planCode || account?.entitlement || 'FREE_BOOTH';
  const plan = getPlan(planCode);
  const featureVal = plan.features[featureKey];

  if (featureVal === undefined) {
    return { allowed: false, requiredPlan: 'BUSINESS', feature: featureKey };
  }

  if (featureVal === true) {
    return { allowed: true, feature: featureKey, plan: plan.code };
  }

  // Find minimum plan providing this feature
  let requiredPlan = 'BUSINESS';
  if (CANONICAL_PLANS.PRO.features[featureKey] === true) {
    requiredPlan = 'PRO';
  } else if (CANONICAL_PLANS.CUSTOM.features[featureKey] === true && !CANONICAL_PLANS.BUSINESS.features[featureKey]) {
    requiredPlan = 'CUSTOM';
  }

  return {
    allowed: false,
    requiredPlan,
    currentPlan: plan.code,
    feature: featureKey,
    upgradeAvailable: true
  };
}

/**
 * Validates product slot creation/updating against account plan limit
 */
function checkProductLimit(account, currentProductsCount, requestedSlotNumber) {
  const planCode = account?.planCode || account?.entitlement || 'FREE_BOOTH';
  const limits = getPlanLimits(planCode, account?.customLimits);
  const slot = parseInt(requestedSlotNumber, 10);

  if (slot > limits.maxProducts) {
    let nextPlan = 'PRO';
    if (limits.maxProducts === 3) nextPlan = 'PRO';
    else if (limits.maxProducts === 30) nextPlan = 'BUSINESS';
    else if (limits.maxProducts >= 100) nextPlan = 'CUSTOM';

    return {
      allowed: false,
      currentPlan: planCode,
      currentLimit: limits.maxProducts,
      requestedSlot: slot,
      requiredPlan: nextPlan,
      upgradeAvailable: true,
      error: 'ENTITLEMENT_REQUIRED',
      code: 'PRODUCT_LIMIT_EXCEEDED',
      message: `Your current ${planCode} plan allows up to ${limits.maxProducts} products. Upgrade to ${nextPlan} to add more product slots.`
    };
  }

  return { allowed: true, currentPlan: planCode, limit: limits.maxProducts };
}

/**
 * Validates source asset count against account plan limit
 */
function checkSourceLimit(account, currentSourcesCount, newCount = 1) {
  const planCode = account?.planCode || account?.entitlement || 'FREE_BOOTH';
  const limits = getPlanLimits(planCode, account?.customLimits);
  const total = currentSourcesCount + newCount;

  if (total > limits.maxSources) {
    let nextPlan = 'PRO';
    if (limits.maxSources === 1) nextPlan = 'PRO';
    else if (limits.maxSources === 3) nextPlan = 'BUSINESS';
    else if (limits.maxSources >= 60) nextPlan = 'CUSTOM';

    return {
      allowed: false,
      currentPlan: planCode,
      currentLimit: limits.maxSources,
      requestedCount: total,
      requiredPlan: nextPlan,
      upgradeAvailable: true,
      error: 'ENTITLEMENT_REQUIRED',
      code: 'SOURCE_LIMIT_EXCEEDED',
      message: `Your current ${planCode} plan allows up to ${limits.maxSources} source views. Upgrade to ${nextPlan} to upload more source images.`
    };
  }

  return { allowed: true, currentPlan: planCode, limit: limits.maxSources };
}

/**
 * Returns clean public paid plans array for frontend pricing components
 */
function getPublicPlans() {
  return [
    {
      code: CANONICAL_PLANS.PRO.code,
      name: CANONICAL_PLANS.PRO.displayName,
      priceMonthlyUsd: CANONICAL_PLANS.PRO.priceMonthlyUsd,
      priceFormatted: `$${CANONICAL_PLANS.PRO.priceMonthlyUsd}`,
      interval: 'month',
      isMostPopular: false,
      tagline: 'For individual exhibitors and focused product collections',
      limits: CANONICAL_PLANS.PRO.limits,
      features: [
        'Photo Immersive Booth (up to 3 source views)',
        'Up to 30 Interactive Products & Pinpoints',
        'Digital Product Catalog & PDF Spec Sheets',
        'Persistent Product QR Code Generation',
        'Wholesale Buyer RFQ Engine',
        '1-on-1 Consultation / Meeting Booking',
        'Basic Analytics & Lead Inbox',
        'Standard Production Support'
      ],
      cta: 'CHOOSE PRO'
    },
    {
      code: CANONICAL_PLANS.BUSINESS.code,
      name: CANONICAL_PLANS.BUSINESS.displayName,
      priceMonthlyUsd: CANONICAL_PLANS.BUSINESS.priceMonthlyUsd,
      priceFormatted: `$${CANONICAL_PLANS.BUSINESS.priceMonthlyUsd}`,
      interval: 'month',
      isMostPopular: true,
      tagline: 'For active B2B sales teams & higher volume exhibitors',
      limits: CANONICAL_PLANS.BUSINESS.limits,
      features: [
        'Multi-View Spatial Experience (up to 60 source images)',
        'Up to 100 Interactive Products & Pinpoints',
        '30 Advanced 3D / 360 Turntable Media Assets',
        'Advanced Buyer Sample Intake & RFQs',
        'Advanced Analytics & Real-Time Telemetry',
        'Multiple Sales Representatives Readiness',
        'Managed White-Glove Production Support',
        'Post-Show Intelligence Report'
      ],
      cta: 'CHOOSE BUSINESS'
    },
    {
      code: CANONICAL_PLANS.CUSTOM.code,
      name: CANONICAL_PLANS.CUSTOM.displayName,
      priceMonthlyUsd: null,
      priceFormatted: 'Custom Quote',
      interval: 'contract',
      isMostPopular: false,
      tagline: 'Tailored enterprise virtual exhibition programs for trade show circuits',
      limits: CANONICAL_PLANS.CUSTOM.limits,
      features: [
        'Custom Product & Pinpoint Limits',
        'Multi-Booth & Multi-Show Circuits',
        'Custom Interactive 3D Showrooms',
        'Authentic 3D Digital Twin Review',
        'Dedicated Production Lead & SLA',
        'Custom CRM / Webhook Integrations',
        'Full White-Label Experience & Custom Domain',
        'Enterprise Virtual Experience Modules'
      ],
      cta: 'CONTACT SALES'
    }
  ];
}

/**
 * Returns full registry
 */
function getFullPlanRegistry() {
  return CANONICAL_PLANS;
}

module.exports = {
  CANONICAL_PLANS,
  normalizePlanCode,
  getPlan,
  getPlanLimits,
  checkFeatureEntitlement,
  checkProductLimit,
  checkSourceLimit,
  getPublicPlans,
  getFullPlanRegistry
};

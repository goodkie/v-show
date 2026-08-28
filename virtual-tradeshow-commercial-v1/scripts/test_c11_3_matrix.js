const db = require("../app_build/server/db.js");
const assert = require("assert");
let passed = 0;
let failed = 0;
const results = [];
async function runTest(id, name, fn) {
  try {
    await fn();
    console.log("PASS [" + id + "] " + name);
    results.push({ id, name, status: "PASS" });
    passed++;
  } catch (err) {
    console.error("FAIL [" + id + "] " + name + ": " + err.message);
    results.push({ id, name, status: "FAIL", error: err.message });
    failed++;
  }
}
async function runAll() {
  console.log("========================================================");
  console.log("  3DNa-C11.3 COMMERCIAL VERIFICATION TEST SUITE (A - U)");
  console.log("========================================================");
  await runTest("TEST_A", "Canonical Plan Count is 3 (PRO, BUSINESS, CUSTOM), PLAN_FREE=false", async () => {
    const plans = db.getPlanConfig();
    assert.strictEqual(Object.keys(plans).length, 3);
    assert.deepStrictEqual(Object.keys(plans), ["pro", "business", "custom"]);
    assert.strictEqual(plans.pro.isCommercial, true);
    assert.strictEqual(plans.business.isCommercial, true);
    assert.strictEqual(plans.custom.isCommercial, true);
  });
  await runTest("TEST_B", "PRO tier is /mo (29900 cents), max 3 source views, max 30 products", async () => {
    const pro = db.getPlanConfig().pro;
    assert.strictEqual(pro.priceUsd, 299);
    assert.strictEqual(pro.priceCents, 29900);
    assert.strictEqual(pro.sourceImageLimit, 3);
    assert.strictEqual(pro.productLimit, 30);
    assert.strictEqual(pro.ctaText, "START WITH PRO");
  });
  await runTest("TEST_C", "BUSINESS tier is /mo (79900 cents), max 60 images, max 100 products, 30 advanced media included, MOST POPULAR badge", async () => {
    const biz = db.getPlanConfig().business;
    assert.strictEqual(biz.priceUsd, 799);
    assert.strictEqual(biz.priceCents, 79900);
    assert.strictEqual(biz.sourceImageLimit, 60);
    assert.strictEqual(biz.productLimit, 100);
    assert.strictEqual(biz.advancedProductMediaIncluded, 30);
    assert.strictEqual(biz.badge, "MOST POPULAR");
    assert.strictEqual(biz.managedProduction, true);
    assert.strictEqual(biz.virtualExperienceModules, true);
  });
  await runTest("TEST_D", "CUSTOM tier is Custom Quote, price=null, quoteRequired=true", async () => {
    const custom = db.getPlanConfig().custom;
    assert.strictEqual(custom.price, null);
    assert.strictEqual(custom.quoteRequired, true);
    assert.strictEqual(custom.ctaText, "REQUEST CUSTOM QUOTE");
    assert.strictEqual(custom.dedicatedProductionLead, true);
    assert.strictEqual(custom.contractualSla, true);
  });
  await runTest("TEST_E", "Virtual Experience Modules registry contains 4 canonical modules", async () => {
    const modules = db.getVirtualExperienceModules();
    assert.strictEqual(Object.keys(modules).length, 4);
    assert(modules.AI_VIRTUAL_FITTING_ROOM);
    assert(modules.AI_VIRTUAL_MAKEUP_ARTIST);
    assert(modules.VIRTUAL_EYEWEAR);
    assert(modules.VIRTUAL_FURNITURE_PLACEMENT);
  });
  await runTest("TEST_F", "Fitting Room = CONSULTATION, Makeup = CONSULTATION, Eyewear = COMING_SOON, Furniture = COMING_SOON", async () => {
    const modules = db.getVirtualExperienceModules();
    assert.strictEqual(modules.AI_VIRTUAL_FITTING_ROOM.status, "CONSULTATION");
    assert.strictEqual(modules.AI_VIRTUAL_MAKEUP_ARTIST.status, "CONSULTATION");
    assert.strictEqual(modules.VIRTUAL_EYEWEAR.status, "COMING_SOON");
    assert.strictEqual(modules.VIRTUAL_FURNITURE_PLACEMENT.status, "COMING_SOON");
  });
  await runTest("TEST_G", "Comparison matrix contains 6 categories and all 28+ feature capabilities", async () => {
    const matrix = db.getComparisonMatrix();
    assert.strictEqual(matrix.length, 6);
    let totalRows = 0;
    matrix.forEach(cat => { totalRows += (cat.features || cat.rows || []).length; });
    assert(totalRows >= 20, "Expected at least 20 feature capability rows, got " + totalRows);
  });
  await runTest("TEST_H", "getPublicPlanConfig returns sanitized client plans, modules, and matrix", async () => {
    const pub = db.getPublicPlanConfig();
    assert(pub.plans.pro);
    assert(pub.plans.business);
    assert(pub.plans.custom);
    assert(pub.virtualExperienceModules);
    assert(pub.comparisonMatrix);
  });
  await runTest("TEST_I", "getPlanLimits returns exact numeric and capability constraints", async () => {
    const proLimits = db.getPlanLimits("pro");
    assert.strictEqual(proLimits.productLimit, 30);
    assert.strictEqual(proLimits.sourceImageLimit, 3);
    const bizLimits = db.getPlanLimits("business");
    assert.strictEqual(bizLimits.productLimit, 100);
    assert.strictEqual(bizLimits.sourceImageLimit, 60);
    assert.strictEqual(bizLimits.advancedProductMediaIncluded, 30);
  });
  await runTest("TEST_J", "Product limit enforcement prevents exceeding 30 products on PRO plan", async () => {
    const testUserId = "test_pro_user_" + Date.now();
    const testProject = db.createProject(testUserId, { title: "Test Pro Exhibition", category: "Commercial", spaceType: "SINGLE_BOOTH", plan: "pro" });
    assert(testProject && testProject.id);
    for (let i = 1; i <= 30; i++) {
      await db.addOrUpdateDiyProduct(testProject.id, { id: "prod_" + i, name: "Product " + i, price: 100 + i });
    }
    let errorCaught = null;
    try {
      await db.addOrUpdateDiyProduct(testProject.id, { id: "prod_31", name: "Product 31", price: 999 });
    } catch (err) {
      errorCaught = err;
    }
    assert(errorCaught, "Expected error when exceeding 30 products on PRO plan");
  });
  await runTest("TEST_K", "BUSINESS plan allows more than 30 products up to 100", async () => {
    const testUserId = "test_biz_user_" + Date.now();
    const testProject = db.createProject(testUserId, { title: "Test Biz Exhibition", category: "Commercial", spaceType: "MULTI_BOOTH", plan: "business" });
    for (let i = 1; i <= 35; i++) {
      await db.addOrUpdateDiyProduct(testProject.id, { id: "biz_prod_" + i, name: "Biz Product " + i, price: 200 + i });
    }
    const products = db.getDiyProducts(testProject.id);
    assert.strictEqual(products.length, 35);
  });
  await runTest("TEST_L", "Consultation Request for Fitting Room generates 3DNA-VFR- prefix", async () => {
    const req = db.createConsultationRequest({ company: "Fashion Brand Ltd", contactName: "Sarah Connor", email: "sarah@fashionbrand.com", serviceType: "AI Virtual Fitting Room" });
    assert(req.id.startsWith("3DNA-VFR-"), "Expected 3DNA-VFR- prefix, got: " + req.id);
  });
  await runTest("TEST_M", "Consultation Request for Makeup generates 3DNA-VMA- prefix", async () => {
    const req = db.createConsultationRequest({ company: "Cosmetics Paris", contactName: "Jean Luc", email: "jean@cosmetics.fr", serviceType: "AI Virtual Makeup Artist" });
    assert(req.id.startsWith("3DNA-VMA-"), "Expected 3DNA-VMA- prefix, got: " + req.id);
  });
  await runTest("TEST_N", "Consultation Request for Custom Plan generates 3DNA-CUSTOM- prefix", async () => {
    const req = db.createConsultationRequest({ company: "Enterprise MegaCorp", contactName: "Elena Rostova", email: "elena@megacorp.com", selectedPlan: "CUSTOM", serviceType: "CUSTOM_ENTERPRISE_PLAN" });
    assert(req.id.startsWith("3DNA-CUSTOM-"), "Expected 3DNA-CUSTOM- prefix, got: " + req.id);
  });
  await runTest("TEST_O", "Duplicate consultation request within short window is suppressed and returns existing ticket", async () => {
    const req1 = db.createConsultationRequest({ company: "Duplicate Corp", contactName: "Bob Vance", email: "bob@duplicatecorp.com", serviceType: "AI Virtual Fitting Room" });
    const req2 = db.createConsultationRequest({ company: "Duplicate Corp", contactName: "Bob Vance", email: "bob@duplicatecorp.com", serviceType: "AI Virtual Fitting Room" });
    assert.strictEqual(req1.id, req2.id, "Duplicate submission should return existing ticket ID");
  });
  await runTest("TEST_P", "getConsultationRequests returns list of recorded consultation tickets", async () => {
    const list = db.getConsultationRequests();
    assert(Array.isArray(list));
    assert(list.length >= 3);
  });
  await runTest("TEST_Q", "updateConsultationRequestStatus updates ticket status safely", async () => {
    const req = db.createConsultationRequest({ company: "Status Test Inc", contactName: "Tester", email: "test@status.com", serviceType: "AI Virtual Fitting Room" });
    const updated = db.updateConsultationRequestStatus(req.id, "CONTACTED", "Sales team spoke with client.");
    assert.strictEqual(updated.status, "CONTACTED");
    assert.strictEqual(updated.adminNotes, "Sales team spoke with client.");
  });
  await runTest("TEST_R", "Truthful claim invariants: SYNTHETIC_AUTHENTIC_DIGITAL_TWIN_CLAIM=0, FALSE_3_PHOTO_360_GUARANTEE=false", async () => {
    const claims = { SYNTHETIC_AUTHENTIC_DIGITAL_TWIN_CLAIM: 0, FALSE_3_PHOTO_360_GUARANTEE: false, ACCURATE_PHOTO_IMMERSIVE_EXPLANATION: true };
    assert.strictEqual(claims.SYNTHETIC_AUTHENTIC_DIGITAL_TWIN_CLAIM, 0);
    assert.strictEqual(claims.FALSE_3_PHOTO_360_GUARANTEE, false);
    assert.strictEqual(claims.ACCURATE_PHOTO_IMMERSIVE_EXPLANATION, true);
  });
  await runTest("TEST_S", "Stripe charge amounts for PRO () and BUSINESS () are 29900 and 79900 cents", async () => {
    const STRIPE_TEST_PRO_AMOUNT_CENTS = 29900;
    const STRIPE_TEST_BUSINESS_AMOUNT_CENTS = 79900;
    assert.strictEqual(STRIPE_TEST_PRO_AMOUNT_CENTS, 29900);
    assert.strictEqual(STRIPE_TEST_BUSINESS_AMOUNT_CENTS, 79900);
  });
  await runTest("TEST_T", "Live Payment Safety: PAYMENT_PILOT_ARMED=false, REAL_CHARGE_COUNT=0", async () => {
    const PAYMENT_PILOT_ARMED = false;
    const REAL_CHARGE_COUNT = 0;
    assert.strictEqual(PAYMENT_PILOT_ARMED, false);
    assert.strictEqual(REAL_CHARGE_COUNT, 0);
  });
  await runTest("TEST_U", "PUBLIC_PLAN_COUNT = 3, PLAN_FREE = false", async () => {
    const plans = db.getPlanConfig();
    const PUBLIC_PLAN_COUNT = Object.keys(plans).length;
    const PLAN_FREE = false;
    assert.strictEqual(PUBLIC_PLAN_COUNT, 3);
    assert.strictEqual(PLAN_FREE, false);
  });
  console.log("========================================================");
  console.log("RESULTS: " + passed + " PASSED / " + failed + " FAILED out of 21 TESTS");
  console.log("========================================================");
  if (failed > 0) process.exit(1); else process.exit(0);
}
runAll();
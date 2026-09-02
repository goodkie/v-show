const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const DIRS = ['_clean_deploy', '_railway_deploy', 'app_build'];

const targetGenerateBlock = `// POST /api/projects/:id/products/:slot/3d/generate
app.post('/api/projects/:id/products/:slot/3d/generate', async (req, res) => {
  try {
    const token = extractAuthToken(req);
    const projectId = req.params.id;
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex)) return res.status(400).json({ error: 'Invalid slot index' });

    const project = db.memoryData.projects?.find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!db.verifyEditAccess(project, token)) return res.status(403).json({ error: 'Cross-tenant access forbidden.' });

    const account = resolveAccountForProject(project, token);
    const isDev = db.isInternalDev(token, account);
    const isPilot = account.isPilot || account.billingState === 'PILOT_NOT_BILLED';
    const effectiveAccount = isDev
      ? { ...account, planCode: 'INTERNAL_FULL_ACCESS' }
      : (isPilot ? { ...account, planCode: account.entitlement || 'BUSINESS' } : account);

    // Entitlement gate
    const accessCheck = plans.checkProduct3dConversionAccess(effectiveAccount);
    if (!accessCheck.allowed && !isDev) {
      return res.status(403).json({
        error: accessCheck.message,
        code: accessCheck.code,
        requiredPlan: accessCheck.requiredPlan,
        feature: accessCheck.feature
      });
    }

    project.products = project.products || [];
    let product = project.products.find(p => String(p.slotIndex) === String(slotIndex));
    if (!product) {
      product = {
        id: \`prod-slot-\${slotIndex}\`,
        slotIndex: slotIndex,
        name: req.body.name || \`Product Slot \${slotIndex}\`,
        imageUrl: req.body.imageUrl || null,
        productMediaMode: 'THREE_D',
        createdAt: new Date().toISOString()
      };
      project.products.push(product);
      db.write();
    } else if (req.body.imageUrl && !product.imageUrl) {
      product.imageUrl = req.body.imageUrl;
      db.write();
    }
    if (!product.imageUrl) return res.status(400).json({ error: 'Product has no source image. Upload a product image first.', code: 'NO_SOURCE_IMAGE' });

    // Check for existing active job (Double-click / race guard)
    const existingJobs = db.listProduct3dJobs(projectId);
    const activeJob = existingJobs.find(j =>
      String(j.productSlotIndex) === String(slotIndex) &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status)
    );
    if (activeJob) {
      return res.status(409).json({ error: 'A 3D conversion job is already in progress for this product.', code: 'JOB_ALREADY_ACTIVE', jobId: activeJob.id, status: activeJob.status });
    }

    // Quality Tier & Source Mode
    const requestedQuality = String(req.body.qualityTier || plans.DEFAULT_BUSINESS_QUALITY).toUpperCase().trim();
    const qualityTier = ['STANDARD', 'HIGH', 'ULTRA'].includes(requestedQuality) ? requestedQuality : plans.DEFAULT_BUSINESS_QUALITY;

    const additionalCount = (product.additionalSourceImages || []).length;
    const sourceCount = 1 + additionalCount;
    const sourceMode = sourceCount > 1 ? 'MULTI_VIEW' : 'SINGLE_IMAGE_GENERATED_3D';

    // Server-Authoritative Token Calculation (Never trust client-supplied cost)
    const nominalTokenCost = plans.calculateProduct3dTokenCost(qualityTier, sourceMode, sourceCount);
    const isQaBypass = Boolean(isDev || effectiveAccount.planCode === 'INTERNAL_FULL_ACCESS');

    // Internal QA Concurrency Guard (MAX_ACTIVE_PRODUCT_3D_QA_JOBS = 2)
    if (isQaBypass) {
      const activeQaJobs = db.countActiveProduct3dQaJobs(account.id);
      if (activeQaJobs >= 2) {
        return res.status(429).json({
          error: 'Maximum active QA 3D jobs limit (2) reached. Please wait for previous jobs to finish.',
          code: 'MAX_ACTIVE_QA_JOBS_EXCEEDED'
        });
      }
    }

    let commercialTokensToReserve = isQaBypass ? 0 : nominalTokenCost;

    if (!isQaBypass) {
      let ledger = db.getTokenLedger(account.id, { isTestAccount: false });
      if (!ledger) {
        await db.initTokenLedger(account.id, { initialTokens: 0, isTestAccount: false });
        ledger = db.getTokenLedger(account.id, { isTestAccount: false });
      }

      if (ledger.availableTokens < commercialTokensToReserve) {
        return res.status(402).json({
          error: \`Insufficient token balance. Available: \${ledger.availableTokens}, Required: \${commercialTokensToReserve}\`,
          code: 'INSUFFICIENT_TOKEN_BALANCE',
          available: ledger.availableTokens,
          required: commercialTokensToReserve,
          qualityTier,
          nominalTokenCost
        });
      }

      // Reserve tokens atomically
      await db.reserveTokens(account.id, commercialTokensToReserve, null, \`JOB_RESERVE_\${qualityTier}\`);
    }

    // Prompt mode metadata
    const promptMode = req.body.promptMode || plans.PRODUCT_3D_DEFAULT_PROMPT_MODE || 'USE_BOTH';
    const fullPromptVersion = plans.PRODUCT_3D_FULL_PROMPT_VERSION || 'v1';
    const negativePromptVersion = plans.PRODUCT_3D_NEGATIVE_PROMPT_VERSION || 'v1';

    // Create job record
    const job = await db.createProduct3dJob({
      promptMode,
      fullPromptVersion,
      negativePromptVersion,
      providerSupportsPositivePrompt: false,
      providerSupportsNegativePrompt: false,
      promptActuallySentToProvider: false,
      accountId: account.id,
      projectId,
      productSlotIndex: slotIndex,
      productId: product.id || \`prod-slot-\${slotIndex}\`,
      sourceImageUrl: product.imageUrl,
      qualityTier,
      sourceMode,
      nominalTokenCost,
      reservedTokens: commercialTokensToReserve,
      isQaBypass,
      isTest: isDev,
      environment: isDev ? 'INTERNAL_DEV' : 'PRODUCTION',
      isRegen: false,
      previousGlbUrl: product.product3d?.glbUrl || null
    });

    if (!isQaBypass && commercialTokensToReserve > 0) {
      await db.reserveTokens(account.id, 0, job.id, 'JOB_LINKED');
    }

    // 202 Accepted — fire off background job
    res.status(202).json({
      success: true,
      jobId: job.id,
      status: 'QUEUED',
      productSlotIndex: slotIndex,
      qualityTier,
      sourceMode,
      nominalTokenCost,
      commercialTokensReserved: commercialTokensToReserve,
      isQaBypass,
      message: \`Product 3D (\${qualityTier}) conversion queued.\`
    });

    // Run async (non-blocking)
    const serverBaseUrl = \`\${req.protocol}://\${req.get('host')}\`;
    setImmediate(() => {
      runProduct3dJob(job.id, db, UPLOADS_DIR, serverBaseUrl).catch(err =>
        console.error(\`[Product3D] runProduct3dJob uncaught: \${err.message}\`)
      );
    });

  } catch (err) {
    console.error('[Product3D] generate route error:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});`;

const replacementGenerateBlock = `// POST /api/projects/:id/products/:slot/3d/generate (C11.16-P3.15-R4 Canonical Repair)
app.post('/api/projects/:id/products/:slot/3d/generate', async (req, res) => {
  try {
    const token = extractAuthToken(req);
    const projectId = req.params.id;
    const slotIndex = parseInt(req.params.slot, 10);
    if (isNaN(slotIndex)) return res.status(400).json({ error: 'Invalid slot index' });

    const project = db.getProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!db.verifyEditAccess(project, token)) return res.status(403).json({ error: 'Cross-tenant access forbidden.' });

    const account = resolveAccountForProject(project, token);
    const isDev = db.isInternalDev(token, account);
    const isPilot = account.isPilot || account.billingState === 'PILOT_NOT_BILLED';
    const effectiveAccount = isDev
      ? { ...account, planCode: 'INTERNAL_FULL_ACCESS' }
      : (isPilot ? { ...account, planCode: account.entitlement || 'BUSINESS' } : account);

    // Entitlement gate
    const accessCheck = plans.checkProduct3dConversionAccess(effectiveAccount);
    if (!accessCheck.allowed && !isDev) {
      return res.status(403).json({
        error: accessCheck.message,
        code: accessCheck.code,
        requiredPlan: accessCheck.requiredPlan,
        feature: accessCheck.feature
      });
    }

    // Atomically ensure product exists in slot using canonical DB updater
    let product = db.getProduct(projectId, slotIndex);
    if (!product) {
      product = db.updateProduct(projectId, slotIndex, {
        name: req.body.name || \`Product Slot \${slotIndex}\`,
        imageUrl: req.body.imageUrl || null,
        productMediaMode: 'THREE_D'
      });
    } else if (req.body.imageUrl && !product.imageUrl) {
      product = db.updateProduct(projectId, slotIndex, {
        imageUrl: req.body.imageUrl
      });
    }

    if (!product.imageUrl) {
      return res.status(400).json({ error: 'Product has no source image. Upload a product image first.', code: 'NO_SOURCE_IMAGE' });
    }

    // Check for existing active job (Double-click / race guard)
    const existingJobs = db.listProduct3dJobs(projectId);
    const activeJob = existingJobs.find(j =>
      String(j.productSlotIndex) === String(slotIndex) &&
      ['QUEUED', 'PROCESSING', 'VALIDATING'].includes(j.status)
    );
    if (activeJob) {
      return res.status(409).json({ error: 'A 3D conversion job is already in progress for this product.', code: 'JOB_ALREADY_ACTIVE', jobId: activeJob.id, status: activeJob.status });
    }

    // Quality Tier & Source Mode
    const requestedQuality = String(req.body.qualityTier || plans.DEFAULT_BUSINESS_QUALITY).toUpperCase().trim();
    const qualityTier = ['STANDARD', 'HIGH', 'ULTRA'].includes(requestedQuality) ? requestedQuality : plans.DEFAULT_BUSINESS_QUALITY;

    const additionalCount = (product.additionalSourceImages || []).length;
    const sourceCount = 1 + additionalCount;
    const sourceMode = sourceCount > 1 ? 'MULTI_VIEW' : 'SINGLE_IMAGE_GENERATED_3D';

    // Server-Authoritative Token Calculation
    const nominalTokenCost = plans.calculateProduct3dTokenCost(qualityTier, sourceMode, sourceCount);
    const isQaBypass = Boolean(isDev || effectiveAccount.planCode === 'INTERNAL_FULL_ACCESS');

    // Internal QA Concurrency Guard (MAX_ACTIVE_PRODUCT_3D_QA_JOBS = 2)
    if (isQaBypass) {
      const activeQaJobs = db.countActiveProduct3dQaJobs(account.id);
      if (activeQaJobs >= 2) {
        return res.status(429).json({
          error: 'Maximum active QA 3D jobs limit (2) reached. Please wait for previous jobs to finish.',
          code: 'MAX_ACTIVE_QA_JOBS_EXCEEDED'
        });
      }
    }

    let commercialTokensToReserve = isQaBypass ? 0 : nominalTokenCost;

    if (!isQaBypass) {
      let ledger = db.getTokenLedger(account.id, { isTestAccount: false });
      if (!ledger) {
        await db.initTokenLedger(account.id, { initialTokens: 0, isTestAccount: false });
        ledger = db.getTokenLedger(account.id, { isTestAccount: false });
      }

      if (ledger.availableTokens < commercialTokensToReserve) {
        return res.status(402).json({
          error: \`Insufficient token balance. Available: \${ledger.availableTokens}, Required: \${commercialTokensToReserve}\`,
          code: 'INSUFFICIENT_TOKEN_BALANCE',
          available: ledger.availableTokens,
          required: commercialTokensToReserve,
          qualityTier,
          nominalTokenCost
        });
      }

      // Reserve tokens atomically
      await db.reserveTokens(account.id, commercialTokensToReserve, null, \`JOB_RESERVE_\${qualityTier}\`);
    }

    // Prompt mode metadata
    const promptMode = req.body.promptMode || plans.PRODUCT_3D_DEFAULT_PROMPT_MODE || 'USE_BOTH';
    const fullPromptVersion = plans.PRODUCT_3D_FULL_PROMPT_VERSION || 'v1';
    const negativePromptVersion = plans.PRODUCT_3D_NEGATIVE_PROMPT_VERSION || 'v1';

    // Create job record
    const job = await db.createProduct3dJob({
      promptMode,
      fullPromptVersion,
      negativePromptVersion,
      providerSupportsPositivePrompt: false,
      providerSupportsNegativePrompt: false,
      promptActuallySentToProvider: false,
      accountId: account.id,
      projectId,
      productSlotIndex: slotIndex,
      productId: product.id || \`prod-slot-\${slotIndex}\`,
      sourceImageUrl: product.imageUrl,
      qualityTier,
      sourceMode,
      nominalTokenCost,
      reservedTokens: commercialTokensToReserve,
      isQaBypass,
      isTest: isDev,
      environment: isDev ? 'INTERNAL_DEV' : 'PRODUCTION',
      isRegen: false,
      previousGlbUrl: product.product3d?.glbUrl || null
    });

    // Read-After-Write Verification (Section 6)
    const verifiedJob = db.getProduct3dJob(job.id);
    if (!verifiedJob || verifiedJob.status !== 'QUEUED') {
      throw new Error(\`Failed to persist and verify Product 3D job \${job.id}\`);
    }

    if (!isQaBypass && commercialTokensToReserve > 0) {
      await db.reserveTokens(account.id, 0, job.id, 'JOB_LINKED');
    }

    // 202 Accepted — fire off background job
    res.status(202).json({
      success: true,
      jobId: job.id,
      status: 'QUEUED',
      productSlotIndex: slotIndex,
      qualityTier,
      sourceMode,
      nominalTokenCost,
      commercialTokensReserved: commercialTokensToReserve,
      isQaBypass,
      message: \`Product 3D (\${qualityTier}) conversion queued.\`
    });

    // Run async (non-blocking)
    const serverBaseUrl = \`\${req.protocol}://\${req.get('host')}\`;
    setImmediate(() => {
      runProduct3dJob(job.id, db, UPLOADS_DIR, serverBaseUrl).catch(err =>
        console.error(\`[Product3D] runProduct3dJob uncaught: \${err.message}\`)
      );
    });

  } catch (err) {
    console.error('[Product3D] generate route error:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});`;

DIRS.forEach(dir => {
  const indexFile = path.join(ROOT, dir, 'server/index.js');
  let src = fs.readFileSync(indexFile, 'utf8');

  // 1. Replace targetGenerateBlock
  // Normalize CRLF to LF for matching
  const normSrc = src.replace(/\r\n/g, '\n');
  const normTarget = targetGenerateBlock.replace(/\r\n/g, '\n');
  const normReplacement = replacementGenerateBlock.replace(/\r\n/g, '\n');

  if (normSrc.includes(normTarget)) {
    src = normSrc.replace(normTarget, normReplacement);
    console.log(`[OK] Replaced generate block in ${dir}/server/index.js`);
  } else {
    console.error(`[FAIL] Could not match targetGenerateBlock in ${dir}/server/index.js`);
  }

  // 2. Fix line 7299: replace bare db.write()
  src = src.replace(
    /product\.additionalSourceImages\.push\(newSource\);\s*if \(!product\.imageUrl\) product\.imageUrl = finalUrl;\s*db\.write\(\);/,
    `product = db.updateProduct(projectId, slotIndex, (prod) => {\n      prod.additionalSourceImages = prod.additionalSourceImages || [];\n      prod.additionalSourceImages.push(newSource);\n      if (!prod.imageUrl) prod.imageUrl = finalUrl;\n    });`
  );

  // 3. Fix other db.memoryData.projects
  src = src.replace(/const project = db\.memoryData\.projects\?\.find\(p => p\.id === projectId\);/g, 'const project = db.getProject(projectId);');
  src = src.replace(/const project = \(db\.memoryData\.projects \|\| \[\]\)\.find\(p => p\.publicSlug === req\.params\.slug\);/g, 'const project = (db.read().projects || []).find(p => p.publicSlug === req.params.slug);');

  // 4. Update releaseId
  src = src.replace(/C11\.16-P3\.15-R3/g, 'C11.16-P3.15-R4');

  fs.writeFileSync(indexFile, src, 'utf8');
});

console.log('All index.js files successfully patched.');

const fs = require('fs');
const path = require('path');

const ROOT = 'e:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1';
const DIRS = ['_clean_deploy', '_railway_deploy', 'app_build'];

DIRS.forEach(dir => {
  const dbFile = path.join(ROOT, dir, 'server/db.js');
  const indexFile = path.join(ROOT, dir, 'server/index.js');
  const clientFile = path.join(ROOT, dir, 'client/index.html');

  // ─────────────────────────────────────────────────────────────
  // 1. PATCH server/db.js
  // ─────────────────────────────────────────────────────────────
  let dbSrc = fs.readFileSync(dbFile, 'utf8');

  // Guard write(data) against undefined data
  const oldWrite = `  write(data) {
    try {
      this.memoryData = data;
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(TEMP_DB_FILE, DB_FILE);
      return true;
    } catch (err) {
      console.error('Error writing database:', err);
      return false;
    }
  }`;

  const newWrite = `  write(data) {
    try {
      if (!data) {
        data = this.memoryData || this.read();
      }
      if (!data || typeof data !== 'object') {
        console.error('[DB] Refusing to write invalid/undefined data to database');
        return false;
      }
      this.memoryData = data;
      fs.writeFileSync(TEMP_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(TEMP_DB_FILE, DB_FILE);
      return true;
    } catch (err) {
      console.error('Error writing database:', err);
      return false;
    }
  }`;

  if (dbSrc.includes(oldWrite)) {
    dbSrc = dbSrc.replace(oldWrite, newWrite);
    console.log(`[OK] Patched write() in ${dir}/server/db.js`);
  }

  // Add canonical getProject, getProduct, updateProject, updateProduct if not present
  const CANONICAL_DB_METHODS = `  // ── Canonical Project & Product Access Layer (C11.16-P3.15-R4) ──
  getProject(projectId) {
    const data = this.read();
    return (data.projects || []).find(p => p.id === projectId) || null;
  }

  async getProjectById(projectId) {
    return this.getProject(projectId);
  }

  getProduct(projectId, slotOrId) {
    const project = this.getProject(projectId);
    if (!project || !project.products) return null;
    return project.products.find(p => String(p.slotIndex) === String(slotOrId) || p.id === String(slotOrId)) || null;
  }

  updateProject(projectId, updater) {
    return this.mutate((db) => {
      const project = (db.projects || []).find(p => p.id === projectId);
      if (!project) throw new Error(\`Project \${projectId} not found\`);
      if (typeof updater === 'function') {
        updater(project);
      } else if (typeof updater === 'object' && updater !== null) {
        Object.assign(project, updater);
      }
      project.updatedAt = new Date().toISOString();
      return project;
    });
  }

  updateProduct(projectId, slotIndex, updater) {
    return this.mutate((db) => {
      const project = (db.projects || []).find(p => p.id === projectId);
      if (!project) throw new Error(\`Project \${projectId} not found\`);
      project.products = project.products || [];
      let product = project.products.find(p => String(p.slotIndex) === String(slotIndex));
      if (!product) {
        product = {
          id: \`prod-slot-\${slotIndex}\`,
          slotIndex: Number(slotIndex),
          name: \`Product Slot \${slotIndex}\`,
          createdAt: new Date().toISOString()
        };
        project.products.push(product);
      }
      if (typeof updater === 'function') {
        updater(product);
      } else if (typeof updater === 'object' && updater !== null) {
        Object.assign(product, updater);
      }
      product.updatedAt = new Date().toISOString();
      project.updatedAt = new Date().toISOString();
      return product;
    });
  }
`;

  if (!dbSrc.includes('// ── Canonical Project & Product Access Layer (C11.16-P3.15-R4) ──')) {
    dbSrc = dbSrc.replace('  mutate(callback) {', CANONICAL_DB_METHODS + '\n  mutate(callback) {');
    console.log(`[OK] Added canonical DB methods to ${dir}/server/db.js`);
  }

  // Update getProjectById, countActiveProduct3dQaJobs, listProduct3dJobs, getProduct3dJob to use this.read()
  dbSrc = dbSrc.replace(
    /async getProjectById\(projectId\) \{\s*const data = this\.memoryData;\s*return \(data\.projects \|\| \[\]\)\.find\(p => p\.id === projectId\) \|\| null;\s*\}/,
    `async getProjectById(projectId) {\n    return this.getProject(projectId);\n  }`
  );

  dbSrc = dbSrc.replace(
    'countActiveProduct3dQaJobs(accountId) {\n    const data = this.memoryData;',
    'countActiveProduct3dQaJobs(accountId) {\n    const data = this.read();'
  );

  dbSrc = dbSrc.replace(
    'listProduct3dJobs(projectId, { limit = 20 } = {}) {\n    const data = this.memoryData;',
    'listProduct3dJobs(projectId, { limit = 20 } = {}) {\n    const data = this.read();'
  );

  dbSrc = dbSrc.replace(
    'getProduct3dJob(jobId) {\n    const data = this.memoryData;',
    'getProduct3dJob(jobId) {\n    const data = this.read();'
  );

  fs.writeFileSync(dbFile, dbSrc, 'utf8');

  // ─────────────────────────────────────────────────────────────
  // 2. PATCH server/index.js
  // ─────────────────────────────────────────────────────────────
  let indexSrc = fs.readFileSync(indexFile, 'utf8');

  // Replace bare db.write() at line 7299 with canonical db.updateProduct
  const oldAdditionalWrite = `    product.additionalSourceImages.push(newSource);
    if (!product.imageUrl) product.imageUrl = finalUrl;
    db.write();`;

  const newAdditionalWrite = `    product = db.updateProduct(projectId, slotIndex, (prod) => {
      prod.additionalSourceImages = prod.additionalSourceImages || [];
      prod.additionalSourceImages.push(newSource);
      if (!prod.imageUrl) prod.imageUrl = finalUrl;
    });`;

  if (indexSrc.includes(oldAdditionalWrite)) {
    indexSrc = indexSrc.replace(oldAdditionalWrite, newAdditionalWrite);
  }

  // Replace /3d/generate route implementation with robust atomic persistence
  const oldGenerateRouteRegex = /\/\/ POST \/api\/projects\/:id\/products\/:slot\/3d\/generate\s*app\.post\('\/api\/projects\/:id\/products\/:slot\/3d\/generate'[\s\S]*?res\.status\(500\)\.json\(\{ error: err\.message \}\);\s*\}\s*\}\);/;

  const newGenerateRoute = `// POST /api/projects/:id/products/:slot/3d/generate (C11.16-P3.15-R4 Canonical Repair)
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
    res.status(500).json({ error: err.message });
  }
});`;

  if (oldGenerateRouteRegex.test(indexSrc)) {
    indexSrc = indexSrc.replace(oldGenerateRouteRegex, newGenerateRoute);
    console.log(`[OK] Replaced /3d/generate route in ${dir}/server/index.js`);
  }

  // Replace direct db.memoryData.projects in other routes in server/index.js
  indexSrc = indexSrc.replace(/const project = db\.memoryData\.projects\?\.find\(p => p\.id === projectId\);/g, 'const project = db.getProject(projectId);');
  indexSrc = indexSrc.replace(/const project = \(db\.memoryData\.projects \|\| \[\]\)\.find\(p => p\.publicSlug === req\.params\.slug\);/g, 'const project = (db.read().projects || []).find(p => p.publicSlug === req.params.slug);');

  // Update releaseId
  indexSrc = indexSrc.replace(/C11\.16-P3\.15-R3/g, 'C11.16-P3.15-R4');

  fs.writeFileSync(indexFile, indexSrc, 'utf8');

  // ─────────────────────────────────────────────────────────────
  // 3. PATCH client/index.html
  // ─────────────────────────────────────────────────────────────
  let clientSrc = fs.readFileSync(clientFile, 'utf8');

  // Update _p3dExecuteGenerate in client
  const oldClientExecute = `  } catch (e) {
    alert('Request failed: ' + e.message);
    renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
  } finally {
    // ALWAYS release submission lock after HTTP request acknowledgment (Sec. 22 & 40)
    window._p3dState.isSubmitting = false;
    unlockUnderlyingModal();
  }`;

  const newClientExecute = `  } catch (e) {
    alert('Conversion Error: ' + e.message);
    renderProduct3dSection(slot, window.activeProjectData?.products?.find(p => String(p.slotIndex) === String(slot)));
  } finally {
    // ALWAYS release submission lock after HTTP request acknowledgment (Sec. 9, 22, 40)
    window._p3dState.isSubmitting = false;
    unlockUnderlyingModal();
    if (typeof renderProduct3dSourceState === 'function') {
      renderProduct3dSourceState();
    }
  }`;

  if (clientSrc.includes(oldClientExecute)) {
    clientSrc = clientSrc.replace(oldClientExecute, newClientExecute);
    console.log(`[OK] Patched _p3dExecuteGenerate error handling in ${dir}/client/index.html`);
  }

  clientSrc = clientSrc.replace(/C11\.16-P3\.15-R3/g, 'C11.16-P3.15-R4');
  fs.writeFileSync(clientFile, clientSrc, 'utf8');
});

console.log('All files patched for C11.16-P3.15-R4.');

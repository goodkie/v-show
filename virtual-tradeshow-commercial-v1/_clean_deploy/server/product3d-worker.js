'use strict';
/**
 * ============================================================
 * ³D₂ / 3DZ — PRODUCT 3D CONVERSION WORKER (C11.16-P3.7)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createHash } = require('crypto');

const PRODUCT_3D_SINGLE_IMAGE_TOKEN_COST = parseInt(
  process.env.PRODUCT_3D_SINGLE_IMAGE_TOKEN_COST || '1', 10
);
const PRODUCT_3D_REGEN_TOKEN_COST = parseInt(
  process.env.PRODUCT_3D_REGEN_TOKEN_COST || '1', 10
);

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || null;
const FAL_KEY             = process.env.FAL_KEY || null;
const MAX_IMAGE_BYTES     = 25 * 1024 * 1024;

// ─── Abstract base ────────────────────────────────────────────────────────────
class Product3DProvider {
  get name() { return 'abstract'; }
  get version() { return '0'; }
  async generate(opts) { throw new Error('generate() must be implemented'); }
  async isAvailable() { return false; }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const lib = (options.hostname === 'localhost' || options.port === 80) ? http : https;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Replicate Provider ───────────────────────────────────────────────────────
class ReplicateProvider extends Product3DProvider {
  get name() { return 'replicate'; }
  get version() { return 'trellis-v1'; }
  async isAvailable() { return !!REPLICATE_API_TOKEN; }

  async generate({ imageUrl, outputDir, jobId }) {
    if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not configured');

    const createRes = await httpRequest({
      hostname: 'api.replicate.com',
      path: '/v1/models/firtoz/trellis/predictions',
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' }
    }, JSON.stringify({
      input: { image: imageUrl, seed: 42, render_video: false, mesh_simplify: 0.95, texture_size: 2048 }
    }));

    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Replicate create failed (${createRes.status}): ${JSON.stringify(createRes.body)}`);
    }

    let pred = createRes.body;
    const predId = pred.id;

    // Poll if not immediate
    for (let i = 0; i < 120 && (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled'); i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await httpRequest({
        hostname: 'api.replicate.com',
        path: `/v1/predictions/${predId}`,
        method: 'GET',
        headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` }
      });
      pred = pollRes.body;
    }

    if (pred.status !== 'succeeded') throw new Error(`Replicate job ${predId} ${pred.status}: ${pred.error || 'timeout'}`);

    const output = pred.output || {};
    const glbUrl = output.model_file || (Array.isArray(pred.output) ? pred.output[0] : null);
    if (!glbUrl) throw new Error('Replicate result missing model_file');

    const glbPath = path.join(outputDir, `${jobId}.glb`);
    await downloadFile(glbUrl, glbPath);

    let previewImagePath;
    if (output.preview_image) {
      previewImagePath = path.join(outputDir, `${jobId}_preview.png`);
      await downloadFile(output.preview_image, previewImagePath).catch(() => { previewImagePath = null; });
    }

    return { glbPath, previewImagePath, meshStats: { bytes: fs.statSync(glbPath).size } };
  }
}

// ─── Fal.ai Provider ─────────────────────────────────────────────────────────
class FalProvider extends Product3DProvider {
  get name() { return 'fal'; }
  get version() { return 'stable-fast-3d-v1'; }
  async isAvailable() { return !!FAL_KEY; }

  async generate({ imageUrl, outputDir, jobId }) {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');

    const submitRes = await httpRequest({
      hostname: 'queue.fal.run',
      path: '/fal-ai/stable-fast-3d',
      method: 'POST',
      headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' }
    }, JSON.stringify({ image_url: imageUrl, texture_resolution: '2048', foreground_ratio: 0.85, remesh: 'none' }));

    if (submitRes.status !== 200 && submitRes.status !== 202) {
      throw new Error(`Fal submit failed (${submitRes.status}): ${JSON.stringify(submitRes.body)}`);
    }
    const requestId = submitRes.body.request_id;

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const s = await httpRequest({
        hostname: 'queue.fal.run', path: `/fal-ai/stable-fast-3d/requests/${requestId}/status`,
        method: 'GET', headers: { 'Authorization': `Key ${FAL_KEY}` }
      });
      if (s.body.status === 'COMPLETED') break;
      if (s.body.status === 'FAILED') throw new Error(`Fal job failed: ${s.body.error}`);
    }

    const res = await httpRequest({
      hostname: 'queue.fal.run', path: `/fal-ai/stable-fast-3d/requests/${requestId}`,
      method: 'GET', headers: { 'Authorization': `Key ${FAL_KEY}` }
    });
    const glbUrl = res.body.model_mesh?.url || res.body.glb_url;
    if (!glbUrl) throw new Error('Fal result missing glb url');

    const glbPath = path.join(outputDir, `${jobId}.glb`);
    await downloadFile(glbUrl, glbPath);

    let previewImagePath;
    if (res.body.preview_image?.url) {
      previewImagePath = path.join(outputDir, `${jobId}_preview.png`);
      await downloadFile(res.body.preview_image.url, previewImagePath).catch(() => { previewImagePath = null; });
    }
    return { glbPath, previewImagePath, meshStats: { bytes: fs.statSync(glbPath).size } };
  }
}

// ─── Local Stub Provider ──────────────────────────────────────────────────────
class LocalStubProvider extends Product3DProvider {
  get name() { return 'local_stub'; }
  get version() { return 'stub-v1'; }
  async isAvailable() { return true; }

  async generate({ outputDir, jobId }) {
    await new Promise(r => setTimeout(r, 2000));
    const glbPath = path.join(outputDir, `${jobId}.glb`);
    const json = JSON.stringify({ asset: { version: '2.0', generator: 'LocalStub' }, scene: 0, scenes: [{ nodes: [] }] });
    const jsonPadded = json.padEnd(Math.ceil(json.length / 4) * 4, ' ');
    const jsonBuf = Buffer.from(jsonPadded, 'utf8');
    const totalLength = 12 + 8 + jsonBuf.length;
    const glbBuf = Buffer.alloc(totalLength);
    glbBuf.writeUInt32LE(0x46546C67, 0);
    glbBuf.writeUInt32LE(2, 4);
    glbBuf.writeUInt32LE(totalLength, 8);
    glbBuf.writeUInt32LE(jsonBuf.length, 12);
    glbBuf.writeUInt32LE(0x4E4F534A, 16);
    jsonBuf.copy(glbBuf, 20);
    fs.writeFileSync(glbPath, glbBuf);
    return { glbPath, previewImagePath: null, meshStats: { bytes: glbBuf.length }, isStub: true };
  }
}

// ─── Provider factory ─────────────────────────────────────────────────────────
function getProvider() {
  if (REPLICATE_API_TOKEN) return new ReplicateProvider();
  if (FAL_KEY) return new FalProvider();
  return new LocalStubProvider();
}

// ─── Utility: download file ───────────────────────────────────────────────────
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.destroy(); fs.unlink(destPath, () => {});
        return resolve(downloadFile(res.headers.location, destPath));
      }
      if (res.statusCode !== 200) {
        file.destroy(); return reject(new Error(`Download failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
  });
}

// ─── Image Quality Gate ───────────────────────────────────────────────────────
async function checkImageQuality(imagePath) {
  const warnings = [], errors = [];
  if (!imagePath || !fs.existsSync(imagePath)) {
    errors.push('SOURCE_IMAGE_NOT_FOUND');
    return { pass: false, warnings, errors };
  }
  const stat = fs.statSync(imagePath);
  if (stat.size < 10 * 1024) errors.push('SOURCE_IMAGE_TOO_SMALL');
  if (stat.size > MAX_IMAGE_BYTES) warnings.push(`SOURCE_IMAGE_LARGE:${Math.round(stat.size/1024/1024)}MB`);

  const header = Buffer.alloc(12);
  const fd = fs.openSync(imagePath, 'r');
  fs.readSync(fd, header, 0, 12, 0);
  fs.closeSync(fd);
  const sig = header.toString('hex', 0, 4);
  const isJpeg = sig.startsWith('ffd8');
  const isPng  = sig === '89504e47';
  const isWebp = header.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) errors.push('UNSUPPORTED_FORMAT');

  return { pass: errors.length === 0, warnings, errors, bytes: stat.size };
}

// ─── GLB Validation ───────────────────────────────────────────────────────────
function validateGlb(glbPath) {
  try {
    if (!fs.existsSync(glbPath)) return { valid: false, error: 'GLB_FILE_NOT_FOUND' };
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(glbPath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    const length = buf.readUInt32LE(8);
    if (magic !== 0x46546C67) return { valid: false, error: 'GLB_INVALID_MAGIC' };
    if (version !== 2) return { valid: false, error: 'GLB_UNSUPPORTED_VERSION' };
    const stat = fs.statSync(glbPath);
    if (stat.size !== length) return { valid: false, error: 'GLB_LENGTH_MISMATCH' };
    return { valid: true, bytes: stat.size };
  } catch (e) {
    return { valid: false, error: `GLB_PARSE_ERROR: ${e.message}` };
  }
}

function sha256OfFile(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// ─── Main Job Runner ──────────────────────────────────────────────────────────
async function runProduct3dJob(jobId, db, uploadsDir, serverBaseUrl) {
  console.log(`[Product3D] Starting job ${jobId}`);
  let job;
  try {
    job = await db.getProduct3dJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
  } catch (err) {
    console.error(`[Product3D] Job load failed: ${err.message}`);
    return;
  }

  const { projectId, productSlotIndex, accountId } = job;
  const updateJob = (patch) =>
    db.updateProduct3dJob(jobId, patch).catch(e => console.error(`[Product3D] updateJob: ${e.message}`));

  try {
    await updateJob({ status: 'PROCESSING', startedAt: new Date().toISOString() });

    const project = await db.getProjectById(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const product = (project.products || []).find(p =>
      String(p.slotIndex) === String(productSlotIndex)
    );
    if (!product) throw new Error(`Product slot ${productSlotIndex} not found`);
    if (!product.imageUrl) throw new Error('Product has no source image');

    const relImagePath = product.imageUrl.replace(/^\/+/, '');
    const imagePath    = path.join(uploadsDir, '..', relImagePath);
    const publicImageUrl = `${serverBaseUrl}${product.imageUrl}`;

    // Image quality gate
    await updateJob({ status: 'VALIDATING', validationStep: 'IMAGE_QUALITY' });
    const quality = await checkImageQuality(imagePath);
    if (!quality.pass) {
      await updateJob({ status: 'FAILED', error: quality.errors.join('; '), completedAt: new Date().toISOString() });
      await db.releaseTokens(accountId, job.reservedTokens, jobId, 'QUALITY_GATE_FAIL');
      return;
    }

    const outputDir = path.join(uploadsDir, 'product3d', projectId, String(productSlotIndex));
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    await updateJob({ status: 'PROCESSING', validationStep: null });
    const provider = getProvider();
    console.log(`[Product3D] Provider: ${provider.name} v${provider.version}`);
    await updateJob({ provider: provider.name, generatorVersion: provider.version });

    const genResult = await provider.generate({ imageUrl: publicImageUrl, outputDir, jobId });

    // Validate GLB
    await updateJob({ status: 'VALIDATING', validationStep: 'GLB_STRUCTURE' });
    const glbValidation = validateGlb(genResult.glbPath);
    if (!glbValidation.valid) {
      await updateJob({ status: 'FAILED', error: glbValidation.error, completedAt: new Date().toISOString() });
      await db.releaseTokens(accountId, job.reservedTokens, jobId, 'GLB_VALIDATION_FAIL');
      return;
    }

    const glbPublicPath = `/uploads/product3d/${projectId}/${productSlotIndex}/${jobId}.glb`;
    let previewPublicPath = null;
    if (genResult.previewImagePath && fs.existsSync(genResult.previewImagePath)) {
      previewPublicPath = `/uploads/product3d/${projectId}/${productSlotIndex}/${jobId}_preview.png`;
    }
    const glbSha256 = sha256OfFile(genResult.glbPath);
    const finalStatus = genResult.isStub ? 'NEEDS_REVIEW' : 'READY';

    // Consume tokens (FAILED_JOB_TOKEN_LOSS=0 — only consume on success)
    await db.consumeTokens(accountId, job.reservedTokens, jobId, 'JOB_COMPLETED');

    // Update product.product3d
    await db.setProduct3d(projectId, productSlotIndex, {
      status: finalStatus,
      glbUrl: glbPublicPath,
      previewImageUrl: previewPublicPath,
      sourceImageSha256: product.imageMeta?.sha256 || null,
      sourceMode: 'SINGLE_IMAGE_GENERATED_3D',
      generatedAt: new Date().toISOString(),
      generator: provider.name,
      generatorVersion: provider.version,
      tokenCost: job.reservedTokens,
      assetId: jobId,
      meshStats: genResult.meshStats || {},
      glbSha256,
      validation: { glb: glbValidation, quality }
    });

    await updateJob({
      status: finalStatus,
      completedAt: new Date().toISOString(),
      resultGlbUrl: glbPublicPath,
      resultPreviewUrl: previewPublicPath,
      glbSha256,
      meshStats: genResult.meshStats
    });

    console.log(`[Product3D] Job ${jobId} → ${finalStatus}`);

  } catch (err) {
    console.error(`[Product3D] Job ${jobId} failed: ${err.message}`);
    try {
      await updateJob({ status: 'FAILED', error: err.message, completedAt: new Date().toISOString() });
      if (job?.reservedTokens > 0) {
        await db.releaseTokens(accountId, job.reservedTokens, jobId, 'JOB_EXCEPTION');
      }
    } catch (inner) {
      console.error(`[Product3D] Cleanup error: ${inner.message}`);
    }
  }
}

module.exports = {
  Product3DProvider, ReplicateProvider, FalProvider, LocalStubProvider,
  getProvider, runProduct3dJob, checkImageQuality, validateGlb,
  PRODUCT_3D_SINGLE_IMAGE_TOKEN_COST, PRODUCT_3D_REGEN_TOKEN_COST
};

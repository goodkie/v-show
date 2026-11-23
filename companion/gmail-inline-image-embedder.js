'use strict';
/**
 * XPIDER V7.1 RC11 — Gmail Native Inline CID Image Embedder (RFC 2387 multipart/related).
 *
 * Why this lowers spam score on Gmail:
 * - Native Gmail Web emails embed pasted/inserted images as `multipart/related` inline MIME parts
 *   referenced via `<img src="cid:ii_...">`, rather than linking external third-party image hosts
 *   such as `raw.githubusercontent.com` (which adds a mismatched domain and triggers phishing/spam heuristics).
 * - Preserves all surrounding `<a href="...">` clickable link wrappers 100% intact.
 *
 * Security & Fail-Closed Guardrails:
 * - Reuses audited SSRF protection (`assertPublicHttpsTarget` — blocks private/loopback IPs & internal hosts)
 *   and real magic-byte verification (`detectImageSignature` — PNG/JPEG/GIF/WebP only; blocks SVG/HTML/script).
 * - Hard size caps: <= 1.5 MB per image, <= 2.5 MB total inline payload, max 4 inline images per email.
 * - Safe fallback: if a remote image fails to fetch/validate, leaves the original HTTPS `src` untouched
 *   and reports failure reason cleanly without crashing the send.
 */
const crypto = require('node:crypto');
const { assertPublicHttpsTarget, detectImageSignature } = require('./email-image-host');

const MAX_INLINE_IMAGE_BYTES = 1536 * 1024; // 1.5 MB per image
const MAX_TOTAL_INLINE_BYTES = 2560 * 1024; // 2.5 MB total inline images
const MAX_INLINE_IMAGES = 4;
const ALLOWED_INLINE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const HIGH_RISK_EXTERNAL_IMAGE_HOSTS = new Set([
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'user-images.githubusercontent.com',
  'i.imgur.com',
  'imgur.com'
]);

function isHighRiskImageHost(hostname) {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h) return false;
  if (HIGH_RISK_EXTERNAL_IMAGE_HOSTS.has(h)) return true;
  return h.endsWith('.githubusercontent.com');
}

function sanitizeImageFilename(rawUrl, ext, index) {
  try {
    const u = new URL(String(rawUrl || ''));
    const base = u.pathname.split('/').filter(Boolean).pop() || '';
    const clean = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 48);
    if (clean && /\.(png|jpe?g|gif|webp)$/i.test(clean)) return clean;
  } catch (_) {}
  return `image_${index + 1}.${ext || 'jpg'}`;
}

async function fetchPublicImageBytes(urlStr, { fetchImpl = null, trustedTestMode = false, timeoutMs = 8000 } = {}) {
  let parsed;
  try {
    parsed = new URL(String(urlStr || '').trim());
  } catch (_) {
    return { ok: false, reason: 'INVALID_IMAGE_URL' };
  }
  const ssrf = await assertPublicHttpsTarget(parsed, trustedTestMode);
  if (!ssrf.ok) {
    return { ok: false, reason: ssrf.reason || 'SSRF_BLOCKED' };
  }
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return { ok: false, reason: 'FETCH_UNAVAILABLE' };
  }
  try {
    const resp = await doFetch(parsed.href, {
      method: 'GET',
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif,*/*;q=0.5' },
      ...(doFetch === globalThis.fetch && typeof AbortSignal?.timeout === 'function'
        ? { signal: AbortSignal.timeout(Math.max(1500, Number(timeoutMs) || 8000)) }
        : {})
    });
    if (!resp || !resp.ok) {
      return { ok: false, reason: `IMAGE_HTTP_${resp ? resp.status : 'ERROR'}` };
    }
    let buf;
    if (typeof resp.arrayBuffer === 'function') {
      buf = Buffer.from(await resp.arrayBuffer());
    } else if (typeof resp.buffer === 'function') {
      buf = await resp.buffer();
    } else {
      return { ok: false, reason: 'IMAGE_BODY_UNREADABLE' };
    }
    if (!buf || buf.length === 0 || buf.length > MAX_INLINE_IMAGE_BYTES) {
      return { ok: false, reason: buf && buf.length > MAX_INLINE_IMAGE_BYTES ? 'IMAGE_TOO_LARGE_FOR_CID' : 'EMPTY_IMAGE' };
    }
    const sig = detectImageSignature(buf);
    if (!sig || !ALLOWED_INLINE_MIMES.has(sig.mimeType)) {
      return { ok: false, reason: 'INVALID_IMAGE_SIGNATURE' };
    }
    return {
      ok: true,
      buf,
      mimeType: sig.mimeType,
      ext: sig.ext,
      width: sig.width,
      height: sig.height,
      host: parsed.hostname.toLowerCase()
    };
  } catch (err) {
    return { ok: false, reason: 'IMAGE_FETCH_ERROR', detail: err && err.message ? err.message : '' };
  }
}

function decodeSafeInlineDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!m) return { ok: false, reason: 'INVALID_DATA_URL' };
  const buf = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
  if (!buf || buf.length === 0 || buf.length > MAX_INLINE_IMAGE_BYTES) {
    return { ok: false, reason: buf && buf.length > MAX_INLINE_IMAGE_BYTES ? 'IMAGE_TOO_LARGE_FOR_CID' : 'EMPTY_IMAGE' };
  }
  const sig = detectImageSignature(buf);
  if (!sig || !ALLOWED_INLINE_MIMES.has(sig.mimeType)) {
    return { ok: false, reason: 'INVALID_IMAGE_SIGNATURE' };
  }
  return {
    ok: true,
    buf,
    mimeType: sig.mimeType,
    ext: sig.ext,
    width: sig.width,
    height: sig.height,
    host: 'inline-data-url'
  };
}

/**
 * Resolves external HTTPS (or safe base64 data:) `<img src="...">` tags in HTML
 * into RFC 2387 `multipart/related` CID inline attachments (`<img src="cid:ii_...">`),
 * preserving every surrounding `<a href="...">` clickable wrapper untouched.
 */
async function embedHtmlImagesAsCid(html, {
  fetchImpl = null,
  trustedTestMode = false,
  cache = null,
  maxImages = MAX_INLINE_IMAGES,
  maxTotalBytes = MAX_TOTAL_INLINE_BYTES,
  timeoutMs = 8000
} = {}) {
  const srcHtml = String(html || '');
  if (!srcHtml || !/<img\b/i.test(srcHtml)) {
    return {
      html: srcHtml,
      inlineImages: [],
      embeddedCount: 0,
      replacedHosts: [],
      failedCount: 0,
      failedReasons: [],
      totalInlineBytes: 0
    };
  }

  const imgSrcRe = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi;
  const matches = [];
  let m;
  while ((m = imgSrcRe.exec(srcHtml)) !== null) {
    matches.push({ full: m[0], prefix: m[1], quote: m[2], srcRaw: m[3] });
  }
  if (matches.length === 0) {
    return {
      html: srcHtml,
      inlineImages: [],
      embeddedCount: 0,
      replacedHosts: [],
      failedCount: 0,
      failedReasons: [],
      totalInlineBytes: 0
    };
  }

  const resolvedMap = new Map(); // decodedSrc -> { cid, contentType, dataBase64, filename, sizeBytes, host }
  const inlineImages = [];
  const replacedHosts = new Set();
  const failedReasons = [];
  let totalBytes = 0;
  let failedCount = 0;

  for (const item of matches) {
    const decodedSrc = item.srcRaw.replace(/&amp;/g, '&').trim();
    if (!decodedSrc || /^cid:/i.test(decodedSrc)) continue;
    if (resolvedMap.has(decodedSrc)) continue;
    if (inlineImages.length >= Math.min(MAX_INLINE_IMAGES, Number(maxImages) || MAX_INLINE_IMAGES)) {
      failedReasons.push('MAX_INLINE_IMAGES_REACHED');
      continue;
    }

    let fetched = null;
    if (cache && cache.has(decodedSrc)) {
      fetched = cache.get(decodedSrc);
    } else if (/^data:image\//i.test(decodedSrc)) {
      fetched = decodeSafeInlineDataUrl(decodedSrc);
    } else if (/^https:\/\//i.test(decodedSrc)) {
      fetched = await fetchPublicImageBytes(decodedSrc, { fetchImpl, trustedTestMode, timeoutMs });
      if (cache && fetched && fetched.ok) {
        cache.set(decodedSrc, fetched);
      }
    } else {
      continue;
    }

    if (!fetched || !fetched.ok) {
      failedCount++;
      if (fetched && fetched.reason) failedReasons.push(fetched.reason);
      continue;
    }

    if (totalBytes + fetched.buf.length > Math.min(MAX_TOTAL_INLINE_BYTES, Number(maxTotalBytes) || MAX_TOTAL_INLINE_BYTES)) {
      failedCount++;
      failedReasons.push('MAX_TOTAL_INLINE_BYTES_EXCEEDED');
      continue;
    }

    const digest = crypto.createHash('sha256').update(fetched.buf).digest('hex').slice(0, 14);
    const cid = `ii_${digest}`;
    const filename = sanitizeImageFilename(decodedSrc, fetched.ext, inlineImages.length);
    const rec = {
      cid,
      contentType: fetched.mimeType,
      dataBase64: fetched.buf.toString('base64'),
      filename,
      sizeBytes: fetched.buf.length,
      host: fetched.host
    };
    resolvedMap.set(decodedSrc, rec);
    inlineImages.push({
      cid: rec.cid,
      contentType: rec.contentType,
      dataBase64: rec.dataBase64,
      filename: rec.filename
    });
    totalBytes += fetched.buf.length;
    if (fetched.host) replacedHosts.add(fetched.host);
  }

  if (inlineImages.length === 0) {
    return {
      html: srcHtml,
      inlineImages: [],
      embeddedCount: 0,
      replacedHosts: [],
      failedCount,
      failedReasons,
      totalInlineBytes: 0
    };
  }

  const outHtml = srcHtml.replace(imgSrcRe, (full, prefix, quote, srcRaw) => {
    const decodedSrc = srcRaw.replace(/&amp;/g, '&').trim();
    const rec = resolvedMap.get(decodedSrc);
    if (!rec) return full;
    return `${prefix}${quote}cid:${rec.cid}${quote}`;
  });

  return {
    html: outHtml,
    inlineImages,
    embeddedCount: inlineImages.length,
    replacedHosts: Array.from(replacedHosts),
    failedCount,
    failedReasons,
    totalInlineBytes: totalBytes
  };
}

module.exports = {
  embedHtmlImagesAsCid,
  fetchPublicImageBytes,
  decodeSafeInlineDataUrl,
  isHighRiskImageHost,
  MAX_INLINE_IMAGE_BYTES,
  MAX_TOTAL_INLINE_BYTES,
  MAX_INLINE_IMAGES
};

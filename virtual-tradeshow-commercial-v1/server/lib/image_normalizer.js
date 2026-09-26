'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Safe imports with vendored fallbacks
let jpeg;
try { jpeg = require('./jpeg-js'); } catch (e) { jpeg = require('jpeg-js'); }

let PNG;
try { PNG = require('./pngjs').PNG; } catch (e) { PNG = require('pngjs').PNG; }

let webpDecoder;
try { webpDecoder = require('./cwasm-webp'); } catch (e) {
  try { webpDecoder = require('@cwasm/webp'); } catch (e2) { webpDecoder = null; }
}

/**
 * Section 17: Inspect image buffer magic bytes and structure.
 * Returns { valid, detectedFormat, mime, width, height, magic, reason }
 */
function inspectImageBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 8) {
    return {
      valid: false,
      detectedFormat: 'UNKNOWN',
      mime: 'application/octet-stream',
      width: null,
      height: null,
      magic: buffer && Buffer.isBuffer(buffer) ? buffer.subarray(0, Math.min(8, buffer.length)).toString('hex').toUpperCase() : '',
      reason: 'BUFFER_TOO_SHORT_OR_INVALID'
    };
  }

  const hex = buffer.subarray(0, 16).toString('hex').toUpperCase();
  const ascii16 = buffer.subarray(0, 16).toString('latin1');

  // Check for HTML response masquerading as image
  if (ascii16.startsWith('<!DOCTYPE') || ascii16.toLowerCase().includes('<html') || ascii16.startsWith('<?xml')) {
    return {
      valid: false,
      detectedFormat: 'HTML',
      mime: 'text/html',
      width: null,
      height: null,
      magic: hex.substring(0, 16),
      reason: 'SOURCE_FETCH_RETURNED_HTML'
    };
  }

  // Check for JSON response masquerading as image
  const trimmedAscii = ascii16.trim();
  if (trimmedAscii.startsWith('{') || trimmedAscii.startsWith('[')) {
    return {
      valid: false,
      detectedFormat: 'JSON',
      mime: 'application/json',
      width: null,
      height: null,
      magic: hex.substring(0, 16),
      reason: 'SOURCE_FETCH_RETURNED_JSON'
    };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return {
      valid: true,
      detectedFormat: 'JPEG',
      mime: 'image/jpeg',
      width: null,
      height: null,
      magic: hex.substring(0, 6),
      reason: null
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    return {
      valid: true,
      detectedFormat: 'PNG',
      mime: 'image/png',
      width: null,
      height: null,
      magic: hex.substring(0, 16),
      reason: null
    };
  }

  // WebP: RIFF .... WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return {
      valid: true,
      detectedFormat: 'WEBP',
      mime: 'image/webp',
      width: null,
      height: null,
      magic: hex.substring(0, 24),
      reason: null
    };
  }

  // AVIF / HEIC (ISO Base Media File Format: bytes 4-7 = "ftyp")
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('avif') || brand.includes('avis')) {
      return {
        valid: true,
        detectedFormat: 'AVIF',
        mime: 'image/avif',
        width: null,
        height: null,
        magic: hex.substring(0, 24),
        reason: null
      };
    }
    if (brand.includes('heic') || brand.includes('heix') || brand.includes('mif1')) {
      return {
        valid: true,
        detectedFormat: 'HEIC',
        mime: 'image/heic',
        width: null,
        height: null,
        magic: hex.substring(0, 24),
        reason: null
      };
    }
  }

  return {
    valid: false,
    detectedFormat: 'UNKNOWN',
    mime: 'application/octet-stream',
    width: null,
    height: null,
    magic: hex.substring(0, 16),
    reason: 'UNRECOGNIZED_MAGIC_BYTES'
  };
}

/**
 * Section 12 & 18: Multi-format decoder routing.
 * Decodes raw binary image buffer into canonical RGBA pixel buffer.
 * Returns { width, height, data, detectedFormat, originalBytes }
 */
function decodeImageToPixels(buffer, detectedFormat) {
  if (detectedFormat === 'JPEG') {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
      detectedFormat: 'JPEG',
      originalBytes: buffer.length
    };
  }

  if (detectedFormat === 'PNG') {
    if (!PNG) throw new Error('PNG decoder (pngjs) not available.');
    const parsed = PNG.sync.read(buffer);
    return {
      width: parsed.width,
      height: parsed.height,
      data: parsed.data,
      detectedFormat: 'PNG',
      originalBytes: buffer.length
    };
  }

  if (detectedFormat === 'WEBP') {
    if (!webpDecoder || typeof webpDecoder.decode !== 'function') {
      throw new Error('WebP decoder (cwasm-webp) not available.');
    }
    const parsed = webpDecoder.decode(buffer);
    return {
      width: parsed.width,
      height: parsed.height,
      data: parsed.data,
      detectedFormat: 'WEBP',
      originalBytes: buffer.length
    };
  }

  throw new Error(`UNSUPPORTED_IMAGE_FORMAT: Decoder not available for format ${detectedFormat}`);
}

/**
 * Section 18: Reusable Canonical Normalization Gateway.
 * Accepts: file path, Buffer, data URL string, or remote HTTP(S) URL.
 * Returns: {
 *   success: true,
 *   rawBuffer,
 *   pixels: { width, height, data },
 *   inspection: { valid, detectedFormat, mime, magic },
 *   workingJpegBuffer, // Lossless/high-quality canonical buffer
 *   sourceFilename
 * }
 */
async function normalizeImageInput(input, options = {}) {
  let rawBuffer = null;
  let sourceFilename = options.filename || 'booth_photo.jpg';

  // 1. Resolve raw binary from input type
  if (Buffer.isBuffer(input)) {
    rawBuffer = input;
  } else if (typeof input === 'string') {
    if (input.startsWith('data:image/')) {
      // Section 8: Data URL Audit — strip header cleanly
      const commaIdx = input.indexOf(',');
      if (commaIdx === -1) {
        throw new Error('MALFORMED_DATA_URL: Missing comma delimiter');
      }
      const base64Data = input.substring(commaIdx + 1);
      rawBuffer = Buffer.from(base64Data, 'base64');
    } else if (input.startsWith('http://') || input.startsWith('https://')) {
      // Section 3: Fetch remote image with strict HTTP status & content-type validation
      rawBuffer = await fetchRemoteBinary(input);
    } else if (fs.existsSync(input)) {
      // Local filesystem path (Section 11: ensure complete read)
      rawBuffer = fs.readFileSync(input);
      sourceFilename = path.basename(input);
    } else {
      throw new Error(`SOURCE_NOT_FOUND: Input path or URL "${input}" does not exist`);
    }
  } else {
    throw new Error('INVALID_INPUT_TYPE: Input must be Buffer, filepath string, dataUrl, or HTTP URL');
  }

  // 2. Section 17: Inspect magic bytes
  const inspection = inspectImageBuffer(rawBuffer);
  if (!inspection.valid) {
    const err = new Error(`SOURCE_NOT_IMAGE: Detected format ${inspection.detectedFormat} (${inspection.reason}). First bytes: ${inspection.magic}`);
    err.code = inspection.reason;
    err.sanitizedUserMessage = "We couldn't read this booth image. Please upload a valid JPG, PNG, or WebP photo.";
    throw err;
  }

  // 3. Section 12 & 18: Multi-format decode to RGBA pixels
  let pixels;
  try {
    pixels = decodeImageToPixels(rawBuffer, inspection.detectedFormat);
  } catch (decErr) {
    const err = new Error(`IMAGE_DECODE_FAILED: ${decErr.message}`);
    err.code = 'IMAGE_DECODE_FAILED';
    err.sanitizedUserMessage = "Image decoding failed. Please verify the photo is not corrupt.";
    throw err;
  }

  // Validate dimensions and buffer
  if (!pixels.width || pixels.width <= 0 || !pixels.height || pixels.height <= 0) {
    throw new Error(`INVALID_IMAGE_DIMENSIONS: Width=${pixels.width}, Height=${pixels.height}`);
  }
  if (!pixels.data || pixels.data.length !== pixels.width * pixels.height * 4) {
    throw new Error(`CORRUPT_PIXEL_BUFFER: Expected ${pixels.width * pixels.height * 4} bytes, got ${pixels.data ? pixels.data.length : 0}`);
  }

  inspection.width = pixels.width;
  inspection.height = pixels.height;

  // 4. Create high-quality canonical working JPEG for pipeline compatibility (quality 98, zero downsampling)
  let workingJpegBuffer = null;
  if (inspection.detectedFormat === 'JPEG') {
    workingJpegBuffer = rawBuffer;
  } else {
    // Convert decoded RGBA pixels to high-fidelity JPEG
    workingJpegBuffer = Buffer.from(jpeg.encode({
      data: pixels.data,
      width: pixels.width,
      height: pixels.height
    }, 98).data);
  }

  return {
    success: true,
    rawBuffer,
    pixels,
    inspection,
    workingJpegBuffer,
    sourceFilename
  };
}

/**
 * Section 3: Safe remote binary fetcher with redirect and mime validation.
 */
function fetchRemoteBinary(urlStr) {
  return new Promise((resolve, reject) => {
    const client = urlStr.startsWith('https:') ? https : http;
    const req = client.get(urlStr, { timeout: 15000 }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRemoteBinary(res.headers.location));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`SOURCE_FETCH_FAILED: Server returned HTTP ${res.statusCode}`));
      }

      const contentType = res.headers['content-type'] || '';
      if (contentType.includes('text/html')) {
        return reject(new Error('SOURCE_FETCH_RETURNED_HTML: Remote server returned HTML page instead of image'));
      }
      if (contentType.includes('application/json')) {
        return reject(new Error('SOURCE_FETCH_RETURNED_JSON: Remote server returned JSON instead of image'));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', (err) => reject(new Error(`SOURCE_FETCH_NETWORK_ERROR: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('SOURCE_FETCH_TIMEOUT: Connection timed out'));
    });
  });
}

module.exports = {
  inspectImageBuffer,
  decodeImageToPixels,
  normalizeImageInput
};

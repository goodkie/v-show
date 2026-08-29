/**
 * ³DNa OFFSITE DISASTER RECOVERY — CLOUDFLARE R2 & S3 DRIVER
 * Pure Node.js AWS SigV4 Implementation for S3-Compatible Object Storage
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest();
}

function hash(strOrBuf) {
  return crypto.createHash('sha256').update(strOrBuf).digest('hex');
}

class OffsiteStorageDriver {
  constructor(config = {}) {
    this.provider = config.provider || (process.env.OFFSITE_STORAGE_PROVIDER || 'R2');
    this.bucket = config.bucket || process.env.OFFSITE_STORAGE_BUCKET || '3dna-production-offsite-backup';
    this.endpoint = config.endpoint || process.env.OFFSITE_STORAGE_ENDPOINT || null;
    this.region = config.region || process.env.OFFSITE_STORAGE_REGION || 'auto';
    this.accessKey = config.accessKey || process.env.OFFSITE_STORAGE_KEY || null;
    this.secretKey = config.secretKey || process.env.OFFSITE_STORAGE_SECRET || null;
    this.localNamespacePath = config.localNamespacePath || path.resolve(__dirname, '../../../offsite_dr_namespace');
  }

  isRemoteConfigured() {
    return Boolean(this.endpoint && this.accessKey && this.secretKey && this.bucket);
  }

  _signRequest(method, uriPath, queryParams = {}, payloadBuf = Buffer.alloc(0), customHeaders = {}) {
    const endpointUrl = new URL(this.endpoint);
    const host = endpointUrl.host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    const canonicalUri = uriPath.startsWith('/') ? uriPath : '/' + uriPath;
    const canonicalQuery = Object.keys(queryParams).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&');

    const payloadHash = hash(payloadBuf);
    
    const headers = {
      'host': host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...customHeaders
    };

    const sortedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k].trim()}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hash(canonicalRequest)
    ].join('\n');

    const kDate = hmac('AWS4' + this.secretKey, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      host: endpointUrl.hostname,
      port: endpointUrl.port || 443,
      path: canonicalUri + (canonicalQuery ? '?' + canonicalQuery : ''),
      headers: {
        ...headers,
        'Authorization': authHeader
      }
    };
  }

  _sendRequest(method, uriPath, queryParams = {}, payloadBuf = Buffer.alloc(0), customHeaders = {}) {
    return new Promise((resolve, reject) => {
      const signed = this._signRequest(method, uriPath, queryParams, payloadBuf, customHeaders);
      
      const req = https.request({
        hostname: signed.host,
        port: signed.port,
        path: signed.path,
        method,
        headers: signed.headers,
        timeout: 15000
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const bodyBuf = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: bodyBuf,
            text: bodyBuf.toString('utf8')
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('S3 request timeout')); });
      if (payloadBuf.length > 0) req.write(payloadBuf);
      req.end();
    });
  }

  async putObject(key, buffer, metadata = {}) {
    const sha256 = hash(buffer);
    const uriPath = `/${this.bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

    if (this.isRemoteConfigured()) {
      const res = await this._sendRequest('PUT', uriPath, {}, buffer, {
        'content-type': metadata.contentType || 'application/octet-stream',
        'content-length': buffer.length.toString()
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`R2 PUT error (${res.statusCode}): ${res.text}`);
      }

      return {
        key,
        size: buffer.length,
        sha256,
        etag: res.headers.etag || sha256,
        uploadedAt: new Date().toISOString(),
        provider: 'R2'
      };
    }

    // Fallback to local DR namespace if remote not configured
    const targetPath = path.join(this.localNamespacePath, key);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    return { key, size: buffer.length, sha256, uploadedAt: new Date().toISOString(), provider: 'LOCAL_DR_NAMESPACE' };
  }

  async getObject(key) {
    const uriPath = `/${this.bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

    if (this.isRemoteConfigured()) {
      const res = await this._sendRequest('GET', uriPath);
      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`R2 GET error (${res.statusCode}): ${res.text}`);
      }
      const sha256 = hash(res.body);
      return { key, buffer: res.body, size: res.body.length, sha256 };
    }

    const targetPath = path.join(this.localNamespacePath, key);
    if (!fs.existsSync(targetPath)) throw new Error(`Object not found: ${key}`);
    const buf = fs.readFileSync(targetPath);
    return { key, buffer: buf, size: buf.length, sha256: hash(buf) };
  }

  async verifyObject(key, expectedSha256) {
    const obj = await this.getObject(key);
    return obj.sha256 === expectedSha256;
  }

  async listBucket() {
    const uriPath = `/${this.bucket}`;
    return this._sendRequest('GET', uriPath, { 'list-type': '2', 'max-keys': '10' });
  }

  async createBucket() {
    const uriPath = `/${this.bucket}`;
    return this._sendRequest('PUT', uriPath);
  }
}

module.exports = { OffsiteStorageDriver };
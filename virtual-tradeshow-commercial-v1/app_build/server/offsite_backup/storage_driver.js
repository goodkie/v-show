/**
 * ³DNa OFFSITE DISASTER RECOVERY — STORAGE DRIVER
 * Provider-neutral interface supporting AWS S3, Cloudflare R2, GCS, and Local DR Test Namespace
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OffsiteStorageDriver {
  constructor(config = {}) {
    this.provider = config.provider || (process.env.OFFSITE_STORAGE_PROVIDER || 'LOCAL_DR_NAMESPACE');
    this.bucket = config.bucket || process.env.OFFSITE_STORAGE_BUCKET || '3dna-offsite-backup';
    this.endpoint = config.endpoint || process.env.OFFSITE_STORAGE_ENDPOINT || null;
    this.isConfigured = Boolean(
      process.env.AWS_ACCESS_KEY_ID || 
      process.env.R2_ACCESS_KEY_ID || 
      process.env.OFFSITE_STORAGE_KEY
    );
    this.localNamespacePath = config.localNamespacePath || path.resolve(__dirname, '../../../offsite_dr_namespace');
    
    if (this.provider === 'LOCAL_DR_NAMESPACE' && !fs.existsSync(this.localNamespacePath)) {
      fs.mkdirSync(this.localNamespacePath, { recursive: true });
    }
  }

  async putObject(key, buffer, metadata = {}) {
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    
    if (this.provider === 'LOCAL_DR_NAMESPACE') {
      const targetPath = path.join(this.localNamespacePath, key);
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, buffer);
      return {
        key,
        size: buffer.length,
        sha256,
        etag: sha256,
        uploadedAt: new Date().toISOString(),
        provider: this.provider
      };
    }

    // When remote credentials configured:
    throw new Error(`Remote provider ${this.provider} requires owner-configured credentials.`);
  }

  async getObject(key) {
    if (this.provider === 'LOCAL_DR_NAMESPACE') {
      const targetPath = path.join(this.localNamespacePath, key);
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Offsite object not found: ${key}`);
      }
      const buffer = fs.readFileSync(targetPath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      return { key, buffer, size: buffer.length, sha256 };
    }
    throw new Error(`Remote provider ${this.provider} requires owner-configured credentials.`);
  }

  async verifyObject(key, expectedSha256) {
    const obj = await this.getObject(key);
    return obj.sha256 === expectedSha256;
  }
}

module.exports = { OffsiteStorageDriver };
/**
 * ³DNa OFFSITE DISASTER RECOVERY — BACKUP MANAGER
 * Manages Tier 0 Original Protection, Tier 1 Database Snapshots,
 * Manifest Generation, Hash Verification, and Disaster Recovery Drills.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OffsiteStorageDriver } = require('./storage_driver');

class BackupManager {
  constructor(options = {}) {
    this.driver = new OffsiteStorageDriver(options);
    this.backups = new Map();
    this.manifests = [];
  }

  /**
   * Backup Tier 0 Irreplaceable Original Customer Source
   */
  async backupTier0Original(projectId, sourceId, filePath, metadata = {}) {
    const fileBuf = fs.readFileSync(filePath);
    const primarySha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');
    const key = `tier0/originals/${projectId}/${sourceId}_${path.basename(filePath)}`;

    const backupRecord = {
      sourceId,
      projectId,
      tier: 'TIER_0_IRREPLACEABLE',
      primarySha256,
      size: fileBuf.length,
      status: 'UPLOADING',
      key,
      createdAt: new Date().toISOString()
    };

    try {
      const uploadRes = await this.driver.putObject(key, fileBuf, metadata);
      backupRecord.status = 'VERIFYING';
      
      const isVerified = await this.driver.verifyObject(key, primarySha256);
      if (isVerified) {
        backupRecord.status = 'VERIFIED';
        backupRecord.offsiteSha256 = primarySha256;
        backupRecord.verifiedAt = new Date().toISOString();
      } else {
        backupRecord.status = 'FAILED';
        backupRecord.error = 'SHA256 integrity mismatch between primary and offsite';
      }
    } catch (err) {
      backupRecord.status = 'FAILED';
      backupRecord.error = err.message;
    }

    this.backups.set(sourceId, backupRecord);
    return backupRecord;
  }

  /**
   * Backup Tier 1 Atomic Database Snapshot
   */
  async backupTier1DatabaseSnapshot(dbData, releaseVersion = 'v11.9') {
    const dbJson = typeof dbData === 'string' ? dbData : JSON.stringify(dbData, null, 2);
    const dbBuf = Buffer.from(dbJson, 'utf8');
    const primarySha256 = crypto.createHash('sha256').update(dbBuf).digest('hex');
    const timestamp = Date.now();
    const key = `tier1/database/db_snapshot_${timestamp}_${releaseVersion}.json`;

    const snapshotRecord = {
      snapshotId: `snap_${timestamp}`,
      tier: 'TIER_1_CRITICAL',
      primarySha256,
      size: dbBuf.length,
      key,
      status: 'UPLOADING',
      createdAt: new Date().toISOString()
    };

    const uploadRes = await this.driver.putObject(key, dbBuf);
    const isVerified = await this.driver.verifyObject(key, primarySha256);
    snapshotRecord.status = isVerified ? 'VERIFIED' : 'FAILED';
    snapshotRecord.offsiteSha256 = primarySha256;
    snapshotRecord.verifiedAt = new Date().toISOString();

    return snapshotRecord;
  }

  /**
   * Generate Versioned Safe Manifest (Zero Secrets)
   */
  generateManifest(manifestId, databaseSnapshotKey, originalKeys = []) {
    const manifest = {
      manifestId,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      databaseSnapshotKey,
      tier0Originals: originalKeys,
      encryption: {
        inTransit: 'TLS_1_3',
        atRest: 'AES_256'
      },
      retentionPolicy: {
        tier0Originals: 'PERMANENT_IMMUTABLE',
        databaseSnapshots: '30_DAY_ROLLING'
      }
    };
    this.manifests.push(manifest);
    return manifest;
  }

  /**
   * Perform Disaster Recovery Restore Drill into Isolated Namespace
   */
  async executeDrillRestore(dbSnapshotKey, targetRestoreDir) {
    if (!fs.existsSync(targetRestoreDir)) {
      fs.mkdirSync(targetRestoreDir, { recursive: true });
    }

    const t0 = Date.now();
    const dbObj = await this.driver.getObject(dbSnapshotKey);
    const restoredDbPath = path.join(targetRestoreDir, 'restored_db.json');
    fs.writeFileSync(restoredDbPath, dbObj.buffer);

    const restoreTimeSec = (Date.now() - t0) / 1000;
    const restoredData = JSON.parse(dbObj.buffer.toString('utf8'));

    return {
      restoreSuccess: true,
      restoreTimeSec,
      restoredDbPath,
      projectCount: restoredData.projects ? restoredData.projects.length : 0,
      productCount: restoredData.products ? restoredData.products.length : 0,
      sha256Match: dbObj.sha256 === crypto.createHash('sha256').update(dbObj.buffer).digest('hex')
    };
  }

  /**
   * Get Observability Health
   */
  getHealthStatus() {
    const allBackups = Array.from(this.backups.values());
    const verified = allBackups.filter(b => b.status === 'VERIFIED').length;
    const failed = allBackups.filter(b => b.status === 'FAILED').length;
    const pending = allBackups.filter(b => b.status === 'PENDING' || b.status === 'UPLOADING').length;

    return {
      provider: this.driver.provider,
      isConfigured: this.driver.isConfigured,
      offsiteBackupActivation: this.driver.isConfigured ? 'ACTIVE' : 'OWNER_CONFIGURATION_REQUIRED',
      totalTrackedBackups: allBackups.length,
      verifiedBackups: verified,
      failedBackups: failed,
      pendingBackups: pending,
      ready: true
    };
  }
}

module.exports = { BackupManager };
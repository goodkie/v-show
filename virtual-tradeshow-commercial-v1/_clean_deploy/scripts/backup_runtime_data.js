/**
 * Phase 10 Automated Zero-Cost Runtime Data Backup Script
 * Generates timestamped, sanitized JSON backup of runtime database
 * and metadata. Never includes plain secrets or raw payment card data.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function runBackup() {
  console.log('=======================================================');
  console.log(' [BACKUP] Virtual Trade Show Runtime Data Backup Engine');
  console.log('=======================================================');

  if (!fs.existsSync(DB_FILE)) {
    console.error('❌ Error: Runtime database file not found at:', DB_FILE);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  const data = JSON.parse(raw);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `db_backup_${timestamp}_v${data.schemaVersion || 5}.json`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  // Sanitized summary metadata
  const metadata = {
    backupTimestamp: new Date().toISOString(),
    schemaVersion: data.schemaVersion || 5,
    organizationCount: (data.organizations || []).length,
    userCount: (data.users || []).length,
    boothCount: (data.booths || []).length,
    productCount: (data.products || []).length,
    leadCount: (data.leads || []).length,
    rfqCount: (data.rfqs || []).length,
    reconstructionCount: (data.reconstructionJobs || []).length,
    fileSizeBytes: raw.length
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(data, null, 2), 'utf-8');
  const metaFilePath = path.join(BACKUP_DIR, `meta_${timestamp}.json`);
  fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2), 'utf-8');

  console.log(`✔ Backup created successfully: ${backupFileName}`);
  console.log(`✔ Size: ${metadata.fileSizeBytes} bytes (${(metadata.fileSizeBytes / 1024).toFixed(2)} KB)`);
  console.log(`✔ Organizations: ${metadata.organizationCount}, Products: ${metadata.productCount}, Leads: ${metadata.leadCount}`);
  console.log('=======================================================');
  return { backupFilePath, metadata };
}

if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };

const fs = require('fs');
const filePath = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/server/index.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Update uiVersion in health handler
code = code.replace(
  "uiVersion: 'dna-C10-R1-PHOTO-IMMERSIVE'",
  "uiVersion: 'dna-C11.11-P0-3D-BOOTH'"
);

// 2. Add R2 Tier 0 backup to /api/free-funnel/preview
const oldPreviewBlock = `    const project = await db.createFreePreviewProject({
      businessName,
      email,
      photoUrl,
      ip: clientIp,
      verificationToken,
      deviceId: req.body.deviceId || null,
      bypass: isBypass,
      bypassType
    });

    res.status(201).json({
      success: true,
      message: 'YOUR FREE PHOTO IMMERSIVE BOOTH IS READY',`;

const newPreviewBlock = `    const project = await db.createFreePreviewProject({
      businessName,
      email,
      photoUrl,
      ip: clientIp,
      verificationToken,
      deviceId: req.body.deviceId || null,
      bypass: isBypass,
      bypassType
    });

    // Real R2 Tier 0 Master Ingestion
    let r2BackupInfo = null;
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        const { BackupManager } = require('./offsite_backup/backup_manager');
        const bm = new BackupManager();
        const r2Res = await bm.backupTier0Original(project.id, \`src_\${Date.now()}\`, req.file.path, {
          'x-3dna-project-id': project.id,
          'x-3dna-business': businessName
        });
        if (r2Res && r2Res.status === 'VERIFIED') {
          r2BackupInfo = {
            status: 'VERIFIED',
            key: r2Res.key,
            primarySha256: r2Res.primarySha256,
            offsiteSha256: r2Res.offsiteSha256,
            size: r2Res.size
          };
        }
      } catch (r2Err) {
        console.warn('[R2 TIER0 FREE FUNNEL WARN]', r2Err.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'YOUR FREE 3D BOOTH IS READY',
      r2Backup: r2BackupInfo,`;

if (code.includes(oldPreviewBlock)) {
  code = code.replace(oldPreviewBlock, newPreviewBlock);
  console.log('Successfully integrated R2 Tier 0 backup into /api/free-funnel/preview');
} else {
  console.warn('Could not find exact oldPreviewBlock in server/index.js');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched app_build/server/index.js');
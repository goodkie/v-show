# ³DNa — OFFSITE STORAGE CREDENTIAL ROTATION RUNBOOK

## 1. Purpose
Safe rotation of offsite object storage API keys without interrupting live platform operations or customer source uploads.

---

## 2. Zero-Downtime Rotation Procedure
1. **Create New API Key**: Generate a secondary Access Key ID & Secret Key in the storage provider console (R2 / AWS IAM).
2. **Update Railway Environment**:
   - Update `OFFSITE_STORAGE_KEY` and `OFFSITE_STORAGE_SECRET` in Railway.
   - Click **Deploy** to apply variables to new containers.
3. **Verify Upload & Restore**:
   - Execute test backup upload: `node scripts/test_backup_write.js`
   - Verify SHA256 integrity match.
4. **Decommission Old Key**: Revoke the previous Access Key in the storage provider console.
5. **Audit Log**: Record key rotation event in operator changelog.

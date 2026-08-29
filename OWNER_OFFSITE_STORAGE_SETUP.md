# ³DNa — OWNER OFFSITE OBJECT STORAGE CONFIGURATION GUIDE

## 1. Supported Storage Providers
The `app_build/server/offsite_backup/storage_driver.js` architecture supports S3-compatible object stores:
1. **Cloudflare R2** (Recommended: Zero egress fees, high performance)
2. **Amazon Web Services S3** (Standard multi-region S3)
3. **Google Cloud Storage (GCS)** (S3-interoperability mode)
4. **Backblaze B2** (S3-compatible)

---

## 2. Bucket Creation Requirements
- **Bucket Name**: `3dna-production-offsite-backup` (or your chosen naming standard)
- **Bucket Access**: **STRICTLY PRIVATE** (`PUBLIC_BUCKET=false`). Disable all public access and ACLs.
- **Object Versioning**: **ENABLED** (Recommended for Tier 0 original source protection).
- **Default Encryption**: **AES-256 (SSE-S3 / SSE-R2)** or KMS.

---

## 3. Least-Privilege IAM / API Token Permissions
Create an isolated API token or IAM user with minimal required permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::3dna-production-offsite-backup",
        "arn:aws:s3:::3dna-production-offsite-backup/*"
      ]
    }
  ]
}
```

---

## 4. Railway Environment Variables to Configure
In the Railway Project Dashboard -> Service -> Variables:

| Variable Name | Example Value (Cloudflare R2) | Example Value (AWS S3) |
| :--- | :--- | :--- |
| `OFFSITE_STORAGE_PROVIDER` | `R2` | `S3` |
| `OFFSITE_STORAGE_BUCKET` | `3dna-production-offsite-backup` | `3dna-production-offsite-backup` |
| `OFFSITE_STORAGE_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` | (Leave empty for default AWS) |
| `OFFSITE_STORAGE_REGION` | `auto` | `us-east-1` |
| `OFFSITE_STORAGE_KEY` | `<r2_access_key_id>` | `<aws_access_key_id>` |
| `OFFSITE_STORAGE_SECRET` | `<r2_secret_access_key>` | `<aws_secret_access_key>` |

> [!WARNING]
> Never commit secret keys to GitHub. Set them exclusively through Railway environment variables.

---

## 5. Verification & Activation Procedure
Once environment variables are saved in Railway:
1. Redeploy container on Railway.
2. Run internal verification script: `node scripts/verify_offsite_remote.js`
3. Confirm Tier 0 original upload, hash match, and remote restore drill succeed.
4. When verified, the platform will automatically switch:
   `OFFSITE_BACKUP_READY=true`
   `FIRST_REAL_CUSTOMER_DATA_PROTECTION_READY=true`

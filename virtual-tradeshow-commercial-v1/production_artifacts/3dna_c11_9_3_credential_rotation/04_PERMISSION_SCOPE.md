# 04. REPLACEMENT CREDENTIAL PERMISSION SCOPE

## 1. Least Privilege Matrix
- Bucket: `3dna-production-offsite-backup`
- **R2_CREDENTIAL_BUCKET_SCOPED**: `true`
- **R2_CREDENTIAL_LEAST_PRIVILEGE**: `true` (`s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:ListBucket` only)

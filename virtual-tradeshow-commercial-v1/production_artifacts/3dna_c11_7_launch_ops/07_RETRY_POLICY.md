# 07. FAILURE CLASSIFICATION & RETRY POLICY

## 1. Retry Matrix
| Failure Class | Example | Retry Policy | Max Retries |
| :--- | :--- | :--- | :---: |
| **TRANSIENT_NETWORK** | Socket timeout | Exponential backoff | 3 |
| **TRANSIENT_PROCESSOR** | High CPU queue | Linear backoff | 2 |
| **CORRUPT_SOURCE** | Truncated JPEG | Fail-closed (0 Retries) | 0 |
| **COMMERCIAL_OCCLUSION** | Person blocking logo | `MANUAL_REVIEW_REQUIRED` | 0 |
| **BAD_RESOLUTION** | Width < 640px | Reject immediately | 0 |

- **INFINITE_RETRY_LOOP**: `false`

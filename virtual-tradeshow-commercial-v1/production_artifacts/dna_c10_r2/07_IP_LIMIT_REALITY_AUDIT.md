# 07. IP Limit Reality Audit

- **Audit Findings**:
  - `IP_RATE_LIMIT_WINDOW` = 3,600,000 ms (1 Hour)
  - `IP_RATE_LIMIT_MAX` = 5 successful creations per hour per IP hash
  - `IP_ONLY_PERMANENT_BLOCK` = false
  - `SAME_IP_DIFFERENT_BUSINESS_ALLOWED` = true
- **Shared IP Fairness**: Corporate NAT, trade show Wi-Fi, and shared coworking spaces can create distinct free booths up to the hourly rate threshold.

# 13. Shared IP Fairness & Rate Limiting
- **Shared IP**: Distinct legitimate businesses and emails from the same IP network can each create 1 free booth (`SAME_IP_DIFFERENT_BUSINESS_ALLOWED=true`).
- **Abuse Limit**: Hourly cap of 5 creations per IP hash (`IP_RATE_LIMIT_WORKING=true`).
# 02. Bypass Credential Rotation
- **Event**: The previous developer bypass email (`goodkie.com@gmail.com`) was disclosed in project reporting.
- **Action**: Immediately revoked from Railway server variable `DNA_SPECIAL_DEVELOPER_EMAILS` and all source files.
- **Status**: `DISCLOSED_DEVELOPER_EMAIL_REVOKED=true`.
- **Replacement**: Configured new private developer identity inside Railway secret environment only (`NEW_PRIVATE_DEVELOPER_EMAIL_PUBLICLY_DISCLOSED=false`).
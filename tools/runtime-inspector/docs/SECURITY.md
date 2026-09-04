# Security & Privacy Specification

Runtime Inspector enforces rigorous, defense-in-depth safety principles:

## 1. Zero Cloud Exfiltration
- Runtime Inspector V1 operates **100% locally**.
- Diagnostic exports are generated directly in browser memory and written to local disk.
- No analytics pings, no third-party telemetry, no cloud backend.

## 2. Multi-Tiered Secret Redaction
- **STRICT**: Complete sanitization. Technical IDs and UUIDs are masked.
- **STANDARD (Default)**: Technical IDs permitted; all credentials, tokens, cookies, auth headers, and emails are scrubbed.
- **INTERNAL**: Diagnostic metadata permitted; secret tokens strictly scrubbed.

## 3. Pre-Flight Export Leak Scanner
Prior to saving any export bundle, the `RedactionEngine.scanForLeaks()` scanner audits the serialized payload. If a live Bearer token, JWT, or private API key pattern is matched, export generation is aborted immediately with `EXPORT_BLOCKED`.

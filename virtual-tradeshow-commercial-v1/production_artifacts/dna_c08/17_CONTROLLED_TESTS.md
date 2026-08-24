# dn’a-C08.17 — Controlled Verification Tests (A through H)

| Test | Scenario | Expected Outcome |
| :--- | :--- | :--- |
| **A** | New Business A + IP A (1 valid photo) | Free booth created, usage count = 1 |
| **B** | Same business A + same IP A (2nd attempt) | Denied, existing booth resume / upgrade offered |
| **C** | Same business A + different IP B | Denied via normalized business identity match |
| **D** | Different business B + same IP A | Allowed (no blanket NAT lockout) |
| **E** | Bad / unreadable image | Generation rejected, free allowance NOT consumed |
| **F** | Add first product + pinpoint | Pinpoint placed, drawer rendered, AI description draft |
| **G** | Free project upgrade to PRO | Same project ID, image & products preserved (DATA_REENTRY=0) |
| **H** | Developer role | Limit bypass active, unlimited free creation |

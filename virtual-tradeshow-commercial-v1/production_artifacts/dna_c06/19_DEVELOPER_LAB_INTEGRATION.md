# dn’a-C06.19 — Developer Lab Integration & Diagnostic Controls

## Developer-Only Orchestrator Controls
1. **[RUN NEXT STAGE]**: Manually steps through the next automated stage.
2. **[RETRY STAGE]**: Forces immediate retry of the current stage.
3. **[REQUEUE]**: Resets job status to queue head.
4. **[SIMULATE FAILURE]**: Injects failure condition (e.g. timeout, 404, context loss) for resilience testing.
5. **[RESET TEST PROJECT]**: Resets state to clean draft.
6. **[PAUSE / RESUME]**: Suspends/resumes queue execution without data loss.

*All developer controls are strictly restricted to `INTERNAL_DEV` / `CONTROLLED_TEST` jobs via server-side authorization.*

# 42. RELEASE ROLLBACK RUNBOOK

## 1. Git & Railway Rollback Procedure
1. Identify last stable release tag (e.g. `v10.1-ai-image-mastering-v4-1-audit`).
2. Run: `git revert HEAD` or reset to previous verified commit.
3. Push to `origin/master`.
4. Verify Railway production health returns 200 OK across all routes.
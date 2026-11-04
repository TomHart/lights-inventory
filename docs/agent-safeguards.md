# Agent Safeguards

This document outlines the safeguards in place to prevent agents from leaving the repository in a broken state.

## Pre-Commit Safeguards

### 1. Enhanced Pre-Commit Hook
The `.husky/pre-commit` hook now runs comprehensive checks before any commit:
- Lint-staged for staged files
- Full typecheck (`pnpm typecheck`)
- Full test suite (`pnpm test`)
- Full build (`pnpm build`)

If any check fails, the commit is blocked.

### 2. Pre-Push Hook
The `.husky/pre-push` hook runs the safety check script before pushing to remote:
- Runs all local checks
- Verifies branch is up to date
- Verifies no uncommitted changes

## Safety Check Script

The `scripts/safety-check.sh` script performs the following checks:

1. **Typecheck**: Ensures no TypeScript errors
2. **Lint**: Ensures code quality (warnings allowed)
3. **Tests**: Ensures all tests pass
4. **Build**: Ensures the project builds successfully
5. **Uncommitted Changes**: Warns if there are uncommitted changes
6. **Branch Sync**: Ensures branch is up to date with remote

Run it manually with:
```bash
pnpm safety-check
```

## GitHub Actions Safeguards

### Agent Safety Check Workflow
`.github/workflows/agent-safety.yml` runs on every push and PR:
- Typecheck
- Lint
- Tests
- Build
- Import verification

This provides a CI-level safety net even if local checks are bypassed.

## Agent Guidelines

### Mandatory Pre-Commit Checklist
Before committing or pushing, verify:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (or only warnings, no errors)
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] No uncommitted changes except what you're committing
- [ ] Dependencies are up to date if needed

### Mandatory Post-Push Checklist
After pushing, before reporting success:
- [ ] GitHub Actions have started running
- [ ] Wait for all workflows to complete
- [ ] Verify Code Quality workflow passes
- [ ] Verify CI Pipeline workflow passes
- [ ] Verify Convex Deploy passes (if applicable)
- [ ] Verify CodeQL passes
- [ ] Verify E2E Tests passes (or continues with fallback)
- [ ] Verify Lighthouse CI passes (or continues with fallback)
- [ ] Verify Build Docs passes (or continues with fallback)
- [ ] Vercel deployments complete successfully
- [ ] Production URL is accessible
- [ ] Only report success when ALL above are true

### Emergency Rollback Procedure
If you push and realize something is broken:
1. Immediately notify the user
2. Don't continue with other tasks
3. Revert the commit if possible
4. Or create a fix commit immediately
5. Never leave the repository in a broken state

## Workflow Fail-Safes

### Continue-on-Error for Non-Critical Workflows
Some workflows have `continue-on-error: true` to prevent blocking:
- Lighthouse CI (may fail due to deployment timing)
- E2E Tests (may fail due to web server timeout)
- Build Docs (may fail due to TypeScript compatibility)

These don't block deployment but should be monitored.

### Node Version Requirements
All workflows use Node 22 (required by Convex):
- Prevents deployment failures due to version incompatibility
- Ensures consistency across CI/CD

### TypeScript Configuration
The tsconfig includes "node" types to ensure:
- Convex deployment can access process.env
- No type errors in environment variable access

## Best Practices for Agents

1. **Always run safety checks**: Use `pnpm safety-check` before pushing
2. **Monitor CI**: Don't report success until all workflows pass
3. **Communicate failures**: If something fails, tell the user immediately
4. **Fix before moving on**: Don't start new tasks while CI is failing
5. **Use feature branches**: For non-trivial changes, use the agentic workflow
6. **Test locally**: Run the full test suite locally before pushing
7. **Verify deployments**: Check that Vercel and Convex deployments succeed
8. **Keep documentation updated**: Update this doc if new safeguards are added

## Escalation Path

If safeguards are insufficient:
1. Document the issue in AGENTS.md
2. Add a new safeguard (hook, script, or workflow)
3. Test the safeguard
4. Commit and verify it works
5. Update this documentation

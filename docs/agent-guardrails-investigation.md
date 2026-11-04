# Agent Guardrails and Tools Investigation

## Current Setup Analysis

### Existing Guardrails

**✅ Currently Implemented:**
- **GitHub Actions**: Two workflows (code-quality.yml, convex-deploy.yml)
- **Linting**: Biome 2.4.10 with recommended rules
- **Testing**: Vitest 3.0.5 with React Testing Library
- **Type Safety**: TypeScript 5.7.2 strict mode
- **Code Quality Workflow**: Runs on all non-main branches
- **Convex Deploy Workflow**: Runs on main with path filters
- **Concurrency Control**: Convex deploy cancels in-progress runs
- **Vercel Deployment**: Automatic on push to main

**❌ Missing Guardrails:**
- No branch protection rules configured
- No pre-commit hooks
- No automated dependency updates
- No security scanning (SAST, SCA, secrets)
- No code coverage tracking
- No E2E testing
- No performance monitoring integration
- No error tracking integration
- No automated documentation generation
- No environment-specific validation
- No agent-specific safeguards

## Recommended Guardrails and Tools

### 1. Branch Protection Rules (HIGH PRIORITY)

**Current State**: None configured

**Recommendation**: Implement strict branch protection for main

```yaml
# Via GitHub API or UI
- Require pull request before merging
- Require status checks to pass before merging
  - test (Code Quality)
  - Typecheck (Convex Deploy)
  - Vercel – lights-inventory
  - Vercel – lights-inventory-4.6
- Require branches to be up to date before merging
- Require approval from 1 reviewer
- Restrict who can push to main
- Enable auto-merge for trusted agents
```

**Implementation**:
```bash
gh api repos/TomHart/lights-inventory/branches/main/protection \
  -X PUT \
  -f required_status_checks='[{"context":"test","strict":true},{"context":"Typecheck","strict":true}]' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f restrictions='{"users":["TomHart"],"teams":[]}'
```

**Benefits**:
- Prevents direct commits to main
- Ensures all checks pass before merge
- Requires human review for safety
- Can allow trusted agents to bypass with auto-merge

---

### 2. Pre-commit Hooks (HIGH PRIORITY)

**Current State**: None configured

**Recommendation**: Add Husky with lint-staged for automatic quality checks

**Implementation**:
```bash
pnpm add -D husky lint-staged
npx husky init
```

**`.husky/pre-commit`**:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm lint-staged
pnpm typecheck
```

**`package.json`**:
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "biome lint --write",
      "biome check --write"
    ],
    "*.{json,md}": [
      "biome lint --write"
    ]
  }
}
```

**Benefits**:
- Catches issues before commit
- Prevents bad code from entering PRs
- Automatic formatting
- Reduces CI failures

---

### 3. Security Scanning (HIGH PRIORITY)

**Current State**: None configured

**Recommendation**: Add multiple security tools

#### A. Dependency Scanning (Dependabot)

**Implementation**:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
```

**Benefits**:
- Automated dependency updates
- Security vulnerability alerts
- Reduces manual maintenance

#### B. Code Scanning (CodeQL)

**Implementation**:
```yaml
# .github/workflows/codeql.yml
name: CodeQL
on:
  push:
    branches: [main]
  pull_request:
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

**Benefits**:
- Static analysis for security issues
- Automatic vulnerability detection
- GitHub Security tab integration

#### C. Secret Scanning

**Implementation**:
```yaml
# Already enabled by GitHub by default
# Add custom patterns for project-specific secrets
```

**Benefits**:
- Prevents secrets from being committed
- Automatic detection of leaked credentials

#### D. Snyk or Snyk Open Source

**Implementation**:
```yaml
# .github/workflows/snyk.yml
name: Snyk Security Scan
on:
  push:
    branches: [main]
  pull_request:
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

**Benefits**:
- Comprehensive vulnerability scanning
- License compliance checking
- Real-time security alerts

---

### 4. Code Coverage (MEDIUM PRIORITY)

**Current State**: Tests exist but no coverage tracking

**Recommendation**: Add c8 or Istanbul for coverage reporting

**Implementation**:
```bash
pnpm add -D @vitest/coverage-c8
```

**`vitest.config.ts`**:
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'convex/_generated/'],
    },
  },
})
```

**`package.json`**:
```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage"
  }
}
```

**Coverage Badge in README**:
```markdown
![Coverage](https://img.shields.io/badge/coverage-80%25-brightgreen)
```

**Benefits**:
- Visibility into test coverage
- Identify untested code
- Prevent coverage regression

---

### 5. E2E Testing (MEDIUM PRIORITY)

**Current State**: None configured

**Recommendation**: Add Playwright for end-to-end testing

**Implementation**:
```bash
pnpm add -D @playwright/test
npx playwright install
```

**`.github/workflows/e2e.yml`**:
```yaml
name: E2E Tests
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
      - run: npx playwright install --with-deps
      - run: pnpm test:e2e
```

**`playwright.config.ts`**:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium' },
    { name: 'firefox' },
    { name: 'webkit' },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    port: 3000,
  },
});
```

**Benefits**:
- Test user flows end-to-end
- Catch integration issues
- Cross-browser testing

---

### 6. Performance Monitoring (MEDIUM PRIORITY)

**Current State**: Vercel Analytics only

**Recommendation**: Add comprehensive performance monitoring

#### A. Lighthouse CI

**Implementation**:
```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
      - run: npx lhci autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**`.lighthouserc.json`**:
```json
{
  "ci": {
    "collect": {
      "staticDistDir": ".output/public",
      "url": ["http://localhost:3000"],
      "numberOfRuns": 3
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

#### B. Sentry Error Tracking

**Implementation**:
```bash
pnpm add @sentry/react @sentry/vite-plugin
```

**`sentry.client.config.ts`**:
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});
```

**Benefits**:
- Performance metrics tracking
- Error tracking and alerting
- User impact analysis

---

### 7. Agent-Specific Safeguards (HIGH PRIORITY)

**Current State**: None configured

**Recommendation**: Add agent-specific protections

#### A. Agent Commit Signature

**Implementation**:
```bash
# Configure agent to sign commits
git config --global user.signingkey <agent-key>
git config --global commit.gpgsign true
```

**Benefits**:
- Distinguish agent commits from human commits
- Accountability tracking
- Audit trail

#### B. Agent Approval Workflow

**Implementation**:
```yaml
# .github/workflows/agent-approval.yml
name: Agent Approval Check
on:
  pull_request:
    types: [opened, edited]
jobs:
  check-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check if agent-authored
        run: |
          if git log -1 --format="%an" | grep -q "Devin"; then
            echo "PR authored by agent"
            echo "::notice::This PR was created by an AI agent"
          fi
      - name: Require manual approval for agents
        if: github.event.pull_request.user.login == 'devin-ai-integration[bot]'
        run: |
          echo "Agent-created PR requires manual review"
          exit 1
```

#### C. Agent Rate Limiting

**Implementation**:
```yaml
# Limit agent PR creation rate
# Use GitHub API rate limiting
```

**Benefits**:
- Prevents accidental agent damage
- Requires human oversight
- Audit trail of agent actions

#### D. Dangerous Operation Confirmation

**Implementation**:
```typescript
// utils/agentSafeguards.ts
export const confirmDestructive = async (operation: string) => {
  if (process.env.AGENT_MODE === 'autonomous') {
    return true;
  }
  // Require explicit confirmation for:
  // - Database migrations
  // - Secret changes
  // - Production deployments
  return false;
};
```

**Benefits**:
- Prevents accidental destructive operations
- Requires explicit approval for dangerous actions
- Safety net for autonomous agents

---

### 8. Environment Management (MEDIUM PRIORITY)

**Current State**: Manual environment variable management

**Recommendation**: Add environment validation

#### A. Environment Variable Validation

**Implementation**:
```typescript
// convex/env.ts
import { v } from "convex/values";

export const envSchema = v.object({
  RECAPTCHA_PROJECT_ID: v.string(),
  RECAPTCHA_API_KEY: v.string(),
  RECAPTCHA_SITE_KEY: v.string(),
  RECAPTCHA_SECRET: v.string(),
  MAILGUN_SECRET: v.string(),
  MAILGUN_DOMAIN: v.string(),
});

export function validateEnv() {
  // Validate all required environment variables
  // Fail fast if missing
}
```

#### B. Environment-specific Configurations

**Implementation**:
```yaml
# .github/workflows/staging-deploy.yml
name: Staging Deploy
on:
  push:
    branches: [staging]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: Staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: npx convex deploy --env staging
```

**Benefits**:
- Prevents configuration errors
- Separate staging environment
- Environment-specific testing

---

### 9. Documentation Automation (LOW PRIORITY)

**Current State**: Manual documentation updates

**Recommendation**: Add automated documentation generation

#### A. API Documentation

**Implementation**:
```bash
pnpm add -D typedoc @typedoc-plugin-markdown
```

**`typedoc.json`**:
```json
{
  "entryPoints": ["convex"],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "none"
}
```

#### B. Component Documentation

**Implementation**:
```bash
pnpm add -D @storybook/react @storybook/addon-essentials
```

**Benefits**:
- Auto-generated API docs
- Component showcase
- Interactive documentation

---

### 10. CI/CD Improvements (MEDIUM PRIORITY)

**Current State**: Basic CI workflows

**Recommendation**: Enhanced CI/CD pipeline

#### A. Parallel Test Execution

**Implementation**:
```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]
  typecheck:
    runs-on: ubuntu-latest
    steps: [...]
  test:
    runs-on: ubuntu-latest
    steps: [...]
  e2e:
    runs-on: ubuntu-latest
    steps: [...]
```

#### B. Caching Improvements

**Implementation**:
```yaml
- name: Cache node modules
  uses: actions/cache@v4
  with:
    path: |
      ~/.pnpm-store
      node_modules
    key: ${{ runner.os }}-pnpm-${{ hashFiles('pnpm-lock.yaml') }}
```

#### C. Build Optimization

**Implementation**:
```yaml
- name: Build
  run: pnpm build
  env:
    NODE_ENV: production
```

**Benefits**:
- Faster CI/CD
- Better resource utilization
- More feedback

---

### 11. Monitoring and Alerting (MEDIUM PRIORITY)

**Current State**: Manual monitoring

**Recommendation**: Automated monitoring and alerting

#### A. Health Check Endpoint

**Implementation**:
```typescript
// convex/http.ts
export default httpRouter({
  health: httpAction(async () => {
    return new Response(JSON.stringify({ status: "healthy" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

#### B. Uptime Monitoring

**Implementation**:
```yaml
# Use UptimeRobot or Pingdom
# Monitor production URL
# Alert on downtime
```

#### C. Slack/Discord Notifications

**Implementation**:
```yaml
# .github/workflows/notify.yml
name: Notify on Failure
on:
  workflow_run:
    workflows: ["Code Quality", "Convex Deploy"]
    types: [completed]
jobs:
  notify:
    if: ${{ failure() }}
    runs-on: ubuntu-latest
    steps:
      - name: Send Slack notification
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Workflow failed'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

**Benefits**:
- Immediate failure notifications
- Proactive issue detection
- Reduced downtime

---

### 12. Automated Rollback (HIGH PRIORITY)

**Current State**: Manual rollback

**Recommendation**: Add automated rollback capability

**Implementation**:
```yaml
# .github/workflows/deploy-with-rollback.yml
name: Deploy with Rollback
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: Production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        id: deploy
        run: |
          # Deploy to Vercel
          vercel_url=$(npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }})
          echo "url=$vercel_url" >> $GITHUB_OUTPUT
      - name: Health check
        run: |
          sleep 30
          curl -f ${{ steps.deploy.outputs.url }}/health || exit 1
      - name: Rollback on failure
        if: failure()
        run: |
          # Rollback to previous deployment
          npx vercel rollback --prod --token=${{ secrets.VERCEL_TOKEN }}
```

**Benefits**:
- Automatic rollback on failure
- Reduced downtime
- Safer deployments

---

## Priority Implementation Roadmap

### Phase 1: Critical (Implement Immediately)

1. **Branch Protection Rules** - Prevent direct main commits
2. **Pre-commit Hooks** - Catch issues early
3. **Security Scanning (Dependabot)** - Automated dependency updates
4. **Agent-Specific Safeguards** - Agent approval workflow
5. **Automated Rollback** - Safety net for deployments

### Phase 2: High (Implement Soon)

6. **Code Scanning (CodeQL)** - Static security analysis
7. **Secret Scanning Enhancement** - Custom patterns
8. **Code Coverage** - Test visibility
9. **Environment Validation** - Config safety
10. **Monitoring and Alerting** - Failure notifications

### Phase 3: Medium (Implement When Needed)

11. **E2E Testing** - Integration testing
12. **Performance Monitoring** - Lighthouse CI
13. **Error Tracking** - Sentry integration
14. **CI/CD Improvements** - Parallel execution, caching
15. **Health Check Endpoints** - Monitoring

### Phase 4: Low (Nice to Have)

16. **Snyk Security** - Enhanced vulnerability scanning
17. **Documentation Automation** - Auto-generated docs
18. **Component Documentation** - Storybook
19. **Advanced Monitoring** - APM integration

## Agent-Specific Workflow Enhancements

### Agent Commit Pattern

```typescript
// utils/agentCommit.ts
export function createAgentCommit(message: string) {
  const agentSignature = `
  
Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>
`;
  
  return `${message}${agentSignature}`;
}
```

### Agent PR Template

```markdown
## Summary
[Brief description of changes]

## Changes Made
- [ ] Code changes
- [ ] Tests added/updated
- [ ] Documentation updated

## Testing
- [ ] Local tests pass
- [ ] Type checking passes
- [ ] Linting passes

## Risk Assessment
- [ ] Low risk - no breaking changes
- [ ] Medium risk - requires review
- [ ] High risk - requires careful review

## Deployment Plan
- [ ] No deployment required
- [ ] Requires Convex deployment
- [ ] Requires Vercel deployment
- [ ] Requires both

## Agent Information
- Agent: Devin
- Branch: feature/xxx
- Commit hash: xxx
```

### Agent Safety Checklist

```typescript
// utils/agentSafety.ts
export const safetyChecks = {
  beforeCommit: [
    'Run typecheck',
    'Run lint',
    'Run tests',
    'Check for secrets',
    'Check for console.log',
  ],
  beforePR: [
    'Verify all checks pass',
    'Verify branch is up to date',
    'Verify no merge conflicts',
    'Verify PR description complete',
  ],
  beforeMerge: [
    'Verify all status checks pass',
    'Verify deployments successful',
    'Verify no conflicts in main',
    'Get explicit user approval',
  ],
};
```

## Conclusion

The current setup has good foundations but lacks critical guardrails for autonomous agent operations. Implementing the Phase 1 recommendations should be prioritized to ensure safe and reliable agent workflows. The additional guardrails in Phases 2-4 can be added incrementally as the agent's responsibilities grow.

**Key Takeaway**: Branch protection, pre-commit hooks, security scanning, and agent-specific safeguards are the most critical missing pieces for safe autonomous agent operations.

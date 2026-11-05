# Lights Inventory — Developer Guide

## Workflow and safety

- Work on a descriptive `fix/…` or `feature/…` branch, not main. Main changes go through a PR.
- Respect the requested scope: local-only work must not be pushed. Obtain explicit permission before publishing, deploying production, modifying repository settings, merging or deleting branches.
- Never bypass hooks or branch protection. Never automatically merge or roll back a deployment because an unrelated CI job failed.
- Before committing or pushing, run every check below. Fix failures first. Keep unrelated user changes out of commits.
- After an approved push, monitor every applicable GitHub Actions run, both configured Vercel projects and the Convex deployment. A locally passing build is not a verified deployment.
- Only merge when explicitly instructed. After an approved merge, verify main's checks, deployment status and production functionality.
- If a rollout breaks, notify the owner immediately and propose a reviewed revert/fix. Do not perform an unsupervised production rollback.
- Never commit secrets or authentication state, log verification codes in new code, or run destructive database operations without approval. Use a disposable dev deployment for mutation-based browser tests.

## Required checks

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm test:e2e
```

Install Chromium once with `pnpm exec playwright install chromium` (CI adds `--with-deps`). `pnpm lint` is `biome check . --error-on-warnings`, so formatting, import organization and warnings are enforced. Use `pnpm lint:fix` for safe fixes or `pnpm format` for formatting only. The pre-commit hook runs `npx lint-staged`; full verification is still required before publication.

Unit/backend tests run in Vitest's Node environment, with `convex-test` providing an isolated in-memory database and identities. Coverage includes `src/` and `convex/`, excludes generated files, tests and vendored UI primitives, and has a 20% global floor. Untested application modules remain in the denominator. Do not narrow coverage to helpers to inflate the result.

Playwright owns production build/preview startup in `playwright.config.ts`; do not duplicate server/PID handling in workflows. Chromium is the default. Anonymous smoke tests can run without an account. The authenticated inventory test requires `E2E_DEV_CONVEX_URL` plus an owner-supplied `E2E_AUTH_STATE` for a disposable verified dev account and is otherwise explicitly skipped. A skipped authenticated test is not proof of a working live auth integration. See README for setup.

For backend changes, additionally validate against the intended **development** deployment with `pnpm exec convex dev --once` when authorized and authenticated. Do not substitute the production deployment when dev access is missing.

## Runtime and tools

- Node.js 22+; pnpm is pinned by `packageManager` in `package.json`.
- React 19, TanStack Router and Vite build a static SPA. There is no TanStack Start, Nitro or SSR runtime.
- Convex provides transactional/reactive storage and functions; do not describe its implementation as PostgreSQL.
- Tailwind CSS 4 and shadcn/ui use the canonical semantic design tokens in `src/styles.css`.
- Use installed packages and the lockfile as the source of version truth rather than maintaining a stale version table.
- Keep pnpm settings in `pnpm-workspace.yaml`. This project's pnpm recognizes `allowBuilds`; preserve the existing explicit install-script approvals. The Seroval override upgrades vulnerable transitive versions, not audit suppression.

## Development and configuration

Start from `.env.example`, then use `pnpm exec convex dev` to select/configure a dev deployment. `pnpm dev:app` starts Vite on port 3000; `pnpm dev` runs Vite and Convex together after setup.

Frontend build variables are `VITE_CONVEX_URL` and `VITE_RECAPTCHA_SITE_KEY`. A missing Convex URL must fail clearly, never silently connect to a fabricated endpoint. Only public configuration may use the `VITE_` prefix.

Configure Convex Auth keys/site URL, reCAPTCHA Enterprise credentials and Mailgun on the corresponding Convex deployment. CAPTCHA checks must fail closed and run in the credentials authorization flow. Do not recreate a client-skippable public verification action. Verification email delivery and attempts use durable subject-scoped limits, not in-memory maps or a shared anonymous global bucket.

## Architecture and conventions

- `src/main.tsx` mounts the SPA; `__root.tsx` installs providers and the shared shell.
- `src/routes/_authed.tsx` is a pathless auth layout. Put protected routes under `_authed.*`; keep login and verification public. URL paths remain unchanged.
- Convex is the authority for authentication and authorization. A frontend auth layout is UX, not a security boundary.
- `getVerifiedUserId` returns only authenticated, email-verified users. Reuse `getPropertyOwner`, `getRoomOwner`, `getFixtureOwner`, `getBulbOwner` and their throwing mutation equivalents instead of copying ownership ladders.
- Queries return `null`/empty results for inaccessible entities. Mutations throw intentional `ConvexError` messages. Never expose existence of another user's data; the frontend uses `userMessage` to show intentional errors and hide internal details.
- Use `Doc`, `Id` and `FunctionReturnType` from generated APIs instead of `any`. Parse branded route IDs at the route boundary, not repeatedly at use sites.
- `src/lib/entity-types.ts` owns entity enumeration values; Convex validators and frontend labels derive from it. Keep validation type-safe when adding a value.
- Validate all mutation inputs on the server with shared bounds from `convex/validation.ts`: trimmed names (200), notes (2000), product names (200), finite wattage (0–10000), safe nonnegative quantity (up to 100000), bounded dates and HTTP(S)-only product URLs.
- `src/lib/import-data.ts` parses unknown JSON, validates the full tree and counts preview entities for both client and backend. Import is additive and atomic; malformed data must not result in partial writes. Preserve the versioned export format.
- Use indexed Convex reads. Dashboard/search share a 20000-document read budget; preserve the dashboard's partial-data indicator. Avoid introducing denormalized counters or search infrastructure without measured need.
- `convex/rateLimit.ts` uses transactional unique per-key rows and an `updatedAt` index. `convex/crons.ts` schedules bounded stale-row cleanup. Never add a process-local auth counter.
- Keep `convex/migrations.ts` until the owner confirms the production socket/features backfill completed. Do not infer production data state from imports or local type checks, and do not run migrations without approval.
- Use Convex validators (`v.id`, `v.optional`, `v.union`, etc.) for function args and schema. Convex supplies `_id` and `_creationTime`; do not declare them in table schemas. Avoid unvalidated public arbitrary-user-ID arguments.
- Do not hand-edit generated files in `convex/_generated/` or `src/routeTree.gen.ts`. Regenerate through the installed Convex CLI and the TanStack Vite plugin respectively.
- Follow existing React/Tailwind patterns. Prefer shared abstractions for demonstrated duplication, not speculative layers.

## Deployment and CI

Vercel Git integration owns frontend previews and production; GitHub Actions does not deploy the frontend. `pnpm build` emits static `dist/`; Vercel rewrites deep links to `index.html` while public files and hashed assets remain available. Only `/assets/` receives immutable long-lived caching. CSP allows the Convex cloud/WebSocket/site endpoints required by auth.

There are four workflows:

1. `ci.yml`: a single verification pipeline and a deployment-status smoke job.
2. `convex-deploy.yml`: production backend deployment on main backend/shared-runtime changes; duplicate type/tests are intentional deploy safety checks.
3. `codeql.yml`: JavaScript/TypeScript analysis on PR/main and a weekly schedule.
4. `audit.yml`: PR/weekly high-and-critical dependency audit. Moderate advisories remain visible; do not suppress findings to turn the job green.

All actions are pinned to commit SHAs and permissions are explicit. pnpm setup reads `packageManager`. Do not restore removed duplicate pipelines, dummy health checks, TypeDoc publication, dev-server Lighthouse audits, automatic rollback or approval-by-comment workflows.

CI builds require repository variables `VITE_CONVEX_URL` and `VITE_RECAPTCHA_SITE_KEY`. Production backend deployment requires `CONVEX_DEPLOY_KEY` and `CONVEX_DEPLOYMENT_PROD` in the configured GitHub environment. Before merging workflow changes, have an administrator verify required job names in branch protection/rulesets. Never weaken those controls to bypass failing or obsolete checks.

Known production targets (for **verification**, not permission to mutate):

- Vercel project `lights-inventory`: https://lights-inventory.vercel.app
- Vercel project `lights-inventory-4.6`: check its Git integration deployment/status URL.
- Convex backend: https://zealous-elephant-547.convex.cloud

Use `gh workflow list`, `gh run list`, `gh run view <run-id>` and `gh pr checks` after authorized publication. Report pending deployments/checks honestly; do not call rollout complete before they pass.

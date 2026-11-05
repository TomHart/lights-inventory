# Lights Inventory

Track properties, rooms, fixtures, installed bulbs, spare stock, maintenance and replacement reminders. Inventory can be exported and imported as versioned JSON.

## Stack

- React 19 and TanStack Router: a client-rendered static SPA, built with Vite.
- Convex: reactive database queries, transactional mutations and Convex Auth.
- Password authentication, email verification through Mailgun, and server-enforced reCAPTCHA Enterprise.
- Tailwind CSS 4, shadcn/ui, Biome, Vitest, convex-test and Playwright.

Node.js 22 or newer is required. Use the pnpm version pinned by `packageManager` in `package.json`; dependency versions and the lockfile are authoritative.

## Development

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec convex dev
```

Select a **development** deployment in the Convex CLI and configure its environment. In a second terminal, run `pnpm dev:app` for the frontend on port 3000. After initial setup, `pnpm dev` runs both processes.

### Configuration

The frontend requires these build-time variables in `.env.local` or Vercel:

| Variable                  | Purpose                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `VITE_CONVEX_URL`         | Convex deployment HTTPS URL; missing configuration produces an explicit application error |
| `VITE_RECAPTCHA_SITE_KEY` | Public reCAPTCHA Enterprise site key                                                      |

`CONVEX_DEPLOYMENT` selects the deployment used by the local Convex CLI. Set the following **on the corresponding Convex deployment**, not as `VITE_*` variables:

| Variable                                                          | Purpose                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY` | Enterprise assessment configuration; required for sign-in and sign-up |
| `RECAPTCHA_MIN_SCORE`                                             | Optional score threshold; defaults to `0.5`                           |
| `MAILGUN_SECRET`, `MAILGUN_DOMAIN`                                | Email delivery credentials and sending domain                         |
| `AUTH_EMAIL_FROM`                                                 | Optional sender address                                               |
| `MAILGUN_API_URL`                                                 | Optional Mailgun region endpoint; defaults to the EU endpoint         |
| `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`                             | Convex Auth configuration generated/configured for that deployment    |

Do not commit local environment files, authentication browser state or secrets. Frontend and backend site keys must match. Never rely on a development verification-code fallback in production; configure Mailgun before deployment.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm lint` enforces both formatting and lint rules, including warnings. `pnpm lint:fix` applies safe fixes; `pnpm format` only formats. The pre-commit hook runs `lint-staged`, not a full build. All checks above still belong in CI and before publication.

Vitest includes backend modules and frontend source in coverage, including untested application files. The initial global coverage floor is 20% for statements, branches, functions and lines; it is a regression floor, not a claim of comprehensive UI coverage. Backend tests exercise ownership, cascades, imports, input bounds, CAPTCHA and rate limits in an in-memory Convex harness.

Playwright starts its own **production build and preview server**, uses Chromium and tests anonymous navigation and assets. An authenticated inventory test is deliberately skipped without a disposable development account. To enable it:

1. Start the app against a disposable dev Convex deployment and sign in as a dedicated, verified test user.
2. Save that browser's Playwright storage state to an ignored file under `playwright/.auth/` using Playwright's codegen/storage-state support.
3. Set `E2E_DEV_CONVEX_URL` and `E2E_AUTH_STATE` to that deployment and state file, then run `pnpm test:e2e`. Set `E2E_PORT` to the same localhost port used when saving the session (default test port: 4173), and stop the setup server first: browser local storage is scoped to the complete origin, including port. The runner builds locally against the supplied dev URL. It rejects the known production backend and external frontend overrides for this mode.

The authenticated test creates a uniquely named property, room, fixture and bulb, changes status, downloads an export and deletes only its own test property. It saves refreshed browser state after cleanup so subsequent runs can use rotated refresh tokens; expired sessions still require a fresh sign-in. It must never run against production. Live login, email delivery and CAPTCHA still require a configured development environment; mocked tests and seeded verified users do not prove those integrations work end-to-end.

## Code layout

- `src/routes/__root.tsx`: application providers and shell.
- `src/routes/_authed.tsx`: pathless authentication layout; `_authed.*` children retain URLs such as `/properties` and `/fixture/$fixtureId`.
- `convex/schema.ts`: database schema. Shared entity values live in `src/lib/entity-types.ts`.
- `convex/auth.helpers.ts`: verified-user checks and typed ownership traversal. Query helpers return `null`; mutation helpers throw intentional `ConvexError` messages.
- `convex/validation.ts` and `src/lib/import-data.ts`: shared input bounds and import validation/counting.
- `convex/rateLimit.ts` and `convex/crons.ts`: durable per-subject counters and bounded stale-row cleanup.
- `convex/migrations.ts`: retained until the owner confirms the production backfill is complete.

Imports are additive, atomic, limited to 1 MB of UTF-8 JSON and bounded entity counts. Dashboard and search scans stop after 20,000 documents; the dashboard marks partial totals. Neither operation is intended as an unbounded analytics service.

## Deployment

Vercel Git integration owns frontend deployments: `pnpm build` emits `dist/index.html` and hashed assets. `vercel.json` supplies SPA rewrites, security headers and immutable caching only for `/assets/`. Public filenames such as `robots.txt` are revalidated rather than cached forever.

There are four GitHub Actions workflows:

- **CI**: formatting/lint, types, coverage, production build, Playwright and deployment-status smoke checks for root/deep links/assets.
- **Convex Deploy**: production backend deployment after its own type and test checks, on main changes to backend code or shared runtime dependencies. These checks intentionally repeat CI for deploy safety.
- **CodeQL**: pull-request/main analysis and a weekly security scan.
- **Security Audit**: pull requests and a weekly audit, failing on high/critical advisories. Moderate advisories remain visible and need triage.

Configure repository variables `VITE_CONVEX_URL` and `VITE_RECAPTCHA_SITE_KEY` for CI builds. The production deployment environment requires `CONVEX_DEPLOY_KEY` and `CONVEX_DEPLOYMENT_PROD`. No Vercel token is needed by these workflows, and CI failures do not automatically roll back unrelated deployments.

Before merging the workflow consolidation, have a repository administrator confirm that required check names match the new jobs. Do not weaken branch protection to make obsolete checks disappear. Publishing, changing repository rules and merging require owner approval. After publication, monitor CI, both configured Vercel projects and the Convex deployment, and verify production before calling rollout complete.

See `docs/code-review/` for the original findings and implementation checklist.

# Current Architecture

Companion to [`README.md`](./README.md). Finding IDs referenced here are detailed in
[`findings.md`](./findings.md).

---

## 1. One-paragraph description

Lights Inventory is a client-rendered React SPA that talks to a Convex deployment over a
WebSocket. There is no application server of our own: every read is a Convex `query`, every write
is a Convex `mutation`, and the only `action` is a reCAPTCHA check. Authentication is
password + emailed verification code via `@convex-dev/auth`. The frontend is built with Vite and
hosted on Vercel; the backend is deployed to Convex by a GitHub Actions workflow.

---

## 2. Component map

```
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                       │
│                                                               │
│  TanStack Router (file-based, src/routes/*)                   │
│    every route: ssr: false                                    │
│    7 of 9 routes wrapped in <AuthGuard>                       │
│                                                               │
│  ConvexAuthProvider  (src/integrations/convex/provider.tsx)   │
│    └── ConvexReactClient(VITE_CONVEX_URL)                     │
│                                                               │
│  shadcn/ui + Tailwind 4 + sonner toasts + lucide icons        │
│  theme: public/theme-init.js + src/components/ThemeToggle.tsx │
└───────────────┬──────────────────────────┬───────────────────┘
                │ WebSocket (queries,      │ HTTPS
                │  mutations, actions)     │ (static assets)
                ▼                          ▼
┌───────────────────────────────┐  ┌──────────────────────────┐
│ Convex deployment             │  │ Vercel                   │
│                               │  │  - static asset hosting  │
│  auth.ts        Password+Email│  │  - security headers      │
│  schema.ts      9 tables      │  │    (vercel.json)         │
│  properties/rooms/fixtures/   │  │  - @vercel/analytics     │
│    bulbs/inventory  CRUD      │  │  ⚠ currently 404 (CR-001)│
│  search.ts      dashboard+find│  └──────────────────────────┘
│  reminders.ts   due list      │
│  maintenance.ts logs          │           external
│  dataTransfer.ts import/export│  ┌──────────────────────────┐
│  recaptcha.ts   action        │──▶│ reCAPTCHA Enterprise API │
│  rateLimit.ts   token counter │  └──────────────────────────┘
│  http.ts        auth routes   │  ┌──────────────────────────┐
│                               │──▶│ Mailgun (verify emails)  │
└───────────────────────────────┘  └──────────────────────────┘
```

---

## 3. Responsibilities of each technology

| Technology                 | What it actually does here                                               | Assessment                                   |
| -------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| **React 19**               | All rendering. No class components, no custom hooks beyond library ones. | Appropriate                                  |
| **TanStack Router**        | File-based routing, typed params, `validateSearch` on one route.         | Appropriate                                  |
| **TanStack Start**         | Nominally provides SSR + a Nitro server. **Zero routes use SSR.**        | Unused — CR-011                              |
| **Vite 8**                 | Build + dev server.                                                      | Appropriate                                  |
| **Convex**                 | Database, server functions, auth, realtime sync. The entire backend.     | Appropriate and well used                    |
| **Vercel**                 | Static hosting + security headers + analytics.                           | Appropriate, misconfigured — CR-001          |
| **Tailwind 4 + shadcn/ui** | All styling. Tokens via CSS custom properties.                           | Appropriate; one leftover token set — CR-029 |
| **Playwright**             | 2 unauthenticated smoke tests against the dev server.                    | Under-used — CR-019                          |
| **Vitest**                 | 1 tautological test.                                                     | Effectively unused — CR-008                  |
| **Biome**                  | Linting only. Formatting is configured but never run in CI.              | Partially used — CR-022                      |
| **GitHub Actions**         | 13 workflows; 8 fire per push.                                           | Grossly over-provisioned — CR-010            |
| **Husky + lint-staged**    | Pre-commit typecheck+test+build; pre-push safety script.                 | Over-heavy — CR-014                          |
| **TypeDoc**                | Generates API docs for `convex/` into an artefact nobody publishes.      | Low value — CR-028                           |

---

## 4. Data flow

### 4.1 Read path (e.g. the fixture detail page)

```
src/routes/fixture.$fixtureId.tsx
  useQuery(api.fixtures.get,      { id })      ─┐
  useQuery(api.bulbs.listByFixture,{ fixtureId })├─ three independent subscriptions
  useQuery(api.maintenance.listByFixture, {…}) ─┘

each one, server side:
  getVerifiedUserId(ctx)                 → users table, checks emailVerificationTime
  ctx.db.get(fixtureId)
  ctx.db.get(fixture.roomId)
  ctx.db.get(room.propertyId)
  property.userId === userId ?           → else return null / []
  ctx.db.query(...).withIndex(...)       → indexed read
```

Loading is modelled by `data === undefined`; "not found or not yours" by `null` / `[]`.
Convex pushes updates over the socket, so there is no cache-invalidation code anywhere. This is
the right way to use Convex and is consistently applied.

### 4.2 Write path

```
component onSubmit
  → useMutation(api.x.y)({...})
      → getVerifiedUserId
      → ownership ladder (CR-012: duplicated ~20×)
      → ctx.db.insert / patch / delete
      → (bulbs.updateStatus also inserts a maintenanceLogs row)
  → toast.success(...)
  → catch { toast.error("Failed to …") }    ← discards the server message (CR-004)
```

### 4.3 Authentication flow

```
/login
  AuthForm.handleSubmit
    ① await verifyRecaptcha({ token, action })   ← Convex action, result is discarded
    ② await signIn("password", { email, password, flow })
       └ Password provider, verify: Email("verification-code")
          └ sendVerificationRequest → in-memory rate check (CR-006) → Mailgun
    ③ if !result.signingIn → sessionStorage[pending] = email → navigate /verify
/verify
    signIn("password", { email, code, flow: "email-verification" })
    → session created → useConvexAuth().isAuthenticated flips
    → AuthGuard stops redirecting
```

Steps ① and ② are **independent calls with no server-side link** — this is CR-005.

### 4.4 Integration points

| Boundary                      | Mechanism                                               | Secrets                                                           |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Browser ↔ Convex              | `ConvexReactClient` WebSocket                           | `VITE_CONVEX_URL` (public)                                        |
| Browser ↔ reCAPTCHA           | `enterprise.js` loaded at runtime from `www.google.com` | `VITE_RECAPTCHA_SITE_KEY` (public)                                |
| Convex ↔ reCAPTCHA Enterprise | `fetch` from an action                                  | `RECAPTCHA_PROJECT_ID`, `RECAPTCHA_API_KEY`, `RECAPTCHA_SITE_KEY` |
| Convex ↔ Mailgun              | `fetch` from the auth provider                          | `MAILGUN_SECRET`, `MAILGUN_DOMAIN`, `MAILGUN_API_URL`             |
| CI ↔ Convex                   | `npx convex deploy`                                     | `CONVEX_DEPLOY_KEY`                                               |
| CI ↔ Vercel                   | `vercel rollback`                                       | `VERCEL_TOKEN`                                                    |
| Git ↔ Vercel                  | Vercel Git integration (push → deploy)                  | n/a                                                               |

---

## 5. What is working well

Listed explicitly so a future agent does not "improve" things that are already right.

**Authorisation.** `convex/auth.helpers.ts` exposes one function, `getVerifiedUserId`, that
requires both a session _and_ `emailVerificationTime`. Every single exported query and mutation
calls it first. Every function that accepts a foreign-key argument then re-derives the owning
property and compares `property.userId`. I checked all 17 Convex modules; there is no function
that trusts a client-supplied ID without this walk. `bulbs.bulkUpdateStatus` even does it
per-element inside the loop and silently `continue`s on a mismatch rather than aborting.

**Schema design.** Literal unions (`roomTypes`, `socketTypes`, `bulbStatuses`,
`colourTemperatures`, `fixtureLocations`) are exported from `convex/schema.ts` and reused as
argument validators in the mutations. Indexes exist for every access pattern actually used
(`by_userId`, `by_propertyId`, `by_roomId`, `by_fixtureId`, `by_userId_active`). No query falls
back to a full table scan with `.filter()`.

**Cascading deletes.** Removing a property walks rooms → fixtures → bulbs and also deletes the
reminders and maintenance logs attached to each bulb and fixture. This is easy to get wrong and
it is correct here.

**Import hardening.** `dataTransfer.importAll` caps payload bytes, counts entities before
inserting anything, validates every enum against an explicit allow-list, rejects non-numeric
wattage, normalises URLs through `normalizeOptionalHttpUrl` (http/https only, 2048-char cap), and
applies a 5-per-hour per-user rate limit. Because Convex mutations are transactional, a mid-way
validation failure writes nothing.

**Frontend data handling.** No Redux, no Zustand, no react-query layer bolted on top of Convex's
own reactivity. Loading states use `=== undefined`; skeletons mirror the real layout. Dialogs are
local `useState`. For 9 screens this is exactly the right amount of machinery.

**Security headers.** `vercel.json` sets a real CSP, HSTS with preload, `frame-ancestors 'none'`,
`nosniff`, and a restrictive `Permissions-Policy`. Verified live via `curl -I` — they are being
applied.

---

## 6. Unnecessary complexity and inconsistencies

### 6.1 The SSR stack nobody uses — and the outage it caused

All nine route modules contain `ssr: false`:

```
src/routes/index.tsx:42            ssr: false,
src/routes/login.tsx:70            ssr: false,
src/routes/verify.tsx:21           ssr: false,
src/routes/properties.tsx:38       ssr: false,
src/routes/property.$propertyId.tsx:49  ssr: false,
src/routes/room.$roomId.tsx:58     ssr: false,
src/routes/fixture.$fixtureId.tsx:71    ssr: false,
src/routes/inventory.tsx:48        ssr: false,
src/routes/search.tsx:44           ssr: false,
```

This is the correct choice for this app — every page needs an authenticated Convex session, so
server rendering would produce a skeleton at best. But the consequence is that **TanStack Start,
Nitro, the `dist/server` bundle, and the Vercel serverless function are all carrying zero load.**

That dead weight then broke production. The chain is visible in git:

1. `5787e7c` (Init) — `vite.config.ts` includes `nitro({ rollupConfig: … })`; build emits `.output/`.
2. `fb207ed` — "Fix vite.config.ts typecheck error": the `nitro()` plugin is deleted.
3. `9249ced` — the `nitro` dependency is removed from `package.json`.
4. `vite build` now emits `dist/client` + `dist/server`.
5. Vercel serves `dist/` as a static root → `/` is 404, `/client/robots.txt` is 200.

A stale `.output/nitro.json` (preset `node-server`, dated 2026-11-04) is still sitting in the
working tree as evidence of step 1.

**Architectural recommendation (CR-011 / CR-001):** make the deployment match the code. Two
honest options:

|                            | Option A — restore Start's server build                             | Option B — ship a plain Vite SPA                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change                     | Re-add the Nitro plugin + Vercel preset, pinned to a stable version | Drop `@tanstack/react-start`; use `@tanstack/router-plugin/vite` (already a dependency) + `index.html`; set Vercel `outputDirectory: dist` with a SPA rewrite |
| Dependencies               | +1 (`nitro`)                                                        | −3 (`@tanstack/react-start`, `@tanstack/react-router-ssr-query`, `@tanstack/devtools-vite` becomes optional)                                                  |
| Hosting                    | Vercel serverless function + static                                 | Pure static/CDN                                                                                                                                               |
| Matches current behaviour? | No — keeps a server that renders nothing                            | Yes                                                                                                                                                           |
| Effort                     | Small                                                               | Medium (rewrite `__root.tsx` shell into `index.html` + `main.tsx`)                                                                                            |
| Future SSR possible?       | Yes, immediately                                                    | Would require re-adopting Start                                                                                                                               |

Option B is the simpler end state and is what the user's stated priorities point to. Option A is
the faster route back to green. **This needs a human decision** — it is the only place in this
review where I am recommending a structural change, and I am deliberately not picking for you.

Everything else in this review is valid under either option.

### 6.2 CI/CD out of proportion to the app

Thirteen workflows for ~6,000 lines of application code. Observed from `gh run list`, a single
push to `main` starts **eight** workflows, and `Deploy with Rollback` then starts **three more
times** because it also triggers on `workflow_run` completion of three other workflows.

Three workflows run substantially the same commands:

| Workflow           | lint | typecheck | test | coverage | build                                    |
| ------------------ | ---- | --------- | ---- | -------- | ---------------------------------------- |
| `ci.yml`           | ✅   | ✅        | ✅   | ✅       | —                                        |
| `code-quality.yml` | ✅   | —         | ✅   | ✅       | —                                        |
| `agent-safety.yml` | ✅   | ✅        | ✅   | —        | ✅ (+ a second redundant `tsc --noEmit`) |

Plus `convex-deploy.yml` independently re-runs typecheck and tests before deploying.

The proportionate shape for this repository is **four** workflows: one CI (lint/typecheck/test/
build + Playwright), one Convex deploy, one CodeQL, one Dependabot-adjacent audit. See CR-010.

### 6.3 Quality gates that cannot fail

- `vitest.config.ts` sets 50 % coverage thresholds. `pnpm test:coverage` reports `0/0` files, so
  the threshold is trivially satisfied (CR-008).
- `snyk.yml` wraps `pnpm audit` in `|| { echo warning; exit 0; }` (CR-026).
- `build-docs.yml` wraps `pnpm docs:build` in `|| echo "TypeDoc failed … skipping"`, then uploads
  `if: success()` — which is always true (CR-028).
- `lighthouse.yml` audits `pnpm dev` output, i.e. unminified modules with HMR, so the scores do
  not describe production (CR-035).
- `notify-on-failure.yml` has never actually run its body (CR-007).

Each of these turns a red signal into a green one. Collectively they are why a 404 in production
coexisted with thirteen passing workflows.

### 6.4 Duplication inside the application

| Duplicated thing                                  | Copies | Where                                                                                                                                  |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| bulb → fixture → room → property ownership ladder | ~20    | `convex/{bulbs,fixtures,rooms,maintenance,reminders}.ts`                                                                               |
| `<AuthGuard>` page wrapper                        | 7      | `src/routes/*.tsx`                                                                                                                     |
| `{ ...updates }` + "strip undefined" patch helper | 2      | `convex/bulbs.ts:621`, `convex/inventory.ts:64`                                                                                        |
| Entity enumerations                               | 4      | `convex/schema.ts` (validators), `convex/dataTransfer.ts` (`VALID_*` Sets), `src/lib/constants.ts` (labels), route-level option arrays |
| `ssr: false`                                      | 9      | every route                                                                                                                            |

None of these is harmful today, but each one is a place where a future change has to be made N
times. CR-012, CR-013, CR-027.

### 6.5 Leftover scaffolding

- `README.md` — unmodified TanStack Start template. Tells you to `npm install`, to delete
  `src/routes/demo/` (doesn't exist), and explains server functions and API routes that the app
  does not use. Three short sections about Convex and reCAPTCHA were added at the top.
- `src/components/Footer.tsx` — "© 2026 Your name here", links to `x.com/tan_stack` and
  `github.com/TanStack`. **Not imported anywhere**; `__root.tsx` has its own inline footer.
- `src/styles.css` lines 9–27 and 160–345 — a complete "sea / lagoon / palm / island" design
  system (`.island-shell`, `.feature-card`, `.nav-link`, `.rise-in`, `.site-footer`,
  `.display-title`). Grepping `src/**/*.tsx` finds **zero** uses of any of them except in the dead
  `Footer.tsx`. The `body` gradient they define is then overridden by the `@layer base` block at
  the end of the same file.
- `convex/env.ts` — exports `validateEnv()` and an `env` object; **imported by nothing**. Its
  top-level `if (process.env.CONVEX_DEPLOYMENT) validateEnv()` side effect contributes 7 of the
  47 lint warnings via non-null assertions.
- `.cta.json` — the Create TanStack App manifest, still listing `"nitro"` as a chosen add-on.

### 6.6 Two theming systems

`public/theme-init.js` + `src/components/ThemeToggle.tsx` implement a bespoke
light/dark/auto toggle writing `localStorage.theme` and a `.light` / `.dark` class.
Independently, `src/components/ui/sonner.tsx` imports `useTheme` from **next-themes** — but no
`next-themes` `ThemeProvider` is mounted anywhere in the tree, so `useTheme()` returns its default
and the toaster is permanently `"system"`, ignoring the app's own toggle. `next-themes` exists in
`package.json` solely to satisfy that one import.

`ThemeToggle` is also styled with `var(--chip-bg)` / `var(--chip-line)` / `var(--sea-ink)` — tokens
from the abandoned scaffolding palette in §6.5, not the shadcn token set used everywhere else.

---

## 7. Recommended architectural position

**Do not redesign this application.** The Convex model, the authorisation approach, and the
React data flow are all appropriate and should be preserved as-is.

The recommended architecture is the current one minus the parts that are not used:

```
Browser (static SPA on Vercel CDN)
   │  TanStack Router, React 19, shadcn/ui
   │  one <AuthGuard> layout route instead of seven wrappers
   ▼
Convex  (queries / mutations / one action)
   │  shared ownership helpers instead of twenty inline ladders
   │  ConvexError for anything the user should read
   ▼
Mailgun + reCAPTCHA Enterprise
```

with:

- **4 GitHub Actions workflows** instead of 13,
- **no automatic production rollback**,
- **one lockfile**,
- **tests that exercise the pure logic that actually exists** (`normalizeOptionalHttpUrl`,
  `enforceRateLimit`, `countImportEntities`, the import validator) plus Playwright for the
  authenticated happy path,
- **no SSR server**, matching the nine `ssr: false` declarations.

That is a strictly smaller system than the one in the repository today, and it is the main
message of this review.

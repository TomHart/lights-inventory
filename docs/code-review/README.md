# Repository Code Review — Lights Inventory

**Implementation status (2026-11-05):** Source remediations are published on
`fix/code-review-remediation` as draft PR #41, using the owner-approved static SPA and deletion choices.
At this publication checkpoint the PR is not merged; production rollout remains pending.
Consult PR #41 and its deployment checks for the subsequent merge and rollout outcome.
The remainder of this document and the other review documents describe the historical review
baseline, not the current working tree.

| Findings                                                               | Local remediation                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-001, CR-011                                                         | Static SPA emits `dist/index.html`; production-build root/deep-link/asset smoke tests and a failing deployment-status smoke job                                                                                                                           |
| CR-002, CR-005, CR-006                                                 | CAPTCHA enforced inside password authorization; durable hashed per-email attempt and email-send limits; live dev sign-in/sign-up reject missing CAPTCHA                                                                                                   |
| CR-003, CR-007, CR-010, CR-025, CR-026, CR-028, CR-035                 | Four workflows; removed automatic rollback, duplicate pipelines, ineffective monitoring, TypeDoc publication and dev-server Lighthouse; pinned actions and explicit permissions; audit fails on high/critical advisories                                  |
| CR-004, CR-016, CR-020                                                 | Intentional `ConvexError` handling, shared server bounds, unique per-key rate counters and scheduled bounded stale-row cleanup                                                                                                                            |
| CR-008, CR-019                                                         | Meaningful backend/helper regression tests, honest coverage including application files, a 20% global floor, Chromium with Playwright-owned production build/preview, and an opt-in authenticated inventory test                                          |
| CR-009, CR-018                                                         | One pnpm lockfile, unused packages removed, full audit clean; `@auth/core` retained because the installed Convex Auth package requires it as a peer                                                                                                       |
| CR-012, CR-013, CR-015, CR-027, CR-030, CR-031, CR-033                 | Typed ownership helpers, pathless auth layout, generated document/result types, shared entity values/import counting, bounded dashboard/search reads and route-boundary ID types                                                                          |
| CR-014, CR-017, CR-021, CR-022, CR-023, CR-024, CR-029, CR-032, CR-037 | Lightweight hook, obsolete files/CSS/docs removed, canonical theming, formatting enforced, actionable missing-env error, corrected ignore rules and rewritten README/AGENTS                                                                               |
| CR-034                                                                 | CSP allows Convex site endpoints; immutable caching only for hashed assets                                                                                                                                                                                |
| CR-036                                                                 | The finding's premise was checked against installed pnpm: `allowBuilds` **is recognized**. Retained its explicit script approval and moved active dependency-resolution settings into `pnpm-workspace.yaml`; removed the ignored package-level pnpm block |

The obsolete `.output`, `.nitro` and `.cache` directories were removed with specific owner
approval. Tracked Vercel project metadata was removed from Git while preserving the local link.
Existing classic branch protection requires `test`; the consolidated CI deliberately retains
that job name, so no repository protection changes were made.

**Outstanding acceptance checks / deliberate deferrals:**

- `convex/migrations.ts` remains by owner choice. A bounded read-only inspection of production
  `zealous-elephant-547` found 0 bulbs and 6 fixtures, with no legacy fixture fields and no
  outstanding bulb backfill candidates. This proves current data shape, not historical execution;
  no production inventory data was changed.
- Dev deployment, live negative CAPTCHA checks, all 99 unit/backend tests and all five
  Chromium tests passed. The authenticated test used an owner-prepared verified dev fixture
  and removed its own property after testing the hierarchy, status change and export.
  A subsequent owner-operated sign-up in a normal browser received the real verification email
  and successfully verified its code. The verified-user guard and CAPTCHA threshold were not
  weakened. Overall unit coverage is 32.97% lines and 27.1% functions, above the
  deliberately modest 20% floor; this is not comprehensive UI coverage.
- With explicit owner approval, the two public repository Actions variables were configured
  from development frontend settings. The owner separately configured the supported Vercel
  automation credential as a GitHub secret. Deployment protection and branch protection remain enabled.
- Formatting-only changes with equivalent compiled syntax were isolated in commit
  `75f6e9b94e5688672d5fdbf03adce753974082f6`. The repository permits only squash merges;
  with owner approval, the active `.git-blame-ignore-revs` reference was removed rather than
  leave a SHA absent from main's ancestry. Merge settings were not changed. Semicolon,
  trailing-comma and quote normalization were checked through compiled syntax-tree equivalence.
- PR #41's test, audit and CodeQL checks passed. Its protected Vercel preview smoke check
  encountered an authentication redirect and HTTP 403. CI now supports the project's official
  automation credential as a header, restricts destinations and refuses cross-origin redirects;
  the owner configured `VERCEL_AUTOMATION_BYPASS_SECRET`; a fresh preview must pass.
- CLI inspection confirms `lights-inventory` is the active project in `tomharts-projects`.
  The owner clarified the old second-project name; `lights-inventory-4.6` is not present in
  that team and is not treated as a second active deployment target.
- The owner approved merging only after checks and preview verification pass, followed by
  production verification. Local passes and a dev deployment are not a completed rollout.

**Review date:** 2026-11-05
**Commit reviewed:** `79659d6` ("Increase E2E server wait time") on `main`
**Reviewer:** automated single-pass review (Devin)
**Guiding principle:** simplicity is the primary architectural objective.

---

## 1. Purpose and scope

This is a full-repository review covering application structure, React patterns, the Convex
backend, Vercel configuration, Playwright tests, GitHub Actions, dependencies, TypeScript
configuration, security, error handling, developer experience, and documentation.

The goal is **not** to propose a grander architecture. It is to find the simplest arrangement
that works well and is cheap to maintain, and to remove everything that is not pulling its weight.

Deliverables:

| Document                                             | Contents                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [`README.md`](./README.md) (this file)               | Summary, headline findings, prioritised index, suggested order |
| [`architecture.md`](./architecture.md)               | How the system fits together today, what works, what doesn't   |
| [`findings.md`](./findings.md)                       | All 37 findings (CR-001 … CR-037) in detail                    |
| [`implementation-plan.md`](./implementation-plan.md) | Phased, executable task list for another agent                 |
| [`references.md`](./references.md)                   | External documentation used, with rationale                    |

---

## 2. Summary of the repository's current state

Lights Inventory is a small, single-user-per-account CRUD application: properties → rooms →
fixtures → bulbs, plus spare-bulb inventory, maintenance logs, reminders, and JSON import/export.

**Scale (excluding generated files and `node_modules`):**

| Area                     | Size                                                          |
| ------------------------ | ------------------------------------------------------------- |
| Convex backend           | 17 hand-written files, ~2,100 lines                           |
| React routes             | 9 routes, ~3,800 lines                                        |
| Shared components        | 5 app components + 17 shadcn/ui primitives                    |
| Unit tests               | 1 file, 1 test (`expect(true).toBe(true)`)                    |
| E2E tests                | 1 file, 2 unauthenticated smoke tests                         |
| GitHub Actions workflows | **13**                                                        |
| Documentation            | README (scaffolding), AGENTS.md (28 KB), 5 docs under `docs/` |

**Verification run locally during the review:**

| Command                                     | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `pnpm typecheck`                            | ✅ passes                                                     |
| `pnpm lint`                                 | ✅ exit 0, but **47 warnings**                                |
| `pnpm test`                                 | ✅ 1 test passes                                              |
| `pnpm test:coverage`                        | ✅ exit 0, but reports **0/0 files** — thresholds are vacuous |
| `pnpm build`                                | ✅ builds to `dist/client` + `dist/server`                    |
| `curl https://lights-inventory.vercel.app/` | ❌ **HTTP 404**                                               |

---

## 3. Overall architectural assessment

**The core application is genuinely good, and most of it should be left alone.**

Specifically, these are well done and should not be churned:

- **The Convex data model** (`convex/schema.ts`) is clean, normalised, properly indexed, and
  uses literal unions rather than free-text strings for enumerations.
- **Authorisation is correct.** Every query and mutation resolves the caller via
  `getVerifiedUserId()` and then walks bulb → fixture → room → property to confirm ownership
  before reading or writing. I looked for IDOR holes across all 17 Convex files and **found none**.
- **Data-destroying operations cascade properly.** `properties.remove`, `fixtures.remove` and
  `bulbs.remove` clean up dependent reminders and maintenance logs rather than orphaning them.
- **The import path is defensive**: size caps, entity-count caps, per-field validation, URL
  scheme normalisation, and a per-user rate limit, all inside one atomic mutation.
- **The UI is conventional** — shadcn/ui + Tailwind, `useQuery`/`useMutation` directly in
  components, `undefined` checked for loading states, skeletons while loading. For an app of this
  size, not adding a client state library is the right call.

**The problems are almost entirely in the layers wrapped _around_ the application:**

1. **The deployment is broken and nothing noticed.** Production returns 404 (see CR-001).
   Thirteen workflows run on every push and all report green.
2. **The CI/CD estate is wildly out of proportion to the app.** 13 workflows, 8 of which fire on a
   single push, with three near-identical lint/test/build jobs, a never-firing notifier, an
   effectively-disabled scheduled health check, and an unsupervised automatic production rollback.
3. **The quality gates are theatre.** The only unit test is `expect(true).toBe(true)`, the
   coverage thresholds measure nothing, the security audit always exits 0, and the docs build
   masks its own failure.
4. **Scaffolding has never been cleaned up.** The README is unmodified TanStack Start boilerplate
   referring to directories that don't exist; `src/components/Footer.tsx` still says "Your name
   here" and links to TanStack's X account; ~200 lines of an unused "island/lagoon" design system
   sit in `src/styles.css`.
5. **Every route sets `ssr: false`.** The app is a pure client-side SPA, yet it is built and
   deployed through TanStack Start's SSR + Nitro server stack. That mismatch is the direct cause
   of the production outage.

The honest summary: **the application is better than its infrastructure.** The highest-value work
is deleting and consolidating the infrastructure, not changing the app.

See [`architecture.md`](./architecture.md) for the full picture.

---

## 4. The most important findings

### 🔴 Production is down (CR-001)

```
$ curl -sI https://lights-inventory.vercel.app/
HTTP/2 404
x-vercel-error: NOT_FOUND

$ curl -s -o /dev/null -w "%{http_code}" https://lights-inventory.vercel.app/client/robots.txt
200
```

Vercel is serving the `dist/` directory as a static root, so the real site lives under
`/client/*` and `/` matches nothing. The cause is traceable in git: commit `fb207ed` removed the
`nitro()` plugin from `vite.config.ts` to silence a typecheck error, and `9249ced` removed the
`nitro` dependency. Without it the build emits `dist/client` + `dist/server` instead of a
deployable Nitro/Vercel output. All 13 workflows reported success through this.

### � Nothing is monitoring production (CR-007)

`health-check.yml` is scheduled `*/5 * * * *` (expected ~8,600 runs/month). It has run **3 times
in total**, and all 3 failed — correctly detecting the 404 above. Nobody was told, because
`notify-on-failure.yml` uses `if: ${{ failure() }}` on a `workflow_run` trigger, which evaluates
the notifier's own step status, not the upstream workflow's. Every one of its runs shows
`skipped`.

### � An unsupervised robot can roll back production (CR-003)

`deploy-with-rollback.yml` runs `vercel rollback --yes` whenever _CI Pipeline_, _Code Quality_ or
_Convex Deploy_ fails — including for a lint warning or a flaky test, and including for runs that
have nothing to do with the current production deployment. It also runs 3–4 times per push.

### 🟠 The reCAPTCHA gate does nothing (CR-005)

`src/routes/login.tsx` calls `api.recaptcha.verify` and then separately calls `signIn`. The two
calls are unlinked: `convex/auth.ts` never checks whether a captcha was solved. Any client can
call `signIn` directly and skip the captcha entirely.

### 🟠 Users never see the error messages the backend sends (CR-004)

Convex redacts uncaught `Error` messages in production deployments unless you throw `ConvexError`.
The codebase contains **zero** uses of `ConvexError`, yet carefully-worded messages like
`"Import exceeds bulb limit"` and `"Too many imports. Please wait and try again later."` are
surfaced to users via `err?.message`. In production those become a generic server error.

### 🟠 The quality gates measure nothing (CR-008)

```
$ pnpm test:coverage
Test Files  1 passed (1) | Tests  1 passed (1)
All files |  0 | 0 | 0 | 0
Statements : Unknown% ( 0/0 )
```

The 50 % thresholds in `vitest.config.ts` pass because zero files are instrumented. The sole test
asserts `true === true`.

---

## 5. Prioritised index of all findings

Full detail for each is in [`findings.md`](./findings.md).

### P0 — Critical

| ID                             | Title                                                                              | Category              |
| ------------------------------ | ---------------------------------------------------------------------------------- | --------------------- |
| [CR-001](./findings.md#cr-001) | Production returns HTTP 404 — build output no longer matches the Vercel deployment | Defect / availability |

### P1 — High

| ID                             | Title                                                                     | Category                |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------- |
| [CR-002](./findings.md#cr-002) | Anonymous caller can lock every user out of login for 10 minutes          | Security / availability |
| [CR-003](./findings.md#cr-003) | Automatic unsupervised `vercel rollback` on any CI failure                | Reliability risk        |
| [CR-004](./findings.md#cr-004) | No `ConvexError` usage — server error messages are redacted in production | Defect / UX             |
| [CR-005](./findings.md#cr-005) | reCAPTCHA verification is decoupled from sign-in and trivially bypassable | Security                |
| [CR-006](./findings.md#cr-006) | In-memory auth rate limiter is ineffective and leaks memory               | Security / reliability  |
| [CR-007](./findings.md#cr-007) | `notify-on-failure.yml` never fires; health check effectively disabled    | Reliability             |
| [CR-008](./findings.md#cr-008) | Test suite and coverage thresholds provide false assurance                | Reliability             |
| [CR-009](./findings.md#cr-009) | Two lockfiles in the repository; the npm one is stale and misnamed        | Reliability             |

### P2 — Medium

| ID                             | Title                                                                               | Category                      |
| ------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------- |
| [CR-010](./findings.md#cr-010) | 13 workflows with three duplicate lint/test/build pipelines                         | Simplification                |
| [CR-011](./findings.md#cr-011) | Every route is `ssr: false` — the SSR/Nitro stack is unused complexity              | Simplification / architecture |
| [CR-012](./findings.md#cr-012) | Ownership-check ladder duplicated ~20 times across Convex functions                 | Maintainability               |
| [CR-013](./findings.md#cr-013) | `<AuthGuard>` repeated in 7 routes instead of a pathless layout route               | Maintainability               |
| [CR-014](./findings.md#cr-014) | Git hooks run the full build on every commit; deprecated husky shim                 | Developer experience          |
| [CR-015](./findings.md#cr-015) | 26 `any` annotations where generated `Doc<>` types exist                            | Type safety                   |
| [CR-016](./findings.md#cr-016) | Inconsistent server-side input bounds across mutations                              | Data integrity                |
| [CR-017](./findings.md#cr-017) | Dead code: `Footer.tsx`, `convex/env.ts`, `convex/migrations.ts`, ~200 lines of CSS | Simplification                |
| [CR-018](./findings.md#cr-018) | Seven unused or redundant dependencies                                              | Simplification                |
| [CR-019](./findings.md#cr-019) | Playwright: manual server orchestration, 3 browsers, stale PID path                 | Simplification / reliability  |
| [CR-020](./findings.md#cr-020) | `rateLimits` table grows without bound; no cleanup                                  | Reliability                   |
| [CR-021](./findings.md#cr-021) | README is unmodified scaffolding; AGENTS.md version table is wrong                  | Documentation                 |
| [CR-022](./findings.md#cr-022) | Biome formatter is never enforced — indentation is inconsistent                     | Consistency                   |
| [CR-023](./findings.md#cr-023) | Missing `VITE_CONVEX_URL` silently falls back to a placeholder                      | Debuggability                 |
| [CR-024](./findings.md#cr-024) | `.vercel/project.json` committed; `.gitignore` negation defeated                    | Hygiene                       |
| [CR-025](./findings.md#cr-025) | Workflow hygiene: no `permissions:`, mixed pinning, pnpm major mismatch             | Security / reliability        |
| [CR-026](./findings.md#cr-026) | Security Audit workflow always exits 0; Dependabot has no schedule                  | Security                      |
| [CR-027](./findings.md#cr-027) | Entity enumerations are defined four times in three places                          | Maintainability               |

### P3 — Low

| ID                             | Title                                                               | Category      |
| ------------------------------ | ------------------------------------------------------------------- | ------------- |
| [CR-028](./findings.md#cr-028) | `build-docs.yml` masks its own failure; TypeDoc output is low value | Cleanup       |
| [CR-029](./findings.md#cr-029) | Two parallel design-token systems in `src/styles.css`               | Cleanup       |
| [CR-030](./findings.md#cr-030) | `dashboardStats` / `searchAll` do unbounded nested scans            | Performance   |
| [CR-031](./findings.md#cr-031) | `maintenance.listByFixture` has a redundant post-filter             | Cleanup       |
| [CR-032](./findings.md#cr-032) | Stale build artefacts and a duplicate `.cursorrules` in the tree    | Hygiene       |
| [CR-033](./findings.md#cr-033) | Route params cast with `as Id<"…">` instead of typed `params`       | Type safety   |
| [CR-034](./findings.md#cr-034) | Blanket `Cache-Control` in `vercel.json`; CSP omits `*.convex.site` | Configuration |
| [CR-035](./findings.md#cr-035) | Lighthouse CI audits the dev server, so scores are meaningless      | Cleanup       |
| [CR-036](./findings.md#cr-036) | `pnpm-workspace.yaml` contains a non-pnpm `allowBuilds` key         | Configuration |
| [CR-037](./findings.md#cr-037) | Obsolete planning documents under `docs/`                           | Documentation |

**Totals:** 1 × P0, 8 × P1, 18 × P2, 10 × P3 — **37 findings**.

---

## 6. Suggested implementation order

The order below is chosen so that each phase is independently shippable, early phases unblock
later ones, and later phases don't have to re-do earlier work. Full task breakdown in
[`implementation-plan.md`](./implementation-plan.md).

| Phase | Theme                                 | Findings                                               | Why here                                                                             |
| ----- | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **0** | Restore production                    | CR-001                                                 | Nothing else matters while the site is 404. Must be decided before CR-011.           |
| **1** | Stop the dangerous automation         | CR-003, CR-007, CR-026                                 | Removing the auto-rollback and fixing alerting is pure deletion and carries no risk. |
| **2** | Fix real correctness/security defects | CR-004, CR-005, CR-006, CR-002, CR-016                 | Smallest set of genuine behavioural bugs.                                            |
| **3** | Collapse CI to four workflows         | CR-010, CR-019, CR-025, CR-028, CR-035, CR-009         | Large simplification; do it after Phase 1 so the deleted workflows stay deleted.     |
| **4** | Make the tests mean something         | CR-008, CR-020                                         | Needs the CI shape from Phase 3 to be settled first.                                 |
| **5** | Delete dead code and dependencies     | CR-017, CR-018, CR-029, CR-032, CR-024, CR-036         | Low risk, high clarity gain. Do after Phase 0 decides the Start/SPA question.        |
| **6** | Reduce duplication in app code        | CR-012, CR-013, CR-015, CR-027, CR-033, CR-031         | Largest diff; leave until the surrounding noise is gone.                             |
| **7** | Documentation and DX                  | CR-021, CR-014, CR-022, CR-023, CR-037, CR-030, CR-034 | Best done last so the docs describe the final state.                                 |

> **One decision gates everything:** Phase 0 asks whether to **restore TanStack Start's Nitro
> build** or **drop Start and ship a plain Vite SPA**. Both fix the outage. The second is the
> simpler end state and is what the code already behaves like (CR-011), but it is a bigger
> one-off change. The plan documents both routes; the implementing agent should get a human
> decision before starting.

---

## 7. What I could not verify

Stated plainly so nobody treats these as confirmed:

- **Vercel project settings.** I can observe the deployed behaviour (404, headers applied, static
  `dist/` served) but not the project's Build & Output settings in the Vercel dashboard. The root
  cause of CR-001 is inferred from the git history plus the observed `/client/robots.txt` 200.
- **Whether `lights-inventory-4.6` (the second Vercel project) is healthy.** I did not guess its
  URL.
- **Convex production deployment health.** Not probed; requires credentials.
- **Whether `CODECOV_TOKEN`, `VERCEL_TOKEN`, `CONVEX_DEPLOY_KEY` secrets are configured.** Not
  readable.
- **Branch protection rules.** `docs/branch-protection-setup.md` says they were never applied;
  AGENTS.md says they exist. I did not resolve the contradiction.
- **Exact current TanStack Start Vercel deployment API.** The ecosystem moved recently; the plan
  tells the implementing agent to confirm against the live docs rather than trusting this review.

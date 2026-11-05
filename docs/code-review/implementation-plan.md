# Implementation Plan

Derived from [`findings.md`](./findings.md). Read [`README.md`](./README.md) first for context.

This plan is written for a coding agent working without the original review context. Each task is
self-contained: it names the files, the change, the dependencies, and how to prove it worked.

---

## How to use this plan

**Standard verification** — referenced throughout as _"run the standard checks"_:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

**Working rules**

1. **One task per branch and PR.** Tasks are sized to be reviewable individually.
2. **Do not batch across phases.** Later phases assume earlier ones landed.
3. **If a task's premise turns out to be wrong, stop and report it.** The review may have been
   mistaken; findings labelled _Confidence: inferred_ are the most likely candidates.
4. **Never commit a formatting change together with a behavioural change** (see T-7.3).
5. The repository's `AGENTS.md` describes a pre-commit hook that runs typecheck + test + build.
   T-7.2 removes it. Until then, commits will be slow; do not work around it with `--no-verify`.

**Phase summary**

| Phase | Tasks         | Theme                              | Can run in parallel with    |
| ----- | ------------- | ---------------------------------- | --------------------------- |
| 0     | T-0.1 … T-0.2 | Restore production                 | nothing — blocks everything |
| 1     | T-1.1 … T-1.3 | Remove dangerous/broken automation | Phase 2                     |
| 2     | T-2.1 … T-2.5 | Correctness and security defects   | Phase 1                     |
| 3     | T-3.1 … T-3.4 | Consolidate CI                     | after Phase 1               |
| 4     | T-4.1 … T-4.3 | Make tests meaningful              | after Phase 3               |
| 5     | T-5.1 … T-5.5 | Delete dead code and dependencies  | after Phase 0               |
| 6     | T-6.1 … T-6.5 | Reduce duplication in app code     | after Phase 2               |
| 7     | T-7.1 … T-7.6 | Documentation and DX               | last                        |

---

# Phase 0 — Restore production

> ⛔ **Production is currently returning HTTP 404.** Nothing else in this plan matters until this
> is fixed. Confirm the outage still exists before starting:
> ```bash
> curl -sI https://lights-inventory.vercel.app/ | head -2
> ```

---

## T-0.1 — Decide and implement the hosting model

**Finding(s):** [CR-001](./findings.md#cr-001), [CR-011](./findings.md#cr-011)
**Dependencies:** none
**Blocks:** T-0.2, and T-5.2 (dependency removal) depends on which option is chosen.

### Objective

Make `https://lights-inventory.vercel.app/` serve the application again, and make the hosting
model explicit in the repository rather than dependent on Vercel's framework auto-detection.

### Background the implementer needs

`vite build` currently emits `dist/client/**` and `dist/server/server.js`. Vercel is serving
`dist/` as a static root, which is why `/client/robots.txt` returns 200 and `/` returns 404.
This started when commit `fb207ed` removed the `nitro()` plugin from `vite.config.ts` and
`9249ced` removed the `nitro` dependency.

Separately, **all nine routes set `ssr: false`** — the application never server-renders.

### ⚠️ Get a human decision before starting

Present both options and wait:

**Option A — restore the TanStack Start server build (smaller change)**

- Re-add a Nitro Vite plugin to `vite.config.ts`, pinned to a **published stable** version (the
  previous `nitro: "npm:nitro-nightly@3.0.261103-rc"` must not come back).
- Select the Vercel preset.
- Confirm `pnpm build` emits a deployable output directory and that the Vercel project's Build &
  Output Settings match it.
- Fix the original typecheck error correctly: remove only the deprecated `rollupConfig` option,
  not the whole plugin.

**Option B — ship a static SPA (recommended end state)**

- `pnpm remove @tanstack/react-start @tanstack/react-router-ssr-query`
- Add `index.html` at the repository root and `src/main.tsx` as the client entry.
- Move the contents of `src/routes/__root.tsx`'s `shellComponent` (the `<html>`/`<head>`/`<body>`
  structure, the `theme-init.js` script tag, the stylesheet link) into `index.html`; keep
  `__root.tsx` as a normal root route rendering `<Header /> <Outlet /> <footer/> <Toaster />`.
- Replace `tanstackStart()` in `vite.config.ts` with
  `tanstackRouter({ target: 'react', autoCodeSplitting: true })` from
  `@tanstack/router-plugin/vite` (already a dependency).
- Remove `ssr: false` from all nine route files.
- Add to `vercel.json`:

  ```jsonc
  {
    "outputDirectory": "dist",
    "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }]
  }
  ```
- Confirm the Vercel project's Output Directory is `dist` (or that `vercel.json` overrides it).

### Files to modify

| Option A                         | Option B                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`, `package.json` | `vite.config.ts`, `package.json`, `index.html` (new), `src/main.tsx` (new), `src/routes/__root.tsx`, all 9 `src/routes/*.tsx`, `vercel.json` |

### Caveats

- **Do not trust this plan's API sketches for TanStack Start or the Nitro plugin.** Both have
  moved recently (the repo is on `@tanstack/react-start@1.169.4`, Vite 8, TypeScript 7). Check
  the current official documentation before writing code.
- Vercel project settings live outside this repository. If `vercel.json` alone does not change the
  behaviour, the dashboard's Build & Output Settings are overriding it and must be updated — flag
  this to the human rather than guessing.
- `src/routeTree.gen.ts` is generated. Let the plugin regenerate it; do not hand-edit.

### Acceptance criteria

- [ ] `pnpm build` succeeds and the output directory matches what `vercel.json` / the Vercel
  project declares.
- [ ] `pnpm preview` serves the app at `http://localhost:3000/` and `/login` renders the sign-in
  form.
- [ ] A Vercel **preview** deployment of the branch returns 200 at `/` and at a deep link such as
  `/properties`.
- [ ] Standard checks pass.

### Verification

```bash
pnpm build && pnpm preview --port 3000 &
sleep 5
curl -s -o /dev/null -w "root=%{http_code}\n"       http://localhost:3000/
curl -s -o /dev/null -w "deep=%{http_code}\n"       http://localhost:3000/properties
curl -s -o /dev/null -w "robots=%{http_code}\n"     http://localhost:3000/robots.txt
# all three must be 200
```

After merge to `main`:

```bash
curl -s -o /dev/null -w "prod=%{http_code}\n" https://lights-inventory.vercel.app/
# must be 200
```

---

## T-0.2 — Add a production smoke check that cannot be silenced

**Finding(s):** [CR-001](./findings.md#cr-001), [CR-003](./findings.md#cr-003)
**Dependencies:** T-0.1 (production must be healthy first, or the new check starts red)

### Objective

Ensure the next deployment-shape regression is caught automatically.

### Implementation

Add a job to `.github/workflows/ci.yml`. (If Phase 3 has already run, add it to the consolidated
workflow instead.)

```yaml
smoke:
  name: Production smoke check
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  permissions:
    contents: read
  steps:
    - name: Wait for Vercel and check the site responds
      run: |
        for i in $(seq 1 30); do
          code=$(curl -s -o /dev/null -w '%{http_code}' https://lights-inventory.vercel.app/)
          echo "attempt $i: $code"
          if [ "$code" = "200" ]; then exit 0; fi
          sleep 10
        done
        echo "::error::Production returned HTTP $code after 5 minutes"
        exit 1
```

**Critically: no `|| echo`, no `|| true`, no `continue-on-error`.** The existing
`deploy-with-rollback.yml` has exactly this check wrapped in `|| echo "Health check failed - Vercel
may still be deploying"`, which is why the outage was invisible.

### Acceptance criteria

- [ ] The job fails when production is unhealthy (test by pointing the URL at a known-404 path on
  a scratch branch, then revert).
- [ ] The job passes on `main` with production healthy.
- [ ] The job does **not** run on pull requests.

---

# Phase 1 — Remove dangerous and broken automation

Pure deletion. No application behaviour changes. Can proceed in parallel with Phase 2.

---

## T-1.1 — Delete the auto-rollback workflow

**Finding(s):** [CR-003](./findings.md#cr-003)
**Dependencies:** T-0.2 should land first so the smoke check replaces it.

### Objective

Stop an automated process from reverting production based on unrelated CI signals.

### Implementation

```bash
git rm .github/workflows/deploy-with-rollback.yml
```

Then check whether `Deploy with Rollback` is listed as a required status check:

```bash
gh api repos/TomHart/lights-inventory/rulesets
gh api repos/TomHart/lights-inventory/branches/main/protection 2>/dev/null
```

If it is, remove it from the required set **before** merging, or merges to `main` will block
forever on a check that no longer runs.

### Caveats

- `secrets.VERCEL_TOKEN` may become unused after this. Leave the secret in place (T-1.2 and other
  workflows may reference it); auditing secrets is out of scope.
- Rollback remains available via the Vercel dashboard
  ([Instant Rollback](https://vercel.com/docs/deployments/instant-rollback)) and `vercel rollback`.

### Acceptance criteria

- [ ] The file is gone.
- [ ] A push to `main` starts no `Deploy with Rollback` run.
- [ ] No required status check references it.
- [ ] Note in the PR description that rollback is now a manual, human-initiated action.

---

## T-1.2 — Delete the broken notifier and fix the health check

**Finding(s):** [CR-007](./findings.md#cr-007)
**Dependencies:** none

### Objective

Stop pretending alerting exists; make the uptime check either useful or absent.

### Implementation

**1. Delete the notifier** — its `if: ${{ failure() }}` on a `workflow_run` trigger evaluates its
own (empty) step history and is therefore never true. Every run in the repository's history shows
`skipped`.

```bash
git rm .github/workflows/notify-on-failure.yml
```

GitHub already emails the actor and repository administrators on workflow failure.

**2. For `health-check.yml`, choose one:**

- **(a) Delete it** and rely on T-0.2's post-deploy smoke check plus Vercel's own monitoring.
  _Simplest; recommended._
- **(b) Keep it but make it realistic and visible** — `*/5` delivered 3 runs in total, so the
  frequency is fiction:

  ```yaml
  name: Health Check
  on:
    schedule:
      - cron: "0 * * * *"     # hourly; GitHub does not honour tighter schedules reliably
    workflow_dispatch:
  permissions:
    contents: read
    issues: write
  jobs:
    health-check:
      runs-on: ubuntu-latest
      steps:
        - name: Check production
          id: check
          run: curl -fsS -o /dev/null https://lights-inventory.vercel.app/
        - name: Open an issue on failure
          if: failure()
          uses: actions/github-script@v7
          with:
            script: |
              const title = "Production health check failing";
              const { data: open } = await github.rest.issues.listForRepo({
                ...context.repo, state: "open", labels: ["health-check"],
              });
              if (open.length === 0) {
                await github.rest.issues.create({
                  ...context.repo, title, labels: ["health-check"],
                  body: `https://lights-inventory.vercel.app/ did not return 2xx.\n\nRun: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
                });
              }
  ```

  Note `if: failure()` **is** correct here — this job has preceding steps in the same job.

### Acceptance criteria

- [ ] `notify-on-failure.yml` deleted.
- [ ] Health check either deleted, or runs hourly and produces a GitHub issue on failure.
- [ ] If option (b): trigger it manually via `workflow_dispatch` against a deliberately bad URL on
  a scratch branch and confirm an issue is created. Revert.

---

## T-1.3 — Make the security audit able to fail

**Finding(s):** [CR-026](./findings.md#cr-026)
**Dependencies:** none

### Objective

Replace an always-green check with one that reports real advisories.

### Implementation

```bash
git mv .github/workflows/snyk.yml .github/workflows/audit.yml
```

Replace the contents with the workflow given in
[CR-026 § Recommended change](./findings.md#cr-026) — key points: remove the `|| { …; exit 0; }`
wrapper, use `--audit-level=high`, and move from push-triggered to `pull_request` + weekly
`schedule`.

Update `.github/dependabot.yml` to add an explicit `schedule` for the npm ecosystem and a
`github-actions` ecosystem entry (see CR-026 and CR-025).

### Caveats

- Run `pnpm audit --audit-level=high` locally **first**. If there are existing high-severity
  advisories, this task must either fix them or the PR must document them explicitly — do not
  silently lower the threshold back to `critical`.
- Also verify in repository settings that Dependabot **security updates** are enabled; those are
  independent of `dependabot.yml` and matter more than the scheduled version bumps.

### Acceptance criteria

- [ ] `pnpm audit --audit-level=high` exit status is reflected in the job status.
- [ ] Workflow runs on pull requests and weekly, not on every push.
- [ ] `dependabot.yml` has an explicit `schedule` for every `updates` entry.

---

# Phase 2 — Correctness and security defects

The only phase that changes application behaviour. Each task is independently shippable.

---

## T-2.1 — Surface real error messages using `ConvexError`

**Finding(s):** [CR-004](./findings.md#cr-004)
**Dependencies:** none
**Should land before:** T-6.1 (which touches every throw site)

### Objective

Make the backend's user-facing error messages actually reach users in production.

### Background

Convex redacts the message of any uncaught non-`ConvexError` exception on production deployments.
The repository contains **zero** `ConvexError` usages, yet surfaces `err?.message` to users and
even branches on its content in `src/routes/login.tsx`. This works in development and silently
degrades in production.

### Implementation

**Step 1 — backend.** In each file below, change user-facing `throw new Error(...)` to
`throw new ConvexError(...)` (import from `convex/values`):

| File                     | Throws to convert                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convex/rateLimit.ts`    | the `errorMessage ?? "Too many requests…"` throw                                                                                                                                         |
| `convex/dataTransfer.ts` | all import-validation throws (`"Import exceeds …"`, `Invalid roomType …`, `Invalid socketType …`, `"Invalid JSON format"`, `"Unsupported export format…"`, `"Import file is too large"`) |
| `convex/validation.ts`   | `"URL is too long"`, `"Invalid URL"`, `"Only http and https URLs are allowed"`                                                                                                           |
| `convex/maintenance.ts`  | the length/required-field validations                                                                                                                                                    |
| `convex/recaptcha.ts`    | the user-facing `"reCAPTCHA verification failed…"` throws                                                                                                                                |
| all CRUD modules         | `"Not authenticated"`, `"Not found"`, `"Not authorized"`                                                                                                                                 |

**Leave as plain `Error`** anything that would leak internals — e.g.
``throw new Error(`Failed to send verification email: ${body}`)`` in `convex/auth.ts`, which
embeds a raw Mailgun response.

**Step 2 — new file `src/lib/errors.ts`:**

```ts
import { ConvexError } from "convex/values";

/** Extract a safe, user-facing message from a Convex error, or fall back. */
export function userMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message: unknown }).message);
    }
  }
  return fallback;
}
```

**Step 3 — call sites.** Replace all 18 `catch` blocks in `src/routes/*.tsx`:

```tsx
// before
} catch {
  toast.error("Failed to create property");
}
// after
} catch (err) {
  toast.error(userMessage(err, "Failed to create property"));
}
```

Affected: `fixture.$fixtureId.tsx` (4), `index.tsx` (3), `inventory.tsx` (2), `login.tsx` (1),
`properties.tsx` (2), `property.$propertyId.tsx` (2), `room.$roomId.tsx` (2), `search.tsx` (1),
`verify.tsx` (1).

**Step 4 — `src/routes/login.tsx`.** Delete the `msg.includes(...)` chain at lines 208-229. Throw
structured errors from the backend instead:

```ts
throw new ConvexError({
  code: "RATE_LIMITED",
  message: "Too many attempts. Please wait.",
});
```

and branch on `err.data.code` in the component.

### Acceptance criteria

- [ ] `grep -rn "throw new Error" convex/ | grep -v _generated` returns only internal/leaky errors,
  each with a brief comment explaining why it stays redacted.
- [ ] No `catch {` without a binding remains in `src/routes/`.
- [ ] Manual test against a **dev** deployment: trigger a rate limit by running the import 6 times
  in an hour; confirm the real message appears in the toast.
- [ ] Standard checks pass.

### Caveats

Only convert messages that are safe to show a user. When in doubt, leave it redacted.

---

## T-2.2 — Bind reCAPTCHA to the sign-in operation, or remove it

**Finding(s):** [CR-005](./findings.md#cr-005), [CR-002](./findings.md#cr-002)
**Dependencies:** T-2.1 recommended first (shared error handling)

### Objective

Make the bot-protection control actually protect sign-in, or stop paying for one that does not.

### Background

`src/routes/login.tsx` calls `api.recaptcha.verify` and then separately calls `signIn`. The server
never links the two, so any client can call `signIn` directly and skip the captcha. Additionally,
`convex/recaptcha.ts` rate-limits on two **global** buckets (`global:${action}` at 20 per 10 min,
`global:all` at 300 per 10 min), so an anonymous caller can exhaust them and block login for
everyone.

### Implementation

**Step 1 — investigate.** Determine whether `@convex-dev/auth@0.0.96`'s `Password` provider offers
a server-side hook that receives the extra `signIn` params before credentials are checked. Read
the installed package and the live Convex Auth documentation. **Do not guess.**

**Step 2a — if a hook exists:** pass `recaptchaToken` through `signIn("password", {...})` and
verify it inside the provider, before authentication. Re-key the rate limit to the submitted email
(lower-cased) rather than a global bucket. Remove the separate `verifyRecaptcha` call from
`login.tsx`.

**Step 2b — if no hook exists:** remove reCAPTCHA entirely and replace it with a real,
server-enforced per-email rate limit on sign-in attempts:

- `git rm convex/recaptcha.ts`
- Remove `ensureRecaptchaLoaded`, the `Window.grecaptcha` declaration, `getRecaptchaToken`, and
  the `verifyRecaptcha` call from `src/routes/login.tsx` (lines 20-66, 145, 156-169, 196-201).
- Remove `https://www.google.com` and `https://www.gstatic.com` from `script-src`,
  `connect-src` and `frame-src` in `vercel.json`.
- Remove `VITE_RECAPTCHA_SITE_KEY` and `RECAPTCHA_*` from `.env.example` and the README.
- Add an `enforceRateLimit` call keyed on the email for the sign-in path.

**Either way — fix the global buckets.** If `convex/recaptcha.ts` survives, change
`global:${actionBucket}` and `global:all` to include a per-subject component, or raise
`RECAPTCHA_GLOBAL_MAX_ATTEMPTS` to a level that represents genuine abuse (≥ 5,000) and log rather
than throw when it is exceeded.

### Acceptance criteria

- [ ] Calling the sign-in path without solving a captcha either fails (2a) or the captcha no longer
  exists (2b).
- [ ] No rate-limit bucket is keyed on a constant string.
- [ ] Sign-in and sign-up still work end to end against a dev deployment.
- [ ] If 2b: CSP, `.env.example` and README no longer reference reCAPTCHA.
- [ ] Standard checks pass.

### Caveats

This touches the authentication path. Test sign-up → verification email → code entry → sign-in →
sign-out manually against a **dev** Convex deployment before opening the PR. Do not deploy
untested.

---

## T-2.3 — Replace the in-memory auth rate limiter

**Finding(s):** [CR-006](./findings.md#cr-006)
**Dependencies:** T-2.2 (the fix may fall out of it naturally)

### Objective

Make verification-email rate limiting durable, or remove the misleading code.

### Background

`convex/auth.ts:5-37` keeps a module-level `Map`. Convex executes functions in V8 isolates that
are recycled and may be distributed, so module state is a best-effort cache, not shared state. The
`Map` also never evicts. The file's own comment acknowledges the problem.

### Implementation

In order of preference:

1. **Official component.** `pnpm add @convex-dev/rate-limiter`, register it in
   `convex/convex.config.ts`, and call it from a context with `ctx`.
2. **Reuse `enforceRateLimit`** if T-2.2 moved captcha/auth checks into a place that has a Convex
   context:

   ```ts
   await enforceRateLimit(ctx, {
     key: `auth:verify:${email.toLowerCase()}`,
     limit: 5,
     windowMs: 60 * 60 * 1000,
     errorMessage: "Too many verification requests. Please try again later.",
   });
   ```
3. **If neither is achievable, delete the `Map` and `checkAuthRateLimit` entirely** and note in the
   PR that verification-email rate limiting is currently provided only by Mailgun's own sending
   limits. Removing a protection that does not work is better than leaving a misleading one.

### Acceptance criteria

- [ ] No module-level mutable `Map` remains in `convex/`.
- [ ] If a limiter remains, it is backed by the database or the official component.
- [ ] Requesting 6 verification codes for the same email within an hour is rejected on the 6th
  (verify against a dev deployment).
- [ ] Standard checks pass.

---

## T-2.4 — Add consistent server-side input bounds

**Finding(s):** [CR-016](./findings.md#cr-016)
**Dependencies:** T-2.1 (use `ConvexError` for the new messages)

### Objective

Stop invalid data entering the database — particularly `NaN` wattages, which permanently poison
the dashboard aggregate.

### Implementation

Add to `convex/validation.ts` the three helpers from
[CR-016 § Recommended change](./findings.md#cr-016): `requireText`, `requireCount`,
`requireWattage`. Use `ConvexError`, not `Error`.

Apply:

| File                     | Function           | Change                                                                                  |
| ------------------------ | ------------------ | --------------------------------------------------------------------------------------- |
| `convex/properties.ts`   | `create`, `update` | `name: requireText(args.name, "Property name", 200)`                                    |
| `convex/rooms.ts`        | `create`, `update` | same for `name`                                                                         |
| `convex/fixtures.ts`     | `create`, `update` | `name` (optional, max 200), `notes` (optional, max 2000)                                |
| `convex/bulbs.ts`        | `create`, `update` | `wattage: requireWattage(...)`, `notes`/`productName` length caps                       |
| `convex/inventory.ts`    | `create`, `update` | `requireWattage`, `requireCount(quantity, …, 100_000)`                                  |
| `convex/inventory.ts`    | `adjustQuantity`   | bound `delta` to ±10,000                                                                |
| `convex/reminders.ts`    | `create`           | `requireText(args.message, "Message", 500)`; reject `reminderDate` outside a sane range |
| `convex/dataTransfer.ts` | `importAll`        | route names/notes/wattages through the same helpers                                     |

**Store the trimmed value**, so `"   "` cannot become a name.

### Acceptance criteria

- [ ] `properties.create({ name: "" })` is rejected.
- [ ] `properties.create({ name: "x".repeat(10_000) })` is rejected.
- [ ] `bulbs.create({ wattage: NaN })` is rejected.
- [ ] `bulbs.create({ wattage: -5 })` is rejected.
- [ ] `inventory.create({ quantity: -1 })` is rejected.
- [ ] Normal CRUD still works through the UI for every entity.
- [ ] Standard checks pass.

### Caveats

Check for pre-existing rows that would violate the new bounds before deploying — an existing
over-length name would start failing on its next edit. Given the forms already constrain input,
this is unlikely, but a quick dashboard query is cheap insurance.

---

## T-2.5 — Bound the `rateLimits` table and simplify the limiter

**Finding(s):** [CR-020](./findings.md#cr-020)
**Dependencies:** T-2.2 / T-2.3 (which may introduce per-subject keys, making this necessary)

### Objective

Prevent unbounded growth of the `rateLimits` table and remove a defensive loop that cannot fire.

### Implementation

**1. Simplify the read** in `convex/rateLimit.ts`:

```ts
const active = await ctx.db
  .query("rateLimits")
  .withIndex("by_key", (q) => q.eq("key", key))
  .unique();
```

Delete the `.collect()` + sort + `for (const extra of existing.slice(1)) delete` block. Convex
mutations are serialisable transactions, so duplicate rows for a key cannot be created.

**2. Add `convex/crons.ts`** and a `purgeStale` internal mutation — see
[CR-020 § Recommended change](./findings.md#cr-020) for the exact code. Use `.take(1000)` to stay
within transaction limits.

**Alternative:** if T-2.3 adopted `@convex-dev/rate-limiter`, delete `convex/rateLimit.ts` and the
`rateLimits` table from `convex/schema.ts` entirely and skip this task.

### Acceptance criteria

- [ ] `enforceRateLimit` uses `.unique()`.
- [ ] `convex/crons.ts` exists and the job appears in the Convex dashboard under Schedules
  (or the component replaced the whole thing).
- [ ] Import rate limiting still works: 6 imports within an hour, the 6th is rejected.
- [ ] Standard checks pass.

### Caveats

Removing a table from `convex/schema.ts` requires the table to be empty, or Convex will reject the
schema push. Clear it from the dashboard first if taking the component route.

---

# Phase 3 — Consolidate CI

Large deletion, no application code changes. **Do not start until Phase 1 has landed**, or the
workflows deleted there will be re-created by merge conflicts.

---

## T-3.1 — Collapse thirteen workflows into four

**Finding(s):** [CR-010](./findings.md#cr-010), [CR-025](./findings.md#cr-025)
**Dependencies:** T-1.1, T-1.2, T-1.3
**Blocks:** T-3.2, T-3.3, T-3.4

### Objective

One CI workflow, one deploy workflow, one security-scan workflow, one audit workflow.

### Implementation

**Delete:**

```bash
git rm .github/workflows/agent-approval.yml \
       .github/workflows/agent-safety.yml \
       .github/workflows/code-quality.yml \
       .github/workflows/lighthouse.yml \
       .github/workflows/build-docs.yml
```

(`deploy-with-rollback.yml`, `notify-on-failure.yml` and `snyk.yml` were handled in Phase 1;
`e2e.yml` is handled in T-3.2.)

**Rewrite `.github/workflows/ci.yml`** as a single sequential job:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # reads packageManager from package.json (T-7.1)
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:coverage
      - run: pnpm build
      - run: npx playwright install --with-deps chromium
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
  # plus the `smoke` job from T-0.2
```

**Simplify `convex-deploy.yml`:** remove its duplicate `Typecheck` and `Run tests` steps and add
`needs: verify` — or keep it standalone but accept the duplication is intentional for deploy
safety. Prefer `needs:`; a single source of truth for "is the code good".

**Keep `codeql.yml`**, removing the `Autobuild` step (unnecessary for JavaScript/TypeScript) and
adding a weekly `schedule`.

**Add `permissions: contents: read`** (or the minimum required) to every remaining workflow.

**Agent-PR review enforcement** previously provided by `agent-approval.yml` should move to branch
protection / rulesets, which cannot be bypassed.

### ⚠️ Required status checks

Before merging, list the current required checks and update them to the new job names, or merges
to `main` will block on checks that no longer exist:

```bash
gh api repos/TomHart/lights-inventory/rulesets
```

### Acceptance criteria

- [ ] `ls .github/workflows/` shows exactly four files.
- [ ] A push to `main` starts at most three workflow runs (CI, CodeQL, and Convex Deploy when
  `convex/**` changed).
- [ ] Every workflow has a `permissions:` block.
- [ ] Required status checks in branch protection match the new job names.
- [ ] CI passes on a test PR.

---

## T-3.2 — Move Playwright server startup into `playwright.config.ts`

**Finding(s):** [CR-019](./findings.md#cr-019)
**Dependencies:** T-3.1, T-0.1 (the build output must be correct for `pnpm preview` to work)

### Objective

Replace ~40 lines of hand-rolled CI server orchestration with Playwright's `webServer` option, and
test the production build rather than the dev server.

### Implementation

Rewrite `playwright.config.ts` per
[CR-019 § Recommended change](./findings.md#cr-019). Key changes:

- Add a `webServer` block running `pnpm build && pnpm preview --port 3000`.
- Honour `process.env.E2E_BASE_URL` so the same suite can run against a deployed URL (and skip
  `webServer` when it is set).
- Reduce `projects` to chromium only.
- Reduce `retries` in CI from 2 to 1.
- Use `[["html", { open: "never" }], ["github"]]` reporters in CI.

```bash
git rm .github/workflows/e2e.yml
```

Playwright install + `pnpm test:e2e` are already in the T-3.1 CI job.

### Caveats

- `pnpm dev` ran `convex dev`, which required Convex credentials in CI. Using `pnpm preview`
  removes that dependency, but **the existing tests only check routing and DOM presence** —
  confirm they still pass without a live backend. The `/` → `/login` redirect is driven by
  `useConvexAuth`, which should report unauthenticated without a reachable backend; if it hangs
  instead, the test needs `VITE_CONVEX_URL` set to the dev deployment.
- The `Stop dev servers` step in the deleted workflow had a bug (`/tmp/server.pid` written,
  `logs/server.pid` read). No need to preserve it.

### Acceptance criteria

- [ ] `pnpm test:e2e` works locally with no server running beforehand.
- [ ] `E2E_BASE_URL=https://lights-inventory.vercel.app pnpm test:e2e` runs without starting a
  local server.
- [ ] `e2e.yml` is deleted and E2E runs inside the CI job.
- [ ] No `sleep` of a fixed duration remains anywhere in `.github/workflows/`.

---

## T-3.3 — Remove Lighthouse CI

**Finding(s):** [CR-035](./findings.md#cr-035)
**Dependencies:** T-3.1 (already deletes the file)

### Objective

Stop auditing a dev server and reporting the numbers as if they meant something.

### Implementation

Covered by T-3.1's deletion. If performance tracking is wanted, add Vercel Speed Insights next to
the existing `@vercel/analytics` import in `src/routes/__root.tsx`:

```tsx
import { SpeedInsights } from "@vercel/speed-insights/react";
…
<Analytics />
<SpeedInsights />
```

**Get a decision first** — Speed Insights has a usage quota beyond the free tier. If declined,
simply deleting the workflow is the correct outcome.

### Acceptance criteria

- [ ] `lighthouse.yml` is gone.
- [ ] Either Speed Insights is wired up, or the PR records the decision not to.

---

## T-3.4 — Consolidate to a single lockfile and declare the package manager

**Finding(s):** [CR-009](./findings.md#cr-009)
**Dependencies:** T-3.1 (so the version pins are removed in one place)

### Objective

One package manager, one lockfile, one declared version.

### Implementation

```bash
git rm package-lock.json
```

Add to `package.json`:

```jsonc
"packageManager": "pnpm@11.1.0"
```

(Match the maintainer's actual local version — `pnpm --version` reported `11.1.0` during the
review.)

Remove `with: { version: 10 }` from every `pnpm/action-setup` step and bump to `@v4`, which reads
`packageManager` automatically.

Set the Vercel project's Install Command to `pnpm install --frozen-lockfile` explicitly.

### Caveats

- `pnpm-lock.yaml` is `lockfileVersion: '9.0'`. Confirm pnpm 11 does not rewrite it on install; if
  it does, commit the regenerated lockfile in the same PR.
- `package-lock.json` is named `lights-inventory-4.6` while `package.json` is `lights-inventory`,
  confirming it is stale.

### Acceptance criteria

- [ ] Only `pnpm-lock.yaml` remains.
- [ ] `packageManager` is set in `package.json`.
- [ ] No workflow hard-codes a pnpm version.
- [ ] `pnpm install --frozen-lockfile` succeeds in CI.
- [ ] A Vercel preview deployment builds successfully.

---

# Phase 4 — Make the tests meaningful

---

## T-4.1 — Fix coverage configuration and delete the tautological test

**Finding(s):** [CR-008](./findings.md#cr-008)
**Dependencies:** T-3.1

### Objective

Make `pnpm test:coverage` measure the codebase instead of reporting `0/0`.

### Implementation

In `vitest.config.ts`, add `coverage.include`:

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "json", "html"],
  include: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
  exclude: [
    "convex/_generated/**",
    "src/routeTree.gen.ts",
    "src/components/ui/**",   // vendored shadcn primitives
    "**/*.test.ts",
  ],
  thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },  // set honestly in T-4.2
},
```

```bash
git rm src/lib/smoke.test.ts
```

Add `--passWithNoTests` to the `test` script temporarily so CI does not fail between this task and
T-4.2, and remove it again in T-4.2.

### Acceptance criteria

- [ ] `pnpm test:coverage` reports a non-zero file count.
- [ ] The reported percentage is the real one (expect something close to 0 %).
- [ ] CI passes.

---

## T-4.2 — Write real unit tests for the pure logic

**Finding(s):** [CR-008](./findings.md#cr-008)
**Dependencies:** T-4.1, T-2.4 (so the new validators are covered too)

### Objective

Test the functions that have genuine logic and no I/O.

### Implementation

Create these test files:

**`convex/validation.test.ts`** — `normalizeOptionalHttpUrl`. This is security-relevant; be
thorough:

| Input                           | Expected              |
| ------------------------------- | --------------------- |
| `undefined`                     | `undefined`           |
| `""`, `"   "`                   | `undefined`           |
| `"https://example.com/x"`       | normalised URL string |
| `"http://example.com"`          | normalised URL string |
| `"javascript:alert(1)"`         | throws                |
| `"data:text/html,<script>"`     | throws                |
| `"ftp://example.com"`           | throws                |
| `"not a url"`                   | throws                |
| `"https://" + "a".repeat(3000)` | throws ("too long")   |

Plus the T-2.4 helpers: `requireText` (empty, whitespace, over-length, trimming),
`requireCount` (negative, fractional, over-max), `requireWattage` (`NaN`, `Infinity`, negative,
over-max).

**`convex/dataTransfer.test.ts`** — `countImportEntities`: empty object, missing `properties`,
nested counting across properties → rooms → fixtures → bulbs, non-array values at each level.
(Export the function first if it is not already exported.)

**`src/lib/password-strength.test.ts`** — extract the `passwordStrength` `useMemo` body from
`src/routes/login.tsx:171-184` into `src/lib/password-strength.ts`, then test all five score
bands.

Then set `vitest.config.ts` thresholds to the actual achieved numbers rounded down, so they ratchet
rather than block.

### Acceptance criteria

- [ ] At least 30 assertions across at least 3 test files.
- [ ] `pnpm test` fails if `normalizeOptionalHttpUrl` is changed to accept `javascript:` URLs
  (verify by temporarily breaking it).
- [ ] Coverage thresholds reflect reality and pass.
- [ ] `--passWithNoTests` removed from the `test` script.

### Caveats

Do **not** add `@testing-library/react` or `jsdom` back for this task — all five targets are pure
functions testable in the existing `node` environment.

---

## T-4.3 — Add an authenticated end-to-end happy path

**Finding(s):** [CR-008](./findings.md#cr-008), [CR-019](./findings.md#cr-019)
**Dependencies:** T-3.2

### Objective

Have at least one test that exercises the actual application.

### Implementation

Add `e2e/inventory.spec.ts` covering: sign in → create a property → create a room → create a
fixture → create a bulb → mark it dead → assert the dashboard "Dead" count incremented → delete
the property.

Authentication options, in order of preference:

1. A Convex seed mutation that creates a verified test user, guarded so it refuses to run against
   a production deployment (check `process.env.CONVEX_CLOUD_URL` or an explicit
   `ALLOW_TEST_SEED` environment variable).
2. A dedicated long-lived test account whose credentials come from GitHub Actions secrets.

Use Playwright's [storage state](https://playwright.dev/docs/auth) so the sign-in runs once in
`globalSetup` rather than per test.

### Acceptance criteria

- [ ] The test passes locally against a dev Convex deployment.
- [ ] The test passes in CI.
- [ ] Deliberately breaking `convex/bulbs.ts`'s ownership check or `updateStatus` makes it fail.
- [ ] No production credentials are involved.

### Caveats

This is the largest task in Phase 4 and needs a Convex dev deployment reachable from CI. If that
is not available, implement it as a locally-runnable test excluded from CI via a project filter,
and say so in the PR — a test that only runs locally is still worth more than none.

---

# Phase 5 — Delete dead code and dependencies

Low risk, high clarity. **Requires T-0.1 to have decided the Start/SPA question**, since that
changes which dependencies are dead.

---

## T-5.1 — Delete unused files and code

**Finding(s):** [CR-017](./findings.md#cr-017)
**Dependencies:** T-0.1

### Implementation

```bash
git rm src/components/Footer.tsx convex/env.ts .cta.json
```

- Remove `export { convex };` from `src/integrations/convex/provider.tsx:24`.
- **`convex/migrations.ts`:** before deleting, confirm the backfill has run in production. Run
  `npx convex run migrations:backfillSocketTypeAndFeatures` once against production and check
  `bulbsUpdated === 0`. **Ask the owner before running anything against production.** If
  confirmed, `git rm convex/migrations.ts`.

### Acceptance criteria

- [ ] `pnpm build` succeeds (proves nothing imported them).
- [ ] Lint warnings drop by 7 (the `convex/env.ts` non-null assertions).
- [ ] The app still renders correctly — `__root.tsx` has its own inline footer, so no visual change
  is expected.

---

## T-5.2 — Remove unused dependencies

**Finding(s):** [CR-018](./findings.md#cr-018)
**Dependencies:** T-0.1, T-5.1

### Implementation

```bash
pnpm remove @convex-dev/react-query @tanstack/react-router-ssr-query @auth/core \
            jsdom @testing-library/react @testing-library/dom wait-on
```

If T-0.1 chose **Option B**, also remove `@tanstack/react-start` (if not already) and keep
`@tanstack/router-plugin` (it becomes a direct requirement).

Handle `next-themes` in T-5.3.

### Caveats

- `@auth/core` is a peer dependency of `@convex-dev/auth`. After removal, run a clean install
  (`rm -rf node_modules && pnpm install`) and `pnpm build`. If anything complains, re-add it and
  note why in the PR — pnpm's strict `node_modules` layout makes this worth verifying rather than
  assuming.
- Verify each package has zero import sites before removing:

  ```bash
  for p in @convex-dev/react-query @tanstack/react-router-ssr-query jsdom wait-on; do
    echo "== $p"; grep -rn "$p" src convex e2e *.ts 2>/dev/null
  done
  ```

### Acceptance criteria

- [ ] Clean install + standard checks pass.
- [ ] A Vercel preview deployment builds and serves correctly.

---

## T-5.3 — Unify theming and remove `next-themes`

**Finding(s):** [CR-017](./findings.md#cr-017), [CR-029](./findings.md#cr-029)
**Dependencies:** T-5.1

### Objective

One theming mechanism. Today there are two, and the second one does nothing.

### Background

`src/components/ui/sonner.tsx` imports `useTheme` from `next-themes`, but no `next-themes`
`ThemeProvider` is mounted, so the toaster is permanently `"system"` and ignores the app's own
toggle. `src/components/ThemeToggle.tsx` and `public/theme-init.js` implement the real mechanism
(a `.light`/`.dark` class plus `localStorage.theme`).

### Implementation

1. Remove the `useTheme` import from `src/components/ui/sonner.tsx`. Either read the app's own
   theme state, or pass `theme="system"` explicitly and let the `.dark` class drive appearance —
   which is already the de facto behaviour.
2. `pnpm remove next-themes`
3. **Restyle `ThemeToggle`** off the scaffolding palette (`var(--chip-bg)`, `var(--chip-line)`,
   `var(--sea-ink)`) onto shadcn tokens. Simplest: reuse `<Button variant="ghost" size="sm">`, as
   `SignOutButton` in `Header.tsx` does. **This must happen before T-5.4 removes those tokens.**

### Acceptance criteria

- [ ] Toggling light → dark → auto still works and persists across reloads.
- [ ] Toasts are legible in both light and dark mode.
- [ ] `grep -rn "next-themes" src/` returns nothing.
- [ ] No flash of unstyled/incorrectly-themed content on load (`theme-init.js` still runs first).

---

## T-5.4 — Remove the unused design-token system from `src/styles.css`

**Finding(s):** [CR-029](./findings.md#cr-029)
**Dependencies:** T-5.1 (deletes `Footer.tsx`), T-5.3 (restyles `ThemeToggle`)

### Objective

One token system. Target: 347 lines → ~120.

### Implementation

Delete from `src/styles.css`:

- The set-1 custom properties in `:root` and `.dark`: `--sea-ink`, `--sea-ink-soft`, `--lagoon`,
  `--lagoon-deep`, `--palm`, `--sand`, `--foam`, `--surface`, `--surface-strong`, `--line`,
  `--inset-glint`, `--kicker`, `--bg-base`, `--header-bg`, `--chip-bg`, `--chip-line`,
  `--link-bg-hover`, `--hero-a`, `--hero-b`.
- The `body` gradient declaration and the `body::before` / `body::after` rules (all overridden by
  the `@layer base` block at the end of the file).
- `.page-wrap`, `.display-title`, `.island-shell`, `.feature-card`, `.feature-card:hover`,
  `.island-kicker`, `.nav-link` (+ `::after`, `:hover`, `.is-active`), `.rise-in` +
  `@keyframes rise-in`, `.site-footer`, `.prose pre`, the global `button, .island-shell, a`
  transition rule.
- `Fraunces` from the Google Fonts `@import` (only `.display-title` used it).

**Keep:** the shadcn `:root` / `.dark` oklch tokens, `@theme inline`, `@custom-variant dark`, the
`a`/`code`/`pre code` base styles, and the final `@layer base` block.

**Verify every class is unused before deleting:**

```bash
for c in island-shell feature-card nav-link rise-in site-footer page-wrap display-title island-kicker; do
  echo -n "$c: "; grep -rl "$c" src --include=*.tsx | tr '\n' ' '; echo
done
# all must be empty
```

### Acceptance criteria

- [ ] `src/styles.css` is under 150 lines.
- [ ] All 9 routes render correctly in **both** light and dark mode — check each one manually.
- [ ] The Google Fonts request fetches only Manrope.

### Caveats

This is the only purely visual change in the plan. Screenshot each route before and after.

---

## T-5.5 — Clean up the ignore rules and stale artefacts

**Finding(s):** [CR-024](./findings.md#cr-024), [CR-032](./findings.md#cr-032), [CR-036](./findings.md#cr-036)
**Dependencies:** none

### Implementation

```bash
git rm -r --cached .vercel
rm -rf .output .nitro .cache dist coverage
```

Rewrite `.gitignore` with negations **after** the patterns they negate — use the block in
[CR-024 § Recommended change](./findings.md#cr-024). This fixes the current bug where the trailing
`.env*` overrides `!.env.example`, and adds the missing `coverage` and `.cache`.

Resolve the pnpm settings duplication (CR-036): either delete `pnpm-workspace.yaml` and keep
`pnpm.onlyBuiltDependencies` in `package.json`, or move the setting into
`pnpm-workspace.yaml` as `onlyBuiltDependencies:` and drop the `package.json` block. **Not both.**
The current `allowBuilds:` key is not a pnpm setting.

Fold `.cursorrules` into `AGENTS.md` (the two useful paragraphs: the Convex `v` validator
reference and the `pnpm dlx shadcn@latest add` command) and `git rm .cursorrules`.

### Acceptance criteria

- [ ] `git check-ignore -v --no-index .env.example` reports `!.env.example` (not `.env*`).
- [ ] `git status` is clean after `pnpm test:coverage`.
- [ ] `rm -rf node_modules && pnpm install && pnpm build` succeeds (proves the build-approval
  setting still works — esbuild failing to build is loud).
- [ ] Only one pnpm settings location exists.

---

# Phase 6 — Reduce duplication in application code

The largest diffs. Do these last among code changes, so they land on a clean base.

---

## T-6.1 — Extract ownership helpers

**Finding(s):** [CR-012](./findings.md#cr-012), [CR-031](./findings.md#cr-031)
**Dependencies:** T-2.1 (so the helpers throw `ConvexError` from the start)

### Objective

Replace ~20 copies of the bulb → fixture → room → property ownership ladder with six functions.

### Implementation

Add to `convex/auth.helpers.ts` (keep the existing `getVerifiedUserId`):

```ts
requireVerifiedUserId(ctx)                      // throws ConvexError("Not authenticated")

requirePropertyOwner(ctx, propertyId)  → { userId, property }
requireRoomOwner(ctx, roomId)          → { userId, room, property }
requireFixtureOwner(ctx, fixtureId)    → { userId, fixture, room, property }
requireBulbOwner(ctx, bulbId)          → { userId, bulb, fixture, room, property }

getPropertyOwner / getRoomOwner / getFixtureOwner / getBulbOwner   // query variants, return null
```

Return the **whole chain** so call sites do not re-fetch documents the ladder already loaded —
`bulbs.updateStatus` needs `fixture._id` for its maintenance-log insert, for example.

Then rewrite every call site:

| File                    | Sites                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| `convex/bulbs.ts`       | 7                                                                      |
| `convex/fixtures.ts`    | 6                                                                      |
| `convex/rooms.ts`       | 4                                                                      |
| `convex/maintenance.ts` | 3 (+ remove the redundant `.then(filter)` — CR-031)                    |
| `convex/reminders.ts`   | 1                                                                      |
| `convex/properties.ts`  | 5                                                                      |
| `convex/inventory.ts`   | 5 (user-owned directly — `requireVerifiedUserId` + an ownership check) |

### Acceptance criteria

- [ ] No file in `convex/` except `auth.helpers.ts` contains the four-level `ctx.db.get` ladder.
- [ ] Queries still return `[]` / `null` for unauthorised access; mutations still throw.
- [ ] `bulbs.bulkUpdateStatus` still _skips_ unauthorised IDs rather than aborting the whole batch
  — preserve this behaviour deliberately; it uses the `get*` (non-throwing) variant.
- [ ] `maintenance.listByFixture` no longer has a post-`collect` filter.
- [ ] The T-4.3 E2E test still passes.
- [ ] Standard checks pass.

### Caveats

This is a security-relevant refactor. Go file by file, not with a regex. Diff each converted
function against its original and confirm the guarantees are identical. If T-4.3 did not land,
test ownership manually with two accounts before merging.

---

## T-6.2 — Replace `<AuthGuard>` with a pathless layout route

**Finding(s):** [CR-013](./findings.md#cr-013)
**Dependencies:** T-6.1 (avoid two large diffs colliding)

### Objective

Make authentication structural rather than opt-in.

### Implementation

1. Create `src/routes/_authed.tsx` with the layout component from
   [CR-013 § Recommended change](./findings.md#cr-013).
2. Rename the seven protected routes:
   - `index.tsx` → `_authed.index.tsx`
   - `properties.tsx` → `_authed.properties.tsx`
   - `property.$propertyId.tsx` → `_authed.property.$propertyId.tsx`
   - `room.$roomId.tsx` → `_authed.room.$roomId.tsx`
   - `fixture.$fixtureId.tsx` → `_authed.fixture.$fixtureId.tsx`
   - `inventory.tsx` → `_authed.inventory.tsx`
   - `search.tsx` → `_authed.search.tsx`
   - **Leave `login.tsx` and `verify.tsx` where they are.**
3. In each renamed file, delete the `XPage` wrapper and the `<AuthGuard>` import; export the
   content component directly as the route `component`.
4. `git rm src/components/AuthGuard.tsx`
5. Let the router plugin regenerate `src/routeTree.gen.ts`.

### Acceptance criteria

- [ ] URLs are **unchanged** — `/properties`, `/room/$roomId` etc. still resolve. The `_authed`
  segment is pathless and must not appear in any URL.
- [ ] Visiting `/properties` signed out redirects to `/login`.
- [ ] Visiting `/login` signed in redirects to `/`.
- [ ] Every internal `<Link to="...">` still type-checks.
- [ ] The T-4.3 E2E test passes.

### Caveats

Large mechanical diff. Commit the file renames and the content edits **separately** so git detects
the renames and the review stays readable.

The canonical TanStack pattern uses `beforeLoad` + `throw redirect(...)`, which avoids rendering
the protected tree at all. That needs auth state outside React (the Convex client in router
context) and is a bigger change — **do not attempt it in this task.** Note it as possible future
work.

---

## T-6.3 — Replace `any` with generated Convex types

**Finding(s):** [CR-015](./findings.md#cr-015)
**Dependencies:** T-6.1, T-6.2 (both change the shapes involved)

### Objective

Get `pnpm lint` to zero warnings, and keep it there.

### Implementation

1. Replace all 26 `any` annotations with `Doc<"table">`, `Id<"table">`, or
   `FunctionReturnType<typeof api.x.y>` — see
   [CR-015 § Recommended change](./findings.md#cr-015) for examples.
   - `convex/env.ts`'s 7 non-null-assertion warnings disappear with T-5.1.
   - `convex/dataTransfer.ts`'s `parsed: any` may stay (genuinely untrusted JSON), but prefer
     `unknown` with the existing explicit validation.
2. Fix both `useButtonType` warnings by adding `type="button"`:
   `src/components/Header.tsx` (mobile menu toggle), `src/router.tsx` (reload button).
3. Fix the `useOptionalChain` warning.
4. For the 11 `noArrayIndexKey` warnings — all static skeleton lists — add a targeted suppression
   with a reason:

   ```tsx
   // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder list
   ```
5. Once the count is zero, change the script so it stays zero:

   ```jsonc
   "lint": "biome check --error-on-warnings ."
   ```

### Acceptance criteria

- [ ] `pnpm lint` reports **0 warnings, 0 errors**.
- [ ] `pnpm lint` exits non-zero if a warning is reintroduced (test by adding a stray `any`).
- [ ] `pnpm typecheck` passes.
- [ ] CI passes.

---

## T-6.4 — Single-source the entity enumerations

**Finding(s):** [CR-027](./findings.md#cr-027)
**Dependencies:** T-6.3

### Objective

Define each enumeration once, and make a missing label a compile error.

### Implementation

Follow [CR-027 § Recommended change](./findings.md#cr-027):

1. In `convex/schema.ts`, export `as const` arrays (`ROOM_TYPES`, `FIXTURE_LOCATIONS`,
   `SOCKET_TYPES`, `BULB_STATUSES`, `COLOUR_TEMPERATURES`) and derive both the union types and the
   `v.union(...)` validators from them.
2. In `convex/dataTransfer.ts`, build the `VALID_*` Sets from those arrays and delete the
   hand-written literal lists.
3. In `src/lib/constants.ts`, import the types and change every label map from
   `Record<string, string>` to `Record<RoomType, string>` etc. Remove the `|| x` fallbacks at call
   sites, which become unnecessary.
4. Delete `countImportData` from `src/routes/index.tsx:64-95`; export `countImportEntities` from
   `convex/dataTransfer.ts` and use it for the client-side preview.

### Acceptance criteria

- [ ] Each enumeration's values appear exactly once in the codebase.
- [ ] Adding a value to `SOCKET_TYPES` and running `pnpm typecheck` produces an error pointing at
  the missing label entry (verify, then revert).
- [ ] Export → import round-trip still works through the UI.
- [ ] Standard checks pass.

### Caveats

Verify that `v.union(...ARRAY.map((s) => v.literal(s)))` still produces a correctly-typed validator
in Convex 1.49. If the spread degrades inference, keep the explicit `v.union(v.literal(...), …)`
and derive only the array from it. **Run `pnpm typecheck` immediately after this specific change.**

---

## T-6.5 — Validate route params at the route boundary

**Finding(s):** [CR-033](./findings.md#cr-033)
**Dependencies:** T-6.2 (routes are renamed there)

### Implementation

Add a `params.parse` / `params.stringify` pair to the three `$param` routes so
`Route.useParams()` returns a correctly-typed `Id<"…">` — see
[CR-033 § Recommended change](./findings.md#cr-033).

Remove the resulting `as Id<"…">` casts from the component bodies.

In `src/routes/search.tsx`, change `selectedIds` from `Set<string>` to `Set<Id<"bulbs">>` and
delete the `as unknown as Array<import("…").Id<"bulbs">>` double assertion. Add a normal top-level
`import type { Id } from "../../convex/_generated/dataModel"`.

### Acceptance criteria

- [ ] No inline `import("...")` type expressions remain in `src/`.
- [ ] At most one `as Id<...>` cast per route file, located in the route definition.
- [ ] Deep links to `/fixture/$fixtureId`, `/room/$roomId`, `/property/$propertyId` still work.
- [ ] Bulk status update from the search page still works.

---

# Phase 7 — Documentation and developer experience

---

## T-7.1 — Rewrite the README

**Finding(s):** [CR-021](./findings.md#cr-021)
**Dependencies:** all earlier phases (so it describes the final state)

### Objective

Replace 191 lines of TanStack Start template with ~60 lines about this application.

### Implementation

Delete everything inherited from the scaffold — including the sections on removing Tailwind,
adding routes, server functions, API routes, loaders, and the "Demo files" section referring to a
non-existent `src/routes/demo/`.

Write, in order:

1. **What it is** — one paragraph. Properties → rooms → fixtures → bulbs, spare inventory,
   maintenance logs, reminders, JSON import/export.
2. **Prerequisites** — Node 22, pnpm (version from `packageManager`), a Convex account.
3. **Setup** — `pnpm install`; `cp .env.example .env.local`; `npx convex dev` to provision; a table
   of which variables belong in Convex vs. Vercel vs. `.env.local`.
4. **Commands** — `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`.
5. **Architecture** — three sentences, linking to
   `docs/lights-inventory-4.6-architecture-brief.md`.
6. **Deployment** — Vercel Git integration for the frontend; `convex-deploy.yml` for the backend.

### Acceptance criteria

- [ ] No reference to `src/routes/demo/`, `npm install`, or removing Tailwind.
- [ ] Every command listed exists in `package.json`.
- [ ] Every environment variable listed exists in `.env.example`.
- [ ] A new developer can go from clone to running app following only the README.

---

## T-7.2 — Simplify the git hooks

**Finding(s):** [CR-014](./findings.md#cr-014)
**Dependencies:** T-3.1 (CI must cover what the hooks stop doing)

### Implementation

`.husky/pre-commit` becomes exactly:

```sh
npx lint-staged
```

(no shebang, no `. "$(dirname "$0")/_/husky.sh"` — that shim is deprecated in husky 9 and removed
in 10.)

```bash
git rm .husky/pre-push scripts/safety-check.sh
```

`package.json`:

```jsonc
"lint-staged": {
  "*.{ts,tsx,json,md}": ["biome check --write --no-errors-on-unmatched"]
}
```

Remove the `safety-check` script.

Update `AGENTS.md`: the "MANDATORY PRE-COMMIT CHECKLIST" should say that CI runs the full checks
and that hooks only format staged files.

### Acceptance criteria

- [ ] `git commit` completes in under 2 seconds on a one-file change.
- [ ] No husky deprecation warning on commit.
- [ ] `scripts/` is empty or removed.
- [ ] CI still catches a deliberate type error pushed to a branch.

---

## T-7.3 — Enforce formatting with Biome

**Finding(s):** [CR-022](./findings.md#cr-022)
**Dependencies:** T-6.3, T-7.2 — and this must be the **last code-touching task**

### Implementation

1. Add to `biome.json`:

   ```jsonc
   "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 }
   ```
2. `pnpm exec biome check --write .`
3. **Commit the result as a single commit containing nothing else.**
4. Record the SHA in `.git-blame-ignore-revs`:

   ```
   # Repo-wide Biome formatting (docs/code-review CR-022)
   <sha>
   ```

   GitHub honours this file automatically.
5. Confirm `"lint": "biome check --error-on-warnings ."` (set in T-6.3) now also enforces
   formatting.

### Acceptance criteria

- [ ] `pnpm exec biome check .` reports no diagnostics.
- [ ] The formatting commit contains **zero** behavioural changes (`git show --stat` should be
  whitespace only; spot-check with `git diff -w` producing an empty diff).
- [ ] `.git-blame-ignore-revs` exists and names the commit.
- [ ] CI passes.

---

## T-7.4 — Fail fast on a missing `VITE_CONVEX_URL`

**Finding(s):** [CR-023](./findings.md#cr-023)
**Dependencies:** none

### Implementation

Replace the placeholder fallback in `src/integrations/convex/provider.tsx` with a thrown error —
see [CR-023 § Recommended change](./findings.md#cr-023). The router's existing
`defaultErrorComponent` in `src/router.tsx` will display the message.

### Acceptance criteria

- [ ] Building and running with `VITE_CONVEX_URL` unset shows a clear on-screen error naming the
  variable and where to set it.
- [ ] With the variable set, behaviour is unchanged.
- [ ] **Before merging**, confirm every Vercel environment (production _and_ preview) has
  `VITE_CONVEX_URL` set — otherwise previews will hard-fail.

---

## T-7.5 — Tidy `vercel.json`

**Finding(s):** [CR-034](./findings.md#cr-034)
**Dependencies:** T-0.1 (which may already have edited this file)

### Implementation

- Remove the blanket `Cache-Control` from the `/(.*)` rule; keep only the security headers there.
- Remove the redundant `/assets/(.*)` rule (subsumed by the extension-based rule).
- Add `https://*.convex.site` to the CSP `connect-src` directive — Convex Auth HTTP routes are
  served from that domain and will be needed if OAuth or magic links are ever added.
- If T-2.2 removed reCAPTCHA, also remove `https://www.google.com` and `https://www.gstatic.com`
  from `script-src`, `connect-src` and `frame-src`.

### Acceptance criteria

- [ ] After deploying, `curl -I https://lights-inventory.vercel.app/` shows the security headers
  and **no** `Cache-Control: max-age=0` on the HTML (let Vercel decide).
- [ ] `curl -I https://lights-inventory.vercel.app/assets/<hashed>.js` shows
  `max-age=31536000, immutable`.
- [ ] No CSP violations in the browser console on any route, signed in and signed out.

---

## T-7.6 — Prune and correct the documentation

**Finding(s):** [CR-037](./findings.md#cr-037), [CR-021](./findings.md#cr-021), [CR-032](./findings.md#cr-032)
**Dependencies:** everything else — this records the final state

### Implementation

```bash
git rm docs/agent-guardrails-investigation.md docs/implementation-phases-2-4.md
```

Both describe completed or abandoned plans and contain wrong version numbers. Git history
preserves them.

**`docs/branch-protection-setup.md`:** determine the actual state —

```bash
gh api repos/TomHart/lights-inventory/rulesets
```

Apply the rules if they are missing (ask the owner first), then replace the file with a short
record of what is configured, or delete it and state the rules in `AGENTS.md`. **Resolve the
contradiction with AGENTS.md either way.**

**`docs/agent-safeguards.md`:** rewrite to match the post-T-7.2 hooks, or delete it — if the hook
is one line, there is nothing to document.

**`docs/lights-inventory-4.6-architecture-brief.md`:** keep. Update its technology-stack section
to match reality and cross-link it from the README and from
[`architecture.md`](./architecture.md).

**`AGENTS.md`:**
- Delete the "Tech Stack" version table (it will always drift); replace with
  "run `pnpm list --depth 0`".
- Update the workflow inventory to the four workflows from T-3.1.
- Update the pre-commit checklist to match T-7.2.
- Correct "Node.js 20" to 22.
- Absorb the two useful paragraphs from `.cursorrules` (T-5.5).

**`docs/code-review/`:** add a short note at the top of this plan's README recording which tasks
were completed, so the review itself does not become stale documentation.

### Acceptance criteria

- [ ] No document in `docs/` states a dependency version that disagrees with `package.json`.
- [ ] No document references a workflow file that no longer exists.
- [ ] The branch-protection question has a single, correct answer in exactly one place.
- [ ] `docs/` contains only documents describing the present state.

---

## Appendix — Task dependency graph

```
T-0.1 ──┬─> T-0.2 ──> T-1.1
        │
        ├─> T-3.2 (needs working build output)
        └─> T-5.1 ──> T-5.2
                 └──> T-5.3 ──> T-5.4

T-1.1 ──┐
T-1.2 ──┼─> T-3.1 ──┬─> T-3.2 ──> T-4.3
T-1.3 ──┘           ├─> T-3.3
                    ├─> T-3.4
                    ├─> T-4.1 ──> T-4.2
                    └─> T-7.2

T-2.1 ──┬─> T-2.2 ──> T-2.3
        ├─> T-2.4 ──> T-4.2
        └─> T-6.1 ──> T-6.2 ──┬─> T-6.3 ──> T-6.4
T-2.2 ──────> T-2.5           └─> T-6.5

T-5.5   (independent)
T-7.4   (independent)
T-7.5   (after T-0.1)

T-6.3, T-7.2 ──> T-7.3 (formatting — must be last code change)
everything ──> T-7.1, T-7.6 (documentation — last)
```

## Appendix — Expected net effect

| Metric                           | Before                  | After (estimated)                    |
| -------------------------------- | ----------------------- | ------------------------------------ |
| Production availability          | **404**                 | 200                                  |
| GitHub Actions workflow files    | 13                      | 4                                    |
| Workflow runs per push to `main` | ~11                     | ~3                                   |
| Lockfiles                        | 2                       | 1                                    |
| Direct dependencies              | 42                      | ~33                                  |
| Lint warnings                    | 47                      | 0 (enforced)                         |
| Unit tests                       | 1 (tautological)        | ~30 assertions over real logic       |
| E2E tests                        | 2 unauthenticated smoke | 2 smoke + 1 authenticated happy path |
| `src/styles.css`                 | 347 lines               | ~120 lines                           |
| Duplicated ownership ladders     | ~20                     | 0                                    |
| Checks that cannot fail          | 4                       | 0                                    |
| Automated production rollback    | yes                     | no                                   |

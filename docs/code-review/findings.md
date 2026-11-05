# Detailed Findings

Companion to [`README.md`](./README.md) and [`architecture.md`](./architecture.md).
Tasks that implement these are in [`implementation-plan.md`](./implementation-plan.md).

Every finding below was observed directly in the repository or by running a read-only command.
Where something is inferred rather than observed, it is labelled **Confidence: inferred** and the
reasoning is given. Nothing here is a style preference dressed up as a defect; the few places
where I am expressing a preference say so.

**Legend** — Priority: `P0` critical · `P1` high · `P2` medium · `P3` low.

---

<a id="cr-001"></a>
## CR-001 — Production returns HTTP 404; the build output no longer matches the Vercel deployment

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| **Priority**   | **P0 — Critical**                                                            |
| **Category**   | Defect / availability                                                        |
| **Confidence** | **Observed** (live HTTP responses); root cause **inferred** from git history |

### Affected files

- `vite.config.ts`
- `package.json` (the removed `nitro` dependency)
- `vercel.json`
- Vercel project **Build & Output Settings** (not in this repository)
- Commits `fb207ed`, `9249ced`

### Current behaviour

```console
$ curl -sI https://lights-inventory.vercel.app/
HTTP/2 404
x-vercel-error: NOT_FOUND
cache-control: public, max-age=0, must-revalidate
content-security-policy: default-src 'self'; …        ← vercel.json IS applied
server: Vercel

$ curl -s -o /dev/null -w "%{http_code}\n" https://lights-inventory.vercel.app/login
404
$ curl -s -o /dev/null -w "%{http_code}\n" https://lights-inventory.vercel.app/robots.txt
404
$ curl -s -o /dev/null -w "%{http_code}\n" https://lights-inventory.vercel.app/client/robots.txt
200          ← the site's files are there, one directory level too deep
```

The security headers from `vercel.json` are being served, which proves a deployment exists and is
live. `/client/robots.txt` returning 200 proves Vercel is serving the repository's `dist/`
directory as the static root, so everything the app needs is published under `/client/*` and
nothing matches `/`.

Locally:

```console
$ pnpm build
✓ built in 389ms
# emits dist/client/** and dist/server/server.js
```

### Problem

The build output shape changed and the hosting configuration was never updated.

Traceable in git:

1. **`5787e7c` (Init)** — `vite.config.ts` contained:

   ```ts
   import { nitro } from 'nitro/vite'
   …
   nitro({ rollupConfig: { external: [/^@sentry\//] } }),
   ```

   With the Nitro plugin, the build produced `.output/` (a deployable server bundle). The stale
   `.output/nitro.json` still in the working tree confirms this — `"preset": "node-server"`,
   dated `2026-11-04T18:26:12Z`.
2. **`fb207ed`** — _"Fix vite.config.ts typecheck error for Convex deployment — Remove deprecated
   nitro rollupConfig option that causes TypeScript typecheck to fail in CI/CD pipeline."_ The
   whole `nitro()` plugin was deleted, not just the offending option.
3. **`9249ced`** — _"Remove unused nitro nightly dependency"_ removed
   `"nitro": "npm:nitro-nightly@3.0.261103-rc"` from `package.json`.
4. The build now emits `dist/client` + `dist/server` with no server entry point Vercel knows how
   to invoke, and no `outputDirectory`/`framework` declared in `vercel.json`.

A CI failure was fixed by deleting the thing that made deployment work.

### Why it matters

The application is completely unavailable. Every user-facing route 404s. This outage has been
live since at least `2026-11-05T00:31Z` (the first failing `Health Check` run) and possibly since
commit `fb207ed` on `2026-11-04T18:38Z` — roughly 24 hours at time of review.

It also demonstrates the systemic problem: 13 workflows ran against these commits and all
reported success (CR-008, CR-026, CR-028), the only check that caught it could not alert anyone
(CR-007), and `deploy-with-rollback.yml`'s own health check swallows its failure with
`|| echo "Health check failed - Vercel may still be deploying"`.

### Recommended change

**Immediate (either option restores service):**

- **Option A — restore the Start/Nitro build.** Re-add the Nitro Vite plugin and ensure the
  Vercel preset is selected, pinned to a published stable release (not a `-nightly`/`-rc` tag).
  Confirm `pnpm build` produces a `.output/` directory and that Vercel's Output Settings point at
  it. Fix the original typecheck error properly (drop only the deprecated `rollupConfig` key, not
  the plugin).
- **Option B — ship a static SPA.** Since every route already sets `ssr: false` (CR-011), remove
  `@tanstack/react-start`, drive file-based routing with `@tanstack/router-plugin/vite` (already a
  dependency), add an `index.html` + `src/main.tsx` entry, and configure Vercel with
  `outputDirectory: "dist"` plus a SPA rewrite in `vercel.json`:

  ```jsonc
  { "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }] }
  ```

**In both cases, add a deployment smoke check that cannot be ignored** — see CR-007 and the
Playwright `webServer` work in CR-019.

### Reasoning

Option A is the minimal diff and gets production back fastest. Option B produces the simpler
long-term system, removes a server that renders nothing, and makes the deployment a plain static
upload with no serverless function to misconfigure. The review recommends **Option B as the end
state** and accepts Option A as a legitimate stopgap, but this is a decision a human should make
because it affects whether SSR can be re-enabled later without rework.

### Expected benefits

Production works. The hosting model becomes explicit in `vercel.json` rather than relying on
Vercel's framework auto-detection, which is what silently changed underneath this project.

### Trade-offs

Option A keeps a serverless function that serves no purpose and keeps the project exposed to
TanStack Start's rapidly-moving build API. Option B forecloses SSR without re-adopting Start, and
requires rewriting `src/routes/__root.tsx`'s `shellComponent` into a conventional `index.html`.

### References

- Vercel — [Project configuration (`vercel.json`)](https://vercel.com/docs/project-configuration)
- Vercel — [Rewrites](https://vercel.com/docs/project-configuration#rewrites)
- TanStack Start — [Hosting](https://tanstack.com/start/latest/docs/framework/react/hosting)
- TanStack Router — [File-based routing with the Vite plugin](https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing)

---

<a id="cr-002"></a>
## CR-002 — Any anonymous caller can lock every user out of login for 10 minutes

|                |                         |
| -------------- | ----------------------- |
| **Priority**   | **P1 — High**           |
| **Category**   | Security / availability |
| **Confidence** | **Observed** in code    |

### Affected files

- `convex/recaptcha.ts:6-8, 45-60`
- `src/routes/login.tsx:198-201`

### Current behaviour

```ts
// convex/recaptcha.ts
const RECAPTCHA_WINDOW_MS = 10 * 60 * 1000;
const RECAPTCHA_MAX_ATTEMPTS = 20;
const RECAPTCHA_GLOBAL_MAX_ATTEMPTS = 300;
…
export const verify = action({            // public — callable by anyone, unauthenticated
  handler: async (ctx, { token, action }) => {
    await ctx.runMutation(internal.recaptcha.assertRateLimit, { key: `global:${actionBucket}` });
    await ctx.runMutation(internal.recaptcha.assertRateLimit, { key: "global:all" });
```

Both rate-limit buckets are **global**, not per-user and not per-IP. There is no IP or identity
component in the key.

### Problem

`api.recaptcha.verify` is a public Convex action requiring no authentication. Any client can call
it 300 times in a few seconds. Once `global:all` is exhausted, `enforceRateLimit` throws for
_every_ subsequent caller for the remainder of the 10-minute window. Because
`src/routes/login.tsx` awaits `verifyRecaptcha(...)` **before** `signIn(...)`, the login and
signup forms stop working for all users.

The per-action bucket (`global:signIn`, 20 per 10 minutes) is even tighter: 20 legitimate sign-in
attempts across the entire application per 10 minutes before everyone is blocked.

### Why it matters

An unauthenticated attacker — or simply a handful of concurrent legitimate users — can deny login
to the whole application with a trivial script. A rate limiter whose key does not include the
subject being limited is an availability liability rather than a protection.

### Recommended change

Key the rate limit by something attributable, and drop the global bucket or raise it far above
any plausible legitimate ceiling:

```ts
// Per-email bucket for the sign-in/sign-up path
await ctx.runMutation(internal.recaptcha.assertRateLimit, {
  key: `recaptcha:${actionBucket}:${emailHash}`, // caller-supplied email, lower-cased + hashed
  limit: 10,
  windowMs: RECAPTCHA_WINDOW_MS,
});
```

If per-subject keying is not practical, raise `RECAPTCHA_GLOBAL_MAX_ATTEMPTS` to a level that
represents genuine abuse (e.g. 5,000 per 10 minutes) and **log** rather than throw when it is
exceeded, so a burst degrades monitoring rather than availability.

Note this finding is partly moot if CR-005 is fixed by moving the captcha check server-side into
the auth flow, where per-email keying is natural. Fix CR-005 first and re-key as part of it.

### Reasoning

Rate limits exist to isolate bad actors. A shared bucket inverts that: it lets one bad actor
punish everyone. This is the standard argument for per-principal rather than global limiting.

### Expected benefits

Abuse is contained to the abuser; legitimate users are unaffected.

### Trade-offs

Per-email keying lets an attacker enumerate buckets cheaply, so it must be paired with the
existing reCAPTCHA scoring rather than replacing it. Convex does not expose client IPs to
actions, so IP-based keying is not available without an HTTP action.

### References

- Convex — [Rate Limiter component](https://www.convex.dev/components/rate-limiter)
- OWASP — [Blocking Brute Force Attacks](https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks)

---

<a id="cr-003"></a>
## CR-003 — Automatic, unsupervised `vercel rollback` on any CI failure

|                |                                                     |
| -------------- | --------------------------------------------------- |
| **Priority**   | **P1 — High**                                       |
| **Category**   | Reliability risk                                    |
| **Confidence** | **Observed** in workflow definition and run history |

### Affected files

- `.github/workflows/deploy-with-rollback.yml` (entire file)

### Current behaviour

```yaml
on:
  push:
    branches: [main]
  workflow_run:
    workflows: ["CI Pipeline", "Code Quality", "Convex Deploy"]
    types: [completed]

jobs:
  monitor:
    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'failure'
    steps:
      …
      - run: vercel rollback --token=… --yes --scope=tomharts-projects

  deploy:                 # ← no `if:` — runs on EVERY trigger
    steps:
      - run: pnpm install        # note: not --frozen-lockfile
      - run: pnpm build
      - name: Health check
        run: |
          sleep 60
          curl -f https://lights-inventory.vercel.app/ || echo "Health check failed - Vercel may still be deploying"

  rollback:
    if: failure()
    needs: deploy
    steps:
      - run: vercel rollback --token=… --yes --scope=tomharts-projects
```

Observed from `gh run list` for a single push (`79659d6`):

```
14:26:57  Deploy with Rollback   push          success  1m20s
14:27:23  Deploy with Rollback   workflow_run  success  1m20s
14:27:42  Deploy with Rollback   workflow_run  success  1m17s
```

Three runs for one push; a fourth appears when `Convex Deploy` also fires.

### Problem

Three distinct issues, in descending severity:

1. **An irreversible production change is automated on a weak signal.** `vercel rollback` reverts
   the current production deployment. It fires when _CI Pipeline_, _Code Quality_ or
   _Convex Deploy_ reports failure — which includes a flaky test, a transient `pnpm install`
   network error, or a Codecov upload problem. None of those indicate the deployed site is bad.
   AGENTS.md states Vercel Git integration is the deployment owner; this workflow unilaterally
   overrides it.
2. **The `deploy` job has no `if:` guard**, so it reinstalls dependencies and rebuilds on every
   one of the 3–4 triggers per push, purely to `sleep 60 && curl`. It is ~4 minutes of wasted CI
   per push and it does not deploy anything — the name is misleading.
3. **The health check cannot fail.** `curl -f … || echo "…"` swallows a non-zero exit, so the
   `deploy` job reports success even when production is 404 — which is exactly what happened
   (CR-001). The `rollback: if: failure()` job therefore never triggers either.

### Why it matters

Automatic rollback of production based on an unrelated CI signal is the kind of automation that
turns a minor problem into an outage, at a time when no human is watching. Meanwhile the one part
of the workflow that _could_ have detected the real outage was explicitly neutered.

### Recommended change

**Delete `.github/workflows/deploy-with-rollback.yml` entirely.**

Replace it with nothing. Vercel already keeps every deployment and offers one-click
["Instant Rollback"](https://vercel.com/docs/deployments/instant-rollback) in the dashboard and
`vercel rollback` on the CLI. A human deciding to roll back after seeing a real failure is both
simpler and safer than a bot deciding on a proxy signal.

If post-deploy verification is wanted, add a single step to the consolidated CI workflow
(CR-010) that runs **after** the Vercel deployment, fails loudly, and does not act:

```yaml
smoke:
  if: github.ref == 'refs/heads/main'
  needs: build
  steps:
    - name: Production smoke check
      run: |
        for i in $(seq 1 30); do
          code=$(curl -s -o /dev/null -w '%{http_code}' https://lights-inventory.vercel.app/)
          [ "$code" = "200" ] && exit 0
          sleep 10
        done
        echo "::error::Production returned $code"
        exit 1
```

### Reasoning

"Fewer moving parts" applies most strongly to automation that can destroy state. The rollback
capability already exists in Vercel; re-implementing it in CI adds a failure mode without adding a
capability. A failing check that a human reads is more useful than an automated action on a bad
signal.

### Expected benefits

Removes ~100 lines of workflow, eliminates 3–4 redundant CI runs per push, removes the risk of an
automated production revert, and — via the replacement smoke check — would have caught CR-001.

### Trade-offs

Rollback becomes a manual action. For a single-maintainer hobby-scale app that is the correct
trade; if unattended rollback is genuinely required, it should at minimum be gated on the
production smoke check failing, never on CI status.

### References

- GitHub Actions — [`workflow_run` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- Vercel — [Instant Rollback](https://vercel.com/docs/deployments/instant-rollback)

---

<a id="cr-004"></a>
## CR-004 — No `ConvexError` usage, so server error messages are redacted in production

|                |                                                                      |
| -------------- | -------------------------------------------------------------------- |
| **Priority**   | **P1 — High**                                                        |
| **Category**   | Defect / user experience                                             |
| **Confidence** | **Observed** in code; production redaction behaviour per Convex docs |

### Affected files

- All 17 Convex modules — every `throw new Error(...)`
- `src/routes/index.tsx:135, 182` (`err?.message` surfaced to the user)
- `src/routes/verify.tsx:94-97`
- `src/routes/login.tsx:208-229` (string-matches on `err.message`)
- 14 further `catch` blocks across `src/routes/*.tsx` that discard the error entirely

### Current behaviour

```console
$ grep -rn "ConvexError" convex/ src/ | grep -v _generated
(no matches)
```

The backend throws plain `Error`s with carefully written user-facing text:

```ts
// convex/dataTransfer.ts
throw new Error("Import exceeds bulb limit");
throw new Error(`Invalid roomType "${room.roomType}" in room "${room.name}"`);
// convex/rateLimit.ts
throw new Error(errorMessage ?? "Too many requests. Please try again later.");
```

The frontend then shows them:

```tsx
// src/routes/index.tsx:182
} catch (err: any) {
    toast.error(err?.message ?? "Import failed");
}
```

…and in `login.tsx` actually branches on the text:

```tsx
const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
if (msg.includes("recaptcha") || …) setError("reCAPTCHA verification failed…");
else if (msg.includes("too many") || msg.includes("rate")) setError("Too many attempts…");
```

### Problem

Convex deliberately **redacts the message of any uncaught non-`ConvexError` exception on
production deployments** and replaces it with a generic "Server Error", to avoid leaking
implementation detail. Only `ConvexError`'s `data` payload is transmitted to the client verbatim.

So in production:

- Import failures all read "Import failed" or a generic server error, never "Invalid roomType
  'lounge' in room 'Snug'" — making a failed import undebuggable for the user.
- The rate-limit messages in `convex/rateLimit.ts` never reach anyone.
- `login.tsx`'s `msg.includes("too many")` branch can never match, so every login failure falls
  through to the catch-all "Authentication failed. Please try again." — including genuine
  rate-limiting and genuine wrong-password cases.

This works in development (where messages are not redacted), which is why it was not noticed.

A secondary, compounding issue: **14 of the 18 `catch` blocks in `src/routes/` discard the error
object entirely** (`} catch {`) and show a fixed string. Even if the message were available, it
would be thrown away.

### Why it matters

Every piece of deliberate, user-helpful error text the backend produces is invisible in
production. Users get "Failed to create property" with no indication whether they hit a
validation limit, a rate limit, or a bug. This is a behavioural defect, not a style issue — the
code was written on an assumption about Convex that does not hold in production.

### Recommended change

**1. Throw `ConvexError` for anything a user should read:**

```ts
import { ConvexError } from "convex/values";

throw new ConvexError("Import exceeds bulb limit");
// or, for structured handling:
throw new ConvexError({
  code: "RATE_LIMITED",
  message: "Too many imports. Please wait.",
});
```

Apply to: `convex/rateLimit.ts`, `convex/dataTransfer.ts`, `convex/validation.ts`,
`convex/maintenance.ts` (the length/field validations), and the `"Not authenticated"` /
`"Not found"` throws.

**2. Add one small helper and use it in every `catch`:**

```ts
// src/lib/errors.ts
import { ConvexError } from "convex/values";

export function userMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    return typeof err.data === "string"
      ? err.data
      : (err.data?.message ?? fallback);
  }
  return fallback;
}
```

```tsx
} catch (err) {
  toast.error(userMessage(err, "Failed to create property"));
}
```

**3. In `login.tsx`, replace the `msg.includes(...)` chain** with explicit `ConvexError` codes
(`"RATE_LIMITED"`, `"RECAPTCHA_FAILED"`), falling back to a generic message. String-sniffing
error text is fragile even when the text survives.

### Reasoning

This is the documented Convex mechanism for exactly this situation. It is also _less_ code than
the current string-matching, and it removes the dev/prod behavioural divergence that hid the bug.

### Expected benefits

Users see accurate, actionable errors in production. The rate-limit and import-validation work
already written in the backend starts being useful. `login.tsx` loses ~20 lines of brittle
matching.

### Trade-offs

Be deliberate about which messages become `ConvexError` — anything that would leak internal
structure should stay a plain `Error` so it is redacted. `"Not found"` and `"Not authenticated"`
are safe to expose; raw database or upstream-API errors are not.

### References

- Convex — [Error handling / application errors](https://docs.convex.dev/functions/error-handling/application-errors)
- Convex — [Errors and warnings](https://docs.convex.dev/functions/error-handling/)

---

<a id="cr-005"></a>
## CR-005 — reCAPTCHA verification is decoupled from sign-in and is trivially bypassable

|                |                      |
| -------------- | -------------------- |
| **Priority**   | **P1 — High**        |
| **Category**   | Security             |
| **Confidence** | **Observed** in code |

### Affected files

- `src/routes/login.tsx:195-207`
- `convex/recaptcha.ts:45-150`
- `convex/auth.ts:39-101`

### Current behaviour

```tsx
// src/routes/login.tsx
const recaptchaToken = await getRecaptchaToken(flow);
await verifyRecaptcha({ token: recaptchaToken, action: flow }); // ① result discarded

const result = await signIn("password", { email, password, flow }); // ② independent call
```

`convex/auth.ts` configures `convexAuth({ providers: [Password({ verify: Email({...}) })] })`.
There is no reference to reCAPTCHA anywhere in it.

### Problem

The captcha check and the authentication attempt are **two unrelated Convex calls**. The server
never records that a captcha was solved, and `signIn` never asks. An attacker using the Convex
client library — or the deployment's public function HTTP endpoint — simply calls `signIn`
directly and never touches `api.recaptcha.verify`.

The control therefore provides **no protection whatsoever** against automated credential
stuffing, password spraying, or signup spam, which is the entire reason it exists.

Supporting detail: `verify`'s return value (`{ success: true }`) is discarded by the caller; the
only thing gating the flow is whether it _threw_. So even a client that does call it can ignore a
negative result.

### Why it matters

This is security theatre: the repository, its README, and its CSP all carry the cost and
complexity of reCAPTCHA Enterprise (a Google project, two secrets, a third-party script in the
CSP, a Convex action, a rate limiter) while delivering none of the benefit. Worse, its presence
may be why no other brute-force protection was added.

### Recommended change

Move the captcha verification **inside** the authentication path so it cannot be skipped.
`@convex-dev/auth`'s `Password` provider supports a custom `profile` function and additional
params; the token should travel with the sign-in call and be verified before credentials are
checked. Sketch:

```ts
// convex/auth.ts
Password({
  profile(params) {
    // params carries whatever the client passes to signIn("password", {...})
    return { email: params.email as string };
  },
  // verify the captcha token before the credential check
  …
})
```

```tsx
// src/routes/login.tsx
await signIn("password", { email, password, flow, recaptchaToken });
```

The exact hook depends on the `@convex-dev/auth` version in use (`0.0.96` — pre-1.0, API is not
stable). **The implementing agent must confirm the current extension point against the live
`@convex-dev/auth` documentation rather than trusting this sketch.**

If a clean server-side hook is not available in this version, the honest alternatives are:

- **(a)** Replace reCAPTCHA with a _real_, server-enforced rate limit on sign-in attempts keyed by
  email (see CR-002 and CR-006). This is simpler, has no third-party dependency, and actually
  works.
- **(b)** Remove reCAPTCHA entirely and delete `convex/recaptcha.ts`, the script loader in
  `login.tsx`, the `VITE_RECAPTCHA_SITE_KEY` / `RECAPTCHA_*` variables, and the
  `https://www.google.com` entries from the CSP.

Given the stated preference for simplicity, **(a) is the recommended outcome** if the server-side
hook proves awkward. A working rate limit beats a bypassable captcha.

### Reasoning

A bot-protection control that the client can skip is not a control. Either bind it to the
operation it protects, or replace it with something that is enforced server-side by construction.

### Expected benefits

Either genuine bot protection, or ~200 lines and one external dependency removed. Both are
improvements over the current state, which has the cost of the former and the protection of the
latter.

### Trade-offs

Option (a) loses signal about _whether_ a request is automated, which reCAPTCHA scoring provides
in principle. In practice this app is not currently receiving that signal either.

### References

- Convex Auth — [Password provider](https://labs.convex.dev/auth/config/passwords)
- Google — [reCAPTCHA Enterprise: create assessments](https://cloud.google.com/recaptcha/docs/create-assessment-website)
- OWASP — [Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

<a id="cr-006"></a>
## CR-006 — The auth e-mail rate limiter is an in-memory `Map` that does not work and leaks

|                |                                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Priority**   | **P1 — High**                                                                    |
| **Category**   | Security / reliability                                                           |
| **Confidence** | **Observed** in code; ineffectiveness **inferred** from Convex's execution model |

### Affected files

- `convex/auth.ts:5-37`

### Current behaviour

```ts
const authRateLimitMap = new Map<string, { count: number; lastRequest: number }>();

function checkAuthRateLimit(email: string): boolean {
  const windowMs = 60 * 60 * 1000;   // 1 hour
  const maxRequests = 5;
  …
}
```

Called from `sendVerificationRequest`. The file's own comment acknowledges the problem:

> `// Note: In a production environment with multiple Convex instances, this should be replaced with a Convex-based rate limiter`

Added in commit `85977dd` ("Add rate limiting to auth email verification (#39)").

### Problem

Two defects:

1. **It does not limit anything reliably.** Convex function executions run in V8 isolates that
   are created, reused, and discarded at the platform's discretion and may be spread across
   instances. Module-level state is best-effort cache, not shared state. An attacker requesting
   verification codes will frequently land on a fresh isolate with an empty `Map`. The protection
   against someone using the app to spam a third party's inbox (and burn Mailgun quota) is
   therefore unreliable.
2. **It never evicts.** Entries are added on first sight and only overwritten when the _same_
   email returns after the window. A stream of distinct addresses grows the `Map` without bound
   for the lifetime of the isolate.

A correct, durable implementation already exists in this repository —
`convex/rateLimit.ts`'s `enforceRateLimit`, backed by the `rateLimits` table — and is used
by `dataTransfer.importAll` and `recaptcha.verify`. It is simply not used here, presumably
because `sendVerificationRequest` does not receive a Convex `ctx`.

### Why it matters

The feature was added specifically to prevent verification-email abuse. Someone reading
`convex/auth.ts` will reasonably believe that protection exists. It mostly does not.

### Recommended change

Use durable storage. Options in order of preference:

1. **Official Convex Rate Limiter component.** Install `@convex-dev/rate-limiter`, register it in
   `convex/convex.config.ts`, and call it from a context that has `ctx`. This is the
   Convex-recommended approach and handles sharding and cleanup.
2. **Reuse the existing `enforceRateLimit`.** If `sendVerificationRequest` can be given access to
   a mutation (e.g. by verifying inside the sign-in action before the provider runs — which
   dovetails with the CR-005 fix), call
   `enforceRateLimit(ctx, { key: \`auth:verify:${email.toLowerCase()}\`, limit: 5, windowMs: 3600_000 })`.
3. **If neither is feasible in `@convex-dev/auth@0.0.96`, delete the `Map` and the comment.**
   Removing a protection that does not work is better than leaving a misleading one in place —
   and Mailgun's own sending limits remain as a backstop.

### Reasoning

The repository already demonstrates the right pattern 30 lines away in `convex/rateLimit.ts`.
There is no reason for a second, weaker, in-memory implementation to exist.

### Expected benefits

Verification-email abuse is actually limited; one misleading piece of security code is removed;
one unbounded memory growth path is removed.

### Trade-offs

Option 1 adds a dependency — justified here because the in-house alternative requires plumbing a
mutation context into a provider callback that is not designed to receive one. Option 3 is honest
but leaves the gap open until CR-005 is addressed.

### References

- Convex — [Rate Limiter component](https://www.convex.dev/components/rate-limiter)
- Convex — [Runtimes](https://docs.convex.dev/functions/runtimes) (isolate lifecycle; no guaranteed shared module state)
- Convex — [Best practices](https://docs.convex.dev/understanding/best-practices/)

---

<a id="cr-007"></a>
## CR-007 — Failure notification never fires and the health check is effectively disabled

|                |                             |
| -------------- | --------------------------- |
| **Priority**   | **P1 — High**               |
| **Category**   | Reliability / observability |
| **Confidence** | **Observed** in run history |

### Affected files

- `.github/workflows/notify-on-failure.yml`
- `.github/workflows/health-check.yml`

### Current behaviour

```yaml
# notify-on-failure.yml
on:
  workflow_run:
    workflows:
      ["Code Quality", "Convex Deploy", "Deploy with Rollback", "CodeQL"]
    types: [completed]
jobs:
  notify:
    if: ${{ failure() }}
```

Every observed run:

```
completed  skipped  Notify on Failure  main  workflow_run  42045437977  1s
completed  skipped  Notify on Failure  main  workflow_run  42045396616  1s
completed  skipped  Notify on Failure  main  workflow_run  42045337588  7s
…  (every single run in the visible history is `skipped`)
```

```yaml
# health-check.yml
on:
  schedule:
    - cron: "*/5 * * * *" # expected ≈ 8,640 runs/month
```

Actual:

```console
$ gh api ".../workflows/health-check.yml/runs?per_page=1" --jq '.total_count'
3

$ gh run list --workflow=health-check.yml
completed  failure  Health Check  main  schedule  42056406116  6s  2026-11-05T15:34:47Z
completed  failure  Health Check  main  schedule  41986142845  6s  2026-11-05T07:17:05Z
completed  failure  Health Check  main  schedule  41941936549  8s  2026-11-05T00:31:19Z
```

### Problem

**`notify-on-failure.yml` is broken.** In a `workflow_run`-triggered workflow, `failure()`
evaluates the status of _this_ workflow's own preceding steps — of which there are none — so it
is always false and the job is always skipped. The correct expression is
`github.event.workflow_run.conclusion == 'failure'`. This is the same condition the author got
_right_ in `deploy-with-rollback.yml`'s `monitor` job, so it is a copy/paste slip rather than a
misunderstanding.

**`health-check.yml` is unreliable.** GitHub does not guarantee `schedule` timing and
aggressively drops high-frequency cron runs on busy or low-activity repositories; a `*/5` schedule
delivering 3 runs is consistent with that. It also sends no notification — a scheduled workflow
failing produces an email to the repo owner at best, and there is no explicit alert step.

**Together:** the only check that detected the P0 outage (CR-001) ran 3 times and told nobody.

### Why it matters

The repository has the _appearance_ of monitoring and alerting. AGENTS.md instructs agents to
"monitor ALL GitHub Actions status checks" and treat green as done. Both of those assumptions are
false, and a 24-hour production outage went unreported as a direct result.

### Recommended change

1. **Delete `notify-on-failure.yml`.** GitHub already emails the actor and repository
   administrators on workflow failure by default
   ([notification settings](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications#github-actions-notification-options)).
   A workflow whose entire body is `echo "::error::…"` adds nothing a human will see. If a real
   channel is wanted (Slack, email, Pushover), add **one** step to the consolidated CI workflow
   rather than a separate `workflow_run` workflow.
2. **Change `health-check.yml` to a realistic schedule** — `'*/30 * * * *'` or hourly — and make
   it emit something actionable, e.g. open/update a GitHub issue via `gh issue create` on failure
   so it is visible without relying on email. Alternatively delete it and use Vercel's own
   monitoring, or a free external uptime service, which will be far more reliable than GitHub
   cron for this purpose.

### Reasoning

Monitoring that does not reach a human is worse than no monitoring, because it creates false
confidence. GitHub's built-in failure notifications already cover the CI case; the only gap is
production uptime, and GitHub `schedule` is a poor tool for that.

### Expected benefits

One fewer workflow. Outages become visible. Agents and humans can trust a green dashboard again.

### Trade-offs

An external uptime monitor is another service, which cuts against "no new infrastructure" — hence
the alternative of a lower-frequency, issue-opening GitHub schedule, which uses only what is
already here.

### References

- GitHub Actions — [`workflow_run`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- GitHub Actions — [`schedule` trigger caveats](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- GitHub Actions — [Status check functions (`failure()`)](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#failure)

---

<a id="cr-008"></a>
## CR-008 — The test suite and its coverage thresholds provide false assurance

|                |                                      |
| -------------- | ------------------------------------ |
| **Priority**   | **P1 — High**                        |
| **Category**   | Reliability                          |
| **Confidence** | **Observed** by running the commands |

### Affected files

- `src/lib/smoke.test.ts` (the only unit test)
- `vitest.config.ts:8-17`
- `.github/workflows/ci.yml` (`coverage` job), `.github/workflows/code-quality.yml` (Codecov upload)

### Current behaviour

```ts
// src/lib/smoke.test.ts — the entire unit test suite
describe("smoke test", () => {
  it("runs in CI", () => {
    expect(true).toBe(true);
  });
});
```

```console
$ pnpm test:coverage
 Test Files  1 passed (1)
      Tests  1 passed (1)

 % Coverage report from v8
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |       0 |        0 |       0 |       0 |
----------|---------|----------|---------|---------|
Statements   : Unknown% ( 0/0 )
Branches     : Unknown% ( 0/0 )
Functions    : Unknown% ( 0/0 )
Lines        : Unknown% ( 0/0 )

$ echo $?
0
```

Meanwhile `vitest.config.ts` declares:

```ts
thresholds: { lines: 50, functions: 50, branches: 50, statements: 50 },
```

### Problem

No `coverage.include` is configured, so V8 only instruments files the tests actually import. The
only test imports nothing. `0/0` satisfies a 50 % threshold, so the gate passes. A dedicated CI
job and a Codecov upload exist to report this number.

Three CI workflows run `pnpm test`; a fourth (`convex-deploy.yml`) runs
`vitest run --passWithNoTests` before deploying the backend. All four are asserting `true === true`.

There _is_ genuinely testable pure logic sitting untested:

| Function                   | File                           | Why it's worth testing                                                 |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `normalizeOptionalHttpUrl` | `convex/validation.ts`         | Security-relevant: scheme allow-list, length cap, parse failure        |
| `countImportEntities`      | `convex/dataTransfer.ts:166`   | Enforces the import caps                                               |
| `enforceRateLimit`         | `convex/rateLimit.ts`          | Window roll-over and duplicate-row handling are subtle                 |
| password-strength scoring  | `src/routes/login.tsx:171-184` | Pure, 5 branches                                                       |
| `countImportData`          | `src/routes/index.tsx:64`      | Duplicates `countImportEntities` — a test would expose the duplication |

### Why it matters

Four CI jobs, a coverage threshold, a Codecov integration, and AGENTS.md's "MANDATORY PRE-COMMIT
CHECKLIST" all rest on a test that cannot fail. This is the mechanism by which a 404 in production
coexisted with a fully green dashboard.

### Recommended change

1. **Set `coverage.include`** so the number means something:

   ```ts
   coverage: {
     provider: "v8",
     include: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
     exclude: ["convex/_generated/**", "src/routeTree.gen.ts", "src/components/ui/**"],
     …
   }
   ```
2. **Either lower the thresholds to the achievable truth or remove them.** Do not leave 50 % in
   place unmet — a permanently-red gate is as useless as a permanently-green one. Suggested: set
   thresholds to whatever the real figure is after step 3, rounded down, and ratchet upward.
3. **Delete `src/lib/smoke.test.ts`** and write real tests for the five pure functions above.
   `convex/validation.ts` alone deserves ~10 cases (`javascript:` URL, `ftp:`, 3000-char URL,
   whitespace-only, undefined, valid http, valid https, malformed).
4. **Consider `convex-test`** for a couple of mutation-level tests (ownership enforcement on
   `bulbs.update`, the cascade in `properties.remove`). This is optional — it adds a dependency —
   but those two behaviours are the ones most expensive to get wrong.
5. **Drop the separate `coverage` CI job**; run `vitest run --coverage` once in the single test
   job (CR-010).

### Reasoning

A test suite's value is the failures it can produce. The current one can produce none. Testing
the pure, dependency-free functions first gives the best ratio of confidence to effort and needs
no new tooling — Vitest is already installed and configured.

### Expected benefits

Real regression protection on the security-relevant URL validator and the import caps. A coverage
number that means something. One fewer CI job.

### Trade-offs

Writing tests takes time and the first honest coverage figure will look bad. That is information,
not a problem. `convex-test` (step 4) is an additional dependency and should only be added if the
mutation-level tests are actually written.

### References

- Vitest — [Coverage configuration](https://vitest.dev/guide/coverage) and [`coverage.include`](https://vitest.dev/config/#coverage-include)
- Convex — [Testing with `convex-test`](https://docs.convex.dev/testing/convex-test)

---

<a id="cr-009"></a>
## CR-009 — Two lockfiles; the npm one is stale and names a different project

|                |                               |
| -------------- | ----------------------------- |
| **Priority**   | **P1 — High**                 |
| **Category**   | Reliability / reproducibility |
| **Confidence** | **Observed**                  |

### Affected files

- `package-lock.json` (289 KB, tracked)
- `pnpm-lock.yaml` (245 KB, tracked)
- `package.json`
- All workflows using `pnpm install --frozen-lockfile`

### Current behaviour

```console
$ head -3 package-lock.json
{
  "name": "lights-inventory-4.6",        ← package.json says "lights-inventory"
  "lockfileVersion": 3,

$ grep -A3 '"dependencies"' package-lock.json | head
  "@convex-dev/react-query": "0.1.0",
  "tw-animate-css": "^1.3.6",            ← package.json says ^1.4.0
  "@testing-library/dom": "^10.4.1",     ← package.json says ^10.4.2
  "jsdom": "^28.1.0",                    ← package.json says ^30.1.3
```

`package-lock.json` reflects an older `package.json` and still carries the pre-rename project
name. All 13 workflows use pnpm.

Separately: local pnpm is **11.1.0**; every workflow pins `pnpm/action-setup` to `version: 10`;
`package.json` has no `packageManager` field.

### Problem

1. **Ambiguity for any tool that auto-detects a package manager.** Vercel in particular picks an
   install command based on which lockfile it finds. With both present the behaviour depends on
   Vercel's precedence rules rather than on anything in this repository — an unnecessary unknown
   for a project whose deployment is already broken (CR-001).
2. **The npm lockfile is stale**, so anyone (or any tool) that does use it installs different
   versions from CI.
3. **No `packageManager` field** means the pnpm major version is pinned in 13 separate places and
   differs from the developer's local version. `pnpm-lock.yaml` is `lockfileVersion: '9.0'`, which
   pnpm 10 can read today, but a future pnpm 11-only lockfile format change would break every
   workflow at once.

### Why it matters

Reproducibility is the one thing a lockfile is for. Having two that disagree defeats it, and
creates a real possibility that production builds and CI builds resolve different dependency
trees.

### Recommended change

```bash
git rm package-lock.json
```

Add to `package.json`:

```jsonc
{
  "packageManager": "pnpm@11.1.0"
}
```

Then simplify every workflow's setup to rely on it:

```yaml
- uses: pnpm/action-setup@v4 # reads packageManager from package.json
- uses: actions/setup-node@v4
  with: { node-version: 22, cache: pnpm }
```

Also set the Vercel project's install command to `pnpm install --frozen-lockfile` explicitly
rather than relying on detection.

### Reasoning

One package manager, one lockfile, one declared version, read from a single place. This is the
conventional setup and removes 13 duplicated version pins.

### Expected benefits

Deterministic installs everywhere; 289 KB removed; pnpm version upgrades become a one-line change.

### Trade-offs

Anyone used to running `npm install` in this repo will get an error. That is the intended effect.

### References

- Node.js / corepack — [`packageManager` field](https://nodejs.org/api/packages.html#packagemanager)
- pnpm — [`pnpm/action-setup`](https://github.com/pnpm/action-setup)
- Vercel — [Package manager detection](https://vercel.com/docs/deployments/configure-a-build#install-command)

---

<a id="cr-010"></a>
## CR-010 — Thirteen workflows with three duplicate lint/test/build pipelines

|                |                                                |
| -------------- | ---------------------------------------------- |
| **Priority**   | **P2 — Medium**                                |
| **Category**   | Simplification                                 |
| **Confidence** | **Observed** in workflow files and run history |

### Affected files

All of `.github/workflows/`:

```
agent-approval.yml      agent-safety.yml      build-docs.yml
ci.yml                  code-quality.yml      codeql.yml
convex-deploy.yml       deploy-with-rollback.yml                e2e.yml
health-check.yml        lighthouse.yml        notify-on-failure.yml
snyk.yml
```

### Current behaviour

Eight workflows start on a single push to `main` (observed for commit `79659d6`), plus 3–4
additional `Deploy with Rollback` runs via `workflow_run`.

The overlap:

| Workflow            | lint | typecheck | test | coverage | build | other                                                        |
| ------------------- | ---- | --------- | ---- | -------- | ----- | ------------------------------------------------------------ |
| `ci.yml`            | ✅   | ✅        | ✅   | ✅       |       | 4 separate jobs, 4 × install                                 |
| `code-quality.yml`  | ✅   |           | ✅   | ✅       |       | Codecov upload                                               |
| `agent-safety.yml`  | ✅   | ✅        | ✅   |          | ✅    | plus a _second_ `tsc --noEmit` "to verify no broken imports" |
| `convex-deploy.yml` |      | ✅        | ✅   |          |       | `convex deploy`                                              |

That is **4 lint runs, 4 typecheck runs (5 counting the duplicate), 4 test runs and 3 coverage
runs per push**, each preceded by its own `pnpm install`.

`agent-safety.yml`'s final step is literally:

```yaml
- name: Verify no broken imports
  run: pnpm exec tsc --noEmit || exit 1 # the Typecheck step three steps earlier
```

`agent-approval.yml` adds a label and echoes "requires manual review" — enforcement that belongs
in branch protection, not a workflow.

### Problem

Thirteen workflow files is more CI configuration than this application has backend modules. The
cost is not just minutes: it is thirteen files that must stay mutually consistent (they already
disagree on Node setup, action pinning, and pnpm version), and a status dashboard so noisy that a
production 404 went unnoticed inside it.

### Why it matters

Maintenance burden scales with the number of configuration files, and the duplicated jobs mean
every change to the build (e.g. the Nitro removal in CR-001) has to be reasoned about in four
places.

### Recommended change

**Collapse to four workflows.**

| Keep                | Purpose                                                                                                                          | Triggers                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ci.yml`            | One job: install → lint → typecheck → test (with coverage) → build → Playwright. Plus a `smoke` job on `main` only (see CR-003). | `push: [main]`, `pull_request`                    |
| `convex-deploy.yml` | Deploy the backend. Drop its duplicate typecheck/test — make it `needs: ci`.                                                     | `push: [main]` with `paths: convex/**`            |
| `codeql.yml`        | Security scanning. Remove the `Autobuild` step (unnecessary for JavaScript).                                                     | `push: [main]`, `pull_request`, weekly `schedule` |
| `audit.yml`         | Renamed from `snyk.yml`, actually failing on findings (CR-026).                                                                  | `push: [main]`, `pull_request`, weekly            |

**Delete:** `agent-approval.yml`, `agent-safety.yml`, `code-quality.yml`,
`deploy-with-rollback.yml` (CR-003), `e2e.yml` (folded into `ci.yml`, CR-019),
`health-check.yml` (CR-007), `lighthouse.yml` (CR-035), `notify-on-failure.yml` (CR-007),
`build-docs.yml` (CR-028).

Use a **single job with sequential steps** rather than four parallel jobs each doing its own
install — for a 90-second test suite, parallelism costs more in install overhead than it saves.

Enforce "agent PRs need review" through **branch protection / rulesets**, which is where GitHub
intends it and which cannot be bypassed, rather than `agent-approval.yml`'s advisory echo.

### Reasoning

The conventional shape for a small project is one CI workflow plus whatever genuinely needs a
different trigger. Everything here either duplicates the CI workflow, enforces nothing, or is
broken.

### Expected benefits

13 files → 4. Roughly 8 workflow runs per push → 3. A legible status list where a red check is
meaningful. One place to change the Node version.

### Trade-offs

A single sequential job gives slightly slower feedback than parallel jobs and reports only the
first failure. At under three minutes total, that is the right trade. Any required status checks
configured in branch protection must be renamed to match the new job names, or merges will block.

### References

- GitHub Actions — [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax-for-github-actions)
- GitHub — [Rulesets / required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- CodeQL — [Advanced setup for JavaScript](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/codeql-code-scanning-for-compiled-languages)

---

<a id="cr-011"></a>
## CR-011 — Every route sets `ssr: false`, so the SSR/Nitro stack is unused complexity

|                |                               |
| -------------- | ----------------------------- |
| **Priority**   | **P2 — Medium**               |
| **Category**   | Simplification / architecture |
| **Confidence** | **Observed**                  |

### Affected files

All nine route modules, plus `vite.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`,
`package.json`.

```console
$ grep -c "ssr: false" src/routes/*.tsx | grep -v ':0'
src/routes/fixture.$fixtureId.tsx:1
src/routes/index.tsx:1
src/routes/inventory.tsx:1
src/routes/login.tsx:1
src/routes/properties.tsx:1
src/routes/property.$propertyId.tsx:1
src/routes/room.$roomId.tsx:1
src/routes/search.tsx:1
src/routes/verify.tsx:1
```

### Current behaviour

The application is 100 % client-rendered. The build nonetheless produces `dist/server/server.js`
(258 KB) and the project carries `@tanstack/react-start`, `@tanstack/react-router-ssr-query`, and
(until recently) `nitro`.

### Problem

`ssr: false` on every route is the _correct_ decision — every page requires an authenticated
Convex session, so server rendering could only emit a loading skeleton. But the consequence is
that the entire server-side half of TanStack Start is dead weight: a 258 KB bundle, a serverless
function, a Nitro preset to configure, and a build output shape that is easy to get wrong. It
already was got wrong — this is the proximate cause of CR-001.

Secondary: the flag is repeated nine times. If a tenth route is added and the author forgets,
that route will attempt SSR and behave differently from its neighbours. The installed
`@tanstack/react-router` does **not** expose a `defaultSsr` router option (verified:
`grep -rl defaultSsr node_modules/@tanstack/` returns nothing), so there is no one-line fix within
Start.

### Why it matters

This is the largest single source of accidental complexity in the repository, and it has already
caused a production outage.

### Recommended change

Covered in detail under CR-001. In short: **make the deployment match the code** by moving to a
plain Vite SPA (`@tanstack/router-plugin/vite` + `index.html` + `src/main.tsx`), removing
`@tanstack/react-start`, `@tanstack/react-router-ssr-query`, and the nine `ssr: false` lines.

If Start is retained instead, add a comment at the top of `src/router.tsx` recording _why_ every
route disables SSR, so the next person does not "fix" it.

### Reasoning

The simplest system that works is the one whose runtime shape matches its code. Nine declarations
saying "do not use this feature" are a signal that the feature should not be in the dependency
tree.

### Expected benefits

Three fewer dependencies, no serverless function, a deployment that is a static file upload, and
one fewer class of build-output bug.

### Trade-offs

Loses the ability to add SSR or server functions later without re-adopting Start. Given that the
app is entirely behind authentication and has no SEO requirement (`robots.txt` allows everything
but there is nothing public to index), that optionality has little value here. This is the one
genuinely structural recommendation in the review and should be a deliberate human choice.

### References

- TanStack Start — [Selective SSR](https://tanstack.com/start/latest/docs/framework/react/selective-ssr)
- TanStack Router — [Quick start (Vite, SPA)](https://tanstack.com/router/latest/docs/framework/react/quick-start)
- Vite — [Building for production](https://vite.dev/guide/build)

---

<a id="cr-012"></a>
## CR-012 — The ownership-check ladder is duplicated about twenty times

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Maintainability |
| **Confidence** | **Observed**    |

### Affected files

- `convex/bulbs.ts` — 7 copies (`listByFixture`, `create`, `update`, `updateStatus`, `duplicate`, `remove`, `bulkUpdateStatus`)
- `convex/fixtures.ts` — 6 copies
- `convex/rooms.ts` — 4 copies
- `convex/maintenance.ts` — 3 copies (plus a 4-level variant)
- `convex/reminders.ts` — 1 copy
- `convex/migrations.ts` — 1 variant

### Current behaviour

The same block, with only the error style varying:

```ts
const userId = await getVerifiedUserId(ctx);
if (!userId) throw new Error("Not authenticated");
const bulb = await ctx.db.get(args.id);
if (!bulb) throw new Error("Not found");
const fixture = await ctx.db.get(bulb.fixtureId);
if (!fixture) throw new Error("Not found");
const room = await ctx.db.get(fixture.roomId);
if (!room) throw new Error("Not found");
const property = await ctx.db.get(room.propertyId);
if (!property || property.userId !== userId) throw new Error("Not found");
```

Query variants return `null` / `[]` instead of throwing; mutation variants throw.

### Problem

The logic is **correct everywhere** — I checked all of them, and this is not a security finding.
The issue is purely that a future change has to be made in twenty places. Concretely: the CR-004
fix (switch to `ConvexError`) has to touch every one of these blocks, and so would adding
soft-delete, audit logging, or a shared-household feature.

It also makes the interesting part of each function hard to see: `bulbs.updateStatus` is 34 lines,
of which 14 are the ladder.

### Why it matters

Twenty copies of a security-relevant check is twenty chances for one of them to drift. It has not
drifted yet; the recommendation is to make sure it cannot.

### Recommended change

Add to `convex/auth.helpers.ts`:

```ts
/** Throws unless the caller is verified and owns the property chain above `bulbId`. */
export async function requireBulbOwner(ctx: MutationCtx, bulbId: Id<"bulbs">) {
  const userId = await requireVerifiedUserId(ctx);
  const bulb = await ctx.db.get(bulbId);
  if (!bulb) throw new ConvexError("Not found");
  const fixture = await ctx.db.get(bulb.fixtureId);
  if (!fixture) throw new ConvexError("Not found");
  const room = await ctx.db.get(fixture.roomId);
  if (!room) throw new ConvexError("Not found");
  const property = await ctx.db.get(room.propertyId);
  if (!property || property.userId !== userId) throw new ConvexError("Not found");
  return { userId, bulb, fixture, room, property };
}

/** Query variant: returns null instead of throwing. */
export async function getBulbOwner(ctx: QueryCtx, bulbId: Id<"bulbs">) { … }
```

Plus `requireFixtureOwner`, `requireRoomOwner`, `requirePropertyOwner` and their `get*` variants —
six functions total. Call sites collapse to:

```ts
export const updateStatus = mutation({
  args: { id: v.id("bulbs"), status: bulbStatuses },
  handler: async (ctx, args) => {
    const { userId, fixture } = await requireBulbOwner(ctx, args.id);
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    await ctx.db.insert("maintenanceLogs", {
      userId,
      fixtureId: fixture._id,
      bulbId: args.id,
      action: `Status changed to ${args.status}`,
      date: Date.now(),
      createdAt: Date.now(),
    });
  },
});
```

Returning the whole chain avoids re-fetching documents the ladder already loaded.

### Reasoning

This is the smallest abstraction that removes the duplication: six plain functions in a file that
already exists, no new concepts, no framework. It is not premature — the duplication is present
twenty times today.

### Expected benefits

Roughly 150 lines removed from `convex/`. Each function's actual behaviour becomes visible.
Security-relevant logic lives in one auditable place. The CR-004 migration becomes a six-line
change instead of a twenty-site one.

### Trade-offs

One extra indirection when reading a mutation. Mitigated by keeping the helpers in the file whose
name already says what they do and giving them obvious names.

### References

- Convex — [Best practices: helper functions](https://docs.convex.dev/understanding/best-practices/#use-helper-functions-to-write-shared-code)
- Convex — [Authorisation patterns](https://stack.convex.dev/authorization)

---

<a id="cr-013"></a>
## CR-013 — `<AuthGuard>` is repeated in seven routes instead of using a layout route

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Maintainability |
| **Confidence** | **Observed**    |

### Affected files

- `src/components/AuthGuard.tsx`
- `src/routes/{index,properties,property.$propertyId,room.$roomId,fixture.$fixtureId,inventory,search}.tsx`

### Current behaviour

Every protected route repeats:

```tsx
function PropertiesPage() {
  return (
    <AuthGuard>
      <PropertiesContent />
    </AuthGuard>
  );
}
```

`AuthGuard` itself redirects from inside an effect:

```tsx
useEffect(() => {
  if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
}, [isLoading, isAuthenticated, navigate]);
```

### Problem

1. **Opt-in protection.** A new route is unprotected unless the author remembers the wrapper.
   Protection should be structural, not a convention.
2. **The component-splitting is boilerplate.** Each route needs a `XPage` wrapper and an
   `XContent` component purely to accommodate the guard — 14 extra function declarations.
3. **Redirecting in an effect** means the protected tree mounts first, its `useQuery` hooks fire
   against an unauthenticated client, and only then does the redirect run. It works (the queries
   return `[]`), but it is the pattern React's own docs single out as avoidable, and it costs a
   render + a round trip.

### Why it matters

Auth-by-convention is the kind of thing that eventually gets forgotten on exactly the route that
matters.

### Recommended change

Use a **pathless layout route**. Create `src/routes/_authed.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isLoading && !isAuthenticated)
      navigate({ to: "/login", replace: true });
  }, [isLoading, isAuthenticated, navigate]);
  if (isLoading || !isAuthenticated) return <Spinner />;
  return <Outlet />;
}
```

and rename the protected routes to `_authed.index.tsx`, `_authed.properties.tsx`,
`_authed.property.$propertyId.tsx`, etc. The `_authed` segment does not appear in URLs, so no
links change. Delete `src/components/AuthGuard.tsx` and the 7 `XPage` wrappers.

> **Caveat for the implementer:** the canonical TanStack approach is a `beforeLoad` throwing
> `redirect({ to: '/login' })`, which avoids rendering the protected tree at all. That requires
> auth state to be available outside React — reachable by putting the `ConvexReactClient` in the
> router context. That is a larger change; the layout-component version above captures most of
> the benefit for a fraction of the effort. Start with the layout component.

### Reasoning

File-based routing already provides a mechanism for "these routes share a concern". Using it
makes protection the default for anything placed under `_authed/`, which is the property we want.

### Expected benefits

~60 lines removed; new protected routes are protected by where they live; one definition of the
redirect behaviour.

### Trade-offs

Renaming route files regenerates `src/routeTree.gen.ts` and touches every file — a large but
entirely mechanical diff. Do it in its own commit.

### References

- TanStack Router — [Authenticated routes](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- TanStack Router — [Pathless (layout) routes](https://tanstack.com/router/latest/docs/framework/react/routing/routing-concepts#pathless-layout-routes)
- React — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

---

<a id="cr-014"></a>
## CR-014 — Git hooks run the full build on every commit and use a deprecated husky shim

|                |                      |
| -------------- | -------------------- |
| **Priority**   | **P2 — Medium**      |
| **Category**   | Developer experience |
| **Confidence** | **Observed**         |

### Affected files

- `.husky/pre-commit`
- `.husky/pre-push`
- `scripts/safety-check.sh`
- `package.json` (`lint-staged` config)

### Current behaviour

`.husky/pre-commit`:

```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"     # ← deprecated in husky v9, removed in v10

npx lint-staged
pnpm typecheck   || exit 1
pnpm test        || exit 1
pnpm build       || exit 1
```

`.husky/pre-push` runs `scripts/safety-check.sh`, which re-runs typecheck, lint, test and build,
then:

```bash
read -p "Do you want to commit these changes first? (y/n) " -n 1 -r
```

### Problem

1. **Every commit runs a full production build.** Measured locally the build alone is ~2 s for
   Vite plus the TanStack Start/Nitro passes; combined with typecheck and tests the hook makes
   every `git commit` take tens of seconds. That is the behaviour that trains people to use
   `--no-verify`, which disables the hook entirely — the opposite of the intent.
2. **The husky v9 shim line is deprecated.** `husky@9.1.7` is installed; `. "$(dirname "$0")/_/husky.sh"`
   prints a deprecation warning in v9 and is removed in v10. Hooks should now be plain shell
   scripts with no shebang boilerplate.
3. **`scripts/safety-check.sh` duplicates the pre-commit hook**, so a commit-then-push runs
   typecheck/test/build twice.
4. **It prompts interactively.** `read -p` in a `pre-push` hook has no terminal under most GUI git
   clients and some CI contexts; the logic is also inverted (answering `y` — "yes, commit first" —
   exits 1 and blocks, which is right, but answering `n` proceeds with a dirty tree).
5. `lint-staged` runs both `biome lint --write` and `biome check --write` on every `.ts`/`.tsx`
   file; `biome check` is a superset of `biome lint`, so the first command is redundant.

### Why it matters

Slow hooks get bypassed, and a bypassed hook protects nothing. CI is the right place for the
expensive checks; hooks should catch only what is cheap and local.

### Recommended change

`.husky/pre-commit` — one line:

```sh
npx lint-staged
```

`package.json`:

```jsonc
"lint-staged": {
  "*.{ts,tsx,json,md}": ["biome check --write --no-errors-on-unmatched"]
}
```

**Delete `.husky/pre-push` and `scripts/safety-check.sh`.** Everything they do is already done by
the consolidated CI workflow (CR-010), on a machine where it does not block the developer, and
with results that are visible on the PR.

Remove the `. "$(dirname "$0")/_/husky.sh"` line.

### Reasoning

Pre-commit hooks should be fast enough that nobody thinks about them. Correctness gates belong in
CI, where they cannot be skipped with a flag and where their output is recorded.

### Expected benefits

Commits become sub-second. Two files and ~110 lines of bash deleted. No husky v10 migration
needed later. Nobody is trained to use `--no-verify`.

### Trade-offs

A broken commit can reach the remote and be caught by CI rather than locally. On a repository with
branch protection and a single maintainer that is a good trade; the feedback arrives in ~2 minutes.

### References

- Husky — [v9 migration / hook format](https://typicode.github.io/husky/migrate-from-v4-to-v9.html)
- Biome — [`biome check`](https://biomejs.dev/reference/cli/#biome-check)
- lint-staged — [Configuration](https://github.com/lint-staged/lint-staged#configuration)

---

<a id="cr-015"></a>
## CR-015 — Twenty-six `any` annotations where generated Convex types exist

|                |                                                |
| -------------- | ---------------------------------------------- |
| **Priority**   | **P2 — Medium**                                |
| **Category**   | Type safety                                    |
| **Confidence** | **Observed** (`biome lint --reporter=summary`) |

### Affected files

```
lint/suspicious/noExplicitAny               26 warnings
lint/style/noNonNullAssertion                7 warnings  (all in convex/env.ts — dead, see CR-017)
lint/suspicious/noArrayIndexKey             11 warnings
lint/complexity/useOptionalChain             1 warning
lint/a11y/useButtonType                      2 warnings
                                            ─────────────
                                            47 warnings
```

Distribution: `src/routes/index.tsx` (7), `src/routes/fixture.$fixtureId.tsx` (6),
`src/routes/inventory.tsx` (5), `src/routes/properties.tsx` (5),
`src/routes/property.$propertyId.tsx` (5), `src/routes/room.$roomId.tsx` (4),
`convex/env.ts` (7), `convex/dataTransfer.ts` (2), `src/routes/search.tsx` (2),
`convex/recaptcha.ts` (1), `src/components/Header.tsx` (1), `src/router.tsx` (1),
`src/routes/verify.tsx` (1).

### Current behaviour

```tsx
// src/routes/property.$propertyId.tsx:172
function RoomCard({ room }: { room: any }) { … }

// src/routes/properties.tsx:255
function EditPropertyForm({ property }: { property: any; onSuccess: () => void }) { … }

// src/routes/index.tsx:376
{dueReminders.slice(0, 5).map((r: any) => ( … ))}
```

Meanwhile Convex generates exactly the types these need, in `convex/_generated/dataModel.d.ts`:

```ts
import type { Doc, Id } from "../../convex/_generated/dataModel";
// Doc<"rooms">, Doc<"properties">, Id<"bulbs">, …
```

and for derived shapes, `FunctionReturnType<typeof api.reminders.listDue>[number]`.

### Problem

`any` at a component boundary discards the main benefit of using Convex: the end-to-end type chain
from `schema.ts` through the generated API to the component. Rename a schema field and these
components silently keep compiling and break at runtime. `lint` reports them as warnings and exits
0, so CI never objects.

`convex/dataTransfer.ts` uses `parsed: any` for untrusted JSON — that one is defensible (the input
genuinely is unknown), but `unknown` plus the existing explicit validation would be more honest.

The 11 `noArrayIndexKey` warnings are all in skeleton-loader lists
(`Array.from({ length: 4 }).map((_, i) => <Card key={i}>)`), where index keys are harmless because
the list is static. Those should be **suppressed deliberately**, not left as noise.

### Why it matters

47 warnings that never fail the build become invisible. Real issues then hide among them — which
is how the dead `convex/env.ts` (7 of the 47) survived.

### Recommended change

1. **Replace `any` with generated types** at every component boundary:

   ```tsx
   import type { Doc } from "../../convex/_generated/dataModel";
   function RoomCard({ room }: { room: Doc<"rooms"> & { fixtureCount: number } }) { … }
   ```

   For query results with computed fields, prefer deriving:

   ```tsx
   type Reminder = FunctionReturnType<typeof api.reminders.listDue>[number];
   ```
2. **Fix the two `useButtonType` warnings** (`src/components/Header.tsx` mobile toggle,
   `src/router.tsx` reload button) by adding `type="button"` — a one-character-each real fix.
3. **For the skeleton lists**, either use a stable key array or add a targeted
   `// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list` with the reason.
4. **Once the count is zero, make lint fail on warnings** so it stays zero:

   ```jsonc
   // package.json
   "lint": "biome check --error-on-warnings ."
   ```

### Reasoning

A warning count that only goes up is not a signal. Getting to zero and then enforcing zero is the
only state in which lint output is worth reading. The types already exist and cost nothing to use.

### Expected benefits

Schema changes surface as compile errors in the UI. Lint output becomes meaningful.

### Trade-offs

Some query return types are structural (`{ ...fixture, roomName, propertyName }`) and need either
a derived type or a small hand-written interface. `FunctionReturnType` handles most of them.

### References

- Convex — [TypeScript and generated types](https://docs.convex.dev/understanding/best-practices/typescript)
- Biome — [`noExplicitAny`](https://biomejs.dev/linter/rules/no-explicit-any/) · [suppressions](https://biomejs.dev/linter/#suppress-lint-rules)

---

<a id="cr-016"></a>
## CR-016 — Server-side input bounds are applied inconsistently

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Data integrity  |
| **Confidence** | **Observed**    |

### Affected files

- `convex/properties.ts:75-88` (`create`), `:90-100` (`update`)
- `convex/rooms.ts` (`create`, `update`)
- `convex/fixtures.ts:58-80` (`create`), `:409-433` (`update`)
- `convex/bulbs.ts:554-593` (`create`)
- `convex/inventory.ts:19-45` (`create`), `:79-95` (`adjustQuantity`)
- Contrast with `convex/maintenance.ts:40-47`, which _does_ validate

### Current behaviour

`convex/maintenance.ts` gets it right:

```ts
if (args.action.trim().length === 0 || args.action.length > 200) {
  throw new Error("Action must be between 1 and 200 characters");
}
if (args.notes && args.notes.length > 2000) {
  throw new Error("Notes must be 2000 characters or less");
}
```

Nothing else does. `properties.create` accepts `name: v.string()` with no length or emptiness
check. `bulbs.create` accepts `wattage: v.number()` — and `v.number()` is an IEEE-754 float64, so
`-5`, `1e308`, `NaN` and `Infinity` are all valid. `inventory.create` accepts any `quantity`
including negative and fractional; `adjustQuantity` floors the _result_ at 0 but does not bound
`delta`. `reminders.create` accepts any `message` string and any `reminderDate`.

The HTML forms set `required` and `type="number"`, but those are client-side only and the Convex
functions are directly callable.

### Problem

A client (or a script) can create a property with a 10 MB name, a bulb with `NaN` wattage, or a
spare-bulb row with quantity `-1`. `NaN` in particular will render as "NaN W" and break the
`spares.reduce((sum, s) => sum + s.quantity, 0)` aggregation in `search.dashboardStats`, which
will then display `NaN` on the dashboard for every subsequent load until the row is deleted.

### Why it matters

This is a genuine data-integrity gap rather than a theoretical one: there is no way to repair a
`NaN` aggregate from the UI. It is also an inconsistency — the author clearly knows to do this,
since `maintenance.ts` does it.

### Recommended change

Add a small shared validator module next to the existing `convex/validation.ts`:

```ts
// convex/validation.ts
export function requireText(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError(`${field} is required`);
  if (trimmed.length > max)
    throw new ConvexError(`${field} must be ${max} characters or fewer`);
  return trimmed;
}

export function requireCount(
  value: number,
  field: string,
  max: number,
): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new ConvexError(
      `${field} must be a whole number between 0 and ${max}`,
    );
  }
  return value;
}

export function requireWattage(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new ConvexError("Wattage must be between 0 and 10000");
  }
  return value;
}
```

Apply: names → `requireText(args.name, "Name", 200)`; notes → `requireText(..., 2000)` where
present; `wattage` → `requireWattage`; `quantity` and `delta` → `requireCount(..., 100_000)`;
`reminders.message` → `requireText(..., 500)`.

Note this also fixes a latent bug: the trimmed value should be what gets stored, so
`"   "` cannot become a property name.

### Reasoning

Convex validators check _shape_, not _domain_. The domain checks belong in the handler, which is
what `maintenance.ts` already demonstrates. Three small functions cover every case in the app.

### Expected benefits

Consistent server-side validation; impossible to poison the dashboard aggregate; the limits become
documented in one place.

### Trade-offs

Existing rows that violate the new bounds (if any) will fail on their next `update`. Given the app
is single-user-per-account and the forms already constrain input, this is very unlikely; a one-off
query to check is cheap if desired.

### References

- Convex — [Argument validation](https://docs.convex.dev/functions/validation)
- Convex — [Data types (`v.number()` is float64)](https://docs.convex.dev/database/types)

---

<a id="cr-017"></a>
## CR-017 — Dead code: an unused component, an unused module, a no-op migration, ~200 lines of CSS

|                |                                           |
| -------------- | ----------------------------------------- |
| **Priority**   | **P2 — Medium**                           |
| **Category**   | Simplification                            |
| **Confidence** | **Observed** (grep for every import site) |

### Affected files

| File / region                                                    | Evidence it is dead                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/Footer.tsx` (44 lines)                           | `grep -rn "Footer" src/ \| grep -v AlertDialogFooter\|CardFooter\|DialogFooter` → no import. `__root.tsx` renders its own inline `<footer>`. Content is template text: "© 2026 Your name here", links to `x.com/tan_stack` and `github.com/TanStack`.                                                                                                                                                              |
| `convex/env.ts` (51 lines)                                       | `grep -rn "from \"./env\"" convex/` → no matches. Produces 7 of the 47 lint warnings via `process.env.X!`. Its top-level `validateEnv()` call is a module side-effect that would throw if it ever _were_ imported with a partial environment.                                                                                                                                                                      |
| `convex/migrations.ts` (81 lines)                                | Not referenced from `src/`. Its own comments say step 2 "is now a no-op … Kept for historical context". It migrates a schema shape (`fixtures.socketType`) that no longer exists in `schema.ts`.                                                                                                                                                                                                                   |
| `export { convex }` in `src/integrations/convex/provider.tsx:24` | No importer; routes use `useConvex()`.                                                                                                                                                                                                                                                                                                                                                                             |
| `src/styles.css` lines ~9-27 and ~160-345                        | The "sea/lagoon/palm/island" token set and classes `.island-shell`, `.feature-card`, `.nav-link`, `.rise-in`, `.site-footer`, `.display-title`, `.page-wrap`, `.island-kicker`. Grepping `src/**/*.tsx` finds uses only in the dead `Footer.tsx`. The elaborate `body` gradient they define is overridden by the `@layer base { body { background-color: var(--background) } }` block at the end of the same file. |
| `next-themes` dependency                                         | Imported only by `src/components/ui/sonner.tsx`. No `next-themes` `ThemeProvider` is mounted anywhere, so `useTheme()` returns its default and the toaster is permanently `"system"` regardless of the app's own toggle.                                                                                                                                                                                           |
| `.cta.json`                                                      | Create-TanStack-App scaffolding manifest; still lists `"nitro"` as a chosen add-on (removed in `9249ced`). Nothing reads it.                                                                                                                                                                                                                                                                                       |

Related: `src/components/ThemeToggle.tsx` styles itself with `var(--chip-bg)`, `var(--chip-line)`,
`var(--sea-ink)` — tokens from the abandoned palette rather than the shadcn set used by every
other component.

### Problem

Roughly 380 lines of code and CSS that can never execute, plus one dependency whose only effect is
to make the toast theme _wrong_. New contributors and agents read it, reason about it, and in the
case of `convex/env.ts` may reasonably conclude that environment validation is happening when it
is not.

### Why it matters

Dead code is a tax on every future read. `convex/env.ts` in particular is actively misleading: it
looks like a safety mechanism.

### Recommended change

```bash
git rm src/components/Footer.tsx convex/env.ts convex/migrations.ts .cta.json
```

- Remove `export { convex }` from `src/integrations/convex/provider.tsx`.
- Delete the unused CSS regions from `src/styles.css`, keeping only the shadcn `:root` / `.dark`
  token blocks, the `@theme inline` mapping, and the `@layer base` block.
- Restyle `ThemeToggle` with shadcn tokens (or reuse `<Button variant="ghost" size="sm">` as the
  sign-out button does).
- Remove `next-themes` from `package.json` and replace the import in `src/components/ui/sonner.tsx`
  with the app's own theme state — or simply hard-code `theme="system"` and let the CSS `.dark`
  class handle it, which is what effectively happens today.

**Before deleting `convex/migrations.ts`, confirm with the owner that the backfill has been run on
production.** If unsure, run `npx convex run migrations:backfillSocketTypeAndFeatures` once and
check `bulbsUpdated === 0`, then delete.

### Reasoning

Deleting unused code is the cheapest possible simplification, and `convex/env.ts` additionally
removes 7 of the 47 lint warnings for free.

### Expected benefits

~380 lines gone, one dependency gone, 7 lint warnings gone, and the theming story becomes
single-sourced.

### Trade-offs

Only the migration carries any risk, and only if it has not yet been run in production — hence the
check above.

### References

- Tailwind CSS v4 — [Theme variables](https://tailwindcss.com/docs/theme)
- shadcn/ui — [Theming](https://ui.shadcn.com/docs/theming)

---

<a id="cr-018"></a>
## CR-018 — Seven unused or redundant dependencies

|                |                                            |
| -------------- | ------------------------------------------ |
| **Priority**   | **P2 — Medium**                            |
| **Category**   | Simplification                             |
| **Confidence** | **Observed** by grepping every import site |

### Affected files

- `package.json`

### Current behaviour

| Package                                          | Declared as                 | Import sites found  | Notes                                                                      |
| ------------------------------------------------ | --------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `@convex-dev/react-query`                        | dependency (pinned `0.1.0`) | **none**            | Also needs a `@tanstack/react-query` peer that is not a direct dependency. |
| `@tanstack/react-router-ssr-query`               | dependency                  | **none**            | SSR query integration; app has no SSR (CR-011).                            |
| `@auth/core`                                     | dependency                  | **none** directly   | Transitive peer of `@convex-dev/auth`; should not be a direct dependency.  |
| `jsdom`                                          | devDependency               | **none**            | `vitest.config.ts` sets `environment: "node"`.                             |
| `@testing-library/react`, `@testing-library/dom` | devDependencies             | **none**            | No component test exists (CR-008).                                         |
| `wait-on`                                        | devDependency               | **none**            | Workflows use hand-rolled `curl` loops instead (CR-019).                   |
| `next-themes`                                    | dependency                  | 1 (`ui/sonner.tsx`) | Non-functional without a provider — see CR-017.                            |

Also: `@tanstack/router-plugin` is declared but not referenced in `vite.config.ts` — it is used
transitively by `tanstackStart()`. It becomes a _direct_ requirement under CR-011 Option B, so
leave it.

### Problem

Seven packages (plus their transitive trees) are installed, locked, audited, scanned by CodeQL and
Dependabot, and downloaded in every CI job, for no runtime or build-time benefit. `jsdom` and
`@testing-library/*` additionally imply a component-testing setup that does not exist, which is
misleading for anyone adding tests.

### Why it matters

Each dependency is supply-chain surface and a thing to keep up to date. Removing seven is free.

### Recommended change

```bash
pnpm remove @convex-dev/react-query @tanstack/react-router-ssr-query @auth/core \
            jsdom @testing-library/react @testing-library/dom wait-on
```

Handle `next-themes` as part of CR-017.

**Re-add `jsdom` and `@testing-library/react` only if and when a component test is actually
written** (CR-008 recommends starting with pure-function tests, which need neither).

Verify afterwards: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

### Reasoning

Fewer dependencies is the single most reliable way to reduce long-term maintenance for a small
project. These seven have zero call sites.

### Expected benefits

Smaller lockfile, faster CI installs, less Dependabot noise, smaller audit surface. No behaviour
change.

### Trade-offs

`@auth/core` is a peer dependency of `@convex-dev/auth`; removing the direct declaration relies on
pnpm hoisting resolving it via the peer. Verify the build after removal and re-add if
`@convex-dev/auth` complains — pnpm's strict `node_modules` layout makes this worth checking
rather than assuming.

### References

- pnpm — [`pnpm remove`](https://pnpm.io/cli/remove)
- npm — [Dependency types](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#dependencies)

---

<a id="cr-019"></a>
## CR-019 — Playwright: hand-rolled server orchestration, three browsers, a stale PID path

|                |                              |
| -------------- | ---------------------------- |
| **Priority**   | **P2 — Medium**              |
| **Category**   | Simplification / reliability |
| **Confidence** | **Observed**                 |

### Affected files

- `playwright.config.ts`
- `.github/workflows/e2e.yml`
- `e2e/basic.spec.ts`

### Current behaviour

`playwright.config.ts` has **no `webServer`** block. Instead `e2e.yml` does:

```yaml
- name: Start dev servers (Convex + Vite)
  run: |
    pnpm dev > /tmp/server.log 2>&1 &
    echo $! > /tmp/server.pid
- name: Wait for servers
  run: |
    for i in {1..120}; do
      if curl -s http://localhost:3000 > /dev/null; then break; fi
      sleep 2
    done
    sleep 15                        # "additional time for Convex initialization"
- run: pnpm test:e2e
- name: Stop dev servers
  if: always()
  run: |
    if [ -f logs/server.pid ]; then      # ← writes /tmp/server.pid, reads logs/server.pid
      kill $(cat logs/server.pid) || true
    fi
    pkill -f "pnpm dev" || true
```

`playwright.config.ts`:

```ts
projects: [{ name: "chromium" }, { name: "firefox" }, { name: "webkit" }],
retries: process.env.CI ? 2 : 0,
```

`e2e/basic.spec.ts` — the whole suite:

```ts
test("should load the home page", … expect(page).toHaveURL(/.*\/login/));
test("should show login form on login page", … expect(input[type=email]).toBeVisible());
```

Git history shows ten consecutive commits fighting this setup: _"Build separately before E2E tests
to avoid timeout"_, _"Use nohup and curl loop for reliable server startup"_, _"Disable E2E tests -
preview server not starting in CI"_, _"Try dev server instead of preview"_, _"Increase E2E server
wait time"_.

### Problem

1. **Playwright has a first-class `webServer` option** that starts a command, polls a URL until it
   responds, and tears it down afterwards. Reimplementing it in YAML is what produced the ten
   commits of thrash and the hard-coded `sleep 15`.
2. **The PID path bug**: `/tmp/server.pid` is written, `logs/server.pid` is read. The `kill` never
   runs; only the `pkill` fallback does.
3. **`pnpm dev` runs `convex dev`**, which needs `CONVEX_DEPLOYMENT` / a deploy key. In CI without
   them the Convex half either fails or prompts; the `cat /tmp/server.log` step exists to debug
   exactly this. Tests then run against a frontend whose backend may not be connected — which is
   why both tests are unauthenticated.
4. **Three browser projects × 2 retries for 2 smoke tests.** The tests exercise routing and two
   DOM selectors; cross-browser coverage adds runtime, not information.
5. **The tests cover nothing of value.** Neither touches authenticated functionality, which is the
   entire application.

### Why it matters

E2E is the only layer that could have caught CR-001 — and it is pointed at a dev server on
localhost, not at a deployment, so it could not.

### Recommended change

**1. Move server startup into `playwright.config.ts`:**

```ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm preview --port 3000",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
```

Testing the **production build** (`preview`), not the dev server, is both more representative and
removes the `convex dev` dependency.

**2. Delete `.github/workflows/e2e.yml`** and add two steps to the consolidated CI workflow
(CR-010): `npx playwright install --with-deps chromium`, then `pnpm test:e2e`.

**3. Add an authenticated happy-path test.** Seed a test user in the Convex dev deployment and
drive: sign in → create property → create room → create fixture → create bulb → mark dead →
verify the dashboard count. That one test covers more of the app than the entire unit suite.

**4. Point E2E at production after deploy.** With `E2E_BASE_URL` honoured above, the `smoke` job
from CR-003 can run the same suite against `https://lights-inventory.vercel.app` — which would
have caught CR-001 immediately.

### Reasoning

Use the framework's own feature instead of reimplementing it in CI YAML. The ten commits of
churn in the git log are direct evidence of the cost of not doing so.

### Expected benefits

One workflow deleted; the `sleep 15` and the PID bug disappear; E2E runtime drops ~3×; the suite
starts testing the production build and, optionally, production itself.

### Trade-offs

Dropping Firefox/WebKit loses cross-browser coverage. For a private inventory tool that is
acceptable; they can be re-added to a weekly scheduled run if desired. The authenticated test
needs a seeded user, which is a small amount of setup — do it in a `globalSetup` or via a Convex
seed mutation guarded to the dev deployment.

### References

- Playwright — [Web server](https://playwright.dev/docs/test-webserver)
- Playwright — [Configuration](https://playwright.dev/docs/test-configuration)
- Playwright — [Authentication / reusing signed-in state](https://playwright.dev/docs/auth)
- Playwright — [CI](https://playwright.dev/docs/ci)

---

<a id="cr-020"></a>
## CR-020 — The `rateLimits` table grows without bound and has no cleanup

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Reliability     |
| **Confidence** | **Observed**    |

### Affected files

- `convex/schema.ts:147-156`
- `convex/rateLimit.ts`
- (absent) `convex/crons.ts`

### Current behaviour

```ts
rateLimits: defineTable({ key, count, windowStart, updatedAt })
  .index("by_key", ["key"])
  .index("by_updatedAt", ["updatedAt"]); // ← index exists, nothing uses it
```

```ts
const existing = await ctx.db
  .query("rateLimits")
  .withIndex("by_key", (q) => q.eq("key", key))
  .collect(); // collects ALL rows for the key

const active = existing.sort((a, b) => b.updatedAt - a.updatedAt)[0];
for (const extra of existing.slice(1)) {
  await ctx.db.delete(extra._id); // dedupe workaround
}
```

Rows are created, updated, and **never deleted** once a window expires. There is no
`convex/crons.ts` in the repository.

### Problem

1. **Unbounded growth.** Every distinct key leaves a permanent row. Keys include
   `recaptcha:global:signIn`, `recaptcha:global:all` (bounded — fine) and
   `importAll:${userId}` (one per user, also bounded). Today the growth is slow. But the CR-002
   fix introduces per-email keys, at which point every login attempt from a new address creates a
   permanent row and the table becomes an attacker-controlled growth vector.
2. **The `by_updatedAt` index is unused** — it was clearly added for a cleanup job that was never
   written.
3. **The dedupe loop is a workaround for a problem that should not exist.** Convex mutations are
   serialisable transactions, so two concurrent `enforceRateLimit` calls for the same key cannot
   both insert. The `.collect()` + sort + delete-the-rest logic is defending against something
   that can't happen, at the cost of reading every row for the key on every call. `.unique()` or
   `.first()` expresses the intent directly.

### Why it matters

It is a latent problem today and becomes a real one the moment per-subject rate limiting is
introduced — which CR-002 recommends doing.

### Recommended change

**1. Simplify the read:**

```ts
const active = await ctx.db
  .query("rateLimits")
  .withIndex("by_key", (q) => q.eq("key", key))
  .unique();
```

**2. Add a cleanup cron** — `convex/crons.ts`:

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily(
  "purge stale rate limits",
  { hourUTC: 3, minuteUTC: 0 },
  internal.rateLimit.purgeStale,
);
export default crons;
```

```ts
// convex/rateLimit.ts
export const purgeStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoff))
      .take(1000);
    for (const row of stale) await ctx.db.delete(row._id);
  },
});
```

`.take(1000)` keeps each run inside Convex's transaction limits; the daily schedule catches up
over time.

**Alternative:** adopt the official `@convex-dev/rate-limiter` component (also recommended by
CR-006) and delete `convex/rateLimit.ts` and the `rateLimits` table entirely. That is one
dependency in exchange for ~70 lines, a schema table, a cron, and this whole class of problem.

### Reasoning

The `by_updatedAt` index is direct evidence that cleanup was intended. Either finish it (20 lines)
or delegate the whole concern to the component that already solves it.

### Expected benefits

Bounded table size; `enforceRateLimit` reads one row instead of all rows for a key; CR-002's
per-subject keys become safe to introduce.

### Trade-offs

Adds `convex/crons.ts` — one more file, but a conventional and expected one in a Convex project.
The component alternative adds a dependency but removes more than it adds.

### References

- Convex — [Cron jobs](https://docs.convex.dev/scheduling/cron-jobs)
- Convex — [Rate Limiter component](https://www.convex.dev/components/rate-limiter)
- Convex — [Reading data / `unique()`](https://docs.convex.dev/database/reading-data/)

---

<a id="cr-021"></a>
## CR-021 — The README is unmodified scaffolding and AGENTS.md states wrong versions

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Documentation   |
| **Confidence** | **Observed**    |

### Affected files

- `README.md` (191 lines)
- `AGENTS.md` (28 KB)

### Current behaviour

`README.md` opens with:

> Welcome to your new TanStack Start app!
>
> ```bash
> npm install
> npm run dev
> ```

and goes on to explain how to remove Tailwind, how to add routes, how to use server functions and
API routes (neither is used), and:

> # Demo files
> Files prefixed with `demo` can be safely deleted.
> 1. Remove the demo pages in `src/routes/demo/`

There is no `src/routes/demo/`. The project uses pnpm, not npm. Roughly 15 lines about Convex and
reCAPTCHA were inserted into the middle of the template; everything else is generic.

The README **never says what the application is.**

`AGENTS.md`'s "Tech Stack" table versus `package.json` / `node_modules`:

| Claim in AGENTS.md      | Actually installed                 |
| ----------------------- | ---------------------------------- |
| Node.js 20              | CI uses **22** in all 13 workflows |
| TypeScript 5.7.2        | **7.0.2**                          |
| TanStack Start 1.168.60 | **1.169.4**                        |
| React 19.2.0            | **19.3.1**                         |
| Tailwind 4.1.18         | **4.3.4**                          |
| Convex 1.34.0           | **1.49.0**                         |
| Vite 7.3.1              | **8.3.5**                          |
| Vitest 3.0.5            | **5.1.0**                          |
| Biome 2.4.10            | **2.6.4**                          |

AGENTS.md also lists required status checks and a workflow inventory that no longer match
`.github/workflows/`, and asserts branch protection exists while
`docs/branch-protection-setup.md` says it was never configured.

### Problem

The README is the first thing a human or an agent reads, and it describes a different project. The
AGENTS.md version table is worse than absent: an agent that trusts it will reason about the wrong
APIs — e.g. TypeScript 5.7 vs 7.0, or Vite 7 vs 8, which have materially different plugin
contracts. The `build-docs.yml` workflow already contains the string _"TypeScript 7.0
compatibility issue"_, so this has bitten already.

### Why it matters

This repository is explicitly set up for agentic development (AGENTS.md, `.cursorrules`,
`agent-approval.yml`). Wrong documentation is a direct input to wrong code.

### Recommended change

**Rewrite `README.md`** to roughly 60 lines covering only:

1. One paragraph: what Lights Inventory is (properties → rooms → fixtures → bulbs, spares,
   reminders, import/export).
2. Prerequisites: Node 22, pnpm (version from `packageManager`).
3. Setup: `pnpm install`, `cp .env.example .env.local`, `npx convex dev` to provision, which
   variables go in Convex vs. Vercel.
4. Commands table: `dev`, `build`, `test`, `test:e2e`, `lint`, `typecheck`.
5. Architecture: three sentences + a link to `docs/lights-inventory-4.6-architecture-brief.md`.
6. Deployment: Vercel Git integration for the frontend, `convex-deploy.yml` for the backend.

Delete every section inherited from the template.

**Fix AGENTS.md:** delete the version table entirely — it is guaranteed to drift. Replace it with
"run `pnpm list --depth 0`". Update the workflow inventory to match the post-CR-010 set, and
resolve the branch-protection contradiction against the actual repository settings.

### Reasoning

A version table maintained by hand in a document nobody updates will always be wrong. The fix is
to not have one. The README should answer "what is this and how do I run it" and nothing else.

### Expected benefits

Agents and humans get accurate context. ~130 lines of irrelevant template removed.

### Trade-offs

None. This is pure correction.

### References

- GitHub — [About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [agents.md](https://agents.md/) — conventions for agent instruction files

---

<a id="cr-022"></a>
## CR-022 — The Biome formatter is never enforced, so indentation is inconsistent

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Consistency     |
| **Confidence** | **Observed**    |

### Affected files

- `package.json` (`"lint": "biome lint ."`)
- `biome.json`
- Most of `convex/` and `src/`

### Current behaviour

`pnpm lint` runs `biome lint .` — **lint rules only, no formatting check**. `biome.json` has no
`formatter` block, so defaults apply but are never verified. Only `lint-staged` runs
`biome check --write`, and only on staged files at commit time — which is bypassed whenever the
heavy pre-commit hook is skipped (CR-014).

The result is visible mid-file:

```ts
// convex/maintenance.ts — three indentation styles in one function
export const listByFixture = query({
    args: { fixtureId: v.id("fixtures") },        // 4 spaces
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);

    const fixture = await ctx.db.get(args.fixtureId);   // 4 spaces, wrong depth
    if (!fixture) return [];
        …
            .order("desc")
      .collect()                                        // 6 spaces
      .then((logs) => logs.filter((log) => log.userId === userId));
```

```ts
// convex/maintenance.ts — insertion block
        return await ctx.db.insert("maintenanceLogs", {
            userId,
          fixtureId: resolvedFixtureId,     // 10 spaces among 12s
            bulbId: args.bulbId,
```

Across the repo: `convex/auth.ts` and `convex/recaptcha.ts` use tabs; `convex/properties.ts` uses
4 spaces; `convex/reminders.ts` uses 2; `src/routes/index.tsx` uses 4 while every other route uses
2; `e2e/basic.spec.ts` uses tabs.

### Problem

Biome is installed, configured and run in CI, yet the one thing it is best at — deterministic
formatting — is switched off. Diffs are noisier than they need to be and reviewers spend attention
on whitespace.

### Why it matters

Low severity individually, but it is pure free consistency: the tool is already there and the fix
is a one-word change plus one mechanical commit.

### Recommended change

1. `package.json`:

   ```jsonc
   "lint": "biome check .",
   "lint:fix": "biome check --write ."
   ```

   `biome check` runs the formatter, linter and import sorting together — it is the command Biome
   documents for CI.
2. `biome.json` — state the style explicitly rather than relying on defaults:

   ```jsonc
   "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 }
   ```
3. Run `pnpm biome check --write .` once and commit the result **as a single, isolated commit**
   so it never has to be untangled from a behavioural change.
4. Simplify `lint-staged` to the single `biome check --write` entry (see CR-014).

### Reasoning

Automated formatting is only valuable when it is unconditional. Half-enforcing it produces the
worst outcome: the churn without the consistency.

### Expected benefits

Uniform formatting; smaller, more readable diffs; one command (`biome check`) instead of three
near-synonyms scattered across `package.json` and `lint-staged`.

### Trade-offs

One large whitespace-only commit that will appear in `git blame`. Mitigate by recording its SHA in
a `.git-blame-ignore-revs` file, which GitHub honours.

### References

- Biome — [`biome check`](https://biomejs.dev/reference/cli/#biome-check)
- Biome — [Formatter configuration](https://biomejs.dev/reference/configuration/#formatter)
- Git — [`blame.ignoreRevsFile`](https://git-scm.com/docs/git-blame#Documentation/git-blame.txt---ignore-revs-fileltfilegt)

---

<a id="cr-023"></a>
## CR-023 — A missing `VITE_CONVEX_URL` silently falls back to a placeholder

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Debuggability   |
| **Confidence** | **Observed**    |

### Affected files

- `src/integrations/convex/provider.tsx:4-9`

### Current behaviour

```ts
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;
if (!CONVEX_URL) {
  console.error("Missing VITE_CONVEX_URL environment variable");
}
const convex = new ConvexReactClient(
  CONVEX_URL || "https://placeholder.convex.cloud",
);
```

### Problem

If the Vercel project is missing `VITE_CONVEX_URL`, the app builds and deploys successfully, loads
in the browser, renders the shell and the header — and then every query hangs or fails against a
domain that does not belong to this project. The only signal is a `console.error` that nobody is
watching.

The symptom (a blank authenticated page, infinite spinners) is indistinguishable from several
other failure modes, so diagnosis starts from scratch.

Note also that `AuthGuard` shows a spinner while `isLoading`, and `useConvexAuth` against an
unreachable deployment stays loading — so the user sees a spinner forever with no error.

### Why it matters

This is a configuration mistake that is easy to make (new Vercel project, renamed env var, preview
environment without the variable) and currently produces the least diagnosable possible symptom.
Given that CR-001 is itself a deployment-configuration failure, failing loudly here has concrete
value.

### Recommended change

Fail fast and visibly:

```ts
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error(
    "VITE_CONVEX_URL is not set. Copy .env.example to .env.local for local development, " +
      "or add it to the Vercel project's Environment Variables.",
  );
}

const convex = new ConvexReactClient(CONVEX_URL);
```

A thrown error during module initialisation surfaces through the router's `defaultErrorComponent`
(already defined in `src/router.tsx`) with the message visible on screen.

Optionally also assert it at build time in `vite.config.ts` so a misconfigured deployment fails in
CI rather than in the browser.

### Reasoning

A placeholder URL converts a clear, immediate configuration error into a confusing runtime one.
There is no scenario in which `https://placeholder.convex.cloud` is a useful thing to connect to.

### Expected benefits

Misconfiguration is obvious within one second instead of requiring a console inspection.

### Trade-offs

Any build or preview environment currently missing the variable will now hard-fail. That is the
point, but check Vercel preview environments have it set before shipping this.

### References

- Vite — [Env variables and modes](https://vite.dev/guide/env-and-mode)
- Convex — [Client configuration](https://docs.convex.dev/client/react)

---

<a id="cr-024"></a>
## CR-024 — `.vercel/project.json` is committed and the `.gitignore` negation is defeated

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Hygiene         |
| **Confidence** | **Observed**    |

### Affected files

- `.vercel/project.json`, `.vercel/README.txt` (both tracked)
- `.gitignore`

### Current behaviour

```console
$ git ls-files | grep .vercel
.vercel/README.txt
.vercel/project.json

$ cat .vercel/project.json
{"projectId":"prj_kmtjuVUW2EYrxh9Z0TSMLXG48uUK","orgId":"team_clocZuPtMHN5C01cBJPXqV0p","projectName":"lights-inventory"}
```

`.vercel/README.txt` — committed alongside it — says:

> **Should I commit the ".vercel" folder?**
> No, you should not share the ".vercel" folder with anyone.

`.gitignore` does list `.vercel` (line 15), but the files were committed before that line existed,
and `.gitignore` does not affect already-tracked files.

Separately, `.gitignore` ends with:

```
.env
.env.local
.env.*.local
!.env.example
.nitro
.tanstack
.wrangler
.output
.vinxi
__unconfig*
todos.json
.vercel
.env*              ← line 18
```

```console
$ git check-ignore -v --no-index .env.example
.gitignore:18:.env*    .env.example
```

The trailing `.env*` is the last matching pattern, so it **overrides the earlier `!.env.example`
negation**. `.env.example` survives only because it is already tracked. Also untracked and
unignored: `coverage/` (created by `pnpm test:coverage`).

### Problem

1. `projectId` / `orgId` are not credentials — they cannot be used without a `VERCEL_TOKEN` — so
   this is **not a secret leak**. But Vercel explicitly says not to commit it, and the
   directory's presence can confuse `vercel` CLI runs in forks and CI.
2. The `.env*` / `!.env.example` ordering means any _new_ env template file (`.env.sample`,
   `.env.production.example`) silently cannot be added without `git add -f` — a confusing trap.
3. `coverage/` shows up as untracked noise in `git status` after every coverage run.

### Why it matters

Low individually; collectively these are the kind of small frictions that waste time repeatedly.

### Recommended change

```bash
git rm -r --cached .vercel
```

Rewrite the ignore tail in a sensible order (negations must come **after** the pattern they
negate):

```gitignore
# env
.env*
!.env.example

# build output
dist
dist-ssr
.output
.nitro
.tanstack
.vinxi
.vercel
coverage

# misc
node_modules
.DS_Store
*.local
__unconfig*
todos.json
.cache
```

This also removes the current duplication of `.env`, `.env.local`, `.env.*.local` and `.env*`.

### Reasoning

Correct `.gitignore` ordering and a clean tracked-file list are cheap and prevent a category of
small surprises.

### Expected benefits

`git status` is clean after a coverage run; env templates can be added normally; the Vercel link
directory is local-only as intended.

### Trade-offs

After `git rm -r --cached .vercel`, anyone with the repo checked out keeps their local copy; new
clones will need `vercel link` to re-establish the link. That is the documented workflow.

### References

- Vercel CLI — [`vercel link` and the `.vercel` directory](https://vercel.com/docs/cli/project-linking)
- Git — [gitignore pattern precedence](https://git-scm.com/docs/gitignore#_pattern_format)

---

<a id="cr-025"></a>
## CR-025 — Workflow hygiene: missing `permissions:`, mixed action pinning, pnpm version drift

|                |                        |
| -------------- | ---------------------- |
| **Priority**   | **P2 — Medium**        |
| **Category**   | Security / reliability |
| **Confidence** | **Observed**           |

### Affected files

All of `.github/workflows/`.

### Current behaviour

**No `permissions:` block** in: `ci.yml`, `e2e.yml`, `lighthouse.yml`, `deploy-with-rollback.yml`,
`agent-approval.yml`, `agent-safety.yml`, `snyk.yml`, `health-check.yml`. Those jobs run with the
repository's default `GITHUB_TOKEN` scope, which may be read/write.

**Three different pinning styles**, sometimes within one file:

```yaml
uses: actions/checkout@v4 # code-quality.yml
uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.2.2    # ci.yml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2    # convex-deploy.yml
uses: pnpm/action-setup@v2 # most files
uses: pnpm/action-setup@eae0cfeb286e66ffb5155f1a79b90583a127a68b # v2.4.1    # ci.yml
uses: pnpm/action-setup@b307475762933b98ed359c036b0e51f26b63b74b # v5.0.0    # convex-deploy.yml
```

So `actions/checkout` is simultaneously pinned to v4, v4.2.2 and v6.0.2, and `pnpm/action-setup`
to v2, v2.4.1 and v5.0.0, across workflows in the same repository.

**pnpm version drift:** every workflow hard-codes `version: 10`; the developer's machine runs
11.1.0; `package.json` has no `packageManager` field (CR-009).

**`agent-approval.yml`** calls `github.rest.issues.addLabel` with no `permissions:` block. Adding
a label requires `issues: write`. If the repository default token is read-only (GitHub's
recommended setting, and the default for repos created after Feb 2023), this step fails.
_Confidence: inferred_ — I could not read the repository's default token permission setting.

### Problem

1. **Least privilege is not applied.** GitHub's guidance is to declare the narrowest
   `permissions:` each workflow needs; an over-privileged token in a workflow that runs untrusted
   PR code is a standard supply-chain risk.
2. **Inconsistent pinning** means an action upgrade has to be applied in up to 13 places and is
   easy to do partially — which has already happened.
3. **pnpm major drift** is a latent CI break when the lockfile format moves on.

### Why it matters

These are the conventional hardening steps for GitHub Actions, and the inconsistency itself is a
maintenance cost regardless of the security angle.

### Recommended change

After consolidating to four workflows (CR-010), for each remaining workflow:

```yaml
permissions:
  contents: read # ci.yml, audit.yml

permissions: # codeql.yml
  contents: read
  actions: read
  security-events: write
```

Pick **one** pinning convention and apply it everywhere. For a private project of this size,
major-version tags (`@v4`) with Dependabot's `github-actions` ecosystem enabled is the
proportionate choice; SHA pinning is stricter but only worth the overhead if Dependabot keeps the
SHAs current. Do not keep both.

Add `packageManager` to `package.json` (CR-009) and use `pnpm/action-setup@v4` without a `version:`
input so there is exactly one source of truth.

Add to `.github/dependabot.yml`:

```yaml
- package-ecosystem: "github-actions"
  directory: "/"
  schedule: { interval: "monthly" }
```

### Reasoning

Consolidating to four workflows (CR-010) makes this almost free — there are only four files to get
right instead of thirteen.

### Expected benefits

Least-privilege tokens; one place to bump each action; no pnpm major surprises.

### Trade-offs

Major-version tags accept upstream changes within a major. For a private repo with no untrusted
contributors that is a reasonable risk; if the maintainer prefers SHA pinning, enable Dependabot's
`github-actions` ecosystem so the SHAs do not rot.

### References

- GitHub — [Assigning permissions to jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/control-permissions-for-github_token)
- GitHub — [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- Dependabot — [`github-actions` ecosystem](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot)

---

<a id="cr-026"></a>
## CR-026 — The Security Audit workflow always passes; Dependabot has no schedule

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Security        |
| **Confidence** | **Observed**    |

### Affected files

- `.github/workflows/snyk.yml`
- `.github/dependabot.yml`

### Current behaviour

```yaml
# .github/workflows/snyk.yml  — the workflow is named "Security Audit"
- name: Run npm audit
  run: |
    pnpm audit --audit-level=critical || {
      echo "::warning::Security vulnerabilities found. Review the output above."
      exit 0
    }
```

```yaml
# .github/dependabot.yml
- package-ecosystem: "npm"
  directory: "/"
  # No schedule - only run manually for security updates
  open-pull-requests-limit: 5
```

### Problem

1. **The audit cannot fail.** `exit 0` in the failure branch means a critical advisory produces a
   collapsed warning annotation on a green check. Nobody will see it. The workflow's only
   observable effect is to consume a CI minute.
2. **`--audit-level=critical`** ignores high-severity advisories entirely.
3. **The filename is `snyk.yml` but Snyk was removed** in commit `137354f` ("Replace Snyk with
   npm audit"). The file name and the workflow name disagree, which makes it hard to find.
4. **`schedule` is required by the Dependabot schema** for each `updates` entry. Omitting it with
   a comment saying "no schedule" is not a supported way to disable scheduling — the config may be
   rejected or defaulted. _Confidence: inferred_ — I could not check whether Dependabot is
   reporting a config error, which would be visible under Insights → Dependency graph →
   Dependabot.

### Why it matters

This is the third "green check that cannot go red" in the repository (with CR-008 and CR-028). The
cumulative effect is a dashboard that carries no information.

### Recommended change

Rename to `.github/workflows/audit.yml` and make it mean something:

```yaml
name: Security Audit
on:
  pull_request:
  schedule:
    - cron: "0 6 * * 1" # Mondays
  workflow_dispatch:
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high # no `|| exit 0`
```

Fix `dependabot.yml` to declare a schedule explicitly, and add the `github-actions` ecosystem
(CR-025):

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 5
    labels: ["dependencies"]
    commit-message: { prefix: "chore" }
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "monthly" }
```

Also verify Dependabot **security** updates are enabled in repository settings — those are
independent of this file and are the ones that matter most.

### Reasoning

A check should either fail on the condition it is named for, or not exist. Weekly rather than
per-push keeps the signal and removes most of the cost.

### Expected benefits

Vulnerabilities become visible. One fewer always-green check.

### Trade-offs

A newly published transitive advisory can block a PR. `pnpm audit --audit-level=high` with weekly
scheduling keeps that rare; if it becomes disruptive, move it to schedule-only.

### References

- pnpm — [`pnpm audit`](https://pnpm.io/cli/audit)
- Dependabot — [Configuration options](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- GitHub — [Configuring Dependabot security updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/configuring-dependabot-security-updates)

---

<a id="cr-027"></a>
## CR-027 — Entity enumerations are defined four times in three places

|                |                 |
| -------------- | --------------- |
| **Priority**   | **P2 — Medium** |
| **Category**   | Maintainability |
| **Confidence** | **Observed**    |

### Affected files

- `convex/schema.ts:4-64` — the authoritative validators
- `convex/dataTransfer.ts:112-164` — `VALID_ROOM_TYPES`, `VALID_FIXTURE_LOCATIONS`, `VALID_SOCKET_TYPES`, `VALID_STATUSES`, `VALID_COLOUR_TEMPS`
- `src/lib/constants.ts` — `ROOM_TYPE_LABELS`, `FIXTURE_LOCATION_LABELS`, `SOCKET_TYPE_OPTIONS`, `BULB_STATUS_LABELS`, `COLOUR_TEMP_LABELS`, `FEATURE_OPTIONS`, `FEATURE_LABELS`
- `src/routes/index.tsx:64-95` — `countImportData` duplicates `convex/dataTransfer.ts:166` `countImportEntities`

### Current behaviour

The 15 socket types are written out in full three times:

```ts
// convex/schema.ts
export const socketTypes = v.union(v.literal("E26"), v.literal("E12"), …);

// convex/dataTransfer.ts
const VALID_SOCKET_TYPES = new Set(["E26", "E12", "E17", …]);

// src/lib/constants.ts
export const SOCKET_TYPE_OPTIONS = ["E26", "E12", "E17", …] as const;
```

Likewise 14 room types × 3, 13 fixture locations × 3, 3 statuses × 3, 3 colour temperatures × 3.

And the import-counting logic exists twice with identical semantics — once client-side for the
preview dialog, once server-side for the caps.

### Problem

Adding a socket type (say `GU5.3`) requires edits in three files; miss one and the symptom
differs by which one you missed:

- miss `schema.ts` → Convex rejects the write with an opaque validator error;
- miss `dataTransfer.ts` → export works, re-import of your own data fails;
- miss `constants.ts` → the value is storable but renders as the raw key in the UI.

The label maps are also typed `Record<string, string>`, so a typo in a key is not a compile error
and shows up as `undefined` at runtime — which is why every call site is written defensively as
`FIXTURE_LOCATION_LABELS[x] || x`.

### Why it matters

This is the most likely place for a future change to go subtly wrong, and the current typing
guarantees the failure is silent.

### Recommended change

Make `convex/schema.ts` the single source and derive everything else.

```ts
// convex/schema.ts
export const SOCKET_TYPES = [
  "E26",
  "E12",
  "E17",
  "E39",
  "GU10",
  "GU24",
  "MR16",
  "G4",
  "G9",
  "T8",
  "T5",
  "PAR20",
  "PAR30",
  "PAR38",
  "other",
] as const;
export type SocketType = (typeof SOCKET_TYPES)[number];
export const socketTypes = v.union(...SOCKET_TYPES.map((s) => v.literal(s)));
```

Then:

```ts
// convex/dataTransfer.ts
import { SOCKET_TYPES, ROOM_TYPES, … } from "./schema";
const VALID_SOCKET_TYPES = new Set<string>(SOCKET_TYPES);
```

```ts
// src/lib/constants.ts
import type { SocketType } from "../../convex/schema";
export const SOCKET_TYPE_OPTIONS = SOCKET_TYPES;
export const ROOM_TYPE_LABELS: Record<RoomType, string> = { living_room: "Living Room", … };
//                             ^^^^^^^^^^^^^^^^^^^^^^^^ exhaustive: a missing key is a type error
```

Typing the label maps as `Record<RoomType, string>` instead of `Record<string, string>` makes
adding a value to the union a **compile error** until the label is added — exactly the forcing
function that is missing today. The `|| x` fallbacks at call sites can then go.

Separately: delete `countImportData` from `src/routes/index.tsx` and export `countImportEntities`
from `convex/dataTransfer.ts` for the client preview to reuse.

> **Verify first:** `v.union(...array.map(v.literal))` must still produce a correctly-typed
> validator in Convex 1.49. If the spread degrades the inferred type, keep the explicit
> `v.union(v.literal(...), …)` in `schema.ts` and derive only the array from it, or vice versa.
> Check `pnpm typecheck` immediately after this change.

### Reasoning

One source of truth plus exhaustive `Record` types converts a silent runtime failure into a
compile error, using only TypeScript features already in use.

### Expected benefits

Adding an enum value becomes a single edit with compiler-enforced follow-up. ~60 lines of
duplicated literals removed. The defensive `|| x` fallbacks become unnecessary.

### Trade-offs

Couples `src/lib/constants.ts` to `convex/schema.ts` by a type-only import. That is already true
across the codebase (routes import `api` and `Id` from `convex/_generated`) and is the intended
Convex workflow.

### References

- Convex — [Schemas and validators](https://docs.convex.dev/database/schemas)
- TypeScript — [`as const` assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)

---

<a id="cr-028"></a>
## CR-028 — `build-docs.yml` masks its own failure and produces low-value output

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Cleanup      |
| **Confidence** | **Observed** |

### Affected files

- `.github/workflows/build-docs.yml`
- `typedoc.json`
- `package.json` (`docs:build`, `typedoc` devDependency)

### Current behaviour

```yaml
- name: Build docs
  run: pnpm docs:build || echo "TypeDoc failed - TypeScript 7.0 compatibility issue, skipping docs generation"
- uses: actions/upload-artifact@v4
  if: success() # always true, because of the `||` above
  with:
    name: api-docs
    path: docs/api/
```

`typedoc.json` points at `entryPoints: ["convex"]`.

### Problem

The workflow documents its own brokenness in the fallback string, then uploads a possibly
non-existent `docs/api/` directory under an always-true condition. `docs/api/` is not committed,
not published to Pages, and not linked from anywhere — the artefact expires unread.

TypeDoc over `convex/` would in any case produce reference docs for Convex function definitions,
which is not a format that helps anyone; `convex/_generated/api.d.ts` already provides the typed
surface, and the Convex dashboard lists the deployed functions.

### Why it matters

It is a fourth always-green check (with CR-008, CR-026, and the health check in CR-007), one more
workflow to maintain, and a `typedoc` devDependency carried for no consumer.

### Recommended change

```bash
git rm .github/workflows/build-docs.yml typedoc.json
pnpm remove typedoc
```

and drop the `docs:build` script.

If API documentation is genuinely wanted later, publish it to GitHub Pages so it has a reader, and
do not mask the failure.

### Reasoning

Documentation that is generated into an expiring artefact nobody opens is not documentation.

### Expected benefits

One workflow, one config file, one dependency, one script removed.

### Trade-offs

None identified — there is no consumer of this output.

### References

- TypeDoc — [Options](https://typedoc.org/options/)
- GitHub Actions — [`upload-artifact` retention](https://github.com/actions/upload-artifact)

---

<a id="cr-029"></a>
## CR-029 — Two parallel design-token systems in `src/styles.css`

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Cleanup      |
| **Confidence** | **Observed** |

### Affected files

- `src/styles.css` (347 lines)
- `src/components/ThemeToggle.tsx`
- `public/theme-init.js`

### Current behaviour

`:root` declares **two** complete palettes:

```css
:root {
  /* set 1 — scaffolding "island/sea" theme */
  --sea-ink: #173a40;  --lagoon: #4fb8b2;  --palm: #2f6a4a;  --sand: #e7f0e8;
  --chip-bg: …;        --hero-a: …;        --line: …;

  /* set 2 — shadcn/ui tokens, used by every component */
  --background: oklch(1 0 0);  --foreground: oklch(0.141 0.005 285.823);  …
}
```

`body` gets an elaborate four-layer radial-gradient background from set 1, plus `::before` and
`::after` decorative overlays — and is then overridden at the bottom of the same file:

```css
@layer base {
  body {
    background-color: var(--background);
    color: var(--foreground);
  }
}
```

Line 1 is a remote font import:

```css
@import url("https://fonts.googleapis.com/css2?family=Fraunces:…&family=Manrope:…&display=swap");
```

`Fraunces` is referenced only by `.display-title`, which no component uses.

### Problem

Covered partly by CR-017 (the dead classes). What remains after deleting those:

- The set-1 custom properties are still declared in both `:root` and `.dark` and shipped to every
  user, defining a palette nothing reads except the two files being deleted.
- The `body` gradient and the `::before`/`::after` overlays are computed and then overridden —
  wasted paint work on every load.
- A **render-blocking** remote stylesheet is fetched from `fonts.googleapis.com` on every page
  load, half of it for a font nobody displays.

### Why it matters

Minor, but it is a visible contradiction: the file declares an elaborate visual identity and then
cancels it. Anyone trying to change the look will read set 1 first and get nowhere.

### Recommended change

1. Delete the set-1 custom properties from both `:root` and `.dark` (keep only the shadcn tokens).
2. Delete the `body` gradient and the `body::before` / `body::after` rules; keep the `@layer base`
   block that actually applies.
3. Drop `Fraunces` from the font import. Better still, self-host `Manrope` via `@fontsource/manrope`
   or move the `<link rel="preconnect">` + `<link rel="stylesheet">` into `__root.tsx`'s `head` —
   a CSS `@import` is render-blocking and cannot be preloaded.
4. Reconcile with CR-017: `ThemeToggle` must be restyled off set 1 **before** these tokens are
   removed, or it will lose all styling.

Target: `src/styles.css` drops from 347 lines to roughly 120.

### Reasoning

One token system, applied consistently, is easier to reason about than two where the second
silently wins.

### Expected benefits

~200 lines of CSS removed; one less render-blocking request (or a faster one); the theming story
becomes "shadcn tokens + a `.dark` class", which is the conventional and documented setup.

### Trade-offs

Purely visual verification required — load every page in light and dark mode after the change.
There are 9 routes, so this is a 5-minute check.

### References

- Tailwind CSS v4 — [Theme variables](https://tailwindcss.com/docs/theme)
- shadcn/ui — [Theming with CSS variables](https://ui.shadcn.com/docs/theming)
- web.dev — [Optimize WebFont loading](https://web.dev/articles/font-best-practices)

---

<a id="cr-030"></a>
## CR-030 — `dashboardStats` and `searchAll` perform unbounded nested scans

|                |                                                                          |
| -------------- | ------------------------------------------------------------------------ |
| **Priority**   | **P3 — Low**                                                             |
| **Category**   | Performance                                                              |
| **Confidence** | **Observed**; impact **inferred** (no production data volumes available) |

### Affected files

- `convex/search.ts:117-200` (`dashboardStats`)
- `convex/search.ts:5-115` (`searchAll`)
- `convex/properties.ts:29-73` (`getWithStats`)
- `convex/dataTransfer.ts:18-108` (`exportAll`)

### Current behaviour

```ts
for (const property of properties) {
  const rooms = await ctx.db.query("rooms").withIndex("by_propertyId", …).collect();
  for (const room of rooms) {
    const fixtures = await ctx.db.query("fixtures").withIndex("by_roomId", …).collect();
    for (const fixture of fixtures) {
      const bulbs = await ctx.db.query("bulbs").withIndex("by_fixtureId", …).collect();
      …
    }
  }
}
```

Every individual read is correctly indexed, but the pattern is sequential and N+1 shaped:
`1 + P + (P×R) + (P×R×F)` round trips. `dashboardStats` runs this on **every dashboard load**, and
because it is a reactive Convex query it re-runs whenever any bulb, fixture, room or property
changes.

`searchAll` caps results at `Math.min(Math.max(limit ?? 500, 1), 2000)` but **scans everything**
before filtering — the cap bounds the response, not the work. `dashboardStats` has no cap at all.

### Problem

For a household with 3 properties × 8 rooms × 3 fixtures ≈ 100 documents this is irrelevant and
the current code is the right level of effort. It becomes a problem at roughly a few thousand
bulbs, where the query may approach Convex's per-query document-read limits and the dashboard
would start failing outright rather than just being slow.

`dashboardStats` having no limit at all is the sharper edge: there is no graceful degradation.

### Why it matters

**This is explicitly not worth optimising now.** It is recorded so that (a) nobody "fixes" it
prematurely, and (b) there is a known answer if the app is ever loaded with imported data — note
that `importAll` permits up to 50,000 bulbs in a single call, which is two orders of magnitude
past where this comfortably works.

### Recommended change

**Now:** nothing, except one defensive change — add a document cap to `dashboardStats` so it
degrades rather than failing:

```ts
const MAX_SCAN = 20_000;
let scanned = 0;
…
scanned += bulbs.length;
if (scanned > MAX_SCAN) return { ...partial, truncated: true };
```

**If it ever becomes slow:** denormalise counters onto the `properties` document
(`bulbCount`, `deadCount`, …) maintained by the existing mutations, so the dashboard is a single
document read. The mutations are already the only writers, so this is contained.

**Do not** introduce a materialised-view layer, a search index, or an aggregate component for this
app's data volumes.

### Reasoning

Premature optimisation is the exact thing the review brief warns against. The nested loops are
readable and correct; the only genuine gap is the missing bound on an unbounded operation.

### Expected benefits

Predictable failure mode at extreme data volumes. No change in normal operation.

### Trade-offs

The `truncated` flag adds a branch the UI should acknowledge (a small "showing partial data"
note). If that feels like over-engineering for a household app, skipping this finding entirely is
a defensible decision.

### References

- Convex — [Reading data / paginated queries](https://docs.convex.dev/database/pagination)
- Convex — [Limits](https://docs.convex.dev/production/state/limits)
- Convex — [Best practices: avoid sequential `await`s in loops](https://docs.convex.dev/understanding/best-practices/)

---

<a id="cr-031"></a>
## CR-031 — `maintenance.listByFixture` has a redundant post-filter and broken indentation

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Cleanup      |
| **Confidence** | **Observed** |

### Affected files

- `convex/maintenance.ts:5-25`

### Current behaviour

```ts
const fixture = await ctx.db.get(args.fixtureId);
if (!fixture) return [];
const room = await ctx.db.get(fixture.roomId);
if (!room) return [];
const property = await ctx.db.get(room.propertyId);
if (!property || property.userId !== userId) return [];     // ownership already proven

return await ctx.db
    .query("maintenanceLogs")
    .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
    .order("desc")
  .collect()
  .then((logs) => logs.filter((log) => log.userId === userId));   // ← redundant
```

### Problem

The ownership ladder above already establishes that the caller owns the fixture. Every
`maintenanceLogs` row with that `fixtureId` is written by `maintenance.create` or
`bulbs.updateStatus`, both of which set `userId` to the fixture's owner. The `.filter()` can never
remove a row.

It also mixes `await`/`.then()` in one expression and has three different indentation levels
inside one function body (see CR-022).

### Why it matters

Trivial, but the redundant filter implies a doubt about the ownership model that is not warranted,
which is misleading to read. It also costs an extra array pass.

### Recommended change

```ts
export const listByFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    const owner = await getFixtureOwner(ctx, args.fixtureId); // CR-012 helper
    if (!owner) return [];
    return await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
      .order("desc")
      .collect();
  },
});
```

Fold into the CR-012 and CR-022 work rather than doing it separately.

### Reasoning

Remove checks that cannot fire; they imply uncertainty that does not exist.

### Expected benefits

Shorter, clearer, consistent with the other eight list queries.

### Trade-offs

None — the filter is provably a no-op given the ownership check above it.

### References

- Convex — [Reading data](https://docs.convex.dev/database/reading-data/)

---

<a id="cr-032"></a>
## CR-032 — Stale build artefacts in the working tree and a duplicate `.cursorrules`

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Hygiene      |
| **Confidence** | **Observed** |

### Affected files

- `.output/`, `.nitro/`, `.cache/`, `dist/`, `coverage/` (untracked working-tree directories)
- `.cursorrules` (tracked, 3.4 KB)
- `AGENTS.md`

### Current behaviour

`.output/nitro.json` is dated `2026-11-04T18:26:12Z` with `"preset": "node-server"` — produced
before the Nitro plugin was removed (CR-001). It no longer corresponds to anything the build
produces, and its presence makes it look as though a Nitro build still happens.

`.cursorrules` contains Convex schema guidance copied from
`github.com/PatrickJS/awesome-cursorrules` plus two lines about shadcn. The same ground is covered
at greater length in `AGENTS.md`. Per the project's own conventions, agent configuration belongs
in `.devin/` or `AGENTS.md`; `.cursorrules` is the deprecated Cursor format (Cursor has moved to
`.cursor/rules/*.mdc`).

### Problem

Minor confusion rather than breakage: a reader or agent inspecting the tree sees `.output/`
alongside `dist/` and has to work out which is current. Two overlapping agent-instruction files
risk drifting apart, and `.cursorrules` is the one less likely to be updated.

### Why it matters

Low. Included because deleting these is free and it removes a misleading signal about the build
(which is precisely what CR-001 was about).

### Recommended change

```bash
rm -rf .output .nitro .cache dist coverage
```

Ensure all are in `.gitignore` (CR-024 adds `coverage` and `.cache`).

For `.cursorrules`: either delete it and fold the two useful paragraphs (Convex `v` validator
reference, the `pnpm dlx shadcn@latest add` command) into `AGENTS.md`, or — if Cursor is actively
used — migrate it to `.cursor/rules/convex.mdc` as a pointer to `AGENTS.md`. **Do not maintain
both.** Note the review brief's instruction that new configuration should live in `.devin/`;
consolidating into `AGENTS.md` satisfies both.

### Reasoning

One source of truth for agent instructions; no stale build output implying a build that no longer
runs.

### Expected benefits

An unambiguous working tree and one agent-instruction file instead of two.

### Trade-offs

If Cursor is in active use, verify it reads `AGENTS.md` before deleting `.cursorrules`.

### References

- [agents.md](https://agents.md/)
- Cursor — [Rules](https://docs.cursor.com/context/rules)

---

<a id="cr-033"></a>
## CR-033 — Route params are cast with `as Id<"…">` instead of being typed

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Type safety  |
| **Confidence** | **Observed** |

### Affected files

- `src/routes/fixture.$fixtureId.tsx:85-96`
- `src/routes/room.$roomId.tsx`
- `src/routes/property.$propertyId.tsx`
- `src/routes/search.tsx:105-108`

### Current behaviour

```tsx
const { fixtureId } = Route.useParams(); // string
const fixture = useQuery(api.fixtures.get, { id: fixtureId as Id<"fixtures"> });
const bulbs = useQuery(api.bulbs.listByFixture, {
  fixtureId: fixtureId as Id<"fixtures">,
});
```

and, in `search.tsx`:

```tsx
ids: Array.from(selectedIds) as unknown as Array<
  import("../../convex/_generated/dataModel").Id<"bulbs">
>,
```

### Problem

`Route.useParams()` returns `string` for a `$param`, so each use needs a cast. The casts are
_safe in practice_ — Convex re-validates the ID server-side and returns `null` for anything
invalid, and the ownership ladder catches cross-tenant IDs — so this is **not** a security issue.
It is noise: the same cast appears three times in one component, and `search.tsx` resorts to a
double assertion through `unknown` with an inline `import()` type, which is as opaque as TypeScript
gets.

### Why it matters

Low. The casts are a readability cost and they normalise `as` in a codebase that otherwise uses it
sparingly.

### Recommended change

Validate once at the route boundary using TanStack Router's `params` option, so the rest of the
component sees a correctly-typed value:

```tsx
export const Route = createFileRoute("/fixture/$fixtureId")({
  params: {
    parse: (raw) => ({ fixtureId: raw.fixtureId as Id<"fixtures"> }),
    stringify: (p) => ({ fixtureId: p.fixtureId }),
  },
  component: FixtureDetailPage,
});
```

One cast per route instead of three or four, and `Route.useParams()` becomes correctly typed
everywhere downstream.

For `search.tsx`, hold the selection as `Set<Id<"bulbs">>` rather than `Set<string>` and the
double assertion disappears. Add a normal top-level `import type { Id }` instead of the inline
`import()`.

### Reasoning

Cast at the boundary, not at every use. The boundary is where the untyped string actually enters
the system.

### Expected benefits

Roughly a dozen casts removed; one genuinely unreadable expression removed; correct types
downstream.

### Trade-offs

Still one unchecked cast per route — unavoidable, since a URL segment is a string until the server
says otherwise. The cast is just in a better place.

### References

- TanStack Router — [Path params](https://tanstack.com/router/latest/docs/framework/react/guide/path-params)
- Convex — [Document IDs](https://docs.convex.dev/database/document-ids)

---

<a id="cr-034"></a>
## CR-034 — Blanket `Cache-Control` in `vercel.json`; CSP omits `*.convex.site`

|                |                                                                                |
| -------------- | ------------------------------------------------------------------------------ |
| **Priority**   | **P3 — Low**                                                                   |
| **Category**   | Configuration                                                                  |
| **Confidence** | `Cache-Control`: **observed**. CSP gap: **inferred** — not currently exercised |

### Affected files

- `vercel.json`

### Current behaviour

```jsonc
{
  "source": "/(.*)",
  "headers": [
    …,
    { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
  ]
},
{ "source": "/assets/(.*)",                    "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
{ "source": "/:path*.(js|css|ico|png|…)",      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
```

CSP `connect-src`: `'self' https://*.convex.cloud wss://*.convex.cloud https://www.google.com https://va.vercel-scripts.com`.

Confirmed live via `curl -I` — the headers are being applied.

### Problem

1. **The blanket `Cache-Control` on `/(.*)`** overrides whatever Vercel would otherwise set for
   every response, including the hashed-asset case. Two later rules put the immutable value back,
   so the net effect is correct today — but it depends on Vercel applying later matches last,
   which is an ordering assumption that is easy to break when editing. The two asset rules also
   overlap each other (`/assets/(.*)` is a subset of the extension rule).
2. **`connect-src` omits `https://*.convex.site`.** `convex/http.ts` mounts the Convex Auth HTTP
   routes, which are served from the deployment's `.convex.site` domain. The current React auth
   flow goes over the WebSocket to `.convex.cloud`, so nothing is broken today — but the moment an
   OAuth provider, a magic link, or any direct HTTP action call is added, the browser will block
   it and the error (a CSP violation in the console) is not obvious.

### Why it matters

Both are latent rather than active. Worth a five-minute fix while the file is open.

### Recommended change

Drop the blanket rule and the redundant `/assets/` rule:

```jsonc
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        /* security headers only — no Cache-Control */
      ]
    },
    {
      "source": "/:path*.(js|css|woff2|png|jpg|svg|ico|webp|avif|map)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

Add `https://*.convex.site` to `connect-src` now, so it is already correct when it is needed.

**Re-verify with `curl -I` after the CR-001 fix** — once the deployment actually serves the app,
confirm HTML is not being cached and hashed assets are.

### Reasoning

Let the platform handle defaults; override only what needs overriding. Pre-authorising the
`.convex.site` origin costs nothing and removes a future debugging session.

### Expected benefits

Shorter, less order-dependent config; one fewer future CSP surprise.

### Trade-offs

Changing cache headers always warrants a post-deploy check. Do it alongside CR-001's verification,
not separately.

### References

- Vercel — [Headers configuration](https://vercel.com/docs/project-configuration#headers)
- Vercel — [Caching](https://vercel.com/docs/edge-network/caching)
- MDN — [CSP `connect-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src)
- Convex — [HTTP actions (`.convex.site`)](https://docs.convex.dev/functions/http-actions)

---

<a id="cr-035"></a>
## CR-035 — Lighthouse CI audits the dev server, so its scores are meaningless

|                |              |
| -------------- | ------------ |
| **Priority**   | **P3 — Low** |
| **Category**   | Cleanup      |
| **Confidence** | **Observed** |

### Affected files

- `.github/workflows/lighthouse.yml`

### Current behaviour

```yaml
- name: Start dev servers (Convex + Vite)
  run: pnpm dev &
- name: Wait for servers
  run: |
    for i in {1..60}; do curl -s http://localhost:3000 > /dev/null && break; sleep 2; done
    sleep 10
- uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      http://localhost:3000
```

### Problem

1. **It audits `vite dev`** — unminified ES modules served individually, no tree-shaking, no
   compression, HMR client injected, React in development mode. Performance scores from a dev
   server bear no relationship to production.
2. **`http://localhost:3000/` is `/`**, which `AuthGuard` immediately redirects to `/login`
   (confirmed by `e2e/basic.spec.ts`). So the audit measures a redirect to a login page.
3. **No budgets or assertions are configured**, so the action cannot fail — it just prints
   numbers nobody reads.
4. It duplicates the fragile server-startup logic from `e2e.yml` (CR-019), including the magic
   `sleep 10`.

### Why it matters

Another always-green check consuming ~1m35s per push and producing no information.

### Recommended change

**Delete `.github/workflows/lighthouse.yml`.**

If performance tracking is genuinely wanted, the proportionate replacement is **Vercel Speed
Insights**, which measures real users on the real deployment and is a one-line addition next to
the existing `@vercel/analytics` import in `src/routes/__root.tsx`. That is strictly more
informative than a synthetic audit of a dev server, and needs no workflow.

If a synthetic audit is still wanted, run it against the deployed preview URL (not localhost),
only on `pull_request`, and configure `assert` budgets so it can fail.

### Reasoning

A measurement of the wrong thing is worse than no measurement, because it occupies the slot where
a real one would go.

### Expected benefits

One workflow deleted; ~1.5 minutes saved per push; the option of real-user data instead.

### Trade-offs

Vercel Speed Insights is a paid feature above a free quota. If that is unacceptable, deleting the
workflow outright is still the right call — the current data is not usable.

### References

- Lighthouse CI — [Configuration and assertions](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md)
- Vercel — [Speed Insights](https://vercel.com/docs/speed-insights)
- web.dev — [Lab vs field data](https://web.dev/articles/lab-and-field-data-differences)

---

<a id="cr-036"></a>
## CR-036 — `pnpm-workspace.yaml` contains a key that pnpm does not recognise

|                |                                   |
| -------------- | --------------------------------- |
| **Priority**   | **P3 — Low**                      |
| **Category**   | Configuration                     |
| **Confidence** | **Observed**; effect **inferred** |

### Affected files

- `pnpm-workspace.yaml`
- `package.json` (`pnpm.onlyBuiltDependencies`)

### Current behaviour

```yaml
# pnpm-workspace.yaml — the entire file
allowBuilds:
  esbuild: true
```

```jsonc
// package.json
"pnpm": {
  "onlyBuiltDependencies": ["esbuild", "lightningcss"]
}
```

### Problem

1. `allowBuilds` is not a documented pnpm setting. pnpm's build-approval setting is
   `onlyBuiltDependencies`, which is what `package.json` correctly uses. The YAML key is almost
   certainly ignored. _Confidence: inferred_ — `pnpm install` emitted no warning in my run, but
   silence is consistent with the key simply being unknown.
2. It also disagrees with `package.json`, listing only `esbuild` where `package.json` lists
   `esbuild` and `lightningcss`.
3. `pnpm-workspace.yaml`'s actual purpose is declaring workspace packages. This is a single-package
   repository with no `packages:` key, so the file exists solely for the unrecognised setting.
4. pnpm 10+ has been migrating settings from `package.json` into `pnpm-workspace.yaml`, so having
   related settings split across both files in contradictory forms is the worst of both.

### Why it matters

Low — the effective configuration comes from `package.json` and is correct. But the file is a trap:
someone will eventually edit `allowBuilds`, observe no effect, and lose time.

### Recommended change

Delete `pnpm-workspace.yaml`, keeping `pnpm.onlyBuiltDependencies` in `package.json`.

**Or**, if you prefer pnpm 10+'s newer convention, move the setting wholesale:

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - esbuild
  - lightningcss
```

and remove the `pnpm` block from `package.json`. Either is fine; **having both is not.**

Verify with `rm -rf node_modules && pnpm install` and confirm esbuild and lightningcss still build
(an unbuilt esbuild fails loudly at the next `pnpm build`).

### Reasoning

One setting, one location, spelled the way the tool documents.

### Expected benefits

One file removed or one file made authoritative; no contradictory configuration.

### Trade-offs

Needs a clean-install verification, which takes a minute.

### References

- pnpm — [`onlyBuiltDependencies`](https://pnpm.io/settings#onlybuiltdependencies)
- pnpm — [Workspace configuration](https://pnpm.io/pnpm-workspace_yaml)

---

<a id="cr-037"></a>
## CR-037 — Obsolete planning documents under `docs/`

|                |               |
| -------------- | ------------- |
| **Priority**   | **P3 — Low**  |
| **Category**   | Documentation |
| **Confidence** | **Observed**  |

### Affected files

- `docs/agent-guardrails-investigation.md` (855 lines)
- `docs/implementation-phases-2-4.md` (116 lines)
- `docs/branch-protection-setup.md` (40 lines)
- `docs/agent-safeguards.md` (122 lines)
- `docs/lights-inventory-4.6-architecture-brief.md` (571 lines)

### Current behaviour

`docs/agent-guardrails-investigation.md` describes the repository as it was before the guardrails
were added:

> **✅ Currently Implemented:** Two workflows (code-quality.yml, convex-deploy.yml) · Biome 2.4.10 ·
> Vitest 3.0.5 with React Testing Library · TypeScript 5.7.2
> **❌ Missing:** No pre-commit hooks · No security scanning · No E2E testing · No code coverage

All of those now exist (and several should be removed again — CR-010, CR-014). The version numbers
are wrong (CR-021), and "Vitest with React Testing Library" describes a setup that was never
written (CR-018).

`docs/implementation-phases-2-4.md` is a to-do list for work that has since been completed —
including _"Add `@vitest/coverage-c8`"_ (the project uses `@vitest/coverage-v8`).

`docs/branch-protection-setup.md` says _"As of this implementation, branch protection is not yet
configured"_ and gives a `gh api` command to apply it. AGENTS.md asserts the protection exists. One
of the two is wrong and I could not determine which.

`docs/agent-safeguards.md` documents the pre-commit/pre-push hooks that CR-014 recommends removing.

`docs/lights-inventory-4.6-architecture-brief.md` is the only genuinely useful document here, and
is largely accurate.

### Problem

Four of five documents describe past states or abandoned plans, with no "superseded" marker.
An agent reading `docs/` for context — which AGENTS.md encourages — will absorb stale facts, and
the branch-protection contradiction is actively ambiguous on a security-relevant question.

### Why it matters

Low severity, but in an explicitly agent-driven repository, stale documentation is a direct input
to wrong decisions. The incorrect version numbers in these files compound CR-021.

### Recommended change

1. **Delete** `docs/agent-guardrails-investigation.md` and `docs/implementation-phases-2-4.md` —
   both are completed-plan artefacts with no ongoing value. Git history preserves them.
2. **Resolve** `docs/branch-protection-setup.md`: check the actual rules with
   `gh api repos/TomHart/lights-inventory/rulesets`, apply them if absent, then replace the file
   with a short record of what is configured — or delete it and state the rules in AGENTS.md.
3. **Rewrite `docs/agent-safeguards.md`** after CR-014 to describe the final hook setup, or delete
   it if the hooks reduce to `npx lint-staged` (at which point it documents nothing).
4. **Keep** `docs/lights-inventory-4.6-architecture-brief.md`; update its tech-stack section to
   match reality and cross-link it from the new README (CR-021) and from
   [`architecture.md`](./architecture.md).

### Reasoning

Documentation should describe the present. Anything describing a plan that has been executed
belongs in git history, not in `docs/`.

### Expected benefits

~1,000 lines of misleading documentation removed; `docs/` becomes trustworthy; the branch
protection question gets a definite answer.

### Trade-offs

None — the content remains recoverable from git.

### References

- [Diátaxis](https://diataxis.fr/) — a useful frame for deciding what each document is _for_
- [agents.md](https://agents.md/)

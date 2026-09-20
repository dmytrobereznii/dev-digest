# 03 — Local-first hardening

Two changes to match the threat model the README actually describes: bind the
API to loopback, and keep the GitHub PAT out of the `jobs` table.

## Why

### The API listens on every interface, with no authentication

`server/src/server.ts` calls `app.listen({ port, host: '0.0.0.0' })`.

Behind that port:

- `LocalNoAuthProvider` (`adapters/auth/local.ts`) — *"MVP no-login mode.
  Always returns the single seeded system user + default workspace."* There is
  no authentication of any kind on any route.
- `POST /settings/test-connection` — accepts a provider API key in the body and
  **writes it to disk** via `LocalSecretsProvider.set()`.
- `GET /settings/secrets-status` — reports which provider keys are configured.
- `POST /repos` — clones an arbitrary URL onto the host filesystem.

The README's first line is *"Local-first AI pull-request review"* and its
architecture diagram is captioned *"Local studio (your machine)"*. Binding to
`0.0.0.0` publishes that studio to every device on the network — a café, a
co-working space, a conference wifi. Anyone who can reach port 3001 can read
which keys are set, overwrite them, enqueue clones, and run reviews that spend
the owner's LLM credits.

`0.0.0.0` is the right default for a container that must be reachable from the
host. This app is not that: `docker-compose.yml` runs **only Postgres**, and
the API runs on the host by design.

The existing controls are all correct and all aimed elsewhere: `helmet`, a CORS
allowlist pinned to `webOrigin`, a 120 req/min rate limit, a 1 MB body cap.
None of them is an access control.

### The clone token can reach a database column

`modules/repos/helpers.ts:29` — `withGitHubToken()` embeds the PAT into the
clone URL as `https://x-access-token:<token>@github.com/...`, which is the
standard non-interactive approach and fine in itself.

That URL is handed to `simpleGit(...).clone(url, ...)`. When a clone fails,
`platform/jobs.ts:88` persists the error verbatim:

```ts
.set({ status: 'failed', error: (err as Error).message })
```

`simple-git` surfaces git's stderr, and git's authentication failures can
include the remote URL. The result is a PAT in `jobs.error` — a column that is
read back by the polling UI and is in every database dump.

**Confidence: medium.** Modern git redacts credentials in some messages and not
others, and it varies by version and failure mode. The fix is small enough that
confirming the exact behaviour is not worth it — the point is that nothing in
the code *prevents* it.

## What lands

### 1. Bind to loopback by default

Add to `platform/config.ts`:

```ts
API_HOST: z.string().default('127.0.0.1'),
```

surfaced as `apiHost` on `AppConfig`, and used in `server.ts`. Anyone who needs
the old behaviour sets `API_HOST=0.0.0.0` deliberately.

Document it in `server/.env.example` with the reason on the line above, not
just the key — the value of this change is that the next person has to opt in
knowingly.

**Check before shipping:** `scripts/e2e.sh` and the `e2e-web.yml` workflow
start the API and drive it from the same host, so loopback is fine. Confirm
rather than assume — if either ever runs the API in a container, this breaks
them and the failure is a connection refused with no hint about the cause.

### 2. Redact credentials on the error path

A pure helper beside the other URL work in `modules/repos/helpers.ts`:

```ts
/** Strip userinfo from any URL appearing in a message, so a PAT embedded in a
 *  clone URL never reaches logs or the `jobs.error` column. */
export function redactUrlCredentials(text: string): string
```

Applied where the message is captured, not where it is displayed — so in
`platform/jobs.ts` before the `error:` write. Applying it at the display end
would leave the token in the database, which is the part that persists.

`platform/jobs.ts` is ring 3 and `modules/repos/helpers.ts` is a module, so the
helper belongs in `platform/` rather than being imported outward. Put it beside
`resilience.ts`; it is a backend concern with no repos-specific knowledge, per
`onion-architecture` § *Where does this code go?* item 3.

Give it a unit test with a real-shaped git error string — that is the whole
point of extracting it as a pure function.

### 3. While in there

`app.ts`'s catch-all error branch returns `e.message ?? 'Internal error'` to
the client. Covered by
[`05-response-contracts`](../../../.context/specs/05-response-contracts.md) §
*the error-handler fallback*; mentioned here because it is the same class of
leak and the two changes touch adjacent lines. Do it in whichever lands first
and drop it from the other.

## Verification

```sh
cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'
./scripts/e2e.sh                          # the binding change's real test
```

And by hand, from a second device on the same network: `curl
http://<host-lan-ip>:3001/health` should refuse to connect after the change and
succeed before it. That is a thirty-second check and it is the only one that
actually demonstrates the fix.

## Non-goals

- **No authentication.** `LocalNoAuthProvider` is a deliberate MVP choice with
  a `AuthProvider` port ready behind it. Binding to loopback is the
  proportionate fix for a local tool; adding auth is a product decision, not a
  hardening one.
- **No encryption at rest for `~/.devdigest/secrets.json`.** It is already mode
  `0600`. Encrypting it needs a key, which needs somewhere to live, which is
  the same problem again.
- **No change to how the PAT is passed to git.** Embedding it in the URL is the
  standard approach; the fix is on the error path, not the happy path.
- **No CSRF protection.** No cookies, no ambient credentials — CORS plus the
  loopback bind is the appropriate boundary here.

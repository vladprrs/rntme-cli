# @rntme-cli/platform-http

Hono HTTP server that wires `@rntme-cli/platform-core` use-cases to the REST surface and server-rendered UI at `platform.rntme.com`. WorkOS AuthKit handles humans with auto-refreshing sealed sessions; bearer API tokens handle machines.

## Surfaces

This service exposes two surfaces on the same origin:

- **`/v1/*` — JSON REST API.** Documented via `/openapi.json` (OpenAPI 3.1). Used by the CLI and external integrations. Authentication via WorkOS AuthKit cookie (humans) or `Authorization: Bearer rntme_pat_…` (machines).
- **`/` — Browser UI.** Server-rendered dashboard (Hono JSX + htmx + Tailwind CDN) mounted beside the `/v1` sub-app. Lets an authenticated user browse orgs / projects / project versions / audit log and manage API tokens. Read-only except token create/revoke.

## UI routes

| Path | Purpose |
| --- | --- |
| `GET /` | Authed: 302 to `/{orgSlug}`. Unauth: 302 to `/login` |
| `GET /login` | Public sign-in landing with CTA to `/v1/auth/login` |
| `GET /no-org` | Authed user has no org membership yet |
| `GET /{orgSlug}` | Projects list |
| `GET /{orgSlug}/projects/{projSlug}` | Project detail + project versions list |
| `GET /{orgSlug}/projects/{projSlug}/versions/{seq}` | Project version detail |
| `GET /{orgSlug}/tokens` | API tokens list (+ create form if `token:manage` scope) |
| `POST /{orgSlug}/tokens` | Create token (htmx) — returns new `<tr>` + one-time plaintext banner |
| `DELETE /{orgSlug}/tokens/{id}` | Revoke token (htmx) — returns updated row with "revoked" badge |
| `GET /{orgSlug}/audit` | Audit log |
| `POST /logout` | Clears session cookie, redirects to WorkOS logout URL |

## Auth flow

1. `/` (unauth) → `/login`.
2. `/login` links to `/v1/auth/login` → WorkOS AuthKit.
3. WorkOS redirects to `/v1/auth/callback?code=…`. Callback upserts account + org, sets `rntme_session` sealed cookie on `.rntme.com`, and:
   - If request accepts JSON — returns JSON (CLI / tests).
   - Otherwise — 302 to `/`.
4. Authed `/` → `/{orgSlug}`. Session refresh is automatic through the WorkOS-backed provider; failed refresh clears the sealed cookie and returns the user to login.

## Session cookie

- Name: `rntme_session`
- Domain: `PLATFORM_SESSION_COOKIE_DOMAIN` (`.rntme.com` in prod).
- `HttpOnly`, `Secure`, `SameSite=Lax`.
- Max age 30 days.
- Refresh: WorkOS session refresh is attempted before expiry and reseals the cookie when the provider returns a fresh payload.

## CSRF

UI mutations (`POST /:orgSlug/tokens`, `DELETE /:orgSlug/tokens/:id`, `POST /logout`) verify `Origin` or `Referer` against `PLATFORM_BASE_URL` via `sameOriginOnly`. The `/v1/*` JSON API does not use this guard — bearer tokens provide the CSRF defence.

## Security headers (UI only)

Applied by `securityHeaders()` middleware on UI responses:

- `Content-Security-Policy` with `'self'` + `cdn.tailwindcss.com` + `unpkg.com` allowlists.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.

## Development

```bash
pnpm -F @rntme-cli/platform-http test       # unit + e2e (testcontainers)
pnpm -F @rntme-cli/platform-http typecheck
pnpm -F @rntme-cli/platform-http lint
pnpm -F @rntme-cli/platform-http build      # tsc (includes TSX)
pnpm -F @rntme-cli/platform-http start      # runs dist/bin/server.js
```

## Env vars

See `src/config/env.ts`. Required: `DATABASE_URL`, `RUSTFS_*`, `WORKOS_*`, `PLATFORM_BASE_URL`, `PLATFORM_SESSION_COOKIE_DOMAIN`, `PLATFORM_COOKIE_PASSWORD` (≥32 chars).

## Not in the UI (MVP)

- Creating / renaming / archiving projects — CLI only.
- Publishing project versions — CLI only.
- Creating organizations — use the WorkOS Admin Portal.
- Toggling archived visibility.
- Client-side SPA state or infinite scroll.

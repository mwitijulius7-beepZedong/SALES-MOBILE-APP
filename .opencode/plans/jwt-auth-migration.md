# Plan: Migrate authentication to JWT (access + refresh)

## Decisions (confirmed with user)

- **Architecture**: short-lived JWT access token + opaque refresh token stored in the existing `sessions` table.
- **Migration**: clean break — old opaque `vf_session` tokens are rejected; all users re-login once.
- **Library**: `jose` (edge-safe, standard for Next.js).
- **Signing**: HS256 with a new `AUTH_SECRET` env var (secret added to `.env` / `.env.local`; must be set in Vercel for prod).

## Token model

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (HS256), claims: `sub` (user id), `name`, `email`, `role`, `token_use: "access"`, `jti`, `iat`, `exp` | Opaque `randomBytes(32)` base64url |
| Lifetime | 15 minutes | 30 days (fixed, like today) |
| Storage | Web: httpOnly cookie `vf_access`; Native: app storage, sent as `Authorization: Bearer` | Web: httpOnly cookie `vf_refresh`; Native: app storage, sent to `/auth/refresh` |
| Verified by | Signature + expiry (`jose.jwtVerify`) + per-request `users.active` PK lookup (keeps "deactivation kills access" semantics) | DB lookup in `sessions` table |

**Rotation**: full rotation (delete + re-insert) happens only in the `/api/v1/auth/refresh` route handler (where `cookies().set` is legal). The SSR hot path (`getCurrentUser` during page render) validates the refresh cookie **without** rotation or cookie writes — `cookies().set` throws in Server Component render, so the design deliberately avoids it there. After the access cookie expires, web requests fall back to a refresh-cookie DB check + in-memory access-token signing (same DB cost as today's session join).

**Revocation preserved**: logout deletes the refresh row; admin deactivation/deletion already deletes `sessions` rows per user (`src/server/admin.ts:264,280`) — those lines keep working unchanged since the table now stores refresh tokens. Role/profile changes are picked up immediately because `getCurrentUser` loads fresh user rows from the DB (JWT claims are informational).

## Changes by file

### 1. `package.json`
- Add dependency: `jose`.

### 2. `.env` and `.env.local`
- Add `AUTH_SECRET="<64-byte hex, generated>"`. App throws a clear error at auth time if unset.

### 3. `src/lib/auth.ts` — core rework (main file)
- Replace `SESSION_COOKIE` with `ACCESS_COOKIE = "vf_access"` and `REFRESH_COOKIE = "vf_refresh"`.
- Keep `hashPassword` / `verifyPassword` / `HttpError` / `initialsOf` untouched.
- `signAccessToken(user)` — new: `jose` SignJWT, 15-min exp.
- `issueTokens(user)` (replaces `createSession`): insert refresh row into `sessions`, sign access JWT, set both httpOnly cookies (15 min / 30 days, `sameSite: "lax"`, `secure` in prod, `path: "/"`), return `{ accessToken, refreshToken, expiresIn: 900 }`.
- `resolveAccessToken()` (replaces `resolveSessionToken`): Bearer header first, then `vf_access` cookie.
- `verifyAccessToken(token)` — new: `jwtVerify` with `AUTH_SECRET` + `token_use === "access"` check.
- `tryRefreshFromCookie()` — new, private: read `vf_refresh` cookie, look up non-expired row in `sessions`, sign a fresh access token **in memory only** (no rotation, no cookie writes — safe during SSR render).
- `getCurrentUser()` — new flow: resolve access token → verify JWT → load user by id (`active = true`) → return fresh DB profile; if access missing/invalid, fall back to `tryRefreshFromCookie()`; else `null`. Single PK lookup replaces the old join.
- `requireUser()` — unchanged.
- `refreshWithToken(refreshToken)` — new: validate row in `sessions`, rotate (delete old row, insert new), set both cookies, return `{ accessToken, refreshToken, expiresIn }`. Used by the refresh endpoint (and cookie-based callers).
- `destroySession(refreshToken?)` (replaces session delete): delete the presented refresh row (or the user's rows when identified via access JWT), clear both cookies.

### 4. `src/app/api/v1/auth/login/route.ts`
- `issueTokens(user)`; response body becomes `{ accessToken, refreshToken, expiresIn, user }` (was `{ token, user }` — breaking, accepted).

### 5. `src/app/api/v1/auth/register/route.ts`
- Same response-shape change as login.

### 6. `src/app/api/v1/auth/refresh/route.ts` — NEW
- `v1Public` POST: accept `{ refreshToken }` in body (native) or `vf_refresh` cookie; 401 on missing/invalid; return `{ accessToken, refreshToken, expiresIn }` via `refreshWithToken`.

### 7. `src/app/api/v1/auth/logout/route.ts` + `src/app/api/auth/logout/route.ts`
- Switch to public handlers (`v1Public` / plain): logout must work with an expired access token. Accept optional `{ refreshToken }` in body or `vf_refresh` cookie; revoke via `destroySession`; clear cookies.

### 8. `src/app/api/auth/login/route.ts` + `src/app/api/auth/register/route.ts`
- Minimal edits: they call `createSession` → `issueTokens`; body/response shapes unchanged (cookie-only, web app).

### 9. `src/server/openapi.ts` (+ regenerate/copy `docs/vendflow-api-openapi.json`)
- `bearerAuth.bearerFormat`: `"opaque"` → `"JWT"`; description updated.
- `cookieAuth`: document `vf_access` + `vf_refresh`.
- Add `/auth/refresh` path; update `/auth/login`, `/auth/register` response schema (`accessToken`, `refreshToken`, `expiresIn`); update `/auth/logout` summary; update top-level description (line 63).

### 10. `src/server/admin.ts`
- No change needed for deactivation/deletion (session deletes at lines 264/280 now revoke refresh tokens).
- One-line addition: on password change (`patch.password`, lines 245–248), also delete the user's `sessions` rows so a password change revokes other devices — standard JWT-era hygiene, matches existing deactivation behavior.

### Explicitly NOT changed
- `src/proxy.ts` (CORS/headers only, no auth), `src/server/v1.ts` / `src/server/http.ts` wrappers (`requireUser` signature unchanged), web pages/layouts using `getCurrentUser`, `src/lib/client.ts` and `auth-form.tsx` (cookie flow stays transparent), `app-shell.tsx` logout call, DB schema (no migration needed — `sessions` table reused as refresh-token store), `seed.ts`.

## Breaking changes for clients
- Native clients must re-login; parse `accessToken`/`refreshToken`/`expiresIn` from the login body (was `token`); call `POST /api/v1/auth/refresh` with the refresh token when a request returns 401 or before expiry; send refresh token in the body of `/api/v1/auth/logout`.
- Old `vf_session` cookies/tokens stop working.

## Verification
1. `npm install` (adds jose), then `npm run typecheck` and `npm run lint`.
2. `npm run build`.
3. Smoke test against the dev server (Neon DB is reachable; `ensureSeeded` runs automatically):
   - `POST /api/v1/auth/login` → expect `accessToken` (3-segment JWT), `refreshToken`, `expiresIn: 900`.
   - Call an authenticated v1 route (e.g. `/api/v1/auth/me`) with `Authorization: Bearer <accessToken>` → 200.
   - `POST /api/v1/auth/refresh` with refresh token → new pair; old refresh token now rejected.
   - `POST /api/v1/auth/logout` → refresh token revoked; `/auth/me` with old access token still works ≤15 min (documented, expected), refresh path dead.
   - Web flow: login via `/api/auth/login` sets `vf_access`/`vf_refresh` cookies; a page load after access expiry still authenticates via the refresh-cookie fallback.

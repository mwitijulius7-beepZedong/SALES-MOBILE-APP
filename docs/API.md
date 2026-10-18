# VendFlow API Reference

Field sales, inventory, expense and requisition API for the VendFlow web app and native/mobile client.

- **Versioned API base URL:** `/api/v1`
- **Machine-readable spec:** [`vendflow-api-openapi.json`](./vendflow-api-openapi.json) (also served live at `GET /api/v1/openapi`)
- All money values are **integer cents** (e.g. `$12.50` → `1250`).
- Dates are `YYYY-MM-DD`; timestamps are ISO-8601.

---

## 1. Response format

Every `/api/v1` handler is wrapped by `src/server/v1.ts`, so responses are consistent:

**Success**

```json
{ "data": { "...": "..." } }
```

**Success (paginated)**

```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 50, "hasMore": false } }
```

**Error**

```json
{ "error": { "code": "unauthorized", "message": "Unauthorized" } }
```

Error `code` values: `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `method_not_allowed` (405), `conflict` (409), `internal_error` (500).

Pagination is controlled with `?page=` (default `1`) and `?limit=` (default `50`, max `200`).

---

## 2. Authentication

VendFlow uses **JWT access tokens** with **opaque refresh tokens**. The web app uses httpOnly cookies; native/mobile clients use bearer tokens. Both are issued by the same backend — there is no separate identity provider.

### 2.1 Token model

| | Access token | Refresh token |
|---|---|---|
| **Format** | JWT, `HS256` | Opaque random string (`base64url`) |
| **Lifetime** | 15 minutes | 30 days |
| **Web transport** | httpOnly cookie `vf_access` | httpOnly cookie `vf_refresh` |
| **Native transport** | `Authorization: Bearer <token>` header | sent in the `/auth/refresh` request body |
| **Verified by** | signature + expiry, then a `users` lookup to confirm the account is still active | lookup of the row in the `sessions` table |
| **Revocable** | no (expires in ≤15 min) | yes (row deleted on logout/deactivation/password change) |

Access-token claims:

```json
{
  "sub": "12",                 // user id
  "name": "Amara Okonkwo",
  "email": "demo@vendflow.app",
  "role": "owner",
  "token_use": "access",
  "jti": "<uuid>",
  "iat": 1792266543,
  "exp": 1792267443
}
```

The `sub` claim is the source of truth for identity; the remaining claims are informational. On every request the server loads the current user row, so **role changes, deactivation and password changes take effect immediately**, not just when the access token expires.

### 2.2 Signing in

`POST /auth/login` and `POST /auth/register` are public. Both return the same payload and also set the two auth cookies (so a browser session works without storing anything in JS):

```json
{
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>",
    "expiresIn": 900,
    "user": { "id": 1, "name": "Amara Okonkwo", "email": "demo@vendflow.app", "role": "owner", "territory": "Metro North", "initials": "AO", "hue": 158 }
  }
}
```

**Native / mobile** — store `accessToken` and `refreshToken`, then send the access token as a bearer header:

```bash
curl -X POST https://<host>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@vendflow.app","password":"demo1234"}'

curl https://<host>/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

**Web** — the cookies are set automatically by the login response; no JavaScript token handling is required. The legacy `POST /api/auth/login` endpoint does the same thing and returns only the `user` object.

### 2.3 Making authenticated requests

Send either:

- `Authorization: Bearer <accessToken>` (native), **or**
- the `vf_access` cookie (web).

If a request is missing or has an invalid/expired access token, the server returns `401 unauthorized`.

For web requests, when the `vf_access` cookie has expired the server transparently falls back to the `vf_refresh` cookie to mint a new access token for that request — the browser session keeps working with no client-side logic.

### 2.4 Refreshing tokens

`POST /auth/refresh` is public. It **rotates** the refresh token: the old refresh token is deleted and a brand-new access/refresh pair is returned. Reusing a rotated token returns `401`.

```bash
curl -X POST https://<host>/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

```json
{ "data": { "accessToken": "<jwt>", "refreshToken": "<new opaque>", "expiresIn": 900 } }
```

Native clients should call this when a request returns `401` or proactively before the 15-minute access token expires, and replace both stored tokens with the response values.

### 2.5 Signing out and revocation

`POST /auth/logout` deletes the presented refresh token and clears the auth cookies. It accepts an optional `{ "refreshToken": "..." }` body (native); with no body it uses the `vf_refresh` cookie (web). The endpoint is public so clients can log out even with an expired access token.

```bash
curl -X POST https://<host>/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

Revocation is immediate for refresh tokens. Access tokens already issued remain technically valid until they expire (≤15 minutes); this is the standard trade-off of stateless JWTs. The server itself stops honoring an account as soon as it is deactivated or its password changed, because each request re-checks the user row.

Other events that revoke **all** of a user's refresh tokens:

- an admin deactivates the account (`PATCH /users/{id}` with `active: false`),
- an admin changes the account password,
- the account is deleted.

### 2.6 Roles and permissions

`SessionUser.role` is one of `owner`, `manager`, `rep`. Higher roles include the permissions of lower ones.

| Capability | rep | manager | owner |
|---|---|---|---|
| Read catalog/sales/expenses/requisitions/reports | yes | yes | yes |
| Create sales, products, customers, expenses, requisitions | yes | yes | yes |
| Edit products, customers, expenses, open requisitions | yes | yes | yes |
| Upload files | yes | yes | yes |
| Delete own uploads | yes | yes | yes |
| Approve/reject expenses and requisitions, change sale status, void sales | no | yes | yes |
| Delete sales, products, customers, expenses, requisitions | no | yes | yes |
| Adjust stock | no | yes | yes |
| Manage categories | no | yes | yes |
| List/create/edit team accounts | no | yes | yes |
| Delete team accounts, change roles, create owners, change settings | no | no | yes |

Endpoints enforce this with `requireRole(...)` and return `403 forbidden` when the role is insufficient.

### 2.7 Configuration and security notes

- **`AUTH_SECRET`** (required): the HS256 signing secret for access tokens. Set it in the environment (a value is already present in local `.env`); the API returns `500` if it is missing. Rotating it invalidates every issued access token.
- Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production` (so cookie auth requires HTTPS in production).
- Passwords are hashed with scrypt (`s1:salt:digest`).
- There is no externally-issued/JWT control-plane auth — the only other JWT in the deployment (`VERCEL_OIDC_TOKEN`) is a Vercel platform token unused by application code.

---

## 3. Endpoints

All paths below are relative to `/api/v1`. "Auth" means a valid access token (bearer or `vf_access` cookie) is required unless the endpoint is marked **public**.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create a rep account; returns access + refresh tokens (body: `name*`, `email*`, `password*`, `territory`) |
| POST | `/auth/login` | public | Exchange credentials for tokens (body: `email*`, `password*`) |
| POST | `/auth/refresh` | public | Rotate a refresh token (body: `refreshToken`) |
| POST | `/auth/logout` | public | Revoke the refresh token and clear cookies (body: `refreshToken`) |
| GET | `/auth/me` | auth | Current authenticated user |

### Meta

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | Service/database health |
| GET | `/openapi` | public | This API's OpenAPI document |

### Sales

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sales` | auth | List sales. Query: `q`, `status`, `method`, `range`, `page`, `limit` |
| POST | `/sales` | auth | Record a sale; stock and ledger update atomically |
| GET | `/sales/{id}` | auth | Get a sale with its line items |
| PATCH | `/sales/{id}` | auth (owner/manager) | Change sale status (body: `status*`) |
| DELETE | `/sales/{id}` | auth (owner/manager) | Void a sale |

### Products

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/products` | auth | List products with 30-day sales enrichment. Query: `q`, `category`, `status`, `sort`, `page`, `limit` |
| POST | `/products` | auth | Create a product (body: `ProductInput`) |
| GET | `/products/{id}` | auth | Get a product with recent stock movements |
| PUT / PATCH | `/products/{id}` | auth | Replace/update a product (body: `ProductInput`) |
| DELETE | `/products/{id}` | auth (owner/manager) | Delete or archive a product |

`ProductInput`: `name*`, `priceCents*`, `sku`, `category`, `unit`, `costCents`, `stock`, `reorderLevel`, `bin`, `supplier`, `active`.

### Customers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/customers` | auth | List customers with lifetime metrics. Query: `q`, `page`, `limit` |
| POST | `/customers` | auth | Create a customer (body: `CustomerInput`) |
| PUT / PATCH | `/customers/{id}` | auth | Update a customer (body: `CustomerInput`) |
| DELETE | `/customers/{id}` | auth (owner/manager) | Delete a customer |

`CustomerInput`: `name*`, `contactName`, `phone`, `email`, `area`, `segment`, `creditLimitCents`.

### Expenses

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/expenses` | auth | List expenses with summary + category breakdown. Query: `q`, `category`, `range`, `status`, `page`, `limit` |
| POST | `/expenses` | auth | Create an expense (body: `ExpenseInput`; reps' expenses start `pending` when approvals are enabled) |
| PUT / PATCH | `/expenses/{id}` | auth | Edit an expense; when `status` is sent, records an approval decision (**owner/manager only**) |
| DELETE | `/expenses/{id}` | auth (owner/manager) | Delete an expense |

`ExpenseInput`: `title*`, `amountCents*`, `category`, `vendor`, `paymentMethod`, `expenseDate`, `billable`, `note`, `status`.

### Requisitions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/requisitions` | auth | List requisitions (priority order) with status counts. Query: `q`, `status`, `page`, `limit` |
| POST | `/requisitions` | auth | Raise a requisition (body: `productId`, `requestedQty`, `department`, `requester`, `priority`, `neededBy`, `notes`) |
| GET | `/requisitions/{id}` | auth | Get a requisition |
| PATCH | `/requisitions/{id}` | auth (owner/manager) | Approve/reject/receive (body: `status*`, `note`, `approvedQty` for partial approval) |
| PUT | `/requisitions/{id}` | auth | Edit an open requisition (body: `requestedQty*`, `priority`, `department`, `requester`, `notes`) |
| DELETE | `/requisitions/{id}` | auth (owner/manager) | Delete a requisition |

### Inventory

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/stock/adjust` | auth (owner/manager) | Adjust stock (body: `productId*`, `qtyChange*`, `reason`, `reference`, `note`, `mode`) |

### Analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | auth | Aggregated dashboard payload |
| GET | `/reports` | auth | Range report. Query: `from`, `to` |
| GET | `/reference` | auth | Reference/lookup lists |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | auth (owner/manager) | List team accounts |
| POST | `/users` | auth (owner/manager) | Create a team account (body: `UserInput`; only owners can create owners) |
| PATCH | `/users/{id}` | auth (owner/manager) | Update an account (body: `name`, `role` (owner-only), `territory`, `active`, `password`) |
| DELETE | `/users/{id}` | auth (owner only) | Delete an account (never yourself) |

`UserInput`: `name*`, `email*`, `password*`, `role`, `territory`.

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/categories` | auth | Managed picker lists for expense/product categories. Query: `kind` |
| POST | `/categories` | auth (owner/manager) | Add a category (body: `CategoryInput`) |
| PATCH | `/categories/{id}` | auth (owner/manager) | Rename/reorder/reactivate a category (body: `name`, `sortOrder`, `active`) |
| DELETE | `/categories/{id}` | auth (owner/manager) | Delete a category |
| GET | `/settings` | auth | Application settings merged with defaults |
| PUT | `/settings` | auth (owner only) | Update settings (body: `currency`, `taxRatePct`, `expenseApprovals`, `lowStockAlerts`) |
| GET | `/uploads` | auth | List upload metadata for an entity. Query: `entity`, `entityId` |
| POST | `/uploads` | auth | Upload a file as base64 (`AttachmentInput`, ≤5 MB) |
| GET | `/uploads/{id}` | auth | Download raw file bytes |
| DELETE | `/uploads/{id}` | auth (owner/manager or uploader) | Delete an upload |
| GET | `/audit` | auth (owner/manager) | Admin/approval activity trail. Query: `entity`, `action`, `page`, `limit` |

`CategoryInput`: `name*`, `kind`, `sortOrder`.
`AttachmentInput`: `filename*`, `contentBase64*`, `mimeType`, `entity`, `entityId`.

---

## 4. Legacy `/api` endpoints

The web app also uses an unversioned `/api/*` surface (`withAuth` wrapper, `{ "error": "..." }` errors, no `data` envelope). It shares the same authentication. Notable differences:

- `POST /api/auth/login` / `POST /api/auth/register` — set cookies only (they do **not** return tokens in the body).
- `POST /api/auth/logout` — revokes the refresh token and clears cookies.
- Resource routes (`/api/sales`, `/api/products`, `/api/customers`, `/api/expenses`, `/api/requisitions`, `/api/stock/adjust`, `/api/dashboard`, `/api/reports`, `/api/reference`, `/api/health`) mirror the v1 resources without the `data` envelope or versioning.

New integrations should target `/api/v1`.

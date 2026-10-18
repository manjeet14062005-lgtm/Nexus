# Nexus

Nexus is a verification and workspace platform with a React frontend, an Express API, and a separate background worker. It uses an existing Supabase Auth/PostgreSQL project for identity and data.

## Project structure

- `src/`: frontend pages, components, and tests.
- `public/`: public assets, icons, and application metadata.
- `Backend Server/`: API, background workers, provider adapters, and backend tests.
- `supabase/migrations/`: ordered database migrations.
- `scripts/`: local startup, release checks, and smoke checks.
- `render.yaml`: the authoritative deployment blueprint for frontend, API, and worker.

Use Node.js 22, specified by the root `.nvmrc`. This README is the project's single documentation file; dependency packages retain their own documentation and licenses.

## Run locally

On a new machine, install dependencies:

```powershell
npm ci
npm --prefix "Backend Server" ci
Copy-Item .env.example .env.local
Copy-Item "Backend Server/.env.example" "Backend Server/.env"
```

Copy the examples only when the destination files do not already exist. Fill in the local environment files privately. Never overwrite configured credentials with placeholders or commit real environment files.

```powershell
npm run dev
```

Open http://localhost:3000. The API runs at http://localhost:3001. The launcher refuses occupied ports. Stop it with Ctrl+C. To run individual services, use `npm start` for the frontend, `npm run start:api` for the API, and `npm --prefix "Backend Server" run worker` for background jobs. The worker processes real queued work; configure its providers before running it.

## First use

1. Register, complete the required phone flow, and verify the confirmation email.
2. Create or select a workspace.
3. Open Developer Portal and create a test API key. Copy its secret immediately; it is shown once.
4. Call the verification API from your backend. Test verifications use code `123456` and do not send live provider messages.
5. Configure live verification and billing only after checking provider credentials, plans, sender approvals, and webhooks.

Workspace roles are Owner, Admin, Developer, Analyst, and Viewer. Platform administration is separate and does not replace workspace membership.

## Verification commands

```powershell
npm run lint
npm run test:ui
npm run test:server
npm run build
npm --prefix "Backend Server" run preflight
```

`npm run check` combines lint, UI tests, backend tests, and the production bundle. If the local Windows sandbox denies the Jest temporary cache, use `npm run test:ui -- --cacheDirectory=.cache/jest`.

Database integration checks use `npm --prefix "Backend Server" run test:integration` and require the configured development database and an existing workspace owner. They create and remove isolated temporary test records. Run integration checks only against the intended development project.

### Latest local release check: 18 October 2026

- Lint, 108 backend tests, and the production frontend build passed.
- Production dependency audits reported zero advisories for frontend and API; this excludes development toolchain dependencies.
- A full UI run encountered a sandbox cache error. A workspace-cache retry later stalled and was interrupted, so the full suite is not recorded as passing. Its obsolete AI-branding expectation was updated; that focused suite passed all 12 tests.
- Public release remains blocked on hosted URLs, signup-hook configuration, shared rate limiting, and hosted service checks. Nothing has been uploaded or deployed.

## Database and operational requirements

Apply the ordered `supabase/migrations/` history when preparing a new database; do not substitute an old individual RLS patch. Check policies and migration state before applying anything to an existing project. Backend document writes depend on the atomic `nexus_commit_documents` RPC and profile/role synchronization.

Use the API process role for HTTP traffic and a dedicated worker for queued webhooks, workflows, scheduled reports, retention, and account deletion. Keep API and worker encryption settings consistent. Use shared Redis rate limiting before scaling API replicas. Configure database backups and verify restoration before launch.

Identity and workspace authorization are checked server-side. Verified phone fields cannot be edited manually. Sensitive operations require recent authentication where configured. API secrets belong on customer backends, never in browser code.

Security settings include invitation-domain policies, API-key expiry, audit export, and configurable operational retention. Retention of operational data is distinct from required billing/legal retention. Account deletion may require a grace period and transferring or deleting owned workspaces and canceling active subscriptions. These controls are not an SSO/SAML, SCIM, SLA, or compliance-certification claim.

Billing activates only after server-side payment verification or verified provider events. Direct checkout supports the provider's payment methods; the optional phone QR contains a hosted checkout link and is not a direct UPI mandate QR. AI analysis is read-only and grounded in selected workspace evidence. Failed/canceled investigations do not consume questions; short greetings do not start investigations. AI provider availability still affects completed responses.

## Deployment

### 1. Create your accounts

1. Create a GitHub account at https://github.com/signup and verify your email.
2. Install GitHub Desktop from https://desktop.github.com/ and sign in.
3. Create a Render account at https://dashboard.render.com/ using your GitHub account.
4. Initially use Render's provided HTTPS domains. A custom domain can be added later.

Render can host all three Nexus services: static frontend, API, and background worker. Static hosting is free within usage allowances; the dedicated worker requires a paid compute plan. The root blueprint does not specify compute plans, so review the API and worker charges before deploying. A free API sleeps when idle and is unsuitable for reliable production OTP/payment callbacks. Existing Supabase remains the database; do not create a replacement Render database.

### 2. Publish the project privately

The local project already has a Git repository on branch `main`.

1. Open GitHub Desktop → File → Add local repository.
2. Select `C:\Users\manje\Downloads\Nexus`.
3. Review the Changes list. `.env.local`, backend `.env`, logs, preview folders, node_modules, builds, and archives are excluded by `.gitignore`.
4. Enter `Prepare Nexus deployment` as the commit summary and commit to main.
5. Select Publish repository. Use a name such as `Nexus` and keep the repository private.
6. Publish, then copy its GitHub URL. Do not upload a ZIP or RAR backup.

Only source code and placeholder `.env.example` files belong in the repository. A limited credential-pattern scan found no matching credentials among the proposed text files; this does not replace reviewing the files before publishing.

### 3. Connect Render

1. In Render, select New → Blueprint.
2. Connect GitHub and grant access to this Nexus repository.
3. Select the repository, branch `main`, and the **root** `render.yaml`.
4. Confirm these three resources: `nexus-frontend`, `nexus-api`, `nexus-worker`.
5. Review the compute plan/cost for API and worker before confirming deployment.
6. Enter secret values only in Render's environment settings. Use `Backend Server/.env.example` as the variable-name reference. Do not paste secrets into chat or GitHub.

Use the frontend and API HTTPS addresses assigned by Render, not localhost and not guessed addresses. Initial services may fail while these values and the signup hook are being connected; keep the strict checks enabled and redeploy once configured.

### 4. Connect the public addresses

On **nexus-frontend**, enter these build-time variables:

| Variable | Value |
| --- | --- |
| `REACT_APP_OTP_SERVER_URL` | API HTTPS origin |
| `REACT_APP_SUPABASE_URL` | Existing Supabase project URL |
| `REACT_APP_SUPABASE_PUBLISHABLE_KEY` | Supabase public/publishable key |
| `REACT_APP_SUPABASE_EMAIL_REDIRECT_URL` | Frontend HTTPS origin plus `/verify-email` |
| `REACT_APP_SUPABASE_OAUTH_REDIRECT_URL` | Frontend HTTPS origin plus `/dashboard` |

Set `FRONTEND_URL` on API and worker to the frontend HTTPS origin. Rebuild the frontend after changing its variables.

On API/worker configure the existing Supabase backend secret, SMS verification, email delivery, and webhook encryption settings. Use the same `WEBHOOK_ENCRYPTION_KEY` on API and worker. Keep a stable `SIGNUP_PROOF_SECRET` on the API. Configure the AI key on the API only. Configure shared Upstash REST URL/token on the API because the blueprint requires distributed rate limiting. Do not change the production security flags merely to make startup pass.

### 5. Connect authentication and payments

In the existing Supabase project:

- Set Auth Site URL to the frontend HTTPS origin.
- Add the exact email `/verify-email` and sign-in `/dashboard` redirect URLs. Preserve any other intentionally supported callback paths.
- Enable email confirmation and configure production SMTP delivery; the Nexus report/invitation email key does not automatically configure Supabase Auth email.
- Configure the signed Before User Created HTTP hook at the API origin plus `/auth/before-user-created`.
- Put its signing secret in API `SUPABASE_BEFORE_USER_CREATED_SECRET`. Once the actual hook is enabled, set `NEXUS_SIGNUP_HOOK_ENABLED=true`.
- Verify email/password signup without a valid phone proof is rejected. Google signup follows its separate verified-phone onboarding flow.

In the payment dashboard, create a webhook pointing to the API origin plus `/razorpay/webhook`, select the subscription/payment events handled by Nexus, and use a matching webhook secret in API `RAZORPAY_WEBHOOK_SECRET`. Match payment keys, plan IDs, and webhook mode. Start with provider test mode and keep real charges out of smoke tests. Test mode does not validate real UPI scanning.

### 6. Verify before inviting customers

- API `/health` and `/readyz` return HTTP 200.
- Frontend loads directly at `/login`, `/register`, and `/billing`, including page refresh.
- Worker logs confirm startup and background jobs run.
- Register a test account, verify phone and email, sign in, and check workspace isolation.
- Test an AI question, report delivery, notifications, and integration webhook delivery.
- Complete a payment-provider test subscription and confirm Nexus activates only after server verification. Replaying a webhook must not duplicate activation or invoices.
- Confirm deployed database migrations/policies, backups and restoration, account deletion, and production sender approvals.

Local checks cannot verify these hosted flows. The current release environment is still missing public addresses, signup-hook setup, and shared rate limiting. Do not announce a live launch until these are configured and tested.

### References

- https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop
- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free


## API reference


Base URL: your deployed Nexus server URL.

### Authentication

Customer API endpoints use:

```http
Authorization: Bearer nx_test_<secret>
```

or:

```http
Authorization: Bearer nx_live_<secret>
```

Do not expose a live secret in browser JavaScript. Store it on the customer's backend/secret manager.

### Verification API

#### POST /v1/verifications

Creates a verification request.

#### POST /v1/verifications/:id/verify

Completes a test/email verification with the supplied code or a live Twilio verification check for phone verification.

#### GET /v1/verifications/:id

Returns safe, workspace-scoped verification state.

#### GET /v1/usage

Returns the API-key environment's current workspace usage aggregate.

### Customer webhook management

These endpoints use Supabase ID-token authentication because they are Nexus dashboard management APIs.

```text
GET    /workspaces/:workspaceId/webhooks/events
GET    /workspaces/:workspaceId/webhooks
POST   /workspaces/:workspaceId/webhooks
PATCH  /workspaces/:workspaceId/webhooks/:webhookId
DELETE /workspaces/:workspaceId/webhooks/:webhookId
POST   /workspaces/:workspaceId/webhooks/:webhookId/rotate-secret
POST   /workspaces/:workspaceId/webhooks/:webhookId/test
GET    /workspaces/:workspaceId/webhooks/:webhookId/deliveries
POST   /workspaces/:workspaceId/webhooks/:webhookId/deliveries/:deliveryId/retry
GET    /workspaces/:workspaceId/api-logs
```

Webhooks are feature-gated by the workspace plan. The current plan configuration enables webhooks on Pro and Enterprise.

#### Webhook creation

```json
{
  "name": "Production backend",
  "url": "https://api.example.com/webhooks/nexus",
  "environment": "live",
  "events": [
    "verification.created",
    "verification.completed",
    "verification.failed"
  ]
}
```

A successful creation response returns the signing secret once:

```json
{
  "success": true,
  "webhook": {
    "id": "wh_...",
    "name": "Production backend",
    "url": "https://api.example.com/webhooks/nexus",
    "environment": "live",
    "events": ["verification.created", "verification.completed"]
  },
  "secret": "nx_whsec_...",
  "secretShownOnce": true
}
```

Store the secret on the customer's backend. Nexus encrypts it at rest and does not return it in normal list/detail responses.

### Webhook event envelope

Delivered JSON uses the following shape:

```json
{
  "id": "evt_...",
  "type": "verification.completed",
  "created": "2026-09-17T12:00:00.000Z",
  "environment": "live",
  "data": {
    "verification_id": "ver_...",
    "external_user_id": "customer_123",
    "method": "email",
    "status": "verified"
  }
}
```

### Webhook headers

```http
User-Agent: Nexus-Webhooks/1.0
X-Nexus-Event: verification.completed
X-Nexus-Delivery: del_...
X-Nexus-Timestamp: 1768737600
X-Nexus-Signature: v1=<hex-hmac>
```

The signature is HMAC-SHA256 over:

```text
<unix_timestamp>.<raw_request_body>
```

Pseudo-code:

```text
signed_payload = `${timestamp}.${rawBody}`
expected = HMAC_SHA256(webhookSecret, signed_payload)
```

Reject requests with an invalid signature or an unacceptable timestamp age. The receiver should also deduplicate using `X-Nexus-Delivery` or the event ID.

### Delivery lifecycle

A delivery can move through:

```text
pending → processing → delivered
pending → processing → retry → processing → delivered
pending → processing → failed
```

Failed/retry deliveries can be manually retried from the Nexus Developer Portal.

Nexus retries transient/non-2xx deliveries with bounded backoff. Delivery is at-least-once, so customer receivers must be idempotent.

### API logs

`GET /workspaces/:workspaceId/api-logs` returns recent customer API requests including:

- timestamp
- method
- path
- status code
- latency
- environment
- request ID
- API key ID

Secrets are never written to these logs.

### Error format

```json
{
  "success": false,
  "code": "INVALID_API_KEY",
  "message": "Invalid or revoked API key.",
  "requestId": "req_..."
}
```

Common verification codes:

```text
INVALID_API_KEY
QUOTA_EXCEEDED
INVALID_CODE
EXPIRED
MAX_ATTEMPTS
EMAIL_PROVIDER_NOT_CONFIGURED
PHONE_PROVIDER_NOT_CONFIGURED
ENVIRONMENT_MISMATCH
```

Common webhook codes:

```text
FEATURE_NOT_INCLUDED
WEBHOOK_LIMIT_REACHED
WEBHOOK_CREATE_FAILED
WEBHOOK_UPDATE_FAILED
```

### Customer Analytics & Reports

#### `GET /workspaces/:workspaceId/analytics`

Authentication: Supabase Auth access token.

Required workspace roles: `owner`, `admin`, `developer`, `analyst`, `viewer`.

Query parameters:

- `range`: `7`, `30`, `90`, or `365` days. `90` and `365` require the workspace `advancedAnalytics` entitlement.
- `environment`: `all`, `live`, or `test`.

Returns workspace-scoped analytics derived from server-owned verification and usage data, including:

- request totals
- verified / failed / expired outcomes
- verification rate
- high-risk and disposable-email rates
- previous-period comparisons
- daily activity series
- method and risk breakdowns
- recent requests
- current-month quota usage

#### `GET /workspaces/:workspaceId/reports/verification.csv`

Authentication: Supabase Auth access token.

Required workspace roles: `owner`, `admin`, `developer`, `analyst`, `viewer`.

Query parameters match `/analytics`.

Returns a CSV report generated server-side from the same workspace-scoped analytics source of truth.

### Automation, Scheduled Reports and Nexus Intelligence

#### Workflows
- `GET /workspaces/:workspaceId/workflows`
- `GET /workspaces/:workspaceId/workflows/events`
- `POST /workspaces/:workspaceId/workflows`
- `PATCH /workspaces/:workspaceId/workflows/:workflowId`
- `DELETE /workspaces/:workspaceId/workflows/:workflowId`

Workflow triggers are based on verified Nexus events. Conditions are server-evaluated. Actions supported: customer webhook event, workspace-owner email, configured recipient email, and workspace security event.

#### Scheduled reports
- `GET /workspaces/:workspaceId/report-schedules`
- `POST /workspaces/:workspaceId/report-schedules`
- `PATCH /workspaces/:workspaceId/report-schedules/:scheduleId`
- `DELETE /workspaces/:workspaceId/report-schedules/:scheduleId`
- `POST /workspaces/:workspaceId/report-schedules/:scheduleId/run`

Scheduled reports require the `scheduledReports` entitlement. Reports are generated by the server and delivered as CSV attachments through the configured transactional email provider.

#### Nexus Intelligence
- `GET /workspaces/:workspaceId/intelligence/usage`
- `POST /workspaces/:workspaceId/intelligence`

The intelligence endpoint is workspace-scoped and uses server-generated analytics context. API secrets, passwords and raw verification codes are not sent to the model. AI usage is metered per workspace/month and gated by the `ai` entitlement.

#### Security Events

- `GET /workspaces/:workspaceId/security-events`

Authentication: Supabase Auth access token.

Required workspace roles: `owner`, `admin`, `developer`, `analyst`, `viewer`.

Returns the latest server-recorded security events for that workspace. The customer browser cannot write these records directly.

#### Phase 5 entitlement behavior

Automation and scheduled-report execution are checked against the workspace's current server-side plan at execution time. If a customer downgrades to a plan that does not include a feature, new execution is blocked until the entitlement returns. Existing workflows/schedules can still be disabled or deleted so customers are not trapped by a downgrade.

### Workspace Lifecycle, Security and Operations

#### Workspace lifecycle
These dashboard endpoints use Supabase ID-token authentication.

```text
GET    /workspaces
POST   /workspaces
GET    /workspaces/:workspaceId/members
GET    /workspaces/:workspaceId/activity
POST   /workspaces/:workspaceId/invites
PATCH  /workspaces/:workspaceId/members/:memberId
DELETE /workspaces/:workspaceId/members/:memberId
GET    /workspaces/:workspaceId/export.json
DELETE /workspaces/:workspaceId
```

Workspace creation is plan-gated server-side using `workspaceLimit`.
Team invitations are plan-gated using `teamMemberLimit` and cannot assign the Owner role.
Workspace deletion requires recent Supabase authentication and removes workspace-scoped data without deleting account-level billing history.

#### Invitations
```text
GET  /workspace-invites
POST /workspace-invites/:inviteId/accept
```

Invitations are bound to the authenticated user's email. Acceptance creates the membership server-side and records the acceptance in workspace activity.

#### Account security
```text
POST /account/security/revoke-all-sessions
```

Requires recent authentication. This revokes Supabase refresh tokens for the authenticated account. The current browser should sign in again after revocation.

#### Operational endpoints
```text
GET /health
GET /readyz
GET /admin/system/health
```

`/health` is intentionally minimal and does not expose provider configuration. `/readyz` verifies Supabase service-role/PostgreSQL readiness. `/admin/system/health` is restricted to Nexus administrators and reports configuration state and worker flags; it does not claim external-provider availability merely because environment variables exist.

#### Workspace export
`GET /workspaces/:workspaceId/export.json` returns workspace-scoped configuration, verification records, usage, analytics, reports, automation, security events, and sanitized integration metadata. Write-only credentials and cryptographic secret material are excluded.

### Billing Truthfulness, Readiness and Workspace Branding

#### `GET /billing/preferences`
Authentication: Supabase Auth access token. Returns persistent, server-owned billing notification preferences for the authenticated Nexus account.

#### `PATCH /billing/preferences`
Authentication: Supabase Auth access token. Accepts boolean preference fields only. The server merges the patch with the stored preferences; client access to the underlying PostgreSQL collection is denied.

#### `GET /billing/invoices.csv`
Authentication: Supabase Auth access token. Exports the authenticated account's provider-backed invoice records as CSV with an `amount_inr` column.

#### `GET /billing/invoices/:invoiceId.csv`
Authentication: Supabase Auth access token. Exports exactly one provider-backed invoice record if it belongs to the authenticated account.

#### `GET /workspaces/:workspaceId/branding`
Authentication: Supabase Auth access token. Workspace-member access. Returns the current workspace branding configuration and whether the current workspace plan includes the `whiteLabel` entitlement.

#### `PATCH /workspaces/:workspaceId/branding`
Authentication: Supabase Auth access token. Owner/admin access. Requires the workspace `whiteLabel` entitlement. Logo URLs must use HTTPS and may not contain embedded credentials.

Workspace branding is stored server-side under the workspace settings path and is not writable through the browser's PostgreSQL client. Custom-domain routing and SSO/SAML are not included.

#### Readiness

`GET /readyz` is a public machine-readable readiness check. It verifies blocking application configuration and PostgreSQL connectivity without returning secrets. Optional provider configuration is surfaced as warnings.

`GET /admin/system/health` returns the same readiness state to authorized Nexus administrators together with safe service/config booleans and worker configuration. It never returns secret values.

Set `NEXUS_STRICT_STARTUP=true` in production when startup should fail instead of serving while blocking readiness requirements are missing.


### Account Lifecycle & Privacy Controls

#### `GET /account/data-export.json`
Authentication: Supabase Auth access token + recent-auth requirement. Returns a JSON export of the authenticated account's personal profile, role, workspace memberships, owned workspace summary, billing state/preferences, support tickets, recorded account security events, and legacy forms. Workspace-owned operational data and cryptographic secrets are not included.

#### `GET /account/deletion-request`
Authentication: Supabase Auth access token. Returns the current personal-account deletion request, if any.

#### `POST /account/deletion-request`
Authentication: Supabase Auth access token + recent-auth requirement. Schedules personal-account deletion after the configured grace period. The request is blocked while the user owns a workspace or has a provider-backed active subscription.

#### `POST /account/deletion-request/cancel`
Authentication: Supabase Auth access token + recent-auth requirement. Cancels a pending deletion request during the grace period.

Account deletion is executed by the dedicated worker. It removes personal account/profile records, workspace memberships, personal messages/forms/support records, revokes Supabase refresh tokens, and deletes the Supabase Authentication account. Workspace-owned records and legally retained accounting records are not automatically deleted by this personal-account workflow.

# Wasel backend

Standalone NestJS 11 project generated with the installed Nest CLI. This directory owns its package.json, lockfile, node_modules, Nest/TypeScript/Jest/ESLint configuration, provider credentials, scripts, Dockerfile and Compose stack. It imports no mobile code or root configuration. The mobile app communicates over HTTP only.

## Run

Use Node 22.14+ and Docker Desktop with Linux containers. Run these commands **inside backend/**:

```powershell
npm install
npm run setup:local
docker images
docker compose up -d postgres openwa
npm run openwa:connect
npm run start:dev
```

The existing private `.env` was moved here. Setup preserves it. For a fresh checkout, fill `.env.example`, or provide this project's own ignored `env/emails.txt` and `env/mapbox token.txt` before running setup.

Compose uses the local **postgres:17** image with `pull_policy: never`. If your installed PostgreSQL 17 image has another tag, set `POSTGRES_IMAGE` in this project's `.env` to that exact tag. No PostGIS image/extension is required. PostgreSQL is exposed at `127.0.0.1:5433`, database/user `wasel`; its password is in `.env`. Data persists in a named volume.

OpenWA builds from [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA), the supplied repository. Open http://localhost:2785, authenticate with `OPENWA_API_KEY` from `.env`, and scan the WhatsApp QR. The setup script creates/starts the named session and can save its QR privately to `.artifacts/openwa-qr.png`. Pin the Compose source ref to a reviewed commit instead of `main` before deploying.

Health: http://localhost:3000/api/v1/health. `npm run check:services` checks PostgreSQL, OpenWA, Mapbox and SMTP without sending messages. `docker compose up -d --build` also builds/runs the API entirely from this directory.

PostgreSQL 17 integration tests and provider connection checks pass. Automated integration tests use an isolated database and do not send WhatsApp or email messages.

## Standard Nest commands

```powershell
npm run start:dev
npm run build
npm run start:prod
npm test -- --runInBand
npm run lint
npm run test:e2e -- --runInBand
```

End-to-end tests require PostgreSQL 17. They create an isolated `wasel_it_<random>` database, apply migrations, exercise HTTP flows, then remove only that generated database. The local DB user needs create-database permission. The worker is disabled: test codes never leave that database. `npm run test:integration` runs the same check directly.

## Architecture

- `auth`: separate customer/rider controllers, shared DTOs, verification codes, access tokens and guards.
- `customers` / `riders`: separate controllers and role policies.
- `locations`: save/replace the default pickup and manage saved destinations in `user_addresses`.
- `maps`: server-side Mapbox geocoding and attributed static maps; secret token never reaches mobile.
- `orders`: draft/quote/publish trips, offers, assignment, lifecycle/history, text chat and tracking. Nearby discovery uses a parameterized Haversine query on standard PostgreSQL.
- `messaging`: encrypted transactional outbox, retry worker, OpenWA and SMTP adapters.
- `database`: TypeORM entities and initial migration. `DB_SYNCHRONIZE=true` enables local schema synchronization; it defaults to false. Automatic migrations are disabled.

Feature modules register entities with `TypeOrmModule.forFeature(...)`. Services inject `Repository<Entity>` using `@InjectRepository(Entity)`. Transactions use the injected repository manager; no feature service injects `DataSource`. Controllers validate DTOs and delegate to services. Egyptian phone numbers are normalized. A phone/email belongs to one account and role. Passwords use salted scrypt. OTPs are purpose/role-bound, expire in five minutes, allow five attempts, and have request limits. Login/verification returns `access_token`, `token_type`, `expiresInSeconds`, `user`, and `needsLocation`. JWT access tokens expire in seven days. There are no sessions, refresh tokens or cookies. Password reset increments `users.token_version`, invalidating previous tokens. Logout deletes the local token; existing copies remain usable until expiry or password reset.

Customers become verified after a WhatsApp code. Riders verify their phones too, but maps/orders remain blocked until manual approval:

```sql
UPDATE users SET is_rider_verified = true, updated_at = now()
WHERE phone = '+201012345678' AND role = 'RIDER';
```

Do not set `phone_verified_at` manually. The rider can refresh their approval screen afterwards. Public DTOs reject approval fields.

Reset channels are `WHATSAPP` and `EMAIL`. Email must first be verified from the account screen. Ineligible/unknown account requests get the same generic response. Delivery requires linked OpenWA or working SMTP.

## Routes

Base `/api/v1`. Auth routes exist separately under `/customers/auth` and `/riders/auth`:

| Method | Route | Body |
| --- | --- | --- |
| POST | `/register` | `fullName, phone, password, email?`; rider also `vehicleType` |
| POST | `/login` | `phone, password` |
| POST | `/verify` | `challengeId, code` |
| POST | `/otp/resend` | `challengeId` |
| POST | `/password/forgot` | `phone, channel` |
| POST | `/password/reset` | `challengeId, code, newPassword` |
| POST | `/email/request-verification` | Bearer token |
| POST | `/email/verify` | Bearer token; `challengeId, code` |

`GET /customers/me` returns `needsLocation`. `PATCH /customers/me` and `PATCH /riders/me` update `fullName` and `email`; riders also support `vehicleType` and `isOnline`. Phone, role and approval cannot be edited. `GET/POST /customers/addresses` and `DELETE /customers/addresses/:id` manage saved destinations. `GET/PUT /customers/me/location` reads/replaces the saved location (`latitude, longitude, addressText, label?`). `GET /riders/me` works while approval is pending.

Each role has `/maps/search?q=...`, `/maps/reverse?latitude=...&longitude=...`, and `/maps/image?latitude=...&longitude=...&zoom=14`. Approved riders have `/riders/orders/nearby?latitude=...&longitude=...&radius=5000`. `POST /customers/orders` accepts `packageDescription, vehicleType, destination: {latitude, longitude, addressText}, recipientName, recipientPhone`; pickup uses the default location or an explicit `pickup` object. It now creates a DRAFT; quote and publish it through the trip endpoints. Nearby results omit recipient contact details.

## Trip endpoints and token context

Every protected request sends `Authorization: Bearer <access_token>`. `AccessTokenGuard` validates the JWT and loads the current user into `request.user` and `request.principal.user`. Controllers use `@CurrentUser()`; services inject `UserContext` and read `.user`. Profile edits exercise this service context directly. Authorization always uses current database roles/approval, not token role claims.

- `POST /trips`: create a customer draft, optionally supplying UUID `clientRequestId` for retries.
- `GET /trips?page=1&limit=20&status=DELIVERED`: own paginated history; status optional.
- `GET /trips/:id`: authorized details and timeline.
- `POST /trips/:id/quote`: Mapbox route and integer-piaster quote, valid for ten minutes.
- `POST /trips/:id/publish`: `{version}`; explicit quote confirmation.
- `POST /trips/:id/accept`: approved, online rider with matching vehicle and no active trip.
- `POST /trips/:id/actions/{start|arrive-pickup|confirm-pickup|start-transit|arrive-destination|complete|cancel}`: `{version,reason?}`. Cancellation requires a reason and is forbidden after start.
- `GET/POST /trips/:id/offers`: sender views offers; riders submit `{amountPiasters,reason?}`.
- `POST /trips/:id/offers/:offerId/{accept|reject}`: sender decides; acceptance assigns atomically.
- `POST /trips/:id/repeat`: `{clientRequestId}`; new unpriced draft.
- `GET/POST /trips/:id/messages`: participant chat; POST `{clientMessageId,body}`. GET supports `page,limit`.
- `GET /trips/:id/tracking`, `POST /trips/:id/tracking/locations`: authorized location snapshot/upload; upload `{updateId,sequence,latitude,longitude,accuracy,recordedAt}`.
- `GET /trips/:id/map`: attributed route/pickup/destination/rider map image.
- `GET /riders/earnings`: completed-trip fare totals, not payment settlement.
- `GET /notifications`, `POST /notifications/:id/read`: own in-app inbox.

## Test push notification

`GET /api/v1/notifications/test?fcm=<URL-encoded-FCM-token>` creates a fixed test notification in the user's history and queues it for the Firebase worker. Supply `x-notification-key: <NOTIFICATIONS_API_KEY>` as a header; no request body or user bearer token is required. The FCM token must already be registered by an active, push-enabled user through the mobile app. Unknown/unregistered tokens return 404. Invalid tokens return 400, incorrect/missing sender keys return 401, and missing Firebase/sender configuration returns 503. The endpoint allows five requests per minute per IP and returns `Cache-Control: no-store`.

```powershell
$headers = @{ 'x-notification-key' = '<NOTIFICATIONS_API_KEY>' }
$fcm = [uri]::EscapeDataString('<FCM_TOKEN>')
Invoke-RestMethod -Method Get -Uri "http://158.69.210.207:4000/api/v1/notifications/test?fcm=$fcm" -Headers $headers
```

A 202 response includes `notification`, `pushStatus: "queued"`, and `pushConfigured: true`. It acknowledges queueing, not device delivery; the worker checks the queue every three seconds. Each request creates a new test notification. The Firebase payload includes the notification ID and user ID required by the mobile foreground banner and Updates screen. Deploy the updated backend code before calling this URL on the VPS.

## Schema upgrades

With `DB_SYNCHRONIZE=true`, startup applies the trip/token upgrade (including removal of obsolete `sessions`) and then synchronizes entity metadata. Fresh databases run migrations before synchronization. Keep this setting false in production: startup then performs no schema upgrades, migrations, or synchronization. Prepare the schema separately in the dedicated Wasel database after review. Existing databases created by synchronization must be explicitly baselined before switching to migration-only deployment. Never point this application at another site's database.

## Environment files

`.env` is loaded automatically for local runs. `.example.env` is a local copy of the credential-free `.env.example` template. `.prod.env` contains production settings and is not loaded automatically: install it as `.env` in the VPS backend directory. Private environment files are excluded from Git and Docker build contexts. Production uses API port 4000 and the same-server OpenWA endpoint `http://127.0.0.1:2785`; its public dashboard is `http://158.69.210.207:2785`. These URLs are configuration targets, not deployment verification.

`CORS_ORIGINS=*` permits any browser origin; comma-separated origins restrict browser access. Native mobile clients do not need CORS permission. `NOTIFICATIONS_API_KEY` is for trusted server callers only, never the mobile app. `OTP_SECRET` is not used by the current implementation.

Firebase push needs the Admin service-account JSON's `project_id`, `client_email`, and `private_key`, mapped to the three `FIREBASE_*` variables. Android `google-services.json` and iOS `GoogleService-Info.plist` do not supply the private key. The private `.env` and `.prod.env` files contain the supplied Admin credentials; example files keep these fields empty. Credential loading alone does not verify device delivery or APNs setup. Store the private key in double quotes with escaped `\n` line breaks. See [Firebase Admin setup](https://firebase.google.com/docs/admin/setup#initialize_the_sdk).

New tables have descriptive names: `pricing_rules`, `trip_status_history`, `trip_price_proposals`, `trip_messages`, `trip_live_locations`, `trip_location_history`, and `notifications`. `trips` remains the source of history. Saved destinations share `user_addresses` with one partial-unique default pickup per user.

## Implemented scope and open work

See [the implementation status](../planning/17-implementation-status.md) for exact delivered flows, test coverage and remaining plan requirements. Tracking/chat currently use HTTP polling; mobile GPS collection is foreground trip-screen only. Socket.IO, background location execution, R2 images/voice, FCM, registered-recipient invitations, points and admin/operations remain open. Browser/native visual acceptance could not run in this environment.

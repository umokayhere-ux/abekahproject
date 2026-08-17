# RentFinder

A rental marketplace for Ghana. Tenants discover, save, book, and pay for
rooms, apartments, houses, and studios; landlords list properties and receive
rent directly to their bank account; administrators oversee the whole platform.

Prices are in Ghana cedis (GHS), payments run through Paystack — a one-off
GHS 50 landlord registration fee plus a 5% commission on rent — and the app is
built to deploy to Vercel with MongoDB Atlas.

---

## Contents

- [What it does](#what-it-does)
- [Technology](#technology)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [MongoDB Atlas setup](#mongodb-atlas-setup)
- [Paystack setup](#paystack-setup)
- [Cloudinary setup](#cloudinary-setup)
- [Email setup](#email-setup)
- [Admin account](#admin-account)
- [Seeding demo data](#seeding-demo-data)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deploying to Vercel](#deploying-to-vercel)
- [How payments work](#how-payments-work)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)

---

## What it does

### Tenants
Search listings by city, type, budget, and bedrooms. Save favourites, request a
property with a move-in date, pay the first month plus deposit through
Paystack, message landlords, review a property after a confirmed stay, and
manage their profile and payment history.

### Landlords
Pay a one-off GHS 50 registration fee to unlock listing, then create and manage
listings with photo uploads, review and confirm booking requests, connect a
mobile money wallet or bank account for payouts, message tenants, and track
earnings, views, and bookings.

### Administrators
See platform-wide statistics, manage every user and property, verify landlords
and listings, monitor bookings and payments with the commission split, read the
audit log, and perform guarded database resets.

---

## Technology

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, React 19) |
| Language | TypeScript, strict mode |
| Database | MongoDB with Mongoose 9 |
| Auth | JWT via `jose`, password hashing via `bcryptjs` (cost 12) |
| Styling | Tailwind CSS v4 (CSS-first config) |
| Icons | `lucide-react` (exclusively — no emoji, no other icon sets) |
| Payments | Paystack (subaccounts, split payments, signed webhooks) |
| Image storage | Cloudinary |
| Email | Nodemailer over SMTP |
| Tests | Vitest, with `mongodb-memory-server` for integration |

The app is serverless-safe: the Mongoose connection is cached across warm
lambda invocations, and nothing is written to local disk.

---

## Quick start

```bash
git clone https://github.com/umokayhere-ux/abekahproject.git
cd abekahproject
npm install

cp .env.example .env.local
# Fill in MONGODB_URI and JWT_SECRET at minimum, then:

npm run seed     # optional: demo landlords, tenants, and Ghanaian listings
npm run dev
```

Open <http://localhost:3000>.

The minimum to boot is `MONGODB_URI` and `JWT_SECRET`. Without Paystack the app
runs but payments are disabled; without Cloudinary, listing photos can still be
added by URL but the upload button is unavailable.

Check your configuration at any time:

```bash
curl http://localhost:3000/api/health
```

It reports which integrations are configured and whether the database is
reachable — see [Troubleshooting](#troubleshooting).

Generate a secret with:

```bash
openssl rand -base64 48
```

---

## Environment variables

Copy `.env.example` to `.env.local`. `.env*` files are gitignored — only
`.env.example` is committed, and it contains no real values.

### Required

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string, including the database name. |
| `JWT_SECRET` | Signs and verifies JWTs. **At least 32 characters.** Changing it invalidates every existing session. |

### Superadmin (optional, strongly recommended)

| Variable | Purpose |
| --- | --- |
| `ADMIN_EMAIL` | Email of the admin account to create. |
| `ADMIN_PASSWORD` | Its password. Re-synced on every cold start, so this is also how you rotate it. |
| `ADMIN_NAME` | Display name. Defaults to `RentFinder Admin`. |

When all three are set, the admin is created on the first authentication
request and kept in sync afterwards. If they are absent, admin seeding is
skipped and no administrator exists.

### Paystack (required for payments)

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | Server-only. Used for API calls and webhook signature verification. **Never exposed to the browser.** |
| `PAYSTACK_PUBLIC_KEY` | Public key from the same Paystack account. |

### Cloudinary (required for image uploads)

| Variable | Purpose |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Your cloud name. |
| `CLOUDINARY_API_KEY` | API key. |
| `CLOUDINARY_API_SECRET` | API secret. Server-only. |

### Email (required for password resets in production)

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP hostname. |
| `SMTP_PORT` | Port. Defaults to `587`; `465` switches to implicit TLS. |
| `SMTP_USER` / `SMTP_PASSWORD` | Credentials, if the server requires them. |
| `EMAIL_FROM` | From address, e.g. `RentFinder <no-reply@rentfinder.gh>`. |

Without SMTP, reset links are printed to the server console in development. In
production a missing SMTP configuration is logged as an error and the reset
email is not sent.

### Application and payments

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | inferred | Base URL for reset links and Paystack callbacks. Inferred automatically on Vercel; set it explicitly for a custom domain. |
| `LANDLORD_REGISTRATION_FEE_GHS` | `50` | One-off fee a landlord pays before publishing. Goes wholly to the platform. |
| `PLATFORM_COMMISSION_PERCENT` | `5` | Commission on rent, absorbed by the landlord. Values outside 0–100 fall back to 5. |
| `PAYMENT_INCLUDE_DEPOSIT` | `true` | Whether the first payment bundles a deposit. |
| `PAYMENT_DEPOSIT_MONTHS` | `1` | Deposit size, in months of rent. |

> `NEXT_PUBLIC_APP_URL` is the only variable safe to expose to the browser.
> Never prefix a secret with `NEXT_PUBLIC_` — that inlines it into the client
> bundle.

---

## MongoDB Atlas setup

1. Create a free cluster at <https://cloud.mongodb.com>.
2. **Database Access** → add a user with *Read and write to any database*.
3. **Network Access** → add an IP allowlist entry.
   - For local development, add your own IP.
   - **For Vercel, allow `0.0.0.0/0`.** Serverless functions have no stable
     outbound IP, so a narrower rule will cause intermittent connection
     failures. Protect the database with strong credentials instead.
4. **Connect** → *Drivers* → copy the connection string and put it in
   `MONGODB_URI`, replacing `<password>` and adding the database name:

```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/rentfinder?retryWrites=true&w=majority
```

Indexes are declared on the schemas and created automatically by Mongoose.

---

## Paystack setup

1. Create an account at <https://paystack.com> and complete business
   verification (required before live subaccounts settle).
2. **Settings → API Keys & Webhooks** → copy the **test** keys
   (`sk_test_…`, `pk_test_…`) into `.env.local`.
3. Set the webhook URL to:

   ```
   https://your-domain.com/api/payments/webhook
   ```

   Paystack cannot reach `localhost`. To test webhooks locally, tunnel with
   something like `ngrok http 3000` and use the public URL.

4. Subaccounts are created automatically. Each landlord connects a payout
   destination from **Dashboard → Get paid** — either a **mobile money wallet**
   (MTN, Telecel, AirtelTigo) or a bank account. The app resolves the
   destination with Paystack, creates a subaccount with a 95%
   `percentage_charge`, and stores only the resulting subaccount code and the
   last four digits of the number.

   Mobile money is offered first, since it is how most Ghanaian landlords are
   paid. Numbers are accepted in any common form (`0244123456`,
   `+233244123456`, `024 412 3456`) and normalised to the local ten-digit form
   Paystack expects. The provider list is read live from Paystack and split
   into wallets and banks, so new providers appear without a code change; if
   your Paystack account returns no wallets, the option is hidden rather than
   shown empty.

**Test cards** are in the [Paystack docs](https://paystack.com/docs/payments/test-payments/).

---

## Cloudinary setup

1. Sign up at <https://cloudinary.com> — the free tier is ample for this.
2. From the dashboard, copy **Cloud name**, **API Key**, and **API Secret**
   into `.env.local`.
3. Uploads are scoped per user under `rentfinder/<userId>/`, capped at 5 MB and
   1600px, and re-encoded to WebP/AVIF automatically.

Only landlords and admins may upload. `next.config.ts` allowlists
`res.cloudinary.com` and `images.unsplash.com` (the latter for demo seed data);
add any other host you use there, or the image optimiser will reject it.

---

## Email setup

Any SMTP provider works — Resend, SendGrid, Mailgun, Postmark, or a plain SMTP
server. Set the `SMTP_*` variables and `EMAIL_FROM`.

Password reset tokens are random 32-byte values, stored only as a SHA-256 hash,
valid for 60 minutes, and invalidated after a single use.

---

## Admin account

There is **no way to register an administrator through the API.** Public
sign-up accepts only `tenant` and `landlord`, and a request containing
`"role": "admin"` is rejected with a 403 rather than silently downgraded.

The only path to an admin account is the environment:

```env
ADMIN_EMAIL=admin@rentfinder.gh
ADMIN_PASSWORD=a-strong-password
ADMIN_NAME=RentFinder Admin
```

On the first auth request after a cold start, the account is created if it does
not exist, or re-synced if it does — role forced to `admin`, unsuspended,
verified, and the password reset to whatever `ADMIN_PASSWORD` currently says.
To rotate the admin password, change the variable and redeploy.

### Adding more administrators

The environment seed creates exactly one. To add others, sign in as that admin
and use **Dashboard → Users → Add user**, choosing the *Administrator* role.

That endpoint (`POST /api/admin/users`) requires a valid admin JWT, so the rule
is "an admin may appoint an admin" — never "a request may claim to be one".
Public sign-up still refuses the role outright, and every appointment is
written to the audit log under `admin.created`.

You can also create tenants and landlords this way. A landlord created by an
admin is not charged the listing fee, on the basis that the platform is
onboarding them deliberately.

---

## Seeding demo data

```bash
npm run seed          # add demo data, keeping anything already present
npm run seed:fresh    # wipe all non-admin data first, then seed
```

This creates the configured admin, two landlords, two tenants, eight realistic
Ghanaian listings across Accra, Kumasi, Takoradi, Tema, and Cape Coast, plus a
confirmed booking, a settled payment, a review, saved properties, and a
conversation — so every dashboard has something in it on first look.

| Role | Email | Password |
| --- | --- | --- |
| Landlord | `landlord@rentfinder.demo` | `Password123` |
| Landlord | `landlord2@rentfinder.demo` | `Password123` |
| Tenant | `tenant@rentfinder.demo` | `Password123` |
| Tenant | `tenant2@rentfinder.demo` | `Password123` |
| Admin | your `ADMIN_EMAIL` | your `ADMIN_PASSWORD` |

> These are demo credentials with a published password. Never seed them into a
> production database.

Demo photos come from Unsplash's CDN using permanent photo IDs rather than
`source.unsplash.com` redirects, so they do not break over time. For a real
deployment, replace them with your own Cloudinary uploads.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint, including the React Compiler rules. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run seed` | Seed demo data. |
| `npm run seed:fresh` | Wipe non-admin data, then seed. |
| `npm test` | Full test suite. |
| `npm run test:unit` | Unit tests only — no database needed. |
| `npm run test:integration` | Integration tests only. |
| `npm run test:watch` | Watch mode. |

---

## Testing

The suite is split in two.

**Unit tests** (`tests/unit/`) cover the pure, security-critical logic and need
nothing external:

- the commission split, rounding, and pesewa conversion;
- input validation, including Ghanaian phone formats and regex escaping;
- JWT signing, expiry, tampering, and forged-signature rejection;
- bcrypt cost and password verification;
- `toSafeUser` stripping password hashes, subaccount codes, and bank details;
- webhook signature verification against wrong keys and tampered payloads;
- audit-log redaction of passwords, tokens, and account numbers.

**Integration tests** (`tests/integration/`) exercise the real route handlers
against an in-memory MongoDB: registration and login, admin-registration
refusal, suspended accounts, single-use password resets, role and ownership
enforcement, conversation membership, property CRUD and search, the booking
lifecycle, payment initialisation with server-computed amounts, and webhook
idempotency under concurrent delivery.

```bash
npm run test:unit          # always works
npm test                   # everything
```

> **Note:** `mongodb-memory-server` downloads a `mongod` binary from
> `fastdl.mongodb.org` on first run. In a sandbox or CI image that blocks that
> host, the integration project fails to start with a message explaining why.
> If you already have MongoDB installed, point the tests at it:
>
> ```bash
> MONGOMS_SYSTEM_BINARY=$(which mongod) npm test
> ```

---

## Deploying to Vercel

1. Push to GitHub and import the repository at <https://vercel.com/new>.
2. Add every environment variable under **Settings → Environment Variables**.
   Add them to *Production*, *Preview*, and *Development* as appropriate.
3. Deploy. Next.js is detected automatically; no build overrides are needed.
4. In Atlas, confirm Network Access allows `0.0.0.0/0` (see above).
5. In Paystack, set the webhook to
   `https://your-domain.vercel.app/api/payments/webhook`.
6. Sign in with your `ADMIN_EMAIL` to confirm the admin was seeded.

The app makes no assumptions about persistent disk or a long-lived process, so
it works on Vercel's serverless runtime without adjustment.

---

## How payments work

There are two kinds of payment.

### 1. Landlord registration fee — GHS 50, one-off

Landlords pay **before an account exists**. Paystack opens on the sign-up form;
the account is created only once the charge settles.

```
Fills in sign-up form  →  clicks Continue to payment
        ↓  details held in a short-lived pending record (password hashed,
           email reserved) — no user row is created
Paystack popup, or hosted checkout if the popup cannot open
        ↓
Webhook settles the charge  →  the landlord account is created,
                               with approvalStatus: "pending"
        ↓
/auth/registration-complete polls until it exists, then tells the
landlord their account is awaiting approval
        ↓
An admin approves it in Dashboard → Verifications  →  sign-in works
```

A declined, abandoned, or underpaid attempt leaves **no account behind**: the
pending record expires after an hour and releases the email, and a failed
charge deletes it immediately.

The fee settles wholly to the platform account, so **no subaccount or split is
involved** — it is charged before the landlord has any payout details.

Listing also remains gated on `registrationFeePaid` as defence in depth, which
covers legacy accounts created before this flow. That flag is set **only** by
the settlement path, never by a client request.

#### Admin approval

Paying is not admission. A paid landlord is created with
`approvalStatus: "pending"` and **cannot sign in** until an administrator
approves them from **Dashboard → Verifications**.

| Status | Sign-in | Set by |
| --- | --- | --- |
| `pending` | blocked, "awaiting approval" | the settlement path, for paid landlord sign-ups |
| `approved` | allowed | an admin pressing Approve (also marks them verified) |
| `rejected` | blocked, "was not approved" | an admin pressing Reject |

Two deliberate choices:

- The field **defaults to `approved`**, so tenants, admins, and every account
  that existed before this gate keep working. Only the paid sign-up path writes
  `pending`.
- The gate is re-checked in `authenticate()` on **every request**, not only at
  sign-in, so revoking an approval ends a session already in flight.

The block is applied *after* the password check, so the state of an account is
never disclosed to someone who does not hold its credentials.

> **Not built:** rejecting a landlord who has already paid the GHS 50 fee does
> not refund them. Refunds are currently a manual step in the Paystack
> dashboard.

### 2. Rent — 5% platform commission

Rent is GHS 1,000. The tenant pays **exactly** the listed rent — the landlord
absorbs the platform commission, so there is no surprise markup at checkout.

```
Tenant pays      GHS 1,000
Platform keeps   GHS    50   (5%)
Landlord gets    GHS   950   (95%)
```

The landlord's 95% is routed to their Paystack subaccount via
`percentage_charge`; the platform keeps the remainder.

By default the first payment also includes a one-month deposit, so the tenant
is charged GHS 2,000 and the same 95/5 split applies to the total. This is
configurable via `PAYMENT_INCLUDE_DEPOSIT` and `PAYMENT_DEPOSIT_MONTHS`.

The flow:

```
Tenant requests a property with a move-in date
        ↓  server validates availability and computes the amount
Booking created as "pending"
        ↓  tenant taps Pay
Payment row created as "pending" with a unique reference
        ↓
Paystack checkout (split to the landlord's subaccount)
        ↓
Paystack webhook  →  signature verified  →  amount checked
        ↓
Payment marked "paid", booking confirmed, property marked rented,
rival pending bookings cancelled
```

Two properties of this flow matter:

- **The amount is never taken from the browser.** It is computed server-side
  from the stored property price, so a tampered request cannot change what is
  charged.
- **The webhook is authoritative.** A booking is confirmed because Paystack
  said the money arrived, never because the frontend said so. The callback
  redirect also verifies server-side, and both paths share one idempotent
  settlement function — so duplicate or concurrent deliveries settle exactly
  once.

---

## Security model

- **No public admin registration.** `role: "admin"` in a sign-up request is
  rejected with a 403; the only route to admin is the environment.
- **Passwords** are bcrypt-hashed at cost 12, stored with `select: false`, and
  never returned by any endpoint.
- **JWTs** are HS256, expire after 30 days, and carry an issuer and audience.
  Every authenticated request re-loads the user, so a token cannot outlive a
  deletion, a suspension, or a role change.
- **Ownership is checked against the database**, never against an id from the
  client. A landlord cannot touch another landlord's listing, a tenant cannot
  read another tenant's booking, and only participants can read a conversation
  — admins included.
- **Webhook signatures** are verified with a constant-time HMAC-SHA512
  comparison before the body is parsed.
- **Input is validated server-side** on every route. Search terms are
  regex-escaped, pagination is clamped, and image URLs must be `https`.
- **Secrets stay on the server.** `PAYSTACK_SECRET_KEY`, Cloudinary
  credentials, and SMTP passwords are never imported into a Client Component or
  prefixed with `NEXT_PUBLIC_`.
- **The audit log redacts** passwords, tokens, API keys, and account numbers
  before writing, so it cannot become a secret store by accident.
- **Destructive resets** require an admin JWT, a recognised scope, and the
  exact string `RESET`. Administrator accounts survive every scope.
- **Error responses** carry no stack traces in production.

---

## Troubleshooting

### Start here: the health check

```bash
curl https://your-domain.com/api/health
```

```jsonc
{
  "success": true,
  "data": {
    "status": "degraded",
    "canAuthenticate": false,
    "problems": ["MONGODB_URI is not set"],
    // ...per-integration booleans
  }
}
```

It returns `200` when sign-up and sign-in can work and `503` when they cannot,
and lists exactly what is missing. It reports only *whether* each thing is
configured — never a connection string, key, or secret — so it is safe to leave
unauthenticated, which matters because you most need it when authentication
itself is broken.

### "This deployment is missing required configuration (X)"

An environment variable is absent. Set it and redeploy. On Vercel, remember
that **adding a variable does not apply to an existing deployment** — you must
redeploy afterwards.

### "Cannot reach the database right now"

`MONGODB_URI` is set but the database is unreachable. In order of likelihood:

1. **Atlas Network Access.** Vercel functions have no fixed outbound IP, so the
   allowlist must include `0.0.0.0/0`. This is the most common cause of sign-up
   working locally but failing once deployed.
2. **Wrong password in the URI.** Atlas passwords with `@`, `/`, or `:` must be
   percent-encoded.
3. **Missing database name.** The URI needs `/rentfinder` before the `?`.
4. **Cluster paused.** Free-tier clusters pause after inactivity.

### "Something went wrong. Please try again."

This message now means a genuine unexpected error, not a configuration
problem — configuration and connectivity failures report themselves specifically
(above). The details are in your server logs: **Vercel → your project →
Logs**, or the terminal running `npm start`. Every such error is logged with an
`[api]` prefix.

### Sign-in says my password is wrong, but it is right

If you changed `JWT_SECRET`, every existing session was invalidated — sign in
again. If you changed `ADMIN_PASSWORD`, the admin password is re-synced from the
environment on the next cold start, so the *new* value is the correct one.

### No administrator account exists

`ADMIN_EMAIL` and `ADMIN_PASSWORD` must both be set. Seeding runs lazily on the
first authentication request after a cold start, so visit `/auth/login` once
after deploying, then sign in with those credentials.

### Payments say the landlord has no payout account

Expected until that landlord completes **Dashboard → Bank details**. Payments
cannot be initialised without a Paystack subaccount to route the 95% share to.

---

## Project structure

```
app/
  (public)/            Landing page, search, property detail, about, legal
  auth/                Login, register, forgot/reset password
  dashboard/           Tenant, landlord, and admin dashboards
  api/
    auth/              Register, login, logout, me, password reset
    properties/        Search, CRUD, favourites, reviews
    bookings/          Create, list, confirm, cancel
    conversations/     Threads and messages
    payments/          initialize, webhook, verify, history
    landlord/          Payout setup, bank list, stats
    tenant/            Dashboard stats
    admin/             Users, properties, bookings, payments,
                       verifications, activity, stats, reset
components/
  ui/                  Button, Field, Modal, Toast, DataTable, Badge, …
  layout/              Navbar, Footer
  property/            Card, grid, gallery, search, filters, actions
  dashboard/           Shell plus tenant/landlord/admin panels
  home/                Landing-page pieces
hooks/                 useAuth, useApiResource
lib/                   db, auth, api, validate, money, paystack,
                       cloudinary, email, activity, serialize, env
models/                User, Property, Booking, Payment, Conversation,
                       Message, Review, Activity
scripts/seed.ts        Demo data seeder
tests/                 unit/ and integration/
proxy.ts               Edge redirect for dashboard routes
```

### A note on `proxy.ts`

Next.js 16 renames `middleware.ts` to `proxy.ts`. This file only redirects
visitors with no session cookie away from `/dashboard/*` so they see the login
page instead of an empty shell. It deliberately does **not** verify the JWT —
that would not be a security boundary here anyway. Real authentication and
authorisation happen in every API route via `lib/auth.ts`.

---

## Licence

Provided as-is for the RentFinder project.

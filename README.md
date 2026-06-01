# Drop Ops Dashboard

Secure admin dashboard for operating Drop with a split architecture:

- Next.js + TypeScript for the admin UI
- a dedicated Supabase Edge Function for all privileged backend work

This project is built around the real Drop service surface described by:

- `/Users/izuchukwuogbodo/Desktop/Drop-customer-app`
- `/Users/izuchukwuogbodo/Desktop/Drop-driver-app`
- `/Users/izuchukwuogbodo/Desktop/drop-ride-hailing-backend`
- the Supabase schema, migrations, and edge functions bundled with the driver app

## Architecture

The dashboard app now keeps only public Supabase configuration.

All privileged secrets live in the Supabase Edge Function layer:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DISPATCH_ADMIN_TOKEN`
- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_SECRET_HASH`
- `DASHBOARD_ADMIN_USERNAME`
- `DASHBOARD_ADMIN_PASSWORD_HASH`
- `DASHBOARD_SESSION_SECRET`

The Next app does not hold those values anymore. It only:

- renders the admin UI
- stores the returned admin session cookie
- proxies browser requests to the `drop-admin` edge function
- applies CSRF checks, rate limits, redirects, and security headers

## What the dashboard covers

- Overview KPIs, alerts, and recent ride activity
- Live ops for active rides, online drivers, open offers, and scheduled dispatch
- Ride administration:
  cancellation and payment follow-up control
- Driver administration:
  verification, subscription/payment status, vehicle and wallet visibility
- Customer administration:
  profile search and verification control
- Scheduled rides operations
- Finance operations:
  payments, wallets, payouts, partner commissions, fee configuration
- Partner administration:
  onboarding, status updates, commission management
- Support operations:
  reports, chat visibility, push notification sending
- Settings:
  dispatch controls, service types, cancel reasons, app configs

## Security model

- The browser never receives the Supabase service-role key
- The Next dashboard app no longer stores operational server secrets
- The `drop-admin` edge function owns auth verification and privileged Supabase access
- Admin sessions are signed in the edge function and stored as HttpOnly cookies by the dashboard app
- CSRF token protection is enforced for privileged mutations
- Same-origin enforcement is applied on dashboard POST requests
- Basic rate limiting exists on login and admin mutation paths
- Strict security headers are applied in `proxy.ts`

## Project structure

- `app/`
  Next.js pages and thin proxy route handlers
- `components/`
  dashboard and auth UI
- `lib/dashboard-data.js`
  shared admin domain queries and mutations used by the edge function
- `proxy.ts`
  auth gate + security headers
- `supabase/functions/drop-admin/index.ts`
  privileged admin backend
- `supabase/functions/_shared/`
  edge-side auth and Supabase helpers

## Dashboard env

Copy `.env.example` to `.env` and set only the public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_FUNCTION_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME=drop-admin
```

The current repo already copies the shared Supabase project values from the mobile app env files into `.env`.

## Edge function secrets

Set the privileged secrets in Supabase for the `drop-admin` function.

Reference file:

```bash
supabase/functions.env.example
```

Required secrets:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
DISPATCH_ADMIN_TOKEN=...
FLUTTERWAVE_SECRET_KEY=...
FLUTTERWAVE_SECRET_HASH=...
# Optional; defaults to Flutterwave v3 API
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3

DASHBOARD_ADMIN_USERNAME=drop-admin
DASHBOARD_ADMIN_PASSWORD_HASH=...
DASHBOARD_SESSION_SECRET=...
```

Configure Flutterwave webhooks to post to the Supabase webhook function:

```bash
https://<supabase-project-ref>.supabase.co/functions/v1/flutterwave-webhook
```

If you prefer the dashboard to proxy webhooks into the admin edge function, use:

```bash
https://<dashboard-domain>/api/webhooks/flutterwave
```

Use the same value for Flutterwave's secret hash and the edge function
`FLUTTERWAVE_SECRET_HASH`.

Generate a password hash with:

```bash
npm run hash:admin-password
```

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Local development

Install dependencies:

```bash
npm install
```

Run the dashboard:

```bash
npm run dev
```

Then open:

```bash
http://127.0.0.1:3000
```

Local development uses non-secure cookies only on non-HTTPS requests so login still works on localhost.

## Edge function deployment

Deploy the `drop-admin` function with your normal Supabase CLI flow.

Important notes:

- the function must have access to the secrets listed in `supabase/functions.env.example`
- the dashboard expects the function name to be `drop-admin` unless you change `NEXT_PUBLIC_DASHBOARD_FUNCTION_NAME`
- the dashboard talks to the function URL configured in `NEXT_PUBLIC_SUPABASE_FUNCTION_URL`

## Verification

Suggested verification command:

```bash
npm run verify
```

This runs TypeScript checks and a production Next build.

## Current implementation note

The Next app is now a thin admin client/proxy. The real privileged backend lives in the edge function at [supabase/functions/drop-admin/index.ts](/Users/izuchukwuogbodo/Desktop/drop-dashboard/supabase/functions/drop-admin/index.ts).

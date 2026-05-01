This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Auth Notes

- Phone sign-in requires Firebase billing for real SMS delivery. For QA/dev, use Firebase Auth test phone numbers.

## Mapbox setup (Phase 7)

Add these to your `.env.local` (do not commit tokens):

```
MAPBOX_TOKEN=your_secret_token_here
NEXT_PUBLIC_MAPBOX_TOKEN=your_public_token_here
STORE_LAT=40.7
STORE_LNG=-74.2
```

The server routes `/api/mapbox/geocode` and `/api/mapbox/distance` use `MAPBOX_TOKEN` and store coordinates to validate delivery distance.

## Stripe setup (Phase 8)

Add these to your `.env.local` (do not commit secrets):

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
USE_STRIPE_TAX=false
```

## Account dashboard (Phase 10.1)

Enable the new account dashboard and billing UI via:

```
NEXT_PUBLIC_ACCOUNT_DASHBOARD_V2=true
```

Billing routes under `/api/billing/*` require an auth token in the `Authorization: Bearer <idToken>` header.

## Sypram setup (Phase 9)

Add these to your `.env.local` (do not commit secrets):

```
SYPRAM_BASE_URL=https://DataServices.sypramsoftware.com
SYPRAM_USERID=your_sypram_username
SYPRAM_PASSWORD=your_sypram_password
SYPRAM_PIN=your_sypram_pin
```

Sypram sync runs server-side only and is guarded by a 30-minute cooldown.

## Orders note

POS order push was canceled due to vendor cost. Orders are website-only and will be confirmed via Stripe webhooks (Phase 12).

## Order alerts email (SMTP)

Set these in `.env.local` to enable staff email alerts for new orders:

```
EMAIL_PROVIDER=smtp
ORDERS_EMAIL_ENABLED=true
STORE_ORDERS_EMAIL_TO=store@email.com
STORE_ORDERS_EMAIL_FROM=yourstore@gmail.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourstore@gmail.com
SMTP_PASS=GMAIL_APP_PASSWORD
```

For Gmail/Workspace, create an App Password (Google Account > Security > App passwords) and use it as `SMTP_PASS`.

## Operations hardening (Phase 21)

High-severity runtime failures are written to Firestore `opsLogs` with structured fields:

- `source`
- `eventType`
- `orderId`
- `userId`
- `severity`
- `message`
- `details`
- `createdAt`

Admin system health endpoint:

```text
GET /api/admin/system-health
```

This powers a lightweight panel on `/admin` with:

- failed notifications (recent)
- stale open orders
- failed sync events
- last webhook event time
- last Sypram sync status

Admin order export endpoint:

```text
GET /api/admin/orders/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=csv
GET /api/admin/orders/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=json
```

The CSV export is date-bounded and capped to keep Firestore reads predictable.

## Product image matching + rollout (Phase 16A / 16B)

Local source images should live in a gitignored folder at the project root:

```text
images_import/
```

Artifacts are written to:

```text
artifacts/
```

Recommended execution order:

1. Backfill normalized image-matching fields on products:

```bash
pnpm images:backfill:dry --limit=50
pnpm images:backfill
```

Backfill writes a summary artifact to:

```text
artifacts/backfillProductImageMatchFields-summary.json
```

2. Index local images:

```bash
pnpm images:index -- --folder=images_import/beers --limit=50
pnpm images:index
```

3. Run scoring-based matching:

```bash
pnpm images:match -- --input=artifacts/image-candidates.json --limit=50
```

4. Review the outputs and create an explicit approved file:

```text
artifacts/approved_matches.json
```

Or use the admin Image Review queue export, which now writes:

```text
artifacts/review_approved.json
artifacts/review_decisions.json
```

`review_decisions.json` is a persistent decision ledger so reviews can be completed in batches across multiple sessions without losing previous work.

Recommended rollout:

- start with `images_import/beers`
- manually sample at least 20 auto-matches
- manually sample at least 10 review cases
- tighten thresholds if anything looks wrong

5. Attach only approved matches:

```bash
pnpm images:attach:dry -- --input=artifacts/review_approved.json --limit=20
pnpm images:attach -- --input=artifacts/review_approved.json
pnpm images:attach -- --input=artifacts/review_approved.json --overwrite
```

Attach script requirements:

- `FIREBASE_STORAGE_BUCKET` must be set
- uploads go to `products/{productId}/primary.webp`
- Firestore writes `primaryImageUrl` plus import metadata
- existing images are preserved unless `--overwrite` is passed
- attach runs write:
  - `artifacts/attach-summary.json`
  - `artifacts/attach-results.json`
  - `artifacts/script-runs/attachApprovedImages/<runId>.json`

Matching outputs:

- `artifacts/image-candidates.json`
- `artifacts/matched_auto.json`
- `artifacts/needs_review.json`
- `artifacts/unmatched.json`

Image script run auditability:

- each image script run now writes a machine-readable run summary under:
  - `artifacts/script-runs/<script-name>/<runId>.json`
- summaries include: `runId`, start/end timestamps, duration, args, status, structured counters, output artifact paths, and structured error payloads (for failed runs)

Storefront rollout behavior:

- if `primaryImageUrl` exists, product reads prefer it
- if not, the existing `image` field and current placeholder fallback remain unchanged

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

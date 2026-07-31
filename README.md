# Vailsburg Wine & Liquor E-Commerce Platform

A full-stack e-commerce and inventory management platform built for a local wine and liquor retailer.

Customers can browse products, check availability, add items to their cart, securely complete payments, and choose store pickup or local delivery. Store staff can manage products, inventory, orders, product images, and operational issues from the admin side.

This was built around the real requirements of a retail business, not as a tutorial project.

## Live Application

[Visit the live storefront](https://vailsburgwine.com)

> Some functionality may depend on store hours, product availability, delivery location, or test credentials.

## Project Background

The business needed a better way to publish its product catalog online and manage customer orders without relying entirely on manual store processes.

The main challenges were:

- handling a large and frequently changing product catalog
- keeping product availability accurate
- confirming payments before updating inventory
- validating whether an address is inside the delivery area
- giving staff a practical way to manage products and orders
- monitoring failures that could affect customers or store operations

## Key Features

### Customer Experience

- searchable product catalog
- category and product filtering
- product details and availability checks
- shopping cart and checkout
- secure Stripe payments
- customer authentication and account dashboard
- store pickup and local delivery
- Mapbox-based address and delivery-distance validation
- order history and account management

### Admin and Store Operations

- product and inventory management
- CSV-based product import and updates
- order management
- date-based CSV and JSON order exports
- product image matching and manual review workflow
- new-order email notifications
- operational logging and system-health monitoring

## My Role

I handled the project across the frontend, backend, integrations, database, testing, deployment, and production-support areas.

I worked directly with the business owner to understand how products, inventory, pricing, payments, delivery, and orders were handled inside the store. I then converted those requirements into application workflows and technical features.

My work included:

- designing and developing the storefront
- creating server-side API routes
- implementing authentication and role-based access
- integrating Stripe payments and webhooks
- integrating Mapbox for geocoding and delivery validation
- building inventory and stock-validation logic
- developing admin tools
- creating product image-processing workflows
- configuring deployment and environment settings
- fixing production issues after release

## Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend and Data

- Next.js server routes
- Firebase Authentication
- Firebase Firestore
- Firebase Storage

### Integrations

- Stripe Payment Intents and Webhooks
- Mapbox Geocoding and Distance APIs
- SMTP email notifications
- Sypram product and inventory integration

### Operations

- Vercel
- structured Firestore operational logs
- admin system-health monitoring
- CSV and JSON order exports

## Application Flow

1. Customers browse products and add available items to their cart.
2. The application validates stock before checkout.
3. Delivery orders are checked against the configured store location and delivery radius.
4. Stripe handles payment authorization.
5. Stripe webhooks confirm successful payments.
6. Confirmed orders are written to the database and made available to store staff.
7. High-severity failures are recorded in operational logs for review.

## Getting Started

### Prerequisites

Before running the project, make sure you have:

- Node.js installed
- pnpm installed
- a Firebase project
- Stripe test credentials
- Mapbox credentials
- SMTP credentials if order-alert emails are enabled

### Install Dependencies

```bash
pnpm install
```

### Configure Environment Variables

Create a local environment file:

```bash
cp .env.example .env.local
```

Then update `.env.local` with your own development credentials.

Never commit `.env.local`, API keys, passwords, webhook secrets, or customer data.

### Run the Development Server

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

## Environment Configuration

The repository includes `.env.example` with placeholder values only.

```env
# Mapbox
MAPBOX_TOKEN=your_secret_mapbox_token
NEXT_PUBLIC_MAPBOX_TOKEN=your_public_mapbox_token
STORE_LAT=your_store_latitude
STORE_LNG=your_store_longitude

# Stripe
STRIPE_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
USE_STRIPE_TAX=false

# Account dashboard
NEXT_PUBLIC_ACCOUNT_DASHBOARD_V2=true

# Sypram
SYPRAM_BASE_URL=your_sypram_base_url
SYPRAM_USERID=your_sypram_username
SYPRAM_PASSWORD=your_sypram_password
SYPRAM_PIN=your_sypram_pin

# Order alert email
EMAIL_PROVIDER=smtp
ORDERS_EMAIL_ENABLED=true
STORE_ORDERS_EMAIL_TO=orders@example.com
STORE_ORDERS_EMAIL_FROM=store@example.com

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=store@example.com
SMTP_PASS=your_app_password

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_public_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_DATABASE_ID=default

FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_DATABASE_ID=default
FIREBASE_CLIENT_EMAIL=your_firebase_admin_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----\n"
```

## Authentication Notes

Phone sign-in requires Firebase billing for real SMS delivery.

For local development and QA, use Firebase Authentication test phone numbers instead of real SMS messages.

## Mapbox and Delivery Validation

The following server routes handle address lookup and delivery-distance validation:

```text
/api/mapbox/geocode
/api/mapbox/distance
```

The server uses the private `MAPBOX_TOKEN` and configured store coordinates. The browser should only receive the public Mapbox token.

## Stripe Payments

Stripe is used for payment authorization and confirmation.

Required environment variables:

```text
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
```

Orders should be treated as paid only after the related Stripe webhook has been verified successfully.

### Local Webhook Testing

Use the Stripe CLI to forward test webhook events to your local application.

The project's webhook route is:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Account Dashboard

Enable the updated account dashboard with:

```env
NEXT_PUBLIC_ACCOUNT_DASHBOARD_V2=true
```

Billing routes under `/api/billing/*` require a valid Firebase ID token:

```text
Authorization: Bearer <idToken>
```

## Product and Inventory Integration

Sypram synchronization runs on the server and is protected by a cooldown to reduce unnecessary vendor calls.

Orders are managed by the website and confirmed through Stripe webhook events.

Do not expose Sypram credentials or private vendor configuration in client-side code.

## Order Alert Emails

To enable staff email alerts for new orders, configure the SMTP variables in `.env.local`.

For Gmail or Google Workspace, use an App Password instead of the main account password.

## Operations and System Health

High-severity runtime failures are written to the Firestore `opsLogs` collection.

Each log can include:

- `source`
- `eventType`
- `orderId`
- `userId`
- `severity`
- `message`
- `details`
- `createdAt`

The admin system-health endpoint is:

```text
GET /api/admin/system-health
```

The related admin panel can show:

- recent failed notifications
- stale open orders
- failed synchronization events
- last webhook event time
- last Sypram synchronization status

## Order Exports

Admin users can export orders by date range:

```text
GET /api/admin/orders/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=csv
GET /api/admin/orders/export?start=YYYY-MM-DD&end=YYYY-MM-DD&format=json
```

Exports are date-bounded and capped to keep Firestore reads predictable.

## Product Image Matching

Local source images should be placed in the gitignored directory:

```text
images_import/
```

Generated artifacts are written to:

```text
artifacts/
```

### Recommended Workflow

#### 1. Backfill image-matching fields

```bash
pnpm images:backfill:dry --limit=50
pnpm images:backfill
```

#### 2. Index local images

```bash
pnpm images:index -- --folder=images_import/beers --limit=50
pnpm images:index
```

#### 3. Run matching

```bash
pnpm images:match -- --input=artifacts/image-candidates.json --limit=50
```

#### 4. Review matches

Review automatic matches and create an approved file:

```text
artifacts/approved_matches.json
```

The admin image-review workflow may also create:

```text
artifacts/review_approved.json
artifacts/review_decisions.json
```

#### 5. Attach approved images

Start with a dry run:

```bash
pnpm images:attach:dry -- --input=artifacts/review_approved.json --limit=20
```

Attach approved images:

```bash
pnpm images:attach -- --input=artifacts/review_approved.json
```

Overwrite existing images only when intentionally required:

```bash
pnpm images:attach -- --input=artifacts/review_approved.json --overwrite
```

### Image Rollout Safety

Before attaching images:

- manually review a sample of automatic matches
- review low-confidence cases
- confirm the Firebase Storage bucket
- use dry-run mode first
- avoid `--overwrite` unless the existing image should be replaced

## Testing

Before opening a pull request or deploying, verify:

```bash
pnpm lint
pnpm build
```

Also test:

- sign-in and sign-out
- product search and filtering
- cart updates
- out-of-stock behavior
- pickup and delivery checkout
- delivery-distance validation
- Stripe test payments
- Stripe webhook confirmation
- admin access control
- order exports
- order-alert emails
- product image review and attachment

## Deployment

The application is deployed on Vercel.

Production secrets should be stored in the deployment platform's environment-variable settings and must never be committed to GitHub.

Before deployment:

1. run linting
2. create a production build
3. verify environment variables
4. test Stripe webhooks
5. verify Firebase security rules
6. confirm admin routes require authorization

## Security Notes

- Never commit API keys, passwords, service-account files, or webhook secrets.
- Keep private integration credentials on the server.
- Verify Stripe webhook signatures before updating orders.
- Require authentication and authorization for admin routes.
- Do not expose customer data in logs.
- Review Git history for previously committed secrets.
- Rotate any credential that may have been exposed.

## Screenshots

![Storefront](docs/screenshots/storefront.png)

![Product Catalog](docs/screenshots/product-catalog.png)

![Checkout](docs/screenshots/checkout.png)

![Admin Dashboard](docs/screenshots/admin-dashboard.png)

Screenshots should be sanitized before public sharing. Do not include customer names, addresses, phone numbers, email addresses, order IDs, payment data, or private store operations data.

## Current Limitations

- Some integrations require paid third-party services.
- Real phone-number authentication requires Firebase billing.
- Product and inventory accuracy depends on the latest available store data.
- Delivery availability depends on the configured store location and delivery radius.

## Future Improvements

- stronger automated test coverage
- improved inventory synchronization
- better product recommendations
- more detailed operational dashboards
- expanded accessibility testing
- improved mobile checkout performance

## Repository Notes

This repository contains the application source code. Production credentials, customer data, private operational files, and local image-import folders are excluded from version control.

## License

This project was developed for a real business. Do not copy, redistribute, or reuse the source code without permission from the repository owner and the business owner.

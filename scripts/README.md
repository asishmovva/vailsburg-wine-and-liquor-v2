# Seed products from CSV

This script imports products from `scripts/data/CategorizedItemList.csv` into Firestore.
The CSV is used only for seeding and is not used at runtime.

## Requirements

Ensure the Firebase Admin env vars are set (the script auto-loads `.env.local` if present):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_DATABASE_ID` (optional, defaults to `(default)`)

## Commands

Dry run (no writes, prints counts + sample rows):

```bash
pnpm ts-node scripts/seedProductsFromCsv.ts --dry-run
```

Limit to 50 rows (useful for testing):

```bash
pnpm ts-node scripts/seedProductsFromCsv.ts --limit=50
```

Full import:

```bash
pnpm ts-node scripts/seedProductsFromCsv.ts
```

## Backfill nameLower (prefix search)

If products already exist without `nameLower`, run the backfill:

```bash
pnpm ts-node scripts/backfillNameLower.ts --dry-run
```

```bash
pnpm ts-node scripts/backfillNameLower.ts
```

import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";

type Args = {
  dryRun: boolean;
  limit?: number;
};

function loadEnvFromFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
    process.env[key] = value;
  }
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  let limit: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--limit") {
      const next = args[i + 1];
      if (next) {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isNaN(parsed)) limit = parsed;
      }
    } else if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.split("=")[1], 10);
      if (!Number.isNaN(parsed)) limit = parsed;
    }
  }

  return { dryRun, limit };
}

function getDatabaseId() {
  const raw = process.env.FIREBASE_DATABASE_ID;
  const normalized = raw?.trim();
  if (!normalized || normalized === "default" || normalized === "(default)") {
    return "default";
  }
  return normalized;
}

let adminApp: App | null = getApps().length ? getApps()[0] : null;

function getAdminApp() {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.");
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

async function main() {
  loadEnvFromFile(".env.local");

  const { dryRun, limit } = parseArgs();
  const db = getFirestore(getAdminApp(), getDatabaseId());
  const collection = db.collection("products");

  let updated = 0;
  let skipped = 0;
  let processed = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query: FirebaseFirestore.Query = collection
      .orderBy(FieldPath.documentId())
      .limit(500);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    if (typeof limit === "number") {
      query = query.limit(Math.min(500, Math.max(limit - processed, 0)));
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchWrites = 0;

    for (const doc of snapshot.docs) {
      processed += 1;

      if (typeof limit === "number" && processed > limit) break;

      const data = doc.data() as { name?: string; nameLower?: string };
      if (!data.name) {
        skipped += 1;
        continue;
      }

      const nameLower = data.name.toLowerCase();
      if (data.nameLower === nameLower) {
        skipped += 1;
        continue;
      }

      updated += 1;
      if (!dryRun) {
        batch.update(doc.ref, {
          nameLower,
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchWrites += 1;
      }
    }

    if (!dryRun && batchWrites > 0) {
      await batch.commit();
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];

    if (typeof limit === "number" && processed >= limit) break;
  }

  console.log("Backfill summary:");
  console.log({ processed, updated, skipped, dryRun });
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

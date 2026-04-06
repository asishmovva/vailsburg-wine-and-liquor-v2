import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { loadEnvFromFile } from "./lib/env";
import { getFirestoreDb } from "./lib/firebaseAdmin";
import { parseCommonArgs, printSummary } from "./lib/imageImport";
import { buildNormalizedProductImageFields } from "./lib/imageMatchingNormalize";

type ProductDoc = {
  name?: string;
  size?: string;
  pack?: string;
  category?: string;
  nameNormalized?: string;
  sizeNormalized?: string;
  packNormalized?: string;
  categoryNormalized?: string;
  matchTokens?: string[];
};

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit } = parseCommonArgs();
  const db = getFirestoreDb();

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection("products")
      .orderBy(FieldPath.documentId())
      .limit(400);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    if (typeof limit === "number") {
      query = query.limit(Math.min(400, Math.max(limit - processed, 0)));
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchWrites = 0;

    for (const doc of snapshot.docs) {
      if (typeof limit === "number" && processed >= limit) break;

      processed += 1;

      try {
        const data = doc.data() as ProductDoc;
        const normalized = buildNormalizedProductImageFields({
          name: data.name,
          size: data.size,
          pack: data.pack,
          category: data.category,
        });

        const isUnchanged =
          data.nameNormalized === normalized.nameNormalized &&
          data.sizeNormalized === normalized.sizeNormalized &&
          data.packNormalized === normalized.packNormalized &&
          data.categoryNormalized === normalized.categoryNormalized &&
          JSON.stringify(data.matchTokens ?? []) ===
            JSON.stringify(normalized.matchTokens);

        if (isUnchanged) {
          skipped += 1;
          continue;
        }

        updated += 1;
        if (!dryRun) {
          batch.set(
            doc.ref,
            {
              ...normalized,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          batchWrites += 1;
        }
      } catch (error) {
        errors += 1;
        console.error("Failed to normalize product:", {
          productId: doc.id,
          error: (error as Error).message,
        });
      }
    }

    if (!dryRun && batchWrites > 0) {
      await batch.commit();
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;

    if (typeof limit === "number" && processed >= limit) break;
  }

  printSummary("Image match field backfill summary", {
    processed,
    updated,
    skipped,
    errors,
    dryRun,
  });
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

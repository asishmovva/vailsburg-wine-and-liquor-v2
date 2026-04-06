import { FieldPath } from "firebase-admin/firestore";
import {
  buildNormalizedProductImageFields,
  normalizeCategoryForImageMatch,
} from "./lib/imageMatchingNormalize";
import { loadEnvFromFile } from "./lib/env";
import { getFirestoreDb } from "./lib/firebaseAdmin";
import {
  parseCommonArgs,
  printSummary,
  readJsonFile,
  writeArtifactFile,
} from "./lib/imageImport";
import {
  classifyScoredMatches,
  scoreImageCandidate,
} from "./lib/imageMatchingScore";
import type {
  IndexedImageCandidate,
  MatchOutputRecord,
  ProductImageMatchTarget,
} from "./lib/imageMatchingTypes";

type ProductDoc = {
  name?: string;
  size?: string;
  pack?: string;
  category?: string;
  isSellableOnline?: boolean;
  image?: string;
  primaryImageUrl?: string;
  nameNormalized?: string;
  sizeNormalized?: string;
  packNormalized?: string;
  categoryNormalized?: string;
  matchTokens?: string[];
};

async function loadSellableProducts(limit?: number) {
  const db = getFirestoreDb();
  const products: ProductImageMatchTarget[] = [];
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query: FirebaseFirestore.Query = db
      .collection("products")
      .where("isSellableOnline", "==", true)
      .orderBy(FieldPath.documentId())
      .limit(400);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    if (typeof limit === "number") {
      query = query.limit(Math.min(400, Math.max(limit - products.length, 0)));
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      const data = doc.data() as ProductDoc;
      const normalized = {
        nameNormalized: data.nameNormalized,
        sizeNormalized: data.sizeNormalized,
        packNormalized: data.packNormalized,
        categoryNormalized: data.categoryNormalized,
        matchTokens: data.matchTokens,
      };

      const fallback = buildNormalizedProductImageFields({
        name: data.name,
        size: data.size,
        pack: data.pack,
        category: data.category,
      });

      products.push({
        id: doc.id,
        name: data.name ?? "Unnamed item",
        category: data.category ?? "",
        size: data.size ?? "",
        pack: data.pack ?? "",
        isSellableOnline: data.isSellableOnline === true,
        image: data.image ?? "",
        primaryImageUrl: data.primaryImageUrl ?? "",
        nameNormalized: normalized.nameNormalized ?? fallback.nameNormalized,
        sizeNormalized: normalized.sizeNormalized ?? fallback.sizeNormalized,
        packNormalized: normalized.packNormalized ?? fallback.packNormalized,
        categoryNormalized:
          normalized.categoryNormalized ??
          normalizeCategoryForImageMatch(data.category),
        matchTokens: normalized.matchTokens ?? fallback.matchTokens,
      });
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (typeof limit === "number" && products.length >= limit) {
      break;
    }
  }

  return products;
}

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit, input } = parseCommonArgs();

  const candidates = readJsonFile<IndexedImageCandidate[]>(
    input ?? "artifacts/image-candidates.json"
  );
  const targetCandidates =
    typeof limit === "number" ? candidates.slice(0, limit) : candidates;
  const products = await loadSellableProducts();

  const productsByCategory = new Map<string, ProductImageMatchTarget[]>();
  for (const product of products) {
    const list = productsByCategory.get(product.categoryNormalized) ?? [];
    list.push(product);
    productsByCategory.set(product.categoryNormalized, list);
  }

  const matchedAuto: MatchOutputRecord[] = [];
  const needsReview: MatchOutputRecord[] = [];
  const unmatched: MatchOutputRecord[] = [];

  for (const image of targetCandidates) {
    const candidateProducts = productsByCategory.get(image.categoryNormalized) ?? [];
    const scored = candidateProducts.map((product) =>
      scoreImageCandidate(image, product)
    );
    const result = classifyScoredMatches(scored);

    const record: MatchOutputRecord = {
      ...image,
      decision: result.decision,
      chosenProductId: result.best?.productId ?? null,
      chosenProductName: result.best?.productName ?? null,
      score: result.best?.score ?? 0,
      margin: result.margin,
      whyMatched: result.best?.reasons ?? ["no viable candidates"],
      topCandidates: result.topCandidates,
    };

    if (result.decision === "auto-match") {
      matchedAuto.push(record);
    } else if (result.decision === "needs-review") {
      needsReview.push(record);
    } else {
      unmatched.push(record);
    }
  }

  const matchedAutoPath = writeArtifactFile("matched_auto.json", matchedAuto);
  const needsReviewPath = writeArtifactFile("needs_review.json", needsReview);
  const unmatchedPath = writeArtifactFile("unmatched.json", unmatched);

  printSummary("Image matching summary", {
    processed: targetCandidates.length,
    matched_auto: matchedAuto.length,
    needs_review: needsReview.length,
    unmatched: unmatched.length,
    dryRun,
    matchedAutoPath,
    needsReviewPath,
    unmatchedPath,
  });
}

main().catch((error) => {
  console.error("Image matching failed:", error);
  process.exit(1);
});

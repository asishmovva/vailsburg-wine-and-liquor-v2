import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import type { MatchOutputRecord } from "./lib/imageMatchingTypes";
import { loadEnvFromFile } from "./lib/env";
import { getFirestoreDb, getStorageBucket } from "./lib/firebaseAdmin";
import { parseCommonArgs, printSummary, readJsonFile } from "./lib/imageImport";

type ProductImageDoc = {
  primaryImageUrl?: string;
  image?: string;
};

function buildDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit, input, overwrite } = parseCommonArgs();
  const db = getFirestoreDb();
  const bucket = getStorageBucket();

  const approved = readJsonFile<MatchOutputRecord[]>(
    input ?? "artifacts/matched_auto.json"
  );

  const targetRecords = approved
    .filter((record) => Boolean(record.chosenProductId))
    .slice(0, limit);

  let processed = 0;
  let uploaded = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const record of targetRecords) {
    processed += 1;
    const productId = record.chosenProductId;
    if (!productId) continue;

    try {
      const productRef = db.collection("products").doc(productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) {
        errors += 1;
        console.error("Missing product for approved image:", {
          productId,
          sourceFilePath: record.sourceFilePath,
        });
        continue;
      }

      const productData = productSnap.data() as ProductImageDoc;
      const hasExistingImage = Boolean(
        (productData.primaryImageUrl && productData.primaryImageUrl.trim()) ||
          (productData.image && productData.image.trim())
      );

      if (hasExistingImage && !overwrite) {
        skippedExisting += 1;
        continue;
      }

      const absoluteSourcePath = path.resolve(process.cwd(), record.sourceFilePath);
      const sourceBuffer = fs.readFileSync(absoluteSourcePath);
      const webpBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();

      const storagePath = `products/${productId}/primary.webp`;
      const downloadToken = randomUUID();
      const file = bucket.file(storagePath);
      const publicUrl = buildDownloadUrl(bucket.name, storagePath, downloadToken);

      if (!dryRun) {
        await file.save(webpBuffer, {
          contentType: "image/webp",
          resumable: false,
          metadata: {
            cacheControl: "public,max-age=31536000,immutable",
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              sourceFileName: record.sourceFileName,
            },
          },
        });

        await productRef.set(
          {
            primaryImageUrl: publicUrl,
            imageSource: "folder_import_v1",
            imageMatchedBy: "scored_match",
            imageConfidence: record.score,
            imageOriginalFileName: record.sourceFileName,
            imageImportedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      uploaded += 1;
    } catch (error) {
      errors += 1;
      console.error("Failed to attach image:", {
        productId,
        sourceFilePath: record.sourceFilePath,
        error: (error as Error).message,
      });
    }
  }

  printSummary("Approved image attach summary", {
    processed,
    uploaded,
    skipped_existing: skippedExisting,
    errors,
    dryRun,
    overwrite,
  });
}

main().catch((error) => {
  console.error("Image attach failed:", error);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import type { MatchOutputRecord } from "./lib/imageMatchingTypes";
import { loadEnvFromFile } from "./lib/env";
import { getFirestoreDb, getStorageBucket } from "./lib/firebaseAdmin";
import {
  parseCommonArgs,
  printSummary,
  readJsonFile,
  writeArtifactFile,
} from "./lib/imageImport";

type ProductImageDoc = {
  name?: string;
  primaryImageUrl?: string;
  image?: string;
};

type ManualReviewRecord = {
  productId: string;
  imagePath: string;
  confidence?: number;
  source?: string;
};

type ApprovedAttachRecord = MatchOutputRecord | ManualReviewRecord;

type AttachResult = {
  productId: string | null;
  productName: string | null;
  imageFilePath: string;
  storagePath: string | null;
  matchMethod: "scored_match" | "manual_review";
  confidence: number;
  result:
    | "uploaded"
    | "skipped_existing"
    | "skipped_missing_file"
    | "skipped_unapproved"
    | "error";
  reason?: string;
};

function buildDownloadUrl(bucketName: string, filePath: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    filePath
  )}?alt=media&token=${token}`;
}

function isManualReviewRecord(record: ApprovedAttachRecord): record is ManualReviewRecord {
  return "imagePath" in record;
}

function getProductId(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record) ? record.productId : record.chosenProductId;
}

function getImageFilePath(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record) ? record.imagePath : record.sourceFilePath;
}

function getImageFileName(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record)
    ? path.basename(record.imagePath)
    : record.sourceFileName;
}

function getMatchMethod(record: ApprovedAttachRecord): AttachResult["matchMethod"] {
  if (isManualReviewRecord(record)) return "manual_review";
  return record.decision === "needs-review" ? "manual_review" : "scored_match";
}

function getConfidence(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record) ? record.confidence ?? 0 : record.score;
}

function getProductName(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record) ? null : record.chosenProductName;
}

function getImportCategory(record: ApprovedAttachRecord) {
  return isManualReviewRecord(record) ? undefined : record.categoryNormalized;
}

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit, input, overwrite } = parseCommonArgs();
  const db = getFirestoreDb();
  const bucket = getStorageBucket();

  const approved = readJsonFile<ApprovedAttachRecord[]>(
    input ?? "artifacts/approved_matches.json"
  );

  const targetRecords = approved
    .filter((record) => Boolean(getProductId(record)))
    .slice(0, limit);

  let processed = 0;
  let uploaded = 0;
  let skippedExisting = 0;
  let skippedMissingFile = 0;
  let skippedUnapproved = 0;
  let errors = 0;
  const results: AttachResult[] = [];

  for (const record of targetRecords) {
    processed += 1;
    const productId = getProductId(record);
    const matchMethod = getMatchMethod(record);
    const confidence = getConfidence(record);
    const imageFilePath = getImageFilePath(record);
    const imageFileName = getImageFileName(record);

    if (!productId) {
      skippedUnapproved += 1;
      results.push({
        productId: null,
        productName: getProductName(record),
        imageFilePath,
        storagePath: null,
        matchMethod,
        confidence,
        result: "skipped_unapproved",
        reason: "Missing productId in approved input.",
      });
      continue;
    }

    const storagePath = `products/${productId}/primary.webp`;

    try {
      const productRef = db.collection("products").doc(productId);
      const productSnap = await productRef.get();
      if (!productSnap.exists) {
        errors += 1;
        results.push({
          productId,
          productName: getProductName(record),
          imageFilePath,
          storagePath,
          matchMethod,
          confidence,
          result: "error",
          reason: "Product doc missing.",
        });
        console.error("Missing product for approved image:", {
          productId,
          sourceFilePath: imageFilePath,
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
        results.push({
          productId,
          productName: productData.name ?? getProductName(record),
          imageFilePath,
          storagePath,
          matchMethod,
          confidence,
          result: "skipped_existing",
          reason: "Existing image present and overwrite not enabled.",
        });
        continue;
      }

      const absoluteSourcePath = path.resolve(process.cwd(), imageFilePath);
      if (!fs.existsSync(absoluteSourcePath)) {
        skippedMissingFile += 1;
        results.push({
          productId,
          productName: productData.name ?? getProductName(record),
          imageFilePath,
          storagePath,
          matchMethod,
          confidence,
          result: "skipped_missing_file",
          reason: "Source file missing on disk.",
        });
        continue;
      }

      const sourceBuffer = fs.readFileSync(absoluteSourcePath);
      const webpBuffer = await sharp(sourceBuffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();

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
              sourceFileName: imageFileName,
            },
          },
        });

        await productRef.set(
          {
            primaryImageUrl: publicUrl,
            imageSource: "folder_import_v1",
            imageMatchedBy: matchMethod,
            imageConfidence: confidence,
            imageOriginalFileName: imageFileName,
            imageImportCategory: getImportCategory(record),
            imageSourcePath: imageFilePath,
            imageImportedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      uploaded += 1;
      results.push({
        productId,
        productName: productData.name ?? getProductName(record),
        imageFilePath,
        storagePath,
        matchMethod,
        confidence,
        result: "uploaded",
      });
    } catch (error) {
      errors += 1;
      results.push({
        productId,
        productName: getProductName(record),
        imageFilePath,
        storagePath,
        matchMethod,
        confidence,
        result: "error",
        reason: (error as Error).message,
      });
      console.error("Failed to attach image:", {
        productId,
        sourceFilePath: imageFilePath,
        error: (error as Error).message,
      });
    }
  }

  const summary = {
    processed,
    uploaded,
    skipped_existing: skippedExisting,
    skipped_missing_file: skippedMissingFile,
    skipped_unapproved: skippedUnapproved,
    errors,
    dryRun,
    overwrite,
  };

  writeArtifactFile("attach-summary.json", summary);
  writeArtifactFile("attach-results.json", results);
  printSummary("Approved image attach summary", summary);
}

main().catch((error) => {
  console.error("Image attach failed:", error);
  process.exit(1);
});

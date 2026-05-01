import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { logError } from "../src/lib/ops/logError";
import { logEvent } from "../src/lib/ops/logEvent";
import type { MatchOutputRecord } from "./lib/imageMatchingTypes";
import { loadEnvFromFile } from "./lib/env";
import { getFirestoreDb, getStorageBucket } from "./lib/firebaseAdmin";
import {
  beginScriptRun,
  parseCommonArgs,
  printSummary,
  readJsonFile,
  writeScriptRunSummary,
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

function resolveDefaultInputPath(explicitInput?: string) {
  if (explicitInput) return explicitInput;
  const reviewApproved = path.resolve(process.cwd(), "artifacts", "review_approved.json");
  if (fs.existsSync(reviewApproved)) {
    return "artifacts/review_approved.json";
  }
  return "artifacts/approved_matches.json";
}

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit, input, overwrite } = parseCommonArgs();
  const defaultInput = resolveDefaultInputPath(input);
  const runContext = beginScriptRun("scripts/attachApprovedImages.ts", {
    dryRun,
    limit: limit ?? null,
    input: defaultInput,
    overwrite,
  });

  let summaryPath = "";
  let resultsPath = "";
  let summaryForRun: Record<string, unknown> = {
    dryRun,
    overwrite,
    input: defaultInput,
  };

  await logEvent({
    source: "scripts/attachApprovedImages",
    eventType: "IMAGE_ATTACH_RUN_STARTED",
    severity: "info",
    message: "Approved image attach run started.",
    details: {
      dryRun,
      limit: limit ?? null,
      input: defaultInput,
      overwrite,
    },
  });

  const db = getFirestoreDb();
  const bucket = getStorageBucket();

  try {
    const approved = readJsonFile<ApprovedAttachRecord[]>(
      defaultInput
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
          await logEvent({
            source: "scripts/attachApprovedImages",
            eventType: "IMAGE_ATTACH_PRODUCT_MISSING",
            severity: "warning",
            message: "Product doc missing for approved image attach.",
            orderId: productId,
            details: {
              sourceFilePath: imageFilePath,
            },
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
        await logError({
          source: "scripts/attachApprovedImages",
          eventType: "IMAGE_ATTACH_FAILURE",
          severity: "error",
          message: "Failed to attach approved image.",
          error,
          orderId: productId,
          details: {
            sourceFilePath: imageFilePath,
          },
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
      input: defaultInput,
    };
    summaryForRun = summary;

    summaryPath = writeArtifactFile("attach-summary.json", summary);
    resultsPath = writeArtifactFile("attach-results.json", results);
    const runSummaryPath = writeScriptRunSummary(runContext, {
      status: "success",
      summary,
      artifacts: [
        { label: "attach_summary", path: summaryPath, records: 1 },
        { label: "attach_results", path: resultsPath, records: results.length },
      ],
    });
    printSummary("Approved image attach summary", summary);
    console.log("Run summary:", runSummaryPath);

    await logEvent({
      source: "scripts/attachApprovedImages",
      eventType: errors > 0 ? "IMAGE_ATTACH_FAILURE" : "IMAGE_ATTACH_RUN_COMPLETED",
      severity: errors > 0 ? "error" : "info",
      message:
        errors > 0
          ? "Approved image attach run completed with errors."
          : "Approved image attach run completed successfully.",
      details: summary,
      persist: errors > 0,
    });
  } catch (error) {
    const runSummaryPath = writeScriptRunSummary(runContext, {
      status: "failure",
      summary: summaryForRun,
      artifacts: [
        ...(summaryPath ? [{ label: "attach_summary", path: summaryPath }] : []),
        ...(resultsPath ? [{ label: "attach_results", path: resultsPath }] : []),
      ],
      error,
    });
    console.error("Image attach failed:", error);
    console.error("Run summary written to:", runSummaryPath);
    throw error;
  }
}

main().catch((error) => {
  void logError({
    source: "scripts/attachApprovedImages",
    eventType: "IMAGE_ATTACH_FAILURE",
    severity: "critical",
    message: "Approved image attach script crashed.",
    error,
    persist: true,
  });
  process.exit(1);
});

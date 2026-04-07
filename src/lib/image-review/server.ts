import "server-only";

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { adminDb } from "@/lib/firebaseAdmin";
import type {
  ImageReviewCandidate,
  ImageReviewItem,
  ReviewApprovedRecord,
} from "@/lib/image-review/types";

type RawReviewCandidate = {
  productId: string;
  productName: string;
  score: number;
  reasons: string[];
};

type RawReviewRecord = {
  sourceFilePath: string;
  sourceFileName: string;
  categoryNormalized?: string;
  nameNormalized?: string;
  score: number;
  chosenProductId: string | null;
  chosenProductName: string | null;
  topCandidates: RawReviewCandidate[];
};

type ProductMeta = {
  name?: string;
  size?: string;
  pack?: string;
};

const NEEDS_REVIEW_PATH = path.resolve(process.cwd(), "artifacts", "needs_review.json");
const REVIEW_APPROVED_PATH = path.resolve(
  process.cwd(),
  "artifacts",
  "review_approved.json"
);
const previewCache = new Map<string, string | null>();

function readJsonFile<T>(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content) as T;
}

function ensureArtifactsDir() {
  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  return artifactsDir;
}

function resolveImagePath(sourceFilePath: string) {
  return path.resolve(process.cwd(), sourceFilePath);
}

async function buildPreviewDataUrl(sourceFilePath: string) {
  const absolutePath = resolveImagePath(sourceFilePath);
  if (previewCache.has(absolutePath)) {
    return previewCache.get(absolutePath) ?? null;
  }

  if (!fs.existsSync(absolutePath)) {
    previewCache.set(absolutePath, null);
    return null;
  }

  try {
    const buffer = await sharp(absolutePath)
      .rotate()
      .resize({ width: 240, height: 240, fit: "contain", background: "#ffffff" })
      .webp({ quality: 76 })
      .toBuffer();
    const previewSrc = `data:image/webp;base64,${buffer.toString("base64")}`;
    previewCache.set(absolutePath, previewSrc);
    return previewSrc;
  } catch {
    previewCache.set(absolutePath, null);
    return null;
  }
}

async function loadProductMeta(productIds: string[]) {
  if (!productIds.length) return new Map<string, ProductMeta>();

  const db = adminDb();
  const refs = productIds.map((productId) => db.collection("products").doc(productId));
  const snapshots = await db.getAll(...refs);
  const meta = new Map<string, ProductMeta>();

  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const data = snapshot.data() as ProductMeta;
    meta.set(snapshot.id, {
      name: data.name,
      size: data.size,
      pack: data.pack,
    });
  }

  return meta;
}

export function readNeedsReviewRecords() {
  const categoriesDir = path.resolve(process.cwd(), "artifacts", "categories");
  if (fs.existsSync(categoriesDir)) {
    const aggregated = fs
      .readdirSync(categoriesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const categoryPath = path.join(categoriesDir, entry.name, "needs_review.json");
        if (!fs.existsSync(categoryPath)) return [] as RawReviewRecord[];
        return readJsonFile<RawReviewRecord[]>(categoryPath);
      });

    if (aggregated.length) {
      return aggregated;
    }
  }

  if (!fs.existsSync(NEEDS_REVIEW_PATH)) {
    return [] as RawReviewRecord[];
  }

  return readJsonFile<RawReviewRecord[]>(NEEDS_REVIEW_PATH);
}

export async function buildReviewPageData({
  page,
  pageSize,
  category,
  search,
  minScore,
  maxScore,
}: {
  page: number;
  pageSize: number;
  category: string;
  search: string;
  minScore: number | null;
  maxScore: number | null;
}) {
  const allRecords = readNeedsReviewRecords();
  const categories = Array.from(
    new Set(
      allRecords
        .map((record) => record.categoryNormalized?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = allRecords.filter((record) => {
    const recordCategory = record.categoryNormalized ?? "";
    if (category && recordCategory !== category) return false;
    if (minScore !== null && record.score < minScore) return false;
    if (maxScore !== null && record.score > maxScore) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      record.sourceFileName,
      record.nameNormalized,
      record.chosenProductName,
      ...record.topCandidates.map((candidate) => candidate.productName),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const candidateIds = Array.from(
    new Set(
      pageItems.flatMap((record) =>
        record.topCandidates
          .map((candidate) => candidate.productId)
          .filter((productId): productId is string => Boolean(productId))
      )
    )
  );

  const [productMeta, previews] = await Promise.all([
    loadProductMeta(candidateIds),
    Promise.all(pageItems.map((record) => buildPreviewDataUrl(record.sourceFilePath))),
  ]);

  const items: ImageReviewItem[] = pageItems.map((record, index) => {
    const topCandidates: ImageReviewCandidate[] = record.topCandidates.map((candidate) => {
      const meta = productMeta.get(candidate.productId);
      return {
        productId: candidate.productId,
        productName: meta?.name ?? candidate.productName,
        size: meta?.size,
        pack: meta?.pack,
        score: candidate.score,
        reasons: candidate.reasons,
      };
    });

    const proposed = topCandidates[0];

    return {
      id: `${record.sourceFilePath}::${record.chosenProductId ?? "none"}`,
      sourceFilePath: record.sourceFilePath,
      sourceFileName: record.sourceFileName,
      previewSrc: previews[index] ?? null,
      parsedName: record.nameNormalized ?? "",
      category: record.categoryNormalized ?? "",
      score: record.score,
      proposedProductId: record.chosenProductId,
      proposedProductName: proposed?.productName ?? record.chosenProductName,
      proposedSize: proposed?.size,
      proposedPack: proposed?.pack,
      topCandidates,
    };
  });

  return {
    items,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    filters: {
      categories,
      category,
      search,
      minScore,
      maxScore,
    },
  };
}

export function writeReviewedMatches(approved: ReviewApprovedRecord[]) {
  ensureArtifactsDir();
  fs.writeFileSync(REVIEW_APPROVED_PATH, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
  return REVIEW_APPROVED_PATH;
}

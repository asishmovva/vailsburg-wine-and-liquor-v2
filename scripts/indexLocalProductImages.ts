import fs from "fs";
import path from "path";
import {
  ensureArtifactsDir,
  parseCommonArgs,
  printSummary,
  resolveImageImportBaseDir,
  writeArtifactFile,
} from "./lib/imageImport";
import {
  indexImageCandidateFromPath,
  isSupportedImageMatchCategory,
} from "./lib/imageMatchingNormalize";
import type { IndexedImageCandidate } from "./lib/imageMatchingTypes";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
]);

function walkFiles(rootDir: string) {
  const files: string[] = [];

  function visit(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const resolved = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(resolved);
      } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(resolved);
      }
    }
  }

  visit(rootDir);
  return files;
}

function getTopLevelCategory(baseDir: string, filePath: string) {
  const relative = path.relative(baseDir, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length <= 1) {
    return path.basename(baseDir);
  }
  return parts[0] ?? "";
}

async function main() {
  const { dryRun, limit, folder } = parseCommonArgs();
  const baseDir = resolveImageImportBaseDir(folder);

  if (!fs.existsSync(baseDir)) {
    throw new Error(`Image import folder not found: ${baseDir}`);
  }

  ensureArtifactsDir();

  const files = walkFiles(baseDir);
  const targetFiles =
    typeof limit === "number" ? files.slice(0, limit) : files;

  const indexed: IndexedImageCandidate[] = [];
  let processed = 0;
  let errors = 0;
  let skippedUnsupported = 0;

  for (const filePath of targetFiles) {
    processed += 1;
    try {
      const sourceFileName = path.basename(filePath);
      const sourceCategory = getTopLevelCategory(baseDir, filePath);
      if (!isSupportedImageMatchCategory(sourceCategory)) {
        skippedUnsupported += 1;
        continue;
      }

      indexed.push(
        indexImageCandidateFromPath({
          sourceFilePath: path
            .relative(process.cwd(), filePath)
            .split(path.sep)
            .join("/"),
          sourceFileName,
          sourceCategory,
        })
      );
    } catch (error) {
      errors += 1;
      console.error("Failed to index image:", {
        filePath,
        error: (error as Error).message,
      });
    }
  }

  const artifactPath = writeArtifactFile("image-candidates.json", indexed);

  printSummary("Local image indexing summary", {
    processed,
    indexed: indexed.length,
    skipped_unsupported: skippedUnsupported,
    errors,
    dryRun,
    artifactPath,
  });
}

main().catch((error) => {
  console.error("Image indexing failed:", error);
  process.exit(1);
});

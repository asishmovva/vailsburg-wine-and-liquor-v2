import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const IMAGE_IMPORT_CANDIDATES = ["images_import", "image-import"];

export type CommonArgs = {
  dryRun: boolean;
  limit?: number;
  input?: string;
  folder?: string;
  overwrite: boolean;
};

export function parseCommonArgs(argv = process.argv.slice(2)): CommonArgs {
  const getStringFlag = (name: string) => {
    const direct = argv.find((arg) => arg.startsWith(`${name}=`));
    if (direct) return direct.slice(name.length + 1);

    const index = argv.findIndex((arg) => arg === name);
    if (index >= 0 && argv[index + 1]) {
      return argv[index + 1];
    }

    return undefined;
  };

  const parseNumberFlag = (name: string) => {
    const raw = getStringFlag(name);
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    dryRun: argv.includes("--dry-run"),
    limit: parseNumberFlag("--limit"),
    input: getStringFlag("--input"),
    folder: getStringFlag("--folder"),
    overwrite: argv.includes("--overwrite"),
  };
}

export function resolveImageImportBaseDir(explicitFolder?: string) {
  if (explicitFolder) {
    return path.resolve(process.cwd(), explicitFolder);
  }

  for (const candidate of IMAGE_IMPORT_CANDIDATES) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(process.cwd(), IMAGE_IMPORT_CANDIDATES[0]);
}

export function ensureArtifactsDir() {
  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  return artifactsDir;
}

export function writeArtifactFile<T>(fileName: string, payload: T) {
  const artifactsDir = ensureArtifactsDir();
  const targetPath = path.join(artifactsDir, fileName);
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}

export function readJsonFile<T>(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(content) as T;
}

export function printSummary(title: string, summary: Record<string, unknown>) {
  console.log(title);
  console.table(summary);
}

export type ScriptRunContext = {
  runId: string;
  scriptName: string;
  startedAt: string;
  startedAtMs: number;
  args: Record<string, unknown>;
};

export type ScriptRunArtifact = {
  label: string;
  path: string;
  records?: number;
};

export function beginScriptRun(
  scriptName: string,
  args: Record<string, unknown>
): ScriptRunContext {
  return {
    runId: randomUUID(),
    scriptName,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    args,
  };
}

function toErrorInfo(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? null,
      name: error.name,
    };
  }

  return {
    message: String(error),
    stack: null,
    name: "UnknownError",
  };
}

export function writeScriptRunSummary(
  context: ScriptRunContext,
  input: {
    status: "success" | "failure";
    summary: Record<string, unknown>;
    artifacts?: ScriptRunArtifact[];
    error?: unknown;
  }
) {
  const artifactsDir = ensureArtifactsDir();
  const scriptSlug = context.scriptName
    .replace(/^scripts\//, "")
    .replace(/\.ts$/, "")
    .replace(/[\\/]/g, "-");
  const runDir = path.join(artifactsDir, "script-runs", scriptSlug);
  fs.mkdirSync(runDir, { recursive: true });

  const endedAtMs = Date.now();
  const payload = {
    version: 1,
    runId: context.runId,
    script: context.scriptName,
    status: input.status,
    startedAt: context.startedAt,
    endedAt: new Date(endedAtMs).toISOString(),
    durationMs: Math.max(0, endedAtMs - context.startedAtMs),
    args: context.args,
    summary: input.summary,
    artifacts: input.artifacts ?? [],
    error: input.error ? toErrorInfo(input.error) : null,
  };

  const targetPath = path.join(runDir, `${context.runId}.json`);
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return targetPath;
}

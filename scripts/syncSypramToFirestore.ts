import fs from "fs";
import path from "path";

type Args = {
  dryRun: boolean;
  limit?: number;
};

function loadEnvFromFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) return;
    const key = match[1]?.trim();
    if (!key || process.env[key]) return;
    const value = match[2]?.trim();
    if (value === undefined) return;
    process.env[key] = value.replace(/^"|"$/g, "");
  });
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  return {
    dryRun,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}

async function main() {
  loadEnvFromFile(".env.local");
  const { dryRun, limit } = parseArgs();

  const [{ syncSypramToFirestore }, { logEvent }] =
    await Promise.all([
      import("../src/lib/sypram/sync"),
      import("../src/lib/ops/logEvent"),
    ]);

  await logEvent({
    source: "scripts/syncSypramToFirestore",
    eventType: "SYPRAM_SYNC_SCRIPT_START",
    severity: "info",
    message: "Sypram sync script started.",
    details: {
      dryRun,
      limit: limit ?? null,
    },
  });

  const result = await syncSypramToFirestore({
    dryRun,
    limit,
    requestedBy: "script",
  });

  if (!result.ok) {
    console.log("Sypram sync blocked (cooldown).");
    console.log(`Next allowed: ${result.nextAllowedAt}`);
    await logEvent({
      source: "scripts/syncSypramToFirestore",
      eventType: "SYNC_FAILURE",
      severity: "warning",
      message: "Sypram sync script blocked by cooldown.",
      details: {
        nextAllowedAt: result.nextAllowedAt,
        dryRun,
      },
      persist: true,
    });
    return;
  }

  console.log("Sypram sync summary:");
  console.table(result.summary);
  if (result.errors.length) {
    console.log("Errors:");
    result.errors.forEach((err) => console.log(`- ${err}`));
  }

  await logEvent({
    source: "scripts/syncSypramToFirestore",
    eventType:
      result.summary.errors > 0 ? "SYNC_FAILURE" : "SYPRAM_SYNC_SCRIPT_SUCCESS",
    severity: result.summary.errors > 0 ? "error" : "info",
    message:
      result.summary.errors > 0
        ? "Sypram sync script finished with errors."
        : "Sypram sync script finished successfully.",
    details: {
      summary: result.summary,
      errorCount: result.errors.length,
    },
    persist: result.summary.errors > 0,
  });
}

main().catch((error) => {
  console.error("Sypram sync failed:", error);
  import("../src/lib/ops/logError")
    .then(({ logError }) =>
      logError({
        source: "scripts/syncSypramToFirestore",
        eventType: "SYNC_FAILURE",
        severity: "critical",
        message: "Sypram sync script crashed.",
        error,
        persist: true,
      })
    )
    .catch(() => undefined);
  process.exitCode = 1;
});

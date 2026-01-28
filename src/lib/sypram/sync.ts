import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { getSellability, normalizeCategory } from "@/lib/catalog/onlineCatalogRules";
import { fetchSypramItems } from "@/lib/sypram/client";
import { mapItemToProduct, type MappedProduct } from "@/lib/sypram/mapItemToProduct";

const COOLDOWN_MS = 30 * 60 * 1000;
const BATCH_LIMIT = 400;

type SyncCounts = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  blockedCount: number;
  sellableCount: number;
};

type SyncSummary = SyncCounts & {
  runId: string;
  dryRun: boolean;
  durationMs: number;
  blockedByCategory: Record<string, number>;
};

type SyncState = {
  lastRunAt?: FirebaseFirestore.Timestamp | null;
  lastStatus?: string;
  lastSummary?: SyncSummary | null;
};

type SyncOptions = {
  dryRun?: boolean;
  limit?: number;
  requestedBy?: string;
};

type SyncResult =
  | {
      ok: false;
      cooldownActive: true;
      nextAllowedAt: string;
      lastRunAt?: string;
      lastStatus?: string;
      lastSummary?: SyncSummary | null;
    }
  | {
      ok: true;
      summary: SyncSummary;
      errors: string[];
    };

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toIso(date?: Date | null) {
  if (!date) return undefined;
  return date.toISOString();
}

function getCooldownInfo(lastRunAt?: Date | null) {
  if (!lastRunAt) return { cooldownActive: false as const };
  const diff = Date.now() - lastRunAt.getTime();
  if (diff >= COOLDOWN_MS) return { cooldownActive: false as const };
  const nextAllowedAt = new Date(lastRunAt.getTime() + COOLDOWN_MS);
  return { cooldownActive: true as const, nextAllowedAt };
}

function normalizeFacetValue(value?: string) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

async function getSyncState() {
  const db = adminDb();
  const stateRef = db.collection("syncState").doc("sypram");
  const snap = await stateRef.get();
  return { ref: stateRef, data: (snap.data() as SyncState) ?? {} };
}

function buildWriteData(product: MappedProduct, isCreate: boolean) {
  const base = {
    ...product.data,
    updatedAt: FieldValue.serverTimestamp(),
  } as Record<string, unknown>;

  if (isCreate) {
    base.createdAt = FieldValue.serverTimestamp();
    base.image = "";
    if (product.data.salePrice) {
      base.salePrice = product.data.salePrice;
    }
    if (product.data.stockNote) {
      base.stockNote = product.data.stockNote;
    }
  } else {
    base.salePrice =
      product.data.salePrice && product.data.salePrice > 0
        ? product.data.salePrice
        : FieldValue.delete();
    base.stockNote = product.data.stockNote
      ? product.data.stockNote
      : FieldValue.delete();
  }

  return base;
}

export async function syncSypramToFirestore(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const db = adminDb();
  const { dryRun = false, limit, requestedBy } = options;
  const startedAt = Date.now();
  const runRef = db.collection("syncLogs").doc();
  const runId = runRef.id;

  const { ref: stateRef, data: state } = await getSyncState();
  const lastRunAt = state.lastRunAt?.toDate?.() ?? null;
  const cooldown = getCooldownInfo(lastRunAt);
  if (cooldown.cooldownActive) {
    return {
      ok: false,
      cooldownActive: true,
      nextAllowedAt: cooldown.nextAllowedAt.toISOString(),
      lastRunAt: toIso(lastRunAt),
      lastStatus: state.lastStatus,
      lastSummary: state.lastSummary ?? null,
    };
  }

  await stateRef.set(
    {
      lastRunAt: FieldValue.serverTimestamp(),
      lastStatus: "running",
      lastSummary: null,
    },
    { merge: true }
  );

  const errors: string[] = [];
  const counts: SyncCounts = {
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    blockedCount: 0,
    sellableCount: 0,
  };
  const blockedByCategory: Record<string, number> = {};
  const facetSizes = new Set<string>();
  const facetPacks = new Set<string>();

  try {
    const items = await fetchSypramItems();
    const targetItems = typeof limit === "number" ? items.slice(0, limit) : items;
    counts.fetched = targetItems.length;

    const mapped = targetItems.map(mapItemToProduct);
    const valid: MappedProduct[] = [];

    mapped.forEach((result) => {
      if (!result.ok) {
        counts.skipped += 1;
        counts.errors += 1;
        if (errors.length < 20) {
          errors.push(result.reason);
        }
        return;
      }
      valid.push(result.product);
    });

    const chunks = chunk(valid, BATCH_LIMIT);

    for (const group of chunks) {
      const docRefs = group.map((product) =>
        db.collection("products").doc(product.id)
      );
      const snaps = docRefs.length ? await db.getAll(...docRefs) : [];

      if (!dryRun) {
        const batch = db.batch();
        snaps.forEach((snap, index) => {
          const product = group[index];
          const isCreate = !snap.exists;
          const data = buildWriteData(product, isCreate);
          const existing = snap.data() as
            | {
                onlineBlockReason?: string;
                isSellableOnline?: boolean;
              }
            | undefined;

          const { key: categoryKey } = normalizeCategory(product.data.category);
          const sellability = getSellability(product.data.category);
          const manualBlock =
            typeof existing?.onlineBlockReason === "string" &&
            existing.onlineBlockReason.startsWith("MANUAL_");

          if (manualBlock) {
            data.isSellableOnline = false;
            data.onlineBlockReason = existing?.onlineBlockReason;
            counts.blockedCount += 1;
            blockedByCategory[categoryKey] =
              (blockedByCategory[categoryKey] ?? 0) + 1;
          } else {
            data.isSellableOnline = sellability.isSellableOnline;
            if (sellability.isSellableOnline) {
              data.onlineBlockReason = FieldValue.delete();
              counts.sellableCount += 1;
              const sizeValue = normalizeFacetValue(product.data.size);
              const packValue = normalizeFacetValue(product.data.pack);
              if (sizeValue) facetSizes.add(sizeValue);
              if (packValue) facetPacks.add(packValue);
            } else {
              data.onlineBlockReason = sellability.onlineBlockReason;
              counts.blockedCount += 1;
              blockedByCategory[categoryKey] =
                (blockedByCategory[categoryKey] ?? 0) + 1;
            }
          }
          batch.set(docRefs[index], data, { merge: true });
          if (isCreate) {
            counts.created += 1;
          } else {
            counts.updated += 1;
          }
        });
        await batch.commit();
      } else {
        snaps.forEach((snap, index) => {
          if (snap.exists) counts.updated += 1;
          else counts.created += 1;
          const product = group[index];
          const { key: categoryKey } = normalizeCategory(product.data.category);
          const sellability = getSellability(product.data.category);
          const existing = snap.data() as
            | {
                onlineBlockReason?: string;
                isSellableOnline?: boolean;
              }
            | undefined;
          const manualBlock =
            typeof existing?.onlineBlockReason === "string" &&
            existing.onlineBlockReason.startsWith("MANUAL_");

          if (manualBlock || !sellability.isSellableOnline) {
            counts.blockedCount += 1;
            blockedByCategory[categoryKey] =
              (blockedByCategory[categoryKey] ?? 0) + 1;
          } else {
            counts.sellableCount += 1;
          }
        });
      }
    }
  } catch (error) {
    counts.errors += 1;
    if (errors.length < 20) {
      errors.push((error as Error).message ?? "Unknown error");
    }
  }

  const summary: SyncSummary = {
    ...counts,
    runId,
    dryRun,
    durationMs: Date.now() - startedAt,
    blockedByCategory,
  };

  const status = counts.errors > 0 ? "failed" : "success";

  await runRef.set({
    source: "sypram",
    runId,
    dryRun,
    status,
    counts,
    blockedByCategory,
    sellableCount: counts.sellableCount,
    errors,
    requestedBy: requestedBy ?? null,
    startedAt: FieldValue.serverTimestamp(),
    finishedAt: FieldValue.serverTimestamp(),
  });

  await stateRef.set(
    {
      lastStatus: status,
      lastSummary: summary,
    },
    { merge: true }
  );

  if (!dryRun) {
    const sizes = Array.from(facetSizes).sort((a, b) => a.localeCompare(b));
    const packs = Array.from(facetPacks).sort((a, b) => a.localeCompare(b));
    await db
      .collection("catalogMeta")
      .doc("shopFacets")
      .set(
        {
          sizes,
          packs,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  return { ok: true, summary, errors };
}

export async function getSypramSyncOverview() {
  const db = adminDb();
  const { data } = await getSyncState();
  const lastRunAt = data.lastRunAt?.toDate?.() ?? null;
  const cooldown = getCooldownInfo(lastRunAt);

  const logsSnap = await db
    .collection("syncLogs")
    .orderBy("finishedAt", "desc")
    .limit(10)
    .get();

  const logs = logsSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter((entry) => entry.data?.source === "sypram")
    .slice(0, 5)
    .map(({ id, data }) => {
      const payload = data as {
        runId?: string;
        status?: string;
        dryRun?: boolean;
        counts?: SyncCounts;
        finishedAt?: FirebaseFirestore.Timestamp | null;
        errors?: string[];
      };
      return {
        id,
        runId: payload.runId ?? id,
        status: payload.status ?? "unknown",
        dryRun: Boolean(payload.dryRun),
        counts: payload.counts ?? null,
        finishedAt: payload.finishedAt?.toDate?.().toISOString() ?? null,
        errors: payload.errors ?? null,
      };
    });

  return {
    state: {
      lastRunAt: toIso(lastRunAt),
      lastStatus: data.lastStatus ?? null,
      lastSummary: data.lastSummary ?? null,
    },
    cooldownActive: cooldown.cooldownActive,
    nextAllowedAt: cooldown.cooldownActive ? cooldown.nextAllowedAt.toISOString() : null,
    logs,
  };
}

import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import {
  DEFAULT_HOME_PRODUCT_SECTIONS,
  type HomeProductSectionConfig,
} from "@/data/homeSections";

const HOME_SECTIONS_DOC = { collection: "siteContent", id: "homeSections" } as const;

type HomeSectionsDoc = {
  sections?: unknown;
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;
};

const SECTION_ORDER = DEFAULT_HOME_PRODUCT_SECTIONS.map((section) => section.id);
const SECTION_DEFAULTS = new Map(
  DEFAULT_HOME_PRODUCT_SECTIONS.map((section) => [section.id, section])
);

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function sanitizeSection(
  id: string,
  section: Partial<HomeProductSectionConfig> | undefined
): HomeProductSectionConfig {
  const fallback = SECTION_DEFAULTS.get(id);
  if (!fallback) {
    throw new Error(`Unknown home section id: ${id}`);
  }

  return {
    id,
    title: String(section?.title ?? fallback.title).trim() || fallback.title,
    href: String(section?.href ?? fallback.href).trim() || fallback.href,
    productIds: normalizeIds(section?.productIds ?? fallback.productIds),
  };
}

function sanitizeSections(
  input: unknown
): HomeProductSectionConfig[] {
  const byId = new Map<string, Partial<HomeProductSectionConfig>>();

  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const id = String(record.id ?? "").trim();
      if (!SECTION_DEFAULTS.has(id)) continue;
      byId.set(id, {
        id,
        title: typeof record.title === "string" ? record.title : undefined,
        href: typeof record.href === "string" ? record.href : undefined,
        productIds: normalizeIds(record.productIds),
      });
    }
  }

  return SECTION_ORDER.map((id) => sanitizeSection(id, byId.get(id)));
}

export async function getHomeSectionsConfig() {
  try {
    const snap = await adminDb()
      .collection(HOME_SECTIONS_DOC.collection)
      .doc(HOME_SECTIONS_DOC.id)
      .get();

    if (!snap.exists) {
      return {
        sections: DEFAULT_HOME_PRODUCT_SECTIONS,
        source: "default" as const,
        updatedAt: null,
        updatedBy: null,
      };
    }

    const data = snap.data() as HomeSectionsDoc;
    return {
      sections: sanitizeSections(data.sections),
      source: "firestore" as const,
      updatedAt: data.updatedAt?.toMillis() ?? null,
      updatedBy: data.updatedBy ?? null,
    };
  } catch {
    return {
      sections: DEFAULT_HOME_PRODUCT_SECTIONS,
      source: "default" as const,
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export async function saveHomeSectionsConfig(input: {
  sections: unknown;
  updatedBy: string;
}) {
  const sections = sanitizeSections(input.sections);

  await adminDb()
    .collection(HOME_SECTIONS_DOC.collection)
    .doc(HOME_SECTIONS_DOC.id)
    .set(
      {
        sections,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
      { merge: true }
    );

  return sections;
}


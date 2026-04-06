import { normalizeCategory } from "../../src/lib/catalog/onlineCatalogRules";
import type {
  IndexedImageCandidate,
  NormalizedProductImageFields,
} from "./imageMatchingTypes";

const FILLER_TOKENS = new Set([
  "btl",
  "bottle",
  "bottles",
  "can",
  "cans",
  "pk",
  "pack",
]);

const STOP_TOKENS = new Set([
  "the",
  "and",
  "with",
  "for",
  "of",
  "a",
  "an",
]);

const CATEGORY_ALIASES: Record<string, string> = {
  BEER: "BEER",
  BEERS: "BEER",
  BRANDY: "BRANDY",
  COGNAC: "COGNAC",
  GIN: "GIN",
  LIQUOR: "LIQUOR",
  MIXER: "MIXER",
  MIXERS: "MIXER",
  RUM: "RUM",
  SODA: "SODA",
  JUICE: "SODA",
  "SODA AND JUICE": "SODA",
  "SODA & JUICE": "SODA",
  TEQUILA: "TEQUILA",
  VODKA: "VODKA",
  WHISKEY: "WHISKY",
  WHISKIES: "WHISKY",
  WHISKY: "WHISKY",
  WINE: "WINE",
  WINES: "WINE",
  CHAMPAGNE: "CHAMPAGNE",
  COCKTAILS: "COCKTAILS",
  "WINE COOLER": "WINE COOLER",
  "WINE COOLERS": "WINE COOLER",
};

export const SUPPORTED_IMAGE_MATCH_CATEGORIES = new Set(
  Object.values(CATEGORY_ALIASES)
);

const SIZE_PATTERN =
  /\b(\d+(?:\.\d+)?)\s*(ml|m l|oz|o z|l|lt|ltr|liter|litre|cl)\b/i;
const PACK_PATTERN =
  /\b(?:(\d{1,2})\s*(?:pk|pack|packs)|(\d{1,2})-pack|(single))\b/i;

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTokenValue(value: string) {
  return collapseSpaces(
    stripDiacritics(value)
      .replace(/&/g, " and ")
      .replace(/[_./-]+/g, " ")
      .replace(/([a-z])(\d+)\b/gi, "$1 $2")
      .replace(/\b(?:non[\s-]?alcoholic|non[\s-]?alc|na)\b/gi, " nonalcoholic ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .toLowerCase()
  );
}

function formatNumber(raw: string) {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return raw;
  if (Number.isInteger(parsed)) {
    return String(parsed);
  }
  return parsed.toString();
}

export function normalizeSize(value?: string | null) {
  if (!value) return "";
  const normalized = normalizeTokenValue(value);
  const match = normalized.match(SIZE_PATTERN);
  if (!match) return "";

  const amount = formatNumber(match[1] ?? "");
  const unitRaw = (match[2] ?? "").replace(/\s+/g, "").toUpperCase();
  const unit =
    unitRaw === "LT" || unitRaw === "LTR" || unitRaw === "LITER" || unitRaw === "LITRE"
      ? "L"
      : unitRaw;

  return `${amount}${unit}`;
}

export function normalizePack(value?: string | null) {
  if (!value) return "SINGLE";
  const normalized = normalizeTokenValue(value);
  if (!normalized) return "SINGLE";
  if (normalized === "single") return "SINGLE";

  const match = normalized.match(PACK_PATTERN);
  if (!match) return "SINGLE";

  const count = match[1] ?? match[2];
  if (count) {
    return `${count}-PACK`;
  }

  return "SINGLE";
}

export function normalizeCategoryForImageMatch(value?: string | null) {
  if (!value) return "UNCATEGORIZED";

  const raw = collapseSpaces(
    stripDiacritics(String(value))
      .replace(/_/g, " ")
      .replace(/\s*&\s*/g, " & ")
      .trim()
      .toUpperCase()
  );

  const alias = CATEGORY_ALIASES[raw];
  if (alias) return alias;

  const normalized = normalizeCategory(raw);
  return CATEGORY_ALIASES[normalized.key] ?? normalized.key;
}

export function isSupportedImageMatchCategory(value?: string | null) {
  return SUPPORTED_IMAGE_MATCH_CATEGORIES.has(
    normalizeCategoryForImageMatch(value)
  );
}

function removeMatchedPattern(value: string, pattern: RegExp) {
  return collapseSpaces(value.replace(pattern, " "));
}

function normalizeNameCore(value: string) {
  const normalized = normalizeTokenValue(value);
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !FILLER_TOKENS.has(token));

  return collapseSpaces(tokens.join(" "));
}

export function normalizeName(value?: string | null) {
  if (!value) return "";
  return normalizeNameCore(value);
}

export function buildMatchTokens(nameNormalized: string) {
  const seen = new Set<string>();
  return nameNormalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOP_TOKENS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => {
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
}

export function buildNormalizedProductImageFields(input: {
  name?: string | null;
  size?: string | null;
  pack?: string | null;
  category?: string | null;
}): NormalizedProductImageFields {
  const nameNormalized = normalizeName(input.name);
  return {
    nameNormalized,
    sizeNormalized: normalizeSize(input.size),
    packNormalized: normalizePack(input.pack),
    categoryNormalized: normalizeCategoryForImageMatch(input.category),
    matchTokens: buildMatchTokens(nameNormalized),
  };
}

export function indexImageCandidateFromPath(params: {
  sourceFilePath: string;
  sourceFileName: string;
  sourceCategory: string;
}) {
  const baseName = params.sourceFileName.replace(/\.[^.]+$/, "");
  const sizeMatch = normalizeTokenValue(baseName).match(SIZE_PATTERN)?.[0] ?? "";
  const packMatch = normalizeTokenValue(baseName).match(PACK_PATTERN)?.[0] ?? "";
  const withoutSize = sizeMatch
    ? removeMatchedPattern(baseName, new RegExp(sizeMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
    : baseName;
  const withoutPack = packMatch
    ? removeMatchedPattern(withoutSize, new RegExp(packMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
    : withoutSize;

  const nameNormalized = normalizeName(withoutPack);
  const candidate: IndexedImageCandidate = {
    sourceFilePath: params.sourceFilePath,
    sourceFileName: params.sourceFileName,
    sourceCategory: params.sourceCategory,
    categoryNormalized: normalizeCategoryForImageMatch(params.sourceCategory),
    nameNormalized,
    sizeNormalized: normalizeSize(sizeMatch),
    packNormalized: normalizePack(packMatch),
    matchTokens: buildMatchTokens(nameNormalized),
  };

  if (!candidate.sizeNormalized) {
    candidate.sizeNormalized = normalizeSize(baseName);
  }

  if (!candidate.packNormalized || candidate.packNormalized === "SINGLE") {
    candidate.packNormalized = normalizePack(packMatch || baseName);
  }

  return candidate;
}

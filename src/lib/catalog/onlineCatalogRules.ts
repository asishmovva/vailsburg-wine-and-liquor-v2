export const ONLINE_ALLOWLIST = [
  "Beer",
  "Brandy",
  "Champagne",
  "COCKTAILS",
  "Cognac",
  "Gin",
  "Liquor",
  "Rum",
  "Snacks",
  "Soda",
  "Tequila",
  "Vodka",
  "Whisky",
  "Wine",
  "Wine Cooler",
];

export const ONLINE_DENYLIST = [
  "Cigar",
  "Mixer",
  "Tax",
  "Uncategorized",
  "Water",
];

const ALLOW_KEYS = new Set(
  ONLINE_ALLOWLIST.map((value) => value.trim().toUpperCase())
);
const DENY_KEYS = new Set(
  ONLINE_DENYLIST.map((value) => value.trim().toUpperCase())
);

const CANONICAL_LABELS: Record<string, string> = {
  BEER: "Beer",
  BRANDY: "Brandy",
  CHAMPAGNE: "Champagne",
  COCKTAILS: "COCKTAILS",
  COGNAC: "Cognac",
  GIN: "Gin",
  LIQUOR: "Liquor",
  RUM: "Rum",
  SNACKS: "Snacks",
  SODA: "Soda",
  TEQUILA: "Tequila",
  VODKA: "Vodka",
  WHISKY: "Whisky",
  WINE: "Wine",
  "WINE COOLER": "Wine Cooler",
  CIGAR: "Cigar",
  MIXER: "Mixer",
  TAX: "Tax",
  UNCATEGORIZED: "Uncategorized",
  WATER: "Water",
};

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeCategory(input?: string | null) {
  if (!input) {
    return { key: "UNCATEGORIZED", label: CANONICAL_LABELS.UNCATEGORIZED };
  }

  let normalized = collapseSpaces(String(input)).toUpperCase();

  if (!normalized || normalized === "N/A") {
    normalized = "UNCATEGORIZED";
  }

  if (normalized === "WINE COOLERS") {
    normalized = "WINE COOLER";
  }

  if (normalized === "COCKTAIL") {
    normalized = "COCKTAILS";
  }

  if (normalized === "CIGARS") {
    normalized = "CIGAR";
  }

  if (normalized === "WHISKEY" || normalized === "WHISKEYS") {
    normalized = "WHISKY";
  }

  if (normalized === "MIXERS") {
    normalized = "MIXER";
  }

  if (normalized === "UNCATEGORIZED" || normalized === "UN-CATEGORIZED") {
    normalized = "UNCATEGORIZED";
  }

  const label = CANONICAL_LABELS[normalized] ?? collapseSpaces(normalized);
  return { key: normalized, label };
}

export function getSellability(categoryInput?: string | null) {
  const { key, label } = normalizeCategory(categoryInput);
  if (ALLOW_KEYS.has(key)) {
    return {
      isSellableOnline: true,
      onlineBlockReason: null as string | null,
      categoryKey: key,
      categoryLabel: label,
    };
  }

  return {
    isSellableOnline: false,
    onlineBlockReason: `BLOCKED_CATEGORY:${key}`,
    categoryKey: key,
    categoryLabel: label,
  };
}

export function isAllowedCategory(categoryInput?: string | null) {
  return getSellability(categoryInput).isSellableOnline;
}

export function isDeniedCategory(categoryInput?: string | null) {
  const { key } = normalizeCategory(categoryInput);
  return DENY_KEYS.has(key);
}

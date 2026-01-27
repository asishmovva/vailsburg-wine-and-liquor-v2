import "server-only";

import type { SypramItem } from "@/lib/sypram/types";

export type MappedProduct = {
  id: string;
  sku: string;
  data: {
    sku: string;
    upc: string;
    name: string;
    nameLower: string;
    category: string;
    size: string;
    pack: string;
    price: number;
    cost: number;
    salePrice?: number | null;
    stock: number;
    inStock: boolean;
    stockNote?: string;
    groupKey: string;
  };
};

export type MapResult =
  | { ok: true; product: MappedProduct }
  | { ok: false; reason: string; raw: SypramItem };

function normalizeString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ")
    .trim();
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePack(value: string) {
  return value ? value.trim() : "Single";
}

function normalizeCategory(value: string) {
  const trimmed = value.trim();
  return trimmed ? titleCase(trimmed) : "Other";
}

function buildGroupKey(brand: string, name: string) {
  const combined = `${brand} ${name}`.trim().toLowerCase();
  return combined
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getLowerCaseMap(item: SypramItem) {
  const entries = Object.entries(item).map(([key, value]) => [key.toLowerCase(), value]);
  return Object.fromEntries(entries) as Record<string, unknown>;
}

export function mapItemToProduct(item: SypramItem): MapResult {
  const lowered = getLowerCaseMap(item);

  const sku = normalizeString(lowered.sku ?? lowered.itemsku ?? lowered.itemno);
  if (!sku) {
    return { ok: false, reason: "Missing SKU", raw: item };
  }

  const nameRaw = normalizeString(lowered.itemname ?? lowered.name);
  if (!nameRaw) {
    return { ok: false, reason: "Missing ItemName", raw: item };
  }

  const name = normalizeName(nameRaw);
  const brand = normalizeString(
    lowered.brand ??
      lowered.brandname ??
      lowered.brand_name ??
      lowered.vendor ??
      lowered.vendorname ??
      lowered.vendor_name
  );
  const category = normalizeCategory(
    normalizeString(lowered.department ?? lowered.deptname ?? lowered.category)
  );
  const size = normalizeString(lowered.sizename ?? lowered.size);
  const pack = normalizePack(normalizeString(lowered.packname ?? lowered.pack));
  const upc = normalizeString(lowered.upc ?? lowered.barcode);

  const cost = parseNumber(lowered.cost);
  const priceRaw = parseNumber(lowered.price);
  const salePriceRaw = parseNumber(lowered.saleprice ?? lowered.sale_price);
  const useSale = salePriceRaw > 0;
  const price = useSale ? salePriceRaw : priceRaw;

  const totalQtyRaw = parseNumber(lowered.totalqty ?? lowered.total_qty ?? lowered.qty);
  const negativeStock = totalQtyRaw < 0;
  const stock = negativeStock ? 0 : Math.max(0, Math.round(totalQtyRaw));

  const data: MappedProduct["data"] = {
    sku,
    upc,
    name,
    nameLower: name.toLowerCase(),
    category,
    size,
    pack,
    price,
    cost,
    stock,
    inStock: stock > 0,
    groupKey: buildGroupKey(brand, name),
  };

  if (useSale) {
    data.salePrice = salePriceRaw;
  }

  if (negativeStock) {
    data.stockNote = "sypram_negative";
  }

  const product: MappedProduct = {
    id: sku,
    sku,
    data,
  };

  return { ok: true, product };
}

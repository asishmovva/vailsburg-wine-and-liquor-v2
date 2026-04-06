export type ProductSort = "az" | "price_asc" | "price_desc" | "newest";

export type ProductFilters = {
  q?: string;
  category?: string;
  sub?: string;
  size?: string;
  pack?: string;
  inStock?: boolean;
  min?: number;
  max?: number;
  sort?: ProductSort;
  page?: string;
  limit?: number;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  price: number;
  image: string;
  stock: number;
  inStock: boolean;
  createdAt?: number | null;
  size?: string;
  pack?: string;
  upc?: string;
  sku?: string;
  groupKey?: string;
  isSellableOnline?: boolean;
  onlineBlockReason?: string;
  primaryImageUrl?: string;
  imageSource?: string;
  imageMatchedBy?: string;
  imageConfidence?: number;
  imageOriginalFileName?: string;
  imageImportCategory?: string;
  imageSourcePath?: string;
  nameNormalized?: string;
  sizeNormalized?: string;
  packNormalized?: string;
  categoryNormalized?: string;
  matchTokens?: string[];
};

export type ProductDetail = Product & {
  size: string;
  pack: string;
  upc: string;
};

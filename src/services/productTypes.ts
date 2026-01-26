export type ProductSort = "az" | "price_asc" | "price_desc" | "newest";

export type ProductFilters = {
  q?: string;
  category?: string;
  sub?: string;
  inStock?: boolean;
  min?: number;
  max?: number;
  sort?: ProductSort;
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
};

export type ProductDetail = Product & {
  size: string;
  pack: string;
  upc: string;
};

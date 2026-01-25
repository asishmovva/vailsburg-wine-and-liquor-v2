import { ProductCard, type ProductCardItem } from "./ProductCard";

export function ProductGrid({ items }: { items: ProductCardItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  );
}

import { ProductGrid } from "@/components/products/ProductGrid";
import type { ProductCardItem } from "@/components/products/ProductCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

type FirestoreProduct = {
  name?: string;
  price?: number;
  image?: string;
};

async function getProducts(): Promise<ProductCardItem[]> {
  const snapshot = await adminDb()
    .collection("products")
    .orderBy("name")
    .limit(24)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreProduct;
    const price =
      typeof data.price === "number" ? `$${data.price.toFixed(2)}` : "$0.00";

    return {
      id: doc.id,
      name: data.name ?? "Unnamed item",
      price,
      imageUrl: data.image ?? null,
    };
  });
}

export default async function ShopPage() {
  const products = await getProducts();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Shop</h1>
          <p className="text-sm text-zinc-600">
            Browse the latest arrivals and curated categories.
          </p>
        </div>
        <Button variant="outline">Filters</Button>
      </div>

      <Card className="flex items-center justify-between bg-zinc-50">
        <span className="text-sm text-zinc-600">
          Sorting, filters, and availability will appear here.
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Placeholder
        </span>
      </Card>

      {products.length ? (
        <ProductGrid items={products} />
      ) : (
        <Card className="py-12 text-center text-sm text-zinc-500">
          No products found. Run the seed script to populate Firestore.
        </Card>
      )}
    </div>
  );
}

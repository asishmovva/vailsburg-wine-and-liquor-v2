import { Suspense } from "react";
import { ProductGridSkeleton } from "@/components/ui/ProductGridSkeleton";
import ShopClient from "./ShopClient";

function ShopFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Shop</h1>
        <p className="text-sm text-zinc-600">
          Browse curated bottles, mixers, and same-day favorites.
        </p>
      </div>
      <ProductGridSkeleton />
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopFallback />}>
      <ShopClient />
    </Suspense>
  );
}

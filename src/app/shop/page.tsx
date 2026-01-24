import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProductGridSkeleton } from "@/components/ui/ProductGridSkeleton";

export default function ShopPage() {
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

      <ProductGridSkeleton />
    </div>
  );
}

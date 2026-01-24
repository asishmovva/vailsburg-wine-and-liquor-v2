import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ProductDetailsPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="space-y-4">
        <div className="aspect-[4/3] w-full rounded-2xl bg-zinc-100" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 w-16 rounded-xl bg-zinc-100" />
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Product details
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-zinc-900">
            Item name placeholder
          </h1>
          <p className="mt-2 text-lg text-zinc-700">$0.00</p>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center justify-between text-sm text-zinc-600">
            <span>Stock status</span>
            <span className="font-medium text-emerald-600">In stock</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="flex-1">Add to cart</Button>
            <Button variant="outline" className="flex-1">
              Favorite
            </Button>
          </div>
          <p className="text-sm text-zinc-600">
            Pickup and delivery eligibility will appear here.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Related items</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-zinc-200 p-3">
                <div className="h-20 rounded-lg bg-zinc-100" />
                <p className="mt-2 text-sm text-zinc-700">Placeholder item</p>
              </div>
            ))}
          </div>
        </Card>

        <Link href="/shop" className="text-sm text-zinc-600 hover:text-zinc-900">
          Back to shop
        </Link>
      </div>
    </div>
  );
}

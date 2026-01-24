import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/Card";

export default function FavoritesPage() {
  return (
    <RequireAuth redirectTo="/favorites">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Favorites</h1>
          <p className="text-sm text-zinc-600">
            Save your go-to bottles and reorder quickly.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="space-y-3">
              <div className="h-32 rounded-xl bg-zinc-100" />
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Favorite item placeholder
                </p>
                <p className="text-xs text-zinc-500">$0.00</p>
              </div>
            </Card>
          ))}
        </div>

        <Link href="/shop" className="text-sm text-zinc-600 hover:text-zinc-900">
          Browse the shop
        </Link>
      </div>
    </RequireAuth>
  );
}

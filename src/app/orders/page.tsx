import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/Card";

export default function OrdersPage() {
  return (
    <RequireAuth redirectTo="/orders">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Your Orders</h1>
          <p className="text-sm text-zinc-600">
            Track current and past orders in one place.
          </p>
        </div>

        <Card className="space-y-3">
          <p className="text-sm text-zinc-600">
            Your recent orders will appear here.
          </p>
          <Link
            href="/shop"
            className="inline-flex h-10 w-fit items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
          >
            Shop latest arrivals
          </Link>
        </Card>
      </div>
    </RequireAuth>
  );
}

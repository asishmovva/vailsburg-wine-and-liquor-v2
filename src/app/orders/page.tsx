import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Your Orders</h1>
        <p className="text-sm text-zinc-600">
          Track current and past orders in one place.
        </p>
      </div>

      <Card className="space-y-3">
        <p className="text-sm text-zinc-600">
          Sign in to view your order history.
        </p>
        <Link
          href="/signin"
          className="inline-flex h-10 w-fit items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-800"
        >
          Sign in
        </Link>
      </Card>
    </div>
  );
}

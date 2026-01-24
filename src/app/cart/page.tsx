import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function CartPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Cart</h1>
        <p className="text-sm text-zinc-600">
          Review your items before checkout.
        </p>
      </div>

      <Card className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Start shopping
        </Link>
      </Card>
    </div>
  );
}

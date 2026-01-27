import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function OrderFailedPage() {
  return (
    <Card className="space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold text-zinc-900">Payment failed</h1>
      <p className="text-sm text-zinc-600">
        We couldn’t complete the payment. Please try again.
      </p>
      <Link
        href="/checkout"
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Back to checkout
      </Link>
    </Card>
  );
}

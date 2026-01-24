import Link from "next/link";
import { Card } from "@/components/ui/Card";

const policyLinks = [
  { href: "/policies/delivery", label: "Delivery Policy" },
  { href: "/policies/pickup", label: "Pickup Policy" },
  { href: "/policies/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/policies/terms", label: "Terms of Service" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/age-verification", label: "Age Verification (21+)" },
];

export default function CheckoutPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
          <p className="text-sm text-zinc-600">
            Choose pickup or delivery and confirm your details.
          </p>
        </div>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Fulfillment
          </h2>
          <p className="text-sm text-zinc-600">
            Pickup vs. delivery toggle will be added here.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            Delivery address
          </h2>
          <p className="text-sm text-zinc-600">
            Address autocomplete placeholder for Mapbox.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Tip</h2>
          <p className="text-sm text-zinc-600">
            Tip selection controls will appear here.
          </p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Policies</h2>
          <p className="text-sm text-zinc-600">
            By placing an order, you agree to the following policies.
          </p>
          <ul className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
            {policyLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-zinc-900">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Order summary</h2>
        <div className="space-y-2 text-sm text-zinc-600">
          <div className="flex items-center justify-between">
            <span>Items</span>
            <span>$0.00</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Delivery fee</span>
            <span>$0.00</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tax (NJ)</span>
            <span>$0.00</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tip</span>
            <span>$0.00</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 text-base font-semibold">
          <span>Total</span>
          <span>$0.00</span>
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white"
        >
          Continue to payment
        </button>
      </Card>
    </div>
  );
}

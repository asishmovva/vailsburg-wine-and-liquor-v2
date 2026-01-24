import Link from "next/link";
import { Card } from "@/components/ui/Card";

const policies = [
  { href: "/policies/delivery", label: "Delivery Policy" },
  { href: "/policies/pickup", label: "Pickup Policy" },
  { href: "/policies/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/policies/terms", label: "Terms of Service" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/age-verification", label: "Age Verification (21+)" },
];

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Policies</h1>
        <p className="text-sm text-zinc-600">
          Review our delivery, pickup, and store policies.
        </p>
      </div>

      <Card>
        <ul className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-2">
          {policies.map((policy) => (
            <li key={policy.href}>
              <Link href={policy.href} className="hover:text-zinc-900">
                {policy.label}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

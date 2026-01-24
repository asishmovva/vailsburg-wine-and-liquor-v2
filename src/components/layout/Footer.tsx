import Link from "next/link";

const shopLinks = [
  { href: "/shop?category=beer", label: "Beer" },
  { href: "/shop?category=wine", label: "Wine" },
  { href: "/shop?category=whiskey", label: "Whiskey" },
  { href: "/shop?category=vodka", label: "Vodka" },
  { href: "/shop?category=tequila", label: "Tequila" },
];

const policyLinks = [
  { href: "/policies/delivery", label: "Delivery Policy" },
  { href: "/policies/pickup", label: "Pickup Policy" },
  { href: "/policies/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/policies/terms", label: "Terms of Service" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/age-verification", label: "Age Verification (21+)" },
];

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <div className="text-lg font-semibold text-zinc-900">
              Vailsburg Wine & Liquor
            </div>
            <p className="text-sm text-zinc-600">
              Same-day delivery and pickup in Newark, NJ.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
              Shop
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-zinc-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
              Support
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              <li>
                <Link href="/contact" className="hover:text-zinc-900">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div id="policies">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
              Policies
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-600">
              {policyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-zinc-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
          Secure checkout (Stripe)
        </div>
      </div>
    </footer>
  );
}


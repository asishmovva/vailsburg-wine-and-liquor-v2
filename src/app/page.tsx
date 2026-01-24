import Link from "next/link";
import { Card } from "@/components/ui/Card";

const categories = [
  "Beer",
  "Wine",
  "Whiskey",
  "Vodka",
  "Tequila",
  "Rum",
  "Gin",
  "Extras",
];

const highlights = [
  { title: "Top Deals", href: "/shop?sort=deals" },
  { title: "Top Shelf Items", href: "/shop?sort=top-shelf" },
  { title: "Popular Items", href: "/shop?sort=popular" },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-600 via-rose-500 to-red-500 p-8 text-white sm:p-12">
        <div className="relative z-10 max-w-2xl space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-white/80">
            Newark, NJ • Same-day delivery
          </p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            Your neighborhood bottle shop, delivered fast.
          </h1>
          <p className="text-base text-white/90 sm:text-lg">
            Curated wine, spirits, and essentials with pickup or delivery in
            under hours.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900"
            >
              Shop now
            </Link>
            <Link
              href="/shop?sort=top-shelf"
              className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              View top shelf
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute right-6 top-6 h-28 w-28 rounded-full bg-white/20 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          "Same-day delivery",
          "Secure checkout",
          "Pickup available",
        ].map((item) => (
          <Card key={item} className="flex items-center justify-center text-sm">
            {item}
          </Card>
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">
            Shop by Category
          </h2>
          <Link href="/shop" className="text-sm text-zinc-600 hover:text-zinc-900">
            View all
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          {categories.map((category) => (
            <div key={category} className="flex flex-col items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-900 shadow-sm">
                {category}
              </div>
              <span className="text-sm text-zinc-600">{category}</span>
            </div>
          ))}
        </div>
      </section>

      {highlights.map((section) => (
        <section key={section.title} className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">
              {section.title}
            </h2>
            <Link
              href={section.href}
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="space-y-3">
                <div className="h-36 rounded-xl bg-zinc-100" />
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded bg-zinc-100" />
                  <div className="h-4 w-1/2 rounded bg-zinc-100" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}


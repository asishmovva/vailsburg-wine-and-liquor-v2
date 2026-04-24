import Link from "next/link";
import { CategoryCircleGrid } from "@/components/home/CategoryCircleGrid";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { ProductGrid } from "@/components/products/ProductGrid";
import type { ProductCardItem } from "@/components/products/ProductCard";
import { Card } from "@/components/ui/Card";
import { getHomeSectionsConfig } from "@/lib/homeSections";
import { getProductById } from "@/services/product";

export const revalidate = 300;

const heroSlides = [
  {
    id: "deals",
    badge: "Newark, NJ • Same-day delivery",
    title: "Deals worth stocking up on.",
    description:
      "Weekly specials on wines, spirits, and essentials delivered within hours.",
    primaryCta: { label: "Shop now", href: "/shop" },
    secondaryCta: { label: "View top shelf", href: "/shop?tag=top-shelf" },
    gradientClass: "bg-gradient-to-r from-amber-600 via-rose-500 to-red-500",
  },
  {
    id: "top-shelf",
    badge: "Newark, NJ • Same-day delivery",
    title: "Top shelf, always ready to pour.",
    description:
      "Premium bottles, curated picks, and rare finds waiting for pickup or delivery.",
    primaryCta: { label: "Shop now", href: "/shop" },
    secondaryCta: { label: "View top shelf", href: "/shop?tag=top-shelf" },
    gradientClass: "bg-gradient-to-r from-zinc-900 via-slate-800 to-zinc-700",
  },
  {
    id: "popular",
    badge: "Newark, NJ • Same-day delivery",
    title: "Customer favorites (coming soon).",
    description:
      "Stay tuned for top-rated picks as we light up popularity rankings.",
    primaryCta: { label: "Shop now", href: "/shop" },
    secondaryCta: { label: "View top shelf", href: "/shop?tag=top-shelf" },
    gradientClass: "bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600",
  },
];

const categories = [
  { label: "Beer", icon: "🍺", href: "/shop?category=BEER" },
  { label: "Wine", icon: "🍷", href: "/shop?category=WINE" },
  { label: "Whiskey", icon: "🥃", href: "/shop?category=WHISKEY" },
  { label: "Vodka", icon: "🍸", href: "/shop?category=VODKA" },
  { label: "Tequila", icon: "🌵", href: "/shop?category=TEQUILA" },
  { label: "Rum", icon: "🏝️", href: "/shop?category=RUM" },
  { label: "Gin", icon: "🍋", href: "/shop?category=GIN" },
  { label: "Extras", icon: "🧊", href: "/shop?category=EXTRAS" },
];

const trustItems = [
  { label: "Same-day delivery", detail: "Within 8 miles" },
  { label: "Secure checkout", detail: "Stripe-ready" },
  { label: "Pickup available", detail: "Order ahead" },
];

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

async function buildHomeSections() {
  const { sections } = await getHomeSectionsConfig();
  const uniqueIds = Array.from(new Set(sections.flatMap((section) => section.productIds)));
  const products = await Promise.all(
    uniqueIds.map(async (id) => [id, await getProductById(id)] as const)
  );
  const productMap = new Map(products);

  return sections.map((section) => ({
    ...section,
    items: section.productIds
      .map((id) => productMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(
        (item): ProductCardItem => ({
          id: item.id,
          name: item.name,
          price: formatPrice(item.price),
          priceValue: item.price,
          imageUrl: item.image || null,
          category: item.category,
          size: item.size,
          pack: item.pack,
          stock: item.stock,
          inStock: item.inStock,
        })
      ),
  }));
}

export default async function Home() {
  const productSections = await buildHomeSections();

  return (
    <div className="space-y-12">
      <HeroCarousel slides={heroSlides} />

      <section className="grid gap-4 sm:grid-cols-3">
        {trustItems.map((item) => (
          <Card key={item.label} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white">
              ✓
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
              <p className="text-xs text-zinc-500">{item.detail}</p>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">
            Shop by Category
          </h2>
          <Link
            href="/shop"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            View all
          </Link>
        </div>
        <CategoryCircleGrid items={categories} />
      </section>

      {productSections.map((section) => (
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
          <ProductGrid items={section.items} />
        </section>
      ))}
    </div>
  );
}

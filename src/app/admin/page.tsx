import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import SystemHealthPanel from "@/app/admin/SystemHealthPanel";
import HomeSectionsManager from "@/app/admin/HomeSectionsManager";
import Link from "next/link";

const PRIMARY_ACTIONS = [
  {
    title: "Orders",
    description: "Manage live and past orders from a single queue.",
    href: "/admin/orders",
    cta: "Open orders",
  },
  {
    title: "Analytics",
    description: "View revenue, fulfillment, and operational performance.",
    href: "/admin/analytics",
    cta: "View analytics",
  },
  {
    title: "Catalog Sync",
    description: "Run sync and refresh catalog pricing and inventory.",
    href: "/admin/sync",
    cta: "Run sync",
  },
  {
    title: "Image Review",
    description: "Review script-generated image candidates before attach.",
    href: "/admin/image-review",
    cta: "Review image matches",
  },
  {
    title: "Homepage Sections",
    description: "Curate Top Deals, Top Shelf, and Popular picks visually.",
    href: "#home-sections",
    cta: "Manage homepage sections",
  },
  {
    title: "Image Manager",
    description: "Search products and upload, replace, or remove images.",
    href: "/admin/products",
    cta: "Manage product images",
  },
];

export default function AdminPage() {
  return (
    <div className="space-y-8 pb-12">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
            Admin Dashboard
          </h1>
          <Badge>Admin Mode</Badge>
        </div>
        <p className="text-sm text-zinc-600">
          Manage orders, catalog, and system health from one control center.
        </p>
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orders">
            <Button variant="outline" size="sm">
              Open Orders
            </Button>
          </Link>
          <Link href="/admin/analytics">
            <Button variant="outline" size="sm">
              Open Analytics
            </Button>
          </Link>
          <Link href="/admin/sync">
            <Button variant="outline" size="sm">
              Run Sync
            </Button>
          </Link>
          <Link href="/admin/image-review">
            <Button variant="outline" size="sm">
              Review Image Matches
            </Button>
          </Link>
          <Link href="/admin/products">
            <Button variant="outline" size="sm">
              Manage Product Images
            </Button>
          </Link>
          <a href="#home-sections">
            <Button variant="outline" size="sm">
              Manage Homepage Sections
            </Button>
          </a>
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PRIMARY_ACTIONS.map((card) => (
          <Card key={card.title} className="flex h-full flex-col gap-3">
            <div className="space-y-1">
              <p className="text-base font-semibold text-zinc-900">{card.title}</p>
              <p className="text-sm text-zinc-600">{card.description}</p>
            </div>
            <div className="mt-auto">
              <Link href={card.href}>
                <Button variant="outline" className="w-full sm:w-auto">
                  {card.cta}
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </section>

      <HomeSectionsManager />

      <SystemHealthPanel />
    </div>
  );
}

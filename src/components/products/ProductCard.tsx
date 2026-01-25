import { Card } from "@/components/ui/Card";

export interface ProductCardItem {
  id: string;
  name: string;
  price: string;
  imageUrl?: string | null;
}

export function ProductCard({ item }: { item: ProductCardItem }) {
  return (
    <Card className="group flex h-full flex-col gap-3">
      {item.imageUrl ? (
        <div
          className="h-32 overflow-hidden rounded-2xl bg-zinc-100 bg-cover bg-center transition duration-300 group-hover:scale-[1.02]"
          style={{ backgroundImage: `url(${item.imageUrl})` }}
          role="img"
          aria-label={item.name}
        />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-100 via-white to-zinc-200">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {item.name.slice(0, 3)}
          </span>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-900">{item.name}</p>
        <p className="text-xs text-zinc-500">{item.price}</p>
      </div>
    </Card>
  );
}

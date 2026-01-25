import Link from "next/link";

export interface CategoryItem {
  label: string;
  href: string;
  icon: string;
}

export function CategoryCircleGrid({ items }: { items: CategoryItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-2xl shadow-sm ring-1 ring-zinc-200 transition hover:shadow-md">
            <span aria-hidden="true">{item.icon}</span>
          </div>
          <span className="text-sm font-medium text-zinc-700">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

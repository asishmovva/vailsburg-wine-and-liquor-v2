import { Card } from "@/components/ui/Card";

export function SkeletonProductCard() {
  return (
    <Card className="space-y-3">
      <div className="h-32 rounded-2xl bg-zinc-100" />
      <div className="space-y-2">
        <div className="h-3 w-2/3 rounded bg-zinc-100" />
        <div className="h-3 w-1/2 rounded bg-zinc-100" />
      </div>
    </Card>
  );
}

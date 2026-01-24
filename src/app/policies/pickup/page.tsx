import { Card } from "@/components/ui/Card";

export default function PickupPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Pickup Policy</h1>
        <p className="text-sm text-zinc-600">
          How in-store pickup works and what to bring.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          Pickup orders are typically ready the same day during store hours.
        </p>
        <p>
          A valid government ID is required at pickup. Order confirmation will
          be requested at the counter.
        </p>
      </Card>
    </div>
  );
}

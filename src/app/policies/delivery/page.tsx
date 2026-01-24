import { Card } from "@/components/ui/Card";

export default function DeliveryPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Delivery Policy</h1>
        <p className="text-sm text-zinc-600">
          Details about same-day delivery, radius, and minimum order.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          Delivery is available within our service radius. Same-day delivery
          applies to orders placed during operating hours.
        </p>
        <p>
          A delivery fee and minimum order requirement apply. A valid government
          ID is required upon delivery.
        </p>
      </Card>
    </div>
  );
}

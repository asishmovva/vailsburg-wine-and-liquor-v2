import { Card } from "@/components/ui/Card";

export default function RefundCancellationPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Refund & Cancellation Policy
        </h1>
        <p className="text-sm text-zinc-600">
          Guidelines for cancellations and refunds.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          Refund and cancellation eligibility will be provided at checkout and
          confirmed with your order.
        </p>
        <p>
          Contact support as soon as possible for changes to pickup or delivery
          orders.
        </p>
      </Card>
    </div>
  );
}

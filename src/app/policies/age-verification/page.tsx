import { Card } from "@/components/ui/Card";

export default function AgeVerificationPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Age Verification (21+)
        </h1>
        <p className="text-sm text-zinc-600">
          Alcohol purchases require valid government identification.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          You must be 21 or older to purchase alcohol. We require a valid
          government-issued ID at pickup or delivery.
        </p>
      </Card>
    </div>
  );
}

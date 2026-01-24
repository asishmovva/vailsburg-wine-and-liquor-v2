import { Card } from "@/components/ui/Card";

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Privacy Policy</h1>
        <p className="text-sm text-zinc-600">
          How we collect and use your information.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          Details about data collection, usage, and storage will be published
          here.
        </p>
      </Card>
    </div>
  );
}

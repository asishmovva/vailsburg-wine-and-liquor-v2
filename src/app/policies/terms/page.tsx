import { Card } from "@/components/ui/Card";

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Terms of Service</h1>
        <p className="text-sm text-zinc-600">
          Review the terms that govern your use of our services.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>
          Our terms of service outline eligibility, ordering requirements, and
          acceptable use of the site.
        </p>
      </Card>
    </div>
  );
}

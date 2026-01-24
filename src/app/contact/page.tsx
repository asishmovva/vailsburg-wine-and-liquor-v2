import { Card } from "@/components/ui/Card";

export default function ContactPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Contact</h1>
        <p className="text-sm text-zinc-600">
          Support contact details will be listed here.
        </p>
      </div>

      <Card className="text-sm text-zinc-600">
        Contact information placeholder.
      </Card>
    </div>
  );
}

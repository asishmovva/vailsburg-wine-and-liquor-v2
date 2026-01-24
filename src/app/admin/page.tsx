import { Card } from "@/components/ui/Card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Admin</h1>
        <p className="text-sm text-zinc-600">
          Admin-only tools will appear here.
        </p>
      </div>

      <Card className="text-sm text-zinc-600">
        Admin access required.
      </Card>
    </div>
  );
}

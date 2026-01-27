import { Card } from "@/components/ui/Card";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Admin</h1>
        <p className="text-sm text-zinc-600">
          Admin-only tools.
        </p>
      </div>

      <Card className="space-y-3 text-sm text-zinc-600">
        <p>You have admin access.</p>
        <p className="text-xs text-zinc-500">
          Go to <span className="font-medium text-zinc-700">/admin/sync</span> to run Sypram syncs.
        </p>
      </Card>
    </div>
  );
}

import { RequireAuth } from "@/components/auth/RequireAuth";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <RequireAuth redirectTo={`/orders/${orderId}`}>
      <OrderDetailClient orderId={orderId} />
    </RequireAuth>
  );
}

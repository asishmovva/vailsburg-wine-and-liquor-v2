import { RequireAuth } from "@/components/auth/RequireAuth";
import OrderDetailClient from "./OrderDetailClient";

export default function OrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  return (
    <RequireAuth redirectTo={`/orders/${params.orderId}`}>
      <OrderDetailClient orderId={params.orderId} />
    </RequireAuth>
  );
}

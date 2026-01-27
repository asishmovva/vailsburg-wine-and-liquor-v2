import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import OrderSuccessClient from "./OrderSuccessClient";

export default function OrderSuccessPage({
  searchParams,
}: {
  searchParams?: { orderId?: string };
}) {
  const next = searchParams?.orderId
    ? `/order/success?orderId=${encodeURIComponent(searchParams.orderId)}`
    : "/order/success";
  return (
    <RequireAuth redirectTo={next}>
      <Suspense
        fallback={<div className="text-sm text-zinc-500">Loading...</div>}
      >
        <OrderSuccessClient />
      </Suspense>
    </RequireAuth>
  );
}

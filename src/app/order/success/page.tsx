import { Suspense } from "react";
import OrderSuccessClient from "./OrderSuccessClient";

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
      <OrderSuccessClient />
    </Suspense>
  );
}

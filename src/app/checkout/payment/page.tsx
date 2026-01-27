import { Suspense } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import PaymentClient from "./PaymentClient";

export default function PaymentPage() {
  return (
    <RequireAuth redirectTo="/checkout">
      <Suspense
        fallback={<div className="text-sm text-zinc-500">Loading...</div>}
      >
        <PaymentClient />
      </Suspense>
    </RequireAuth>
  );
}

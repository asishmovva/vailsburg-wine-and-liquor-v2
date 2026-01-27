import { RequireAuth } from "@/components/auth/RequireAuth";
import CheckoutClient from "./CheckoutClient";

export default function CheckoutPage() {
  return (
    <RequireAuth redirectTo="/checkout">
      <CheckoutClient />
    </RequireAuth>
  );
}

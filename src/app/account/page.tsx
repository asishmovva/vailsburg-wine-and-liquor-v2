import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";

export default function AccountPage() {
  const isEnabled = process.env.NEXT_PUBLIC_ACCOUNT_DASHBOARD_V2 === "true";
  if (!isEnabled) {
    redirect("/orders");
  }

  return <AccountClient />;
}

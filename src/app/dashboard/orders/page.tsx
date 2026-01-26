import OrdersClient from "@/app/orders/OrdersClient";

export default function DashboardOrdersPage() {
  return <OrdersClient redirectTo="/dashboard/orders" />;
}

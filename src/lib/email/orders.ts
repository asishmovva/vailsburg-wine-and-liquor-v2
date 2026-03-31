import "server-only";

import type { EmailPayload } from "@/lib/email/types";
import { getCustomerStatusDisplay } from "@/lib/orders/statusDisplay";

type OrderEmailItem = {
  name: string;
  qty: number;
  price?: number;
};

export type OrderEmailData = {
  id: string;
  status?: string;
  fulfillment?: "delivery" | "pickup";
  delivery?: { address?: string | null } | null;
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
  createdAt?: unknown;
  email?: string | null;
  phone?: string | null;
  customer?: { name?: string | null; phone?: string | null; email?: string | null };
  items?: OrderEmailItem[];
  cancellationReason?: string | null;
};

export type CustomerOrderEmailMilestone =
  | "orderReceived"
  | "ready"
  | "outForDelivery"
  | "cancelled";

function formatMoney(value?: number) {
  return `$${(value ?? 0).toFixed(2)}`;
}

function parseDate(value?: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const seconds =
    (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function shortOrderId(id: string) {
  if (!id) return "";
  return id.slice(-5).toUpperCase();
}

function normalizeSiteUrl(url?: string | null) {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getOrderLink(orderId: string) {
  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  return siteUrl ? `${siteUrl}/orders/${orderId}` : "";
}

function getOrderSummaryLines(order: OrderEmailData) {
  const items = order.items ?? [];
  return items.map(
    (item) => `${item.qty} x ${item.name} (${formatMoney(item.price)})`
  );
}

export function buildNewOrderEmail(order: OrderEmailData): Pick<
  EmailPayload,
  "subject" | "text" | "html"
> {
  const fulfillment = order.fulfillment === "delivery" ? "Delivery" : "Pickup";
  const total = formatMoney(order.total);
  const shortId = shortOrderId(order.id);
  const createdAt = parseDate(order.createdAt);
  const createdAtLabel = createdAt ? createdAt.toLocaleString() : "Unknown";

  const customerName =
    order.customer?.name ?? order.email ?? "Customer";
  const customerPhone = order.customer?.phone ?? order.phone ?? "-";
  const customerEmail = order.customer?.email ?? order.email ?? "-";

  const items = order.items ?? [];
  const itemsLines = getOrderSummaryLines(order);

  const address =
    order.fulfillment === "delivery"
      ? order.delivery?.address ?? "-"
      : "Pickup";

  const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const adminLink = siteUrl ? `${siteUrl}/admin/orders` : "";

  const subject = `NEW ORDER - ${fulfillment} - ${total} - #${shortId}`;

  const text = [
    `Order #${shortId}`,
    `Placed: ${createdAtLabel}`,
    `Fulfillment: ${fulfillment}`,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    `Email: ${customerEmail}`,
    `Address: ${address}`,
    "",
    "Items:",
    ...itemsLines,
    "",
    `Subtotal: ${formatMoney(order.subtotal)}`,
    `Tax: ${formatMoney(order.tax)}`,
    `Tip: ${formatMoney(order.tip)}`,
    `Total: ${total}`,
    adminLink ? "" : undefined,
    adminLink ? `Admin: ${adminLink}` : undefined,
  ]
    .filter((line) => typeof line === "string" && line.length > 0)
    .join("\n");

  const htmlItems = items
    .map(
      (item) =>
        `<li>${item.qty} x ${item.name} (${formatMoney(item.price)})</li>`
    )
    .join("");

  const html = `
    <h2>New order #${shortId}</h2>
    <p><strong>Placed:</strong> ${createdAtLabel}</p>
    <p><strong>Fulfillment:</strong> ${fulfillment}</p>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Phone:</strong> ${customerPhone}</p>
    <p><strong>Email:</strong> ${customerEmail}</p>
    <p><strong>Address:</strong> ${address}</p>
    <h3>Items</h3>
    <ul>${htmlItems}</ul>
    <p><strong>Subtotal:</strong> ${formatMoney(order.subtotal)}</p>
    <p><strong>Tax:</strong> ${formatMoney(order.tax)}</p>
    <p><strong>Tip:</strong> ${formatMoney(order.tip)}</p>
    <p><strong>Total:</strong> ${total}</p>
    ${adminLink ? `<p><a href="${adminLink}">Open admin orders</a></p>` : ""}
  `.trim();

  return { subject, text, html };
}

export function buildCustomerOrderEmail(
  order: OrderEmailData,
  milestone: CustomerOrderEmailMilestone
): Pick<EmailPayload, "subject" | "text" | "html"> {
  const shortId = shortOrderId(order.id);
  const customerName =
    order.customer?.name ?? order.email?.split("@")[0] ?? "Customer";
  const fulfillment = order.fulfillment === "delivery" ? "Delivery" : "Pickup";
  const orderLink = getOrderLink(order.id);
  const itemsLines = getOrderSummaryLines(order);
  const statusDisplay = getCustomerStatusDisplay({
    status: order.status,
    fulfillment: order.fulfillment,
  });

  const milestoneText = (() => {
    switch (milestone) {
      case "orderReceived":
        return {
          subject: `Order received - #${shortId}`,
          heading: `Order received #${shortId}`,
          message: "We have your order and will keep you posted as it moves forward.",
        };
      case "ready":
        return {
          subject: `Ready for pickup - #${shortId}`,
          heading: `Ready for pickup #${shortId}`,
          message: "Your order is ready and waiting for pickup.",
        };
      case "outForDelivery":
        return {
          subject: `Out for delivery - #${shortId}`,
          heading: `Out for delivery #${shortId}`,
          message: "Your order is on the way.",
        };
      case "cancelled":
        return {
          subject: `Order cancelled - #${shortId}`,
          heading: `Order cancelled #${shortId}`,
          message: order.cancellationReason
            ? `Your order was cancelled. Reason: ${order.cancellationReason}`
            : "Your order was cancelled.",
        };
    }
  })();

  const address =
    order.fulfillment === "delivery"
      ? order.delivery?.address ?? "-"
      : "Pickup";

  const text = [
    `Hi ${customerName},`,
    "",
    milestoneText.message,
    "",
    `Status: ${statusDisplay.label}`,
    `Fulfillment: ${fulfillment}`,
    `Total: ${formatMoney(order.total)}`,
    `Items:`,
    ...itemsLines,
    order.fulfillment === "delivery" ? `Address: ${address}` : undefined,
    orderLink ? "" : undefined,
    orderLink ? `View your order: ${orderLink}` : undefined,
  ]
    .filter((line) => typeof line === "string" && line.length > 0)
    .join("\n");

  const htmlItems = itemsLines.map((line) => `<li>${line}</li>`).join("");

  const html = `
    <h2>${milestoneText.heading}</h2>
    <p>Hi ${customerName},</p>
    <p>${milestoneText.message}</p>
    <p><strong>Status:</strong> ${statusDisplay.label}</p>
    <p><strong>Fulfillment:</strong> ${fulfillment}</p>
    <p><strong>Total:</strong> ${formatMoney(order.total)}</p>
    <h3>Items</h3>
    <ul>${htmlItems}</ul>
    ${order.fulfillment === "delivery" ? `<p><strong>Address:</strong> ${address}</p>` : ""}
    ${orderLink ? `<p><a href="${orderLink}">View your order</a></p>` : ""}
  `.trim();

  return {
    subject: milestoneText.subject,
    text,
    html,
  };
}

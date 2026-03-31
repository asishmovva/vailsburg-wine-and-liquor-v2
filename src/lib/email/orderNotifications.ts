import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { sendEmail } from "@/lib/email";
import {
  buildCustomerOrderEmail,
  type CustomerOrderEmailMilestone,
  type OrderEmailData,
} from "@/lib/email/orders";

type NotificationField =
  | "orderReceivedSentAt"
  | "readySentAt"
  | "outForDeliverySentAt"
  | "cancelledSentAt";

type OrderNotificationOrder = Omit<OrderEmailData, "items"> & {
  items?: Array<{
    name?: string;
    qty: number;
    price?: number;
  }>;
  notifications?: Record<string, unknown> | null;
};

function getNotificationField(
  milestone: CustomerOrderEmailMilestone
): NotificationField {
  switch (milestone) {
    case "orderReceived":
      return "orderReceivedSentAt";
    case "ready":
      return "readySentAt";
    case "outForDelivery":
      return "outForDeliverySentAt";
    case "cancelled":
      return "cancelledSentAt";
  }
}

export async function maybeSendCustomerOrderEmail({
  orderId,
  order,
  orderRef,
  milestone,
}: {
  orderId: string;
  order: OrderNotificationOrder;
  orderRef: FirebaseFirestore.DocumentReference;
  milestone: CustomerOrderEmailMilestone;
}) {
  if (process.env.ORDERS_EMAIL_ENABLED !== "true") return;

  const notificationField = getNotificationField(milestone);
  if (order.notifications?.[notificationField]) {
    console.log("[orders_email_skipped_duplicate]", { orderId, milestone });
    return;
  }

  const to = order.customer?.email ?? order.email ?? "";
  const from =
    process.env.STORE_ORDERS_EMAIL_FROM ??
    process.env.SMTP_USER ??
    "";

  if (!to || !from) {
    console.log("[orders_email_error]", {
      orderId,
      milestone,
      reason: "missing_customer_email",
    });
    return;
  }

  const payload = buildCustomerOrderEmail(
    {
      ...order,
      items: (order.items ?? []).map((item) => ({
        name: item.name ?? "Item",
        qty: item.qty,
        price: item.price,
      })),
    },
    milestone
  );
  const result = await sendEmail({
    to,
    from,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });

  if (result.ok) {
    await orderRef.set(
      {
        notifications: {
          [notificationField]: FieldValue.serverTimestamp(),
          emailLastError: FieldValue.delete(),
        },
      },
      { merge: true }
    );
    console.log("[orders_email_sent]", { orderId, milestone });
    return;
  }

  await orderRef.set(
    {
      notifications: {
        emailLastError: result.error ?? "smtp_failed",
      },
    },
    { merge: true }
  );
  console.log("[orders_email_error]", {
    orderId,
    milestone,
    reason: result.error ?? "smtp_failed",
  });
}

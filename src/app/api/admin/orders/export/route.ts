import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_RECORDS = 5000;

type ExportOrder = {
  orderId?: string;
  status?: string;
  fulfillment?: string;
  total?: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  deliveryFee?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  email?: string | null;
  phone?: string | null;
  delivery?: {
    address?: string;
  } | null;
  items?: Array<{
    name?: string;
    qty?: number;
  }>;
};

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = endOfDay
    ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
    : new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toIso(value?: unknown) {
  if (!value) return "";
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const withToDate = value as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") {
    return withToDate.toDate().toISOString();
  }
  const seconds = (value as { _seconds?: number; seconds?: number })._seconds ??
    (value as { seconds?: number }).seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function escapeCsv(value: unknown) {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(orders: Array<{ id: string } & ExportOrder>) {
  const header = [
    "orderId",
    "status",
    "fulfillment",
    "total",
    "subtotal",
    "tax",
    "tip",
    "deliveryFee",
    "createdAt",
    "updatedAt",
    "customerName",
    "customerEmail",
    "customerPhone",
    "deliveryAddress",
    "itemCount",
    "itemSummary",
  ];

  const rows = orders.map((order) => {
    const items = order.items ?? [];
    const itemSummary = items
      .slice(0, 8)
      .map((item) => `${item.qty ?? 0}x ${item.name ?? "Item"}`)
      .join(" | ");

    const row = [
      order.orderId ?? order.id,
      order.status ?? "",
      order.fulfillment ?? "",
      Number(order.total ?? 0).toFixed(2),
      Number(order.subtotal ?? 0).toFixed(2),
      Number(order.tax ?? 0).toFixed(2),
      Number(order.tip ?? 0).toFixed(2),
      Number(order.deliveryFee ?? 0).toFixed(2),
      toIso(order.createdAt),
      toIso(order.updatedAt),
      order.customer?.name ?? "",
      order.customer?.email ?? order.email ?? "",
      order.customer?.phone ?? order.phone ?? "",
      order.delivery?.address ?? "",
      items.length,
      itemSummary,
    ];
    return row.map(escapeCsv).join(",");
  });

  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  const { searchParams } = new URL(request.url);
  const startDate = parseDate(searchParams.get("start"));
  const endDate = parseDate(searchParams.get("end"), true);
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "Invalid start/end date. Expected YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const start = startDate <= endDate ? startDate : endDate;
  const end = endDate >= startDate ? endDate : startDate;

  try {
    const snapshot = await adminDb()
      .collection("orders")
      .where("createdAt", ">=", Timestamp.fromDate(start))
      .where("createdAt", "<=", Timestamp.fromDate(end))
      .orderBy("createdAt", "asc")
      .limit(MAX_EXPORT_RECORDS)
      .get();

    const orders = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...(doc.data() as ExportOrder),
        }) as { id: string } & ExportOrder
    );

    await logEvent({
      source: "api/admin/orders/export",
      eventType: "ADMIN_ORDERS_EXPORT",
      severity: "info",
      message: "Admin orders export generated.",
      userId: admin.uid,
      details: {
        start: start.toISOString(),
        end: end.toISOString(),
        format,
        exportedCount: orders.length,
        truncated: orders.length >= MAX_EXPORT_RECORDS,
      },
    });

    if (format === "json") {
      return NextResponse.json({
        start: start.toISOString(),
        end: end.toISOString(),
        exportedCount: orders.length,
        truncated: orders.length >= MAX_EXPORT_RECORDS,
        orders,
      });
    }

    const csv = buildCsv(orders);
    const filename = `orders_${start.toISOString().slice(0, 10)}_${end
      .toISOString()
      .slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    await logError({
      source: "api/admin/orders/export",
      eventType: "ADMIN_EXPORT_FAIL",
      severity: "error",
      message: "Failed to export orders.",
      error,
      userId: admin.uid,
      details: {
        start: start.toISOString(),
        end: end.toISOString(),
        format,
      },
      persist: true,
    });
    return NextResponse.json({ error: "Failed to export orders." }, { status: 500 });
  }
}

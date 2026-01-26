import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: `Webhook Error: ${(error as Error).message}` },
      { status: 400 }
    );
  }

  const db = adminDb();

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as {
      id: string;
      metadata?: Record<string, string>;
      charges?: { data?: Array<{ receipt_url?: string | null }> };
    };
    const orderId = intent.metadata?.orderId;
    if (!orderId) {
      return NextResponse.json({ received: true });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ received: true });
    }

    const orderData = orderSnap.data() as {
      items?: Array<{ productId: string; qty: number }>;
    };
    const items = orderData.items ?? [];

    let inventoryWarning = false;
    const receiptUrl = intent.charges?.data?.[0]?.receipt_url ?? null;

    await db.runTransaction(async (transaction) => {
      for (const item of items) {
        const productRef = db.collection("products").doc(item.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists) continue;
        const data = productSnap.data() as { stock?: number };
        const currentStock = Number(data.stock ?? 0);
        const updatedStock = Math.max(currentStock - item.qty, 0);
        if (currentStock - item.qty < 0) inventoryWarning = true;

        transaction.update(productRef, {
          stock: updatedStock,
          inStock: updatedStock > 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(orderRef, {
        status: "paid",
        inventoryWarning,
        paidAt: FieldValue.serverTimestamp(),
        stripe: {
          paymentIntentId: intent.id,
          receiptUrl,
        },
      });
    });

    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as { metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;
    if (orderId) {
      await db.collection("orders").doc(orderId).update({
        status: "failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "payment_intent.canceled") {
    const intent = event.data.object as { metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;
    if (orderId) {
      await db.collection("orders").doc(orderId).update({
        status: "cancelled",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}

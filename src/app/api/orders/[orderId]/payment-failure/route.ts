import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { rateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const params = await context.params;
  const orderId = params.orderId;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
  }

  const { auth, error } = await requireAuth(request);
  if (error || !auth) {
    return error ?? NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const limited = rateLimit(`orders-payment-failure:${auth.uid}`, request, {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      {
        error: "Too many payment failure reports. Please wait and try again.",
        code: "rate_limited",
      },
      { status: 429 }
    );
  }

  const payload = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = payload?.message?.toString().trim();

  const orderRef = adminDb().collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const data = snap.data() as { userId?: string | null };
  if (data.userId && data.userId !== auth.uid) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  console.warn("[checkout:payment_failure]", {
    orderId,
    userId: auth.uid,
    message: message ?? "Payment confirmation failed on client.",
  });

  await orderRef.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
      stripe: {
        lastPaymentFailureAt: FieldValue.serverTimestamp(),
        lastPaymentFailureMessage: message ?? "Payment confirmation failed on client.",
      },
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

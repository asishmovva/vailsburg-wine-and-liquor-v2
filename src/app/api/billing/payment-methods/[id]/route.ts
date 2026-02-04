import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireAuth } from "@/lib/server/requireAuth";
import { rateLimit } from "@/lib/server/rateLimit";
import { getOrCreateStripeCustomerId } from "@/lib/server/stripeCustomers";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { auth, error } = await requireAuth(req);
  if (error || !auth) return error;

  const limited = rateLimit(`billing:${auth.uid}`, req, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const paymentMethodId = params.id;
  if (!paymentMethodId) {
    return new Response("Missing payment method id", { status: 400 });
  }

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomerId(auth);
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== customerId) {
      return new Response("Forbidden", { status: 403 });
    }

    await stripe.paymentMethods.detach(paymentMethodId);

    return Response.json({ success: true });
  } catch {
    return new Response("Unable to remove payment method", { status: 500 });
  }
}

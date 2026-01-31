import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireAuth } from "@/lib/server/requireAuth";
import { rateLimit } from "@/lib/server/rateLimit";
import { getOrCreateStripeCustomerId } from "@/lib/server/stripeCustomers";

export async function POST(req: NextRequest) {
  const { auth, error } = await requireAuth(req);
  if (error || !auth) return error;

  const limited = rateLimit(`billing:${auth.uid}`, req, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomerId(auth);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
    });

    if (!setupIntent.client_secret) {
      return new Response("Setup intent failed", { status: 500 });
    }

    return Response.json({ clientSecret: setupIntent.client_secret });
  } catch {
    return new Response("Setup intent failed", { status: 500 });
  }
}

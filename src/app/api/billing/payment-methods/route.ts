import type { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { requireAuth } from "@/lib/server/requireAuth";
import { rateLimit } from "@/lib/server/rateLimit";
import { getOrCreateStripeCustomerId } from "@/lib/server/stripeCustomers";

export async function GET(req: NextRequest) {
  const { auth, error } = await requireAuth(req);
  if (error || !auth) return error;

  const limited = rateLimit(`billing:${auth.uid}`, req, {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomerId(auth);

    const [paymentMethods, customer] = await Promise.all([
      stripe.paymentMethods.list({ customer: customerId, type: "card" }),
      stripe.customers.retrieve(customerId),
    ]);

    let defaultPaymentMethodId: string | null = null;
    if (typeof customer !== "string" && !customer.deleted) {
      const defaultPm = customer.invoice_settings?.default_payment_method;
      if (typeof defaultPm === "string") {
        defaultPaymentMethodId = defaultPm;
      } else if (defaultPm && typeof defaultPm !== "string") {
        defaultPaymentMethodId = defaultPm.id;
      }
    }

    const cards = paymentMethods.data.map((pm) => {
      const card = pm.card;
      return {
        id: pm.id,
        brand: card?.brand ?? "",
        last4: card?.last4 ?? "",
        expMonth: card?.exp_month ?? null,
        expYear: card?.exp_year ?? null,
      };
    });

    return Response.json({
      defaultPaymentMethodId,
      paymentMethods: cards,
    });
  } catch {
    return new Response("Unable to load payment methods", { status: 500 });
  }
}

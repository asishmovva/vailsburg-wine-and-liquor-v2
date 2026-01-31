import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import type { AuthContext } from "@/lib/server/requireAuth";

export async function getOrCreateStripeCustomerId(auth: AuthContext) {
  const db = adminDb();
  const userRef = db.collection("users").doc(auth.uid);
  const snapshot = await userRef.get();
  const existing = snapshot.exists
    ? (snapshot.get("stripeCustomerId") as string | undefined)
    : undefined;

  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: auth.email ?? undefined,
    name: auth.name ?? undefined,
    metadata: { uid: auth.uid },
  });

  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

import "server-only";

import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe() {
  if (stripe) return stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY env var.");
  }

  stripe = new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
  });

  return stripe;
}

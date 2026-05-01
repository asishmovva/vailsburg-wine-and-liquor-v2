import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  computeCheckoutTotalCents,
  computeManualTaxCents,
  DELIVERY_FEE,
  hasPriceMismatch,
  isWithinDeliveryRadius,
  meetsDeliveryMinimum,
  MIN_DELIVERY_ORDER,
  TAX_RATE,
} from "@/lib/checkout/guardrails";
import {
  buildReservationExpiry,
  buildReservationReleaseStock,
  getAvailableStock,
  getReservedStock,
  isReservationExpired,
  type TimestampLike,
} from "@/lib/checkout/inventoryReservations";
import { getFulfillmentAvailability } from "@/lib/checkout/storeAvailability";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import { getStripe } from "@/lib/stripe";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { resolveProductImage } from "@/services/productImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USE_STRIPE_TAX = process.env.USE_STRIPE_TAX === "true";

type CartInputItem = {
  productId: string;
  qty: number;
  expectedPrice?: number;
};

type AddressInput = {
  street?: string;
  apt?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type SelectedAddressInput = {
  id?: string;
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  coordinates?: { lat: number; lng: number } | null;
};

type CreateIntentPayload = {
  items: CartInputItem[];
  fulfillment: "delivery" | "pickup";
  address?: AddressInput;
  selectedAddress?: SelectedAddressInput | null;
  coords?: { lat: number; lng: number } | null;
  tipAmount?: number;
  ageVerified?: boolean;
  deliveryInstructions?: string;
  checkoutAttemptKey?: string;
  idToken?: string | null;
};

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
  category: string;
};

type CanonicalAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress: string;
  placeId: string | null;
  coords: { lat: number; lng: number };
};

type CheckoutAttemptOrder = {
  id?: string;
  status?: string | null;
  userId?: string | null;
  checkoutAttemptKey?: string | null;
  inventoryReservationActive?: boolean | null;
  reservationExpiresAt?: TimestampLike;
  items?: Array<{ productId: string; qty: number }> | null;
  stripe?: {
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
  } | null;
};

class CheckoutValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly meta: Record<string, unknown>
  ) {
    super(message);
  }
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value?: string | null) {
  return value?.toString().trim() ?? "";
}

const IMPORTANT_CHECKOUT_FAILURE_CODES = new Set([
  "CHECKOUT_RADIUS_FAIL",
  "CHECKOUT_AGE_VERIFICATION_FAIL",
  "CHECKOUT_MIN_ORDER_FAIL",
  "CHECKOUT_STOCK_FAIL",
  "CHECKOUT_PRICE_MISMATCH",
  "CHECKOUT_PAYMENT_FAIL",
  "CHECKOUT_DUPLICATE_SUBMISSION_BLOCKED",
  "CHECKOUT_SESSION_EXPIRED",
  "CHECKOUT_STORE_HOURS_FAIL",
]);

function toCheckoutFailureCode(code: string) {
  switch (code) {
    case "fulfillment_closed":
      return "CHECKOUT_STORE_HOURS_FAIL";
    case "delivery_radius_exceeded":
      return "CHECKOUT_RADIUS_FAIL";
    case "age_verification_required":
      return "CHECKOUT_AGE_VERIFICATION_FAIL";
    case "minimum_delivery_order":
      return "CHECKOUT_MIN_ORDER_FAIL";
    case "items_out_of_stock":
      return "CHECKOUT_STOCK_FAIL";
    case "price_mismatch":
      return "CHECKOUT_PRICE_MISMATCH";
    case "payment_intent_failed":
      return "CHECKOUT_PAYMENT_FAIL";
    case "duplicate_checkout_attempt":
      return "CHECKOUT_DUPLICATE_SUBMISSION_BLOCKED";
    case "checkout_attempt_expired":
      return "CHECKOUT_SESSION_EXPIRED";
    case "delivery_address_invalid":
    case "missing_delivery_coordinates":
      return "CHECKOUT_ADDRESS_VALIDATION_FAIL";
    default:
      return "CHECKOUT_VALIDATION_FAIL";
  }
}

function logCheckoutEvent(
  severity: "info" | "warning" | "error" | "critical",
  eventType: string,
  message: string,
  details: Record<string, unknown>,
  persist = false
) {
  const orderId =
    typeof details.orderId === "string" ? details.orderId : undefined;
  const userId =
    typeof details.userId === "string" ? details.userId : undefined;

  void logEvent({
    source: "api/stripe/create-intent",
    eventType,
    severity,
    message,
    orderId,
    userId,
    details,
    persist,
  });
}

function getMapboxToken() {
  return (
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    ""
  );
}

function getStoreCoords() {
  const lat = Number.parseFloat(process.env.STORE_LAT ?? "");
  const lng = Number.parseFloat(process.env.STORE_LNG ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Missing STORE_LAT/STORE_LNG.");
  }
  return { lat, lng };
}

async function getDrivingDistanceMiles(coords: { lat: number; lng: number }) {
  const token = getMapboxToken();
  if (!token) throw new Error("Mapbox token missing.");
  const store = getStoreCoords();

  const url = new URL(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${store.lng},${store.lat};${coords.lng},${coords.lat}`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("overview", "false");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error("Mapbox distance error.");
  const data = (await response.json()) as { routes?: Array<{ distance?: number }> };
  const meters = data.routes?.[0]?.distance;
  if (!meters) throw new Error("Mapbox distance unavailable.");
  return meters / 1609.344;
}

async function reverseGeocodeAddress(coords: { lat: number; lng: number }) {
  const token = getMapboxToken();
  if (!token) throw new Error("Mapbox token missing.");

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("types", "address");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error("Mapbox reverse geocode error.");

  const data = (await response.json()) as {
    features?: Array<{
      id?: string;
      place_name?: string;
      text?: string;
      address?: string;
      center?: [number, number];
      context?: Array<{ id?: string; text?: string }>;
    }>;
  };

  const feature = data.features?.[0];
  if (!feature?.center) {
    throw new Error("Delivery address unavailable.");
  }

  const context = feature.context ?? [];
  const city = context.find((item) => item.id?.startsWith("place"))?.text ?? "";
  const state = context.find((item) => item.id?.startsWith("region"))?.text ?? "";
  const zip = context.find((item) => item.id?.startsWith("postcode"))?.text ?? "";
  const street = feature.address
    ? `${feature.address} ${feature.text ?? ""}`.trim()
    : normalizeText(feature.text);
  const formattedAddress = normalizeText(feature.place_name) || street;

  if (!street || !city || !state || !zip) {
    throw new Error("Delivery address is incomplete.");
  }

  return {
    street,
    city,
    state,
    zip,
    formattedAddress,
    placeId: feature.id ?? null,
    coords: {
      lng: feature.center[0],
      lat: feature.center[1],
    },
  } satisfies CanonicalAddress;
}

function formatAddress(address: { street: string; apt?: string; city: string; state: string; zip: string }) {
  const parts = [
    address.street,
    address.apt ? `Apt ${address.apt}` : "",
    address.city,
    address.state,
    address.zip,
  ]
    .map((part) => part?.toString().trim())
    .filter(Boolean);
  return parts.join(", ");
}

async function calculateStripeTax({
  items,
  deliveryFee,
  address,
}: {
  items: OrderItem[];
  deliveryFee: number;
  address: { street: string; city: string; state: string; zip: string };
}) {
  const stripe = getStripe();
  const lineItems = items.map((item) => ({
    amount: Math.round(item.price * 100),
    quantity: item.qty,
    reference: item.productId,
  }));

  const calculation = await stripe.tax.calculations.create({
    currency: "usd",
    line_items: lineItems,
    customer_details: {
      address: {
        line1: address.street,
        city: address.city,
        state: address.state,
        postal_code: address.zip,
        country: "US",
      },
      address_source: "shipping",
    },
    shipping_cost:
      deliveryFee > 0 ? { amount: Math.round(deliveryFee * 100) } : undefined,
  });

  const taxAmount =
    calculation.tax_amount_exclusive ??
    calculation.tax_amount_inclusive ??
    0;

  return Math.max(taxAmount, 0);
}

function validationResponse(
  status: number,
  error: string,
  code: string,
  meta: Record<string, unknown>
) {
  const failureCode = toCheckoutFailureCode(code);
  logCheckoutEvent("warning", failureCode, error, {
    code,
    ...meta,
  }, IMPORTANT_CHECKOUT_FAILURE_CODES.has(failureCode));
  return NextResponse.json({ error, code }, { status });
}

async function getExistingCheckoutAttempt(userId: string, checkoutAttemptKey: string) {
  const snapshot = await adminDb()
    .collection("orders")
    .where("userId", "==", userId)
    .where("checkoutAttemptKey", "==", checkoutAttemptKey)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  return {
    ref: snapshot.docs[0].ref,
    data: snapshot.docs[0].data() as CheckoutAttemptOrder,
  };
}

async function cancelPaymentIntentIfPossible(paymentIntentId?: string | null) {
  if (!paymentIntentId) return "missing";

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "canceled" || intent.status === "succeeded") {
    return intent.status;
  }
  await stripe.paymentIntents.cancel(paymentIntentId);
  return "canceled";
}

async function releaseOrderReservation({
  orderRef,
  order,
  status,
  releaseReason,
  statusNote,
}: {
  orderRef: FirebaseFirestore.DocumentReference;
  order: CheckoutAttemptOrder;
  status: string;
  releaseReason: string;
  statusNote?: string;
}) {
  if (order.inventoryReservationActive !== true) {
    await orderRef.set(
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        inventoryReservationActive: false,
        reservationReleaseReason: releaseReason,
        reservationReleasedAt: FieldValue.serverTimestamp(),
        statusNote: statusNote ?? null,
      },
      { merge: true }
    );
    return;
  }

  const db = adminDb();

  await db.runTransaction(async (transaction) => {
    const freshSnap = await transaction.get(orderRef);
    if (!freshSnap.exists) return;

    const freshOrder = freshSnap.data() as CheckoutAttemptOrder;
    if (freshOrder.inventoryReservationActive !== true) {
      transaction.set(
        orderRef,
        {
          status,
          updatedAt: FieldValue.serverTimestamp(),
          inventoryReservationActive: false,
          reservationReleaseReason: releaseReason,
          reservationReleasedAt: FieldValue.serverTimestamp(),
          statusNote: statusNote ?? null,
        },
        { merge: true }
      );
      return;
    }

    const freshItems = freshOrder.items ?? [];
    const productRefs = freshItems.map((item) =>
      db.collection("products").doc(item.productId)
    );
    const productSnaps = productRefs.length
      ? await transaction.getAll(...productRefs)
      : [];

    productSnaps.forEach((productSnap, index) => {
      if (!productSnap.exists) return;
      const item = freshItems[index];
      const data = productSnap.data() as { reservedStock?: number; stock?: number };
      const nextReserved = buildReservationReleaseStock(
        getReservedStock(data),
        item.qty
      );

      transaction.update(productSnap.ref, {
        reservedStock: nextReserved,
        inStock: Number(data.stock ?? 0) > 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    transaction.set(
      orderRef,
      {
        status,
        updatedAt: FieldValue.serverTimestamp(),
        inventoryReservationActive: false,
        reservationReleaseReason: releaseReason,
        reservationReleasedAt: FieldValue.serverTimestamp(),
        reservationExpiresAt: null,
        statusNote: statusNote ?? null,
      },
      { merge: true }
    );
  });
}

async function cleanupExpiredCheckoutReservations() {
  const db = adminDb();
  const snapshot = await db
    .collection("orders")
    .where("inventoryReservationActive", "==", true)
    .limit(12)
    .get();

  if (snapshot.empty) return;

  for (const doc of snapshot.docs) {
    const order = doc.data() as CheckoutAttemptOrder;
    if (order.status !== ORDER_STATUSES.PENDING_PAYMENT) continue;
    if (!isReservationExpired(order)) continue;

    try {
      const cancelResult = await cancelPaymentIntentIfPossible(
        order.stripe?.paymentIntentId
      );
      if (cancelResult === "succeeded") {
        continue;
      }
      await releaseOrderReservation({
        orderRef: doc.ref,
        order,
        status: ORDER_STATUSES.FAILED,
        releaseReason: "expired_checkout_attempt",
        statusNote: "Checkout session expired before payment was completed.",
      });

      logCheckoutEvent(
        "warning",
        "CHECKOUT_RESERVATION_EXPIRED",
        "Expired checkout reservation released.",
        {
          orderId: order.id ?? doc.id,
          paymentIntentId: order.stripe?.paymentIntentId ?? null,
        },
        true
      );
    } catch (error) {
      await logError({
        source: "api/stripe/create-intent",
        eventType: "CHECKOUT_RESERVATION_CLEANUP_FAIL",
        severity: "error",
        message: "Failed to release expired checkout reservation.",
        error,
        orderId: order.id ?? doc.id,
        persist: true,
      });
    }
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateIntentPayload;
    const items = payload.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return validationResponse(400, "Your cart is empty.", "empty_cart", {});
    }

    const fulfillment = payload.fulfillment;
    if (fulfillment !== "delivery" && fulfillment !== "pickup") {
      return validationResponse(400, "Invalid fulfillment option.", "invalid_fulfillment", {
        fulfillment,
      });
    }

    if (!payload.idToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let userId: string;
    let email: string | null = null;
    try {
      const decoded = await adminAuth().verifyIdToken(payload.idToken);
      userId = decoded.uid;
      email = decoded.email ?? null;
    } catch {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const db = adminDb();
    const stripe = getStripe();

    const checkoutAttemptKey = normalizeText(payload.checkoutAttemptKey);
    if (!checkoutAttemptKey) {
      return validationResponse(
        400,
        "Checkout session expired. Please try again.",
        "missing_checkout_attempt_key",
        { userId }
      );
    }

    const ageVerified = payload.ageVerified === true;
    if (!ageVerified) {
      return validationResponse(
        400,
        "You must confirm you are 21+ and will present a valid ID.",
        "age_verification_required",
        { userId, fulfillment }
      );
    }

    const fulfillmentAvailability = getFulfillmentAvailability(fulfillment);
    if (!fulfillmentAvailability.isOpen) {
      return validationResponse(
        400,
        fulfillmentAvailability.message ??
          "Orders are currently unavailable for this fulfillment type.",
        "fulfillment_closed",
        {
          userId,
          fulfillment,
          hoursLabel: fulfillmentAvailability.label,
          timeZone: fulfillmentAvailability.timeZone,
        }
      );
    }

    await cleanupExpiredCheckoutReservations();

    const existingAttempt = await getExistingCheckoutAttempt(userId, checkoutAttemptKey);
    if (
      existingAttempt?.data &&
      (isReservationExpired(existingAttempt.data) ||
        existingAttempt.data.inventoryReservationActive === false)
    ) {
      return validationResponse(
        409,
        "Your checkout session expired. Please try checkout again.",
        "checkout_attempt_expired",
        {
          userId,
          checkoutAttemptKey,
          orderId: existingAttempt.data.id ?? existingAttempt.ref.id,
        }
      );
    }

    if (existingAttempt?.data?.stripe?.paymentIntentId) {
      const existingStatus = normalizeText(existingAttempt.data.status);
      if (existingStatus === ORDER_STATUSES.PENDING_PAYMENT) {
        try {
          const existingIntent = await stripe.paymentIntents.retrieve(
            existingAttempt.data.stripe.paymentIntentId
          );

          if (
            existingIntent.status !== "canceled" &&
            existingIntent.status !== "succeeded"
          ) {
            logCheckoutEvent(
              "info",
              "CHECKOUT_DUPLICATE_SUBMISSION_BLOCKED",
              "Reused existing checkout attempt.",
              {
                userId,
                checkoutAttemptKey,
                orderId: existingAttempt.data.id ?? existingAttempt.ref.id,
                paymentIntentId: existingIntent.id,
              }
            );

            return NextResponse.json({
              clientSecret: existingIntent.client_secret,
              orderId: existingAttempt.data.id ?? existingAttempt.ref.id,
            });
          }
        } catch (error) {
          await logError({
            source: "api/stripe/create-intent",
            eventType: "CHECKOUT_DUPLICATE_LOOKUP_FAILED",
            severity: "warning",
            message: "Failed to validate prior checkout attempt.",
            error,
            userId,
            details: {
              checkoutAttemptKey,
            },
            persist: true,
          });
        }
      } else {
        return validationResponse(
          409,
          "This checkout attempt has already been submitted.",
          "duplicate_checkout_attempt",
          {
            userId,
            checkoutAttemptKey,
            orderId: existingAttempt.data.id ?? existingAttempt.ref.id,
            status: existingStatus,
          }
        );
      }
    }

    const productsRef = db.collection("products");
    const orderItems: OrderItem[] = [];
    const unavailableItems: string[] = [];
    const blockedItems: string[] = [];
    const outOfStockItems: string[] = [];
    const priceChangedItems: string[] = [];
    let subtotalCents = 0;
    let taxableSubtotalCents = 0;

    for (const item of items) {
      const productId = normalizeText(item.productId);
      const qty = Math.floor(parseNumber(item.qty));
      const expectedPrice = parseNumber(item.expectedPrice);

      if (!productId || qty <= 0) {
        return validationResponse(400, "Some cart items are invalid.", "invalid_cart_item", {
          userId,
          productId,
          qty,
        });
      }

      const productSnap = await productsRef.doc(productId).get();
      if (!productSnap.exists) {
        unavailableItems.push(productId);
        continue;
      }

      const data = productSnap.data() as {
        name?: string;
        price?: number;
        stock?: number;
        image?: string;
        primaryImageUrl?: string;
        category?: string;
        taxable?: boolean;
        isSellableOnline?: boolean;
      };

      const name = data.name ?? productId;
      if (data.isSellableOnline !== true) {
        blockedItems.push(name);
        continue;
      }

      const availableStock = getAvailableStock(data);
      if (availableStock <= 0 || qty > availableStock) {
        outOfStockItems.push(name);
        continue;
      }

      const price = parseNumber(data.price);
      if (hasPriceMismatch(expectedPrice, price)) {
        priceChangedItems.push(name);
        continue;
      }

      const priceCents = Math.round(price * 100);
      const isTaxable = data.taxable === false ? false : true;
      subtotalCents += priceCents * qty;
      if (isTaxable) {
        taxableSubtotalCents += priceCents * qty;
      }

      orderItems.push({
        productId,
        name,
        price,
        qty,
        image: resolveProductImage(data) || null,
        category: data.category ?? "Other",
      });
    }

    if (unavailableItems.length > 0) {
      return validationResponse(
        400,
        `Some products are no longer available: ${unavailableItems.join(", ")}`,
        "items_unavailable",
        { userId, unavailableItems }
      );
    }

    if (blockedItems.length > 0) {
      return validationResponse(
        400,
        `These items are no longer available online: ${blockedItems.join(", ")}`,
        "items_blocked",
        { userId, blockedItems }
      );
    }

    if (outOfStockItems.length > 0) {
      return validationResponse(
        400,
        `These items are out of stock: ${outOfStockItems.join(", ")}`,
        "items_out_of_stock",
        { userId, outOfStockItems }
      );
    }

    if (priceChangedItems.length > 0) {
      return validationResponse(
        409,
        `Prices changed for: ${priceChangedItems.join(", ")}. Please review your cart and try again.`,
        "price_mismatch",
        { userId, priceChangedItems }
      );
    }

    if (orderItems.length === 0) {
      return validationResponse(400, "Your cart is empty.", "empty_validated_cart", {
        userId,
      });
    }

    const subtotal = subtotalCents / 100;
    const taxableSubtotal = taxableSubtotalCents / 100;
    const deliveryInstructions = normalizeText(payload.deliveryInstructions);

    let deliveryFee = 0;
    let deliveryAddress: CanonicalAddress | null = null;
    let deliveryInfo:
      | {
          address: string;
          miles: number;
          eligible: true;
          lat: number;
          lng: number;
          placeId: string | null;
          instructions?: string | null;
        }
      | null = null;

    if (fulfillment === "delivery") {
      const selectedAddress = payload.selectedAddress;
      const rawCoords = selectedAddress?.coordinates ?? payload.coords;
      if (!rawCoords || !Number.isFinite(rawCoords.lat) || !Number.isFinite(rawCoords.lng)) {
        return validationResponse(
          400,
          "Select a valid delivery address from the suggestions before continuing.",
          "missing_delivery_coordinates",
          { userId }
        );
      }

      try {
        deliveryAddress = await reverseGeocodeAddress(rawCoords);
      } catch (error) {
        return validationResponse(
          400,
          "We could not validate that delivery address. Please choose a valid address from the suggestions.",
          "delivery_address_invalid",
          { userId, error: (error as Error).message }
        );
      }

      let distanceMiles: number;
      try {
        distanceMiles = await getDrivingDistanceMiles(deliveryAddress.coords);
      } catch (error) {
        await logError({
          source: "api/stripe/create-intent",
          eventType: "CHECKOUT_DISTANCE_PROVIDER_FAIL",
          severity: "error",
          message: "Delivery distance validation failed.",
          error,
          userId,
          persist: true,
        });
        return NextResponse.json(
          { error: "Unable to validate delivery distance right now. Please try again." },
          { status: 502 }
        );
      }

      if (!isWithinDeliveryRadius(distanceMiles)) {
        return validationResponse(
          400,
          "Delivery address is outside our delivery area",
          "delivery_radius_exceeded",
          {
            userId,
            miles: Number(distanceMiles.toFixed(2)),
          }
        );
      }

      if (!meetsDeliveryMinimum(subtotal)) {
        return validationResponse(
          400,
          `Delivery orders must be at least $${MIN_DELIVERY_ORDER.toFixed(2)} before tax and tip.`,
          "minimum_delivery_order",
          { userId, subtotal }
        );
      }

      deliveryFee = DELIVERY_FEE;
      const apt = normalizeText(payload.address?.apt);
      const formattedAddress = formatAddress({
        street: deliveryAddress.street,
        apt,
        city: deliveryAddress.city,
        state: deliveryAddress.state,
        zip: deliveryAddress.zip,
      });
      deliveryInfo = {
        address: formattedAddress,
        miles: Number(distanceMiles.toFixed(2)),
        eligible: true,
        lat: deliveryAddress.coords.lat,
        lng: deliveryAddress.coords.lng,
        placeId: selectedAddress?.id ?? deliveryAddress.placeId ?? null,
        instructions: deliveryInstructions || null,
      };
    }

    const tipAmount =
      fulfillment === "delivery" ? Math.max(0, parseNumber(payload.tipAmount)) : 0;

    let taxCents = 0;
    let taxRate = TAX_RATE;
    let taxStrategy = "manual";

    try {
      if (USE_STRIPE_TAX) {
        let taxAddress = deliveryAddress;
        if (!taxAddress) {
          const storeCoords = getStoreCoords();
          taxAddress = await reverseGeocodeAddress(storeCoords);
        }
        taxCents = await calculateStripeTax({
          items: orderItems,
          deliveryFee,
          address: taxAddress,
        });
        taxStrategy = "stripe";
        taxRate =
          taxableSubtotalCents > 0 ? taxCents / taxableSubtotalCents : TAX_RATE;
      } else {
        taxCents = computeManualTaxCents(taxableSubtotalCents);
      }
    } catch (error) {
      await logError({
        source: "api/stripe/create-intent",
        eventType: "CHECKOUT_TAX_CALCULATION_FAIL",
        severity: "error",
        message: "Tax calculation failed during checkout.",
        error,
        userId,
        details: {
          fulfillment,
        },
        persist: true,
      });
      return NextResponse.json(
        { error: "Unable to calculate tax right now. Please try again." },
        { status: 502 }
      );
    }

    const totalCents = computeCheckoutTotalCents({
      subtotalCents,
      fulfillment,
      deliveryFee,
      tipAmount,
      taxCents,
    });

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: totalCents,
          currency: "usd",
          automatic_payment_methods: { enabled: true },
          receipt_email: email ?? undefined,
          metadata: {
            orderId,
            userId,
            uid: userId,
            fulfillment,
            checkoutAttemptKey,
            ageVerified: "true",
          },
        },
        {
          idempotencyKey: checkoutAttemptKey,
        }
      );
    } catch (error) {
      await logError({
        source: "api/stripe/create-intent",
        eventType: "CHECKOUT_PAYMENT_FAIL",
        severity: "critical",
        message: "Stripe payment intent creation failed.",
        error,
        userId,
        details: {
          checkoutAttemptKey,
        },
        persist: true,
      });
      return NextResponse.json(
        { error: "Unable to start payment right now. Please try again." },
        { status: 502 }
      );
    }
    const reservationExpiresAt = Timestamp.fromDate(buildReservationExpiry());

    try {
      await db.runTransaction(async (transaction) => {
        const productRefs = items.map((item) =>
          productsRef.doc(normalizeText(item.productId))
        );
        const productSnaps = productRefs.length
          ? await transaction.getAll(...productRefs)
          : [];

        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const productId = normalizeText(item.productId);
          const qty = Math.floor(parseNumber(item.qty));
          const expectedPrice = parseNumber(item.expectedPrice);
          const productSnap = productSnaps[index];

          if (!productId || qty <= 0 || !productSnap?.exists) {
            throw new CheckoutValidationError(
              "Some products are no longer available. Please review your cart and try again.",
              "items_unavailable",
              400,
              { userId, productId }
            );
          }

          const data = productSnap.data() as {
            name?: string;
            price?: number;
            stock?: number;
            reservedStock?: number;
            isSellableOnline?: boolean;
          };

          const name = data.name ?? productId;
          if (data.isSellableOnline !== true) {
            throw new CheckoutValidationError(
              `These items are no longer available online: ${name}`,
              "items_blocked",
              400,
              { userId, productId }
            );
          }

          const availableStock = getAvailableStock(data);
          if (availableStock <= 0 || qty > availableStock) {
            throw new CheckoutValidationError(
              `These items are out of stock: ${name}`,
              "items_out_of_stock",
              400,
              { userId, productId, availableStock, qty }
            );
          }

          const price = parseNumber(data.price);
          if (hasPriceMismatch(expectedPrice, price)) {
            throw new CheckoutValidationError(
              `Prices changed for: ${name}. Please review your cart and try again.`,
              "price_mismatch",
              409,
              { userId, productId }
            );
          }

          transaction.update(productSnap.ref, {
            reservedStock: getReservedStock(data) + qty,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        transaction.set(orderRef, {
          id: orderId,
          orderId,
          userId,
          email,
          guestId: null,
          checkoutAttemptKey,
          ageVerified: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          status: ORDER_STATUSES.PENDING_PAYMENT,
          paid: false,
          fulfillment,
          delivery: deliveryInfo ?? null,
          deliveryInstructions:
            fulfillment === "delivery" ? deliveryInstructions || null : null,
          deliveryFee,
          tip: tipAmount,
          subtotal,
          taxableSubtotal,
          tax: taxCents / 100,
          taxRate,
          taxStrategy,
          total: totalCents / 100,
          items: orderItems,
          inventoryReservationActive: true,
          reservationExpiresAt,
          reservedAt: FieldValue.serverTimestamp(),
          stripe: {
            paymentIntentId: paymentIntent.id,
            clientSecretLast4: paymentIntent.client_secret?.slice(-4) ?? null,
          },
        });

        if (userId) {
          const pointerRef = db
            .collection("users")
            .doc(userId)
            .collection("orders")
            .doc(orderId);
          transaction.set(pointerRef, {
            orderId,
            status: ORDER_STATUSES.PENDING_PAYMENT,
            total: totalCents / 100,
            fulfillment,
            items: orderItems,
            ageVerified: true,
            deliveryInstructions:
              fulfillment === "delivery" ? deliveryInstructions || null : null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (error) {
      try {
        await cancelPaymentIntentIfPossible(paymentIntent.id);
      } catch (cancelError) {
        await logError({
          source: "api/stripe/create-intent",
          eventType: "CHECKOUT_PAYMENT_INTENT_CANCEL_FAIL",
          severity: "warning",
          message: "Failed to cancel payment intent after checkout reservation error.",
          error: cancelError,
          orderId,
          userId,
          persist: true,
        });
      }

      if (error instanceof CheckoutValidationError) {
        return validationResponse(error.status, error.message, error.code, error.meta);
      }

      throw error;
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId,
      summary: {
        subtotal,
        taxableSubtotal,
        deliveryFee,
        tip: tipAmount,
        tax: taxCents / 100,
        taxRate,
        taxStrategy,
        total: totalCents / 100,
        fulfillment,
        ageVerified: true,
        deliveryInstructions:
          fulfillment === "delivery" ? deliveryInstructions || undefined : undefined,
        address:
          fulfillment === "delivery" && deliveryAddress
            ? {
                street: deliveryAddress.street,
                apt: normalizeText(payload.address?.apt) || undefined,
                city: deliveryAddress.city,
                state: deliveryAddress.state,
                zip: deliveryAddress.zip,
                formatted: deliveryInfo?.address,
                placeId: deliveryInfo?.placeId ?? undefined,
              }
            : undefined,
        items: orderItems,
      },
    });
  } catch (error) {
    await logError({
      source: "api/stripe/create-intent",
      eventType: "CHECKOUT_UNHANDLED_ERROR",
      severity: "critical",
      message: "Unhandled checkout create-intent failure.",
      error,
      persist: true,
    });
    return NextResponse.json(
      { error: (error as Error).message || "Unable to create payment." },
      { status: 500 }
    );
  }
}

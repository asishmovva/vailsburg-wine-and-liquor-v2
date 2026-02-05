import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import { ORDER_STATUSES } from "@/lib/orders/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_RADIUS_MILES = 8;
const DELIVERY_FEE = 5.99;
const MIN_DELIVERY_ORDER = 20;
const TAX_RATE = 0.06625;
const USE_STRIPE_TAX = process.env.USE_STRIPE_TAX === "true";

type CartInputItem = {
  productId: string;
  qty: number;
};

type AddressInput = {
  street: string;
  apt?: string;
  city: string;
  state: string;
  zip: string;
};

type CreateIntentPayload = {
  items: CartInputItem[];
  fulfillment: "delivery" | "pickup";
  address?: AddressInput;
  coords?: { lat: number; lng: number } | null;
  distanceMiles?: number;
  tipAmount?: number;
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

function parseNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

async function reverseGeocode(coords: { lat: number; lng: number }) {
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
      text: string;
      address?: string;
      center: [number, number];
      context?: Array<{ id?: string; text?: string }>;
    }>;
  };

  const feature = data.features?.[0];
  if (!feature) throw new Error("Store address unavailable.");

  const context = feature.context ?? [];
  const city = context.find((item) => item.id?.startsWith("place"))?.text ?? "";
  const state = context.find((item) => item.id?.startsWith("region"))?.text ?? "";
  const zip = context.find((item) => item.id?.startsWith("postcode"))?.text ?? "";

  return {
    street: feature.address ? `${feature.address} ${feature.text}` : feature.text,
    city,
    state,
    zip,
  };
}

function formatAddress(address: AddressInput) {
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
  address: AddressInput;
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateIntentPayload;
    const items = payload.items ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
    }

    const fulfillment = payload.fulfillment;
    if (fulfillment !== "delivery" && fulfillment !== "pickup") {
      return NextResponse.json({ error: "Invalid fulfillment." }, { status: 400 });
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
    const productsRef = db.collection("products");
    const orderItems: OrderItem[] = [];
    const blockedItems: string[] = [];
    const outOfStockItems: string[] = [];
    let subtotalCents = 0;
    let taxableSubtotalCents = 0;

    for (const item of items) {
      const productSnap = await productsRef.doc(item.productId).get();
      if (!productSnap.exists) {
        return NextResponse.json(
          { error: "Some products are unavailable." },
          { status: 400 }
        );
      }
      const data = productSnap.data() as {
        name?: string;
        price?: number;
        stock?: number;
        image?: string;
        category?: string;
        taxable?: boolean;
        isSellableOnline?: boolean;
      };
      if (data.isSellableOnline !== true) {
        blockedItems.push(data.name ?? item.productId);
        continue;
      }
      const stock = parseNumber(data.stock);
      const qty = parseNumber(item.qty);
      if (stock <= 0 || qty <= 0 || qty > stock) {
        outOfStockItems.push(data.name ?? item.productId);
        continue;
      }
      const price = parseNumber(data.price);
      const priceCents = Math.round(price * 100);
      const isTaxable = data.taxable === false ? false : true;
      subtotalCents += priceCents * qty;
      if (isTaxable) {
        taxableSubtotalCents += priceCents * qty;
      }
      orderItems.push({
        productId: item.productId,
        name: data.name ?? "Item",
        price,
        qty,
        image: data.image ?? null,
        category: data.category ?? "Other",
      });
    }

    if (blockedItems.length > 0) {
      return NextResponse.json(
        {
          error: `Blocked items: ${blockedItems.join(", ")}`,
          blockedItems,
        },
        { status: 400 }
      );
    }

    if (outOfStockItems.length > 0) {
      return NextResponse.json(
        {
          error: `Out of stock: ${outOfStockItems.join(", ")}`,
          outOfStockItems,
        },
        { status: 400 }
      );
    }

    if (orderItems.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty." },
        { status: 400 }
      );
    }

    const subtotal = subtotalCents / 100;
    const taxableSubtotal = taxableSubtotalCents / 100;

    let distanceMiles: number | null = null;
    let deliveryFee = 0;
    let deliveryAddress: AddressInput | null = null;
    let deliveryInfo:
      | { address: string; miles: number; eligible: boolean }
      | null = null;

    if (fulfillment === "delivery") {
      const coords = payload.coords;
      if (!coords) {
        return NextResponse.json(
          { error: "Delivery address coordinates missing." },
          { status: 400 }
        );
      }
      const address = payload.address;
      if (!address?.street || !address.city || !address.zip) {
        return NextResponse.json(
          { error: "Delivery address incomplete." },
          { status: 400 }
        );
      }

      distanceMiles = await getDrivingDistanceMiles(coords);
      if (distanceMiles > DELIVERY_RADIUS_MILES) {
        return NextResponse.json(
          { error: "Outside delivery radius." },
          { status: 400 }
        );
      }
      if (subtotal < MIN_DELIVERY_ORDER) {
        return NextResponse.json(
          { error: "Minimum delivery order not met." },
          { status: 400 }
        );
      }
      deliveryFee = DELIVERY_FEE;
      deliveryAddress = {
        street: address.street,
        apt: address.apt,
        city: address.city,
        state: address.state,
        zip: address.zip,
      };
      deliveryInfo = {
        address: formatAddress(deliveryAddress),
        miles: Number(distanceMiles.toFixed(2)),
        eligible: true,
      };
    }

    const tipAmount =
      fulfillment === "delivery" ? Math.max(0, parseNumber(payload.tipAmount)) : 0;

    let taxCents = 0;
    let taxRate = TAX_RATE;
    let taxStrategy = "manual";

    if (USE_STRIPE_TAX) {
      let taxAddress = deliveryAddress;
      if (!taxAddress) {
        const storeCoords = getStoreCoords();
        taxAddress = await reverseGeocode(storeCoords);
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
      taxCents = Math.round(taxableSubtotalCents * TAX_RATE);
    }

    const totalCents =
      subtotalCents +
      Math.round(deliveryFee * 100) +
      Math.round(tipAmount * 100) +
      taxCents;

    const stripe = getStripe();
    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      receipt_email: email ?? undefined,
      metadata: {
        orderId,
        userId,
        uid: userId,
        fulfillment,
      },
    });

    await orderRef.set({
      id: orderId,
      orderId,
      userId,
      email,
      guestId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: ORDER_STATUSES.PENDING_PAYMENT,
      paid: false,
      fulfillment,
      delivery: deliveryInfo ?? null,
      deliveryFee,
      tip: tipAmount,
      subtotal,
      taxableSubtotal,
      tax: taxCents / 100,
      taxRate,
      taxStrategy,
      total: totalCents / 100,
      items: orderItems,
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecretLast4: paymentIntent.client_secret?.slice(-4) ?? null,
      },
    });

    if (userId) {
      await db
        .collection("users")
        .doc(userId)
        .collection("orders")
        .doc(orderId)
        .set({
          orderId,
          status: ORDER_STATUSES.PENDING_PAYMENT,
          total: totalCents / 100,
          fulfillment,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
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
        address: deliveryAddress ?? undefined,
        items: orderItems,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to create payment." },
      { status: 500 }
    );
  }
}

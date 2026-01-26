import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELIVERY_RADIUS_MILES = 8;
const DELIVERY_FEE = 5.99;
const MIN_DELIVERY_ORDER = 20;

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
  guestId?: string;
  idToken?: string | null;
};

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
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

async function calculateTax({
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

    let userId: string | null = null;
    if (payload.idToken) {
      const decoded = await adminAuth().verifyIdToken(payload.idToken);
      userId = decoded.uid;
    }

    const guestId = !userId ? payload.guestId ?? null : null;

    const db = adminDb();
    const productsRef = db.collection("products");
    const orderItems: OrderItem[] = [];

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
      };
      const stock = parseNumber(data.stock);
      const qty = Math.min(parseNumber(item.qty), stock);
      if (stock <= 0 || qty <= 0) {
        return NextResponse.json(
          { error: "Some items are out of stock." },
          { status: 400 }
        );
      }
      orderItems.push({
        productId: item.productId,
        name: data.name ?? "Item",
        price: parseNumber(data.price),
        qty,
      });
    }

    const subtotal = orderItems.reduce(
      (total, item) => total + item.price * item.qty,
      0
    );

    let distanceMiles: number | null = null;
    let deliveryFee = 0;
    let deliveryAddress: AddressInput | null = null;

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
    }

    const tipAmount =
      fulfillment === "delivery" ? Math.max(0, parseNumber(payload.tipAmount)) : 0;

    let taxAddress = deliveryAddress;
    if (!taxAddress) {
      const storeCoords = getStoreCoords();
      taxAddress = await reverseGeocode(storeCoords);
    }

    const taxCents = await calculateTax({
      items: orderItems,
      deliveryFee,
      address: taxAddress,
    });

    const totalCents =
      Math.round(subtotal * 100) +
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
      metadata: {
        orderId,
        userId: userId ?? "",
        guestId: guestId ?? "",
        fulfillment,
      },
    });

    await orderRef.set({
      orderId,
      userId,
      guestId,
      createdAt: FieldValue.serverTimestamp(),
      status: "payment_pending",
      fulfillment,
      deliveryAddress: deliveryAddress ?? null,
      distanceMiles,
      deliveryFee,
      tipAmount,
      subtotal,
      tax: taxCents / 100,
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
          status: "payment_pending",
          createdAt: FieldValue.serverTimestamp(),
          total: totalCents / 100,
        });
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId,
      summary: {
        subtotal,
        deliveryFee,
        tipAmount,
        tax: taxCents / 100,
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

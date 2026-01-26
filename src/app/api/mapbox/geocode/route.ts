import { NextResponse } from "next/server";

const MAPBOX_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

function getToken() {
  return (
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    ""
  );
}

function getStoreProximity() {
  const lat = Number.parseFloat(process.env.STORE_LAT ?? "");
  const lng = Number.parseFloat(process.env.STORE_LNG ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function extractContextValue(
  context: Array<{ id?: string; text?: string }> | undefined,
  prefix: string
) {
  if (!context) return "";
  const match = context.find((item) => item.id?.startsWith(prefix));
  return match?.text ?? "";
}

export async function GET(request: Request) {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: "Mapbox token missing." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json({ features: [] });
  }

  const proximity = getStoreProximity();
  const url = new URL(`${MAPBOX_BASE}/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", "US");
  url.searchParams.set("types", "address");
  if (proximity) {
    url.searchParams.set("proximity", `${proximity.lng},${proximity.lat}`);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to geocode address." },
      { status: 502 }
    );
  }

  const data = (await response.json()) as {
    features?: Array<{
      id: string;
      place_name: string;
      text: string;
      address?: string;
      center: [number, number];
      context?: Array<{ id?: string; text?: string }>;
    }>;
  };

  const features = (data.features ?? []).map((feature) => {
    const city = extractContextValue(feature.context, "place");
    const state = extractContextValue(feature.context, "region");
    const zip = extractContextValue(feature.context, "postcode");

    return {
      id: feature.id,
      label: feature.place_name,
      street: feature.address
        ? `${feature.address} ${feature.text}`
        : feature.text,
      city,
      state,
      zip,
      coordinates: {
        lng: feature.center[0],
        lat: feature.center[1],
      },
    };
  });

  return NextResponse.json({ features });
}

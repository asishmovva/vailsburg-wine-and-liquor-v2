import { NextResponse } from "next/server";

const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving";

function getToken() {
  return (
    process.env.MAPBOX_TOKEN ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    ""
  );
}

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: "Mapbox token missing." }, { status: 500 });
  }

  const storeLat = parseNumber(process.env.STORE_LAT ?? null);
  const storeLng = parseNumber(process.env.STORE_LNG ?? null);

  if (storeLat === null || storeLng === null) {
    return NextResponse.json(
      { error: "Store coordinates missing." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const toLat = parseNumber(searchParams.get("toLat"));
  const toLng = parseNumber(searchParams.get("toLng"));

  if (toLat === null || toLng === null) {
    return NextResponse.json(
      { error: "Missing coordinates." },
      { status: 400 }
    );
  }

  const url = new URL(
    `${DIRECTIONS_BASE}/${storeLng},${storeLat};${toLng},${toLat}`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("overview", "false");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to calculate distance." },
      { status: 502 }
    );
  }

  const data = (await response.json()) as {
    routes?: Array<{ distance?: number }>;
  };

  const meters = data.routes?.[0]?.distance ?? null;
  if (meters === null) {
    return NextResponse.json(
      { error: "Distance unavailable." },
      { status: 502 }
    );
  }

  const miles = meters / 1609.344;

  return NextResponse.json({
    distanceMeters: meters,
    distanceMiles: miles,
  });
}

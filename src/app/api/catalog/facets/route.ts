import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await adminDb()
    .collection("catalogMeta")
    .doc("shopFacets")
    .get();

  if (!snapshot.exists) {
    return NextResponse.json({ sizes: [], packs: [] });
  }

  const data = snapshot.data() as { sizes?: string[]; packs?: string[] };
  return NextResponse.json({
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    packs: Array.isArray(data.packs) ? data.packs : [],
  });
}

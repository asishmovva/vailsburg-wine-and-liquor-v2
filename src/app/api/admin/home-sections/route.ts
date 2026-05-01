import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { getHomeSectionsConfig, saveHomeSectionsConfig } from "@/lib/homeSections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateBody = {
  sections?: unknown;
};

export async function GET(request: NextRequest) {
  const { uid, error } = await requireAdmin(request);
  if (error) return error;
  const limited = adminRateLimit("read", uid, request);
  if (limited) return limited;

  const data = await getHomeSectionsConfig();
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const { uid, error } = await requireAdmin(request);
  if (error) return error;
  const limited = adminRateLimit("mutate", uid, request);
  if (limited) return limited;

  let body: UpdateBody = {};
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!body.sections) {
    return NextResponse.json(
      { error: "sections is required." },
      { status: 400 }
    );
  }

  const sections = await saveHomeSectionsConfig({
    sections: body.sections,
    updatedBy: uid,
  });

  return NextResponse.json({
    ok: true,
    sections,
  });
}


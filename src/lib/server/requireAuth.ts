import "server-only";

import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export type AuthContext = {
  uid: string;
  email: string | null;
  name: string | null;
};

export async function requireAuth(
  req: NextRequest
): Promise<{ auth: AuthContext | null; error: Response | null }> {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return {
      auth: null,
      error: new Response("Unauthorized", { status: 401 }),
    };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return {
      auth: null,
      error: new Response("Unauthorized", { status: 401 }),
    };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return {
      auth: {
        uid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? decoded.displayName ?? null,
      },
      error: null,
    };
  } catch {
    return {
      auth: null,
      error: new Response("Unauthorized", { status: 401 }),
    };
  }
}

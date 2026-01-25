"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export function RequireAuth({
  children,
  redirectTo,
}: {
  children: ReactNode;
  redirectTo: string;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      const next = encodeURIComponent(redirectTo);
      router.replace(`/signin?next=${next}`);
    }
  }, [loading, user, router, redirectTo]);

  if (loading || !user) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Checking your account...
      </div>
    );
  }

  return <>{children}</>;
}

"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole(user);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !roleLoading) {
      if (!user || role !== "admin") {
        router.replace("/");
      }
    }
  }, [loading, roleLoading, user, role, router]);

  if (loading || roleLoading || !user || role !== "admin") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Verifying admin access...
      </div>
    );
  }

  return <>{children}</>;
}

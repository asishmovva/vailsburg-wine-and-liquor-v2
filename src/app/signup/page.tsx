"use client";

import { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { SignUpForm } from "./SignUpForm";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const nextPath = useMemo(() => searchParams.get("next") ?? "/", [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, user, router, nextPath]);

  return <SignUpForm nextPath={nextPath} />;
}

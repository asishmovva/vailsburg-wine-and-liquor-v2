"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

export function useRole(user: User | null | undefined) {
  const [role, setRole] = useState<string | null>(null);
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    getDoc(doc(db, "users", user.uid))
      .then((snapshot) => {
        if (!active) return;
        const data = snapshot.data();
        setRole(typeof data?.role === "string" ? data.role : null);
        setResolvedUid(user.uid);
      })
      .catch(() => {
        if (!active) return;
        setRole(null);
        setResolvedUid(user.uid);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const userId = user?.uid ?? null;
  const loading = Boolean(userId) && resolvedUid !== userId;
  const safeRole = userId && resolvedUid === userId ? role : null;

  return { role: safeRole, loading };
}

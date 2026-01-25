import { Suspense } from "react";
import { SignInClient } from "./SignInClient";

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-600">Loading...</div>}>
      <SignInClient />
    </Suspense>
  );
}

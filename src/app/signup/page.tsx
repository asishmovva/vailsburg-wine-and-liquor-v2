import { Suspense } from "react";
import { SignUpClient } from "./SignUpClient";

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-600">Loading...</div>}>
      <SignUpClient />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { signInWithGoogle, signUp } from "@/services/auth";

export function SignUpForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"email" | "phone">("email");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signUp({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      router.replace(nextPath);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);

    try {
      await signInWithGoogle();
      router.replace(nextPath);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900">Create account</h1>
        <p className="text-sm text-zinc-600">
          Join Vailsburg Wine & Liquor for faster reorders.
        </p>
      </div>

      <Card className="space-y-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200" />
          <span>or</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        <div className="flex items-center gap-2 rounded-full bg-zinc-100 p-1 text-xs font-medium text-zinc-600">
          <button
            type="button"
            onClick={() => setMethod("email")}
            className={`flex-1 rounded-full px-3 py-1.5 ${
              method === "email"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setMethod("phone")}
            className={`flex-1 rounded-full px-3 py-1.5 ${
              method === "phone"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-600"
            }`}
          >
            Phone
          </button>
        </div>

        {method === "email" ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                className="text-sm font-medium text-zinc-700"
                htmlFor="name"
              >
                Full name (optional)
              </label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                placeholder="Jane Doe"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-zinc-700"
                htmlFor="email"
              >
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium text-zinc-700"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className="pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        ) : (
          <PhoneAuthForm nextPath={nextPath} intent="signup" />
        )}
      </Card>

      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-zinc-900">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function getAuthErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: string }).code);
    if (code.includes("email-already-in-use")) {
      return "That email is already registered.";
    }
    if (code.includes("weak-password")) {
      return "Password should be at least 6 characters.";
    }
    if (code.includes("invalid-email")) {
      return "Please enter a valid email.";
    }
    if (code.includes("popup-closed-by-user")) {
      return "Sign-in popup was closed.";
    }
    if (code.includes("popup-blocked")) {
      return "Popup was blocked. Allow popups to continue.";
    }
    if (code.includes("cancelled-popup-request")) {
      return "Sign-in popup was cancelled.";
    }
    if (code.includes("unauthorized-domain")) {
      return "This domain is not authorized. Add localhost (and your domain) in Firebase Auth settings.";
    }
    if (code.includes("operation-not-allowed")) {
      return "This sign-in method is not enabled in Firebase.";
    }
    if (code.includes("network-request-failed")) {
      return "Network error. Check your connection and try again.";
    }
  }

  return "Unable to create account. Please try again.";
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { signIn, signInWithGoogle } from "@/services/auth";

export function SignInForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
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
        <h1 className="text-2xl font-semibold text-zinc-900">Sign in</h1>
        <p className="text-sm text-zinc-600">
          Access your account for faster checkout.
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

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700" htmlFor="email">
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
                autoComplete="current-password"
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
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>

      <p className="text-sm text-zinc-600">
        New here?{" "}
        <Link href="/signup" className="font-medium text-zinc-900">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function getAuthErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: string }).code);
    if (code.includes("invalid-credential") || code.includes("wrong-password")) {
      return "Incorrect email or password.";
    }
    if (code.includes("user-not-found")) {
      return "No account found for that email.";
    }
    if (code.includes("too-many-requests")) {
      return "Too many attempts. Try again in a few minutes.";
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
  }

  return "Unable to sign in. Please try again.";
}

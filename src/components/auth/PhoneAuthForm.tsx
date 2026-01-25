"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { auth } from "@/lib/firebase";
import { ensureUserProfile } from "@/services/auth";

type RecaptchaSize = "invisible" | "normal";

const SMS_INFO_COPY =
  "For security reasons, SMS verification codes are limited per day. If you don’t receive a code, please try again later or use email/Google sign-in.";

export function PhoneAuthForm({
  nextPath,
  intent = "signin",
}: {
  nextPath: string;
  intent?: "signin" | "signup";
}) {
  const router = useRouter();
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const [phone, setPhone] = useState("+1");
  const [code, setCode] = useState("");
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recaptchaSize, setRecaptchaSize] =
    useState<RecaptchaSize>("invisible");

  const isCodeSent = Boolean(confirmationResult);

  useEffect(() => {
    if (!auth || !recaptchaContainerRef.current) return;
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }

    recaptchaVerifierRef.current = new RecaptchaVerifier(
      auth,
      recaptchaContainerRef.current,
      {
        size: recaptchaSize,
        "expired-callback": () => {
          setError("reCAPTCHA expired. Please try again.");
        },
      }
    );

    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, [recaptchaSize]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  const sendCode = async () => {
    setSending(true);
    setError(null);

    try {
      if (!auth || !recaptchaVerifierRef.current) {
        throw new Error("reCAPTCHA not ready.");
      }

      const result = await signInWithPhoneNumber(
        auth,
        normalizedPhone,
        recaptchaVerifierRef.current
      );
      setConfirmationResult(result);
      setCode("");
      setCooldown(30);
    } catch (err) {
      const message = getPhoneErrorMessage(err);
      setError(message);
      if (shouldShowVisibleRecaptcha(err)) {
        setRecaptchaSize("normal");
      }
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setVerifying(true);
    setError(null);

    try {
      if (!confirmationResult) {
        throw new Error("Please request a verification code first.");
      }
      const credential = await confirmationResult.confirm(code.trim());
      await ensureUserProfile(credential.user, {
        phone: credential.user.phoneNumber ?? normalizedPhone,
      });
      router.replace(nextPath);
    } catch (err) {
      setError(getPhoneErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-zinc-900">
        {intent === "signup" ? "Verify your phone" : "Phone sign-in"}
      </p>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-700" htmlFor="phone">
          Phone number
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+1 973 555 1234"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={sending || verifying}
        />
        <p className="text-xs text-zinc-500">{SMS_INFO_COPY}</p>
        {recaptchaSize === "invisible" ? (
          <button
            type="button"
            className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
            onClick={() => setRecaptchaSize("normal")}
          >
            Having trouble? Show reCAPTCHA
          </button>
        ) : null}
      </div>

      <div
        className={
          recaptchaSize === "normal"
            ? "rounded-xl border border-zinc-200 p-3"
            : "h-0 overflow-hidden"
        }
      >
        <div ref={recaptchaContainerRef} />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={sendCode}
        disabled={sending || verifying || !normalizedPhone || cooldown > 0}
      >
        {sending
          ? "Sending..."
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Send code"}
      </Button>

      <div className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-700" htmlFor="otp">
            Verification code
          </label>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={!isCodeSent || verifying}
          />
          {!isCodeSent ? (
            <p className="text-xs text-zinc-500">
              Send a code first, then enter the 6-digit OTP.
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={verifyCode}
          disabled={!isCodeSent || verifying || code.trim().length < 6}
        >
          {verifying ? "Signing in..." : "Verify & Sign in"}
        </Button>

        <button
          type="button"
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
          onClick={sendCode}
          disabled={!isCodeSent || sending || verifying || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    return trimmed.replace(/\s+/g, "");
  }
  const digits = trimmed.replace(/\D/g, "");
  return `+1${digits}`;
}

function getPhoneErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: string }).code);
    if (code.includes("invalid-phone-number")) {
      return "Enter a valid phone number.";
    }
    if (code.includes("too-many-requests")) {
      return "Too many attempts. Please try again later.";
    }
    if (code.includes("quota") || code.includes("sms")) {
      return "SMS limit reached. Please try again later or use email/Google sign-in.";
    }
    if (code.includes("billing-not-enabled")) {
      return "SMS sign-in requires billing to be enabled on the Firebase project. Use email/Google or test phone numbers.";
    }
    if (code.includes("unauthorized-domain")) {
      return "This domain is not authorized for phone sign-in. Add localhost (and your domain) in Firebase Auth settings.";
    }
    if (code.includes("invalid-verification-code")) {
      return "Invalid verification code.";
    }
    if (code.includes("code-expired")) {
      return "Verification code expired. Please resend.";
    }
    if (code.includes("missing-recaptcha-token")) {
      return "reCAPTCHA verification failed. Please try again.";
    }
    if (code.includes("captcha-check-failed")) {
      return "reCAPTCHA check failed. Please try again.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to sign in with phone. Please try again.";
}

function shouldShowVisibleRecaptcha(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String((error as { code?: string }).code);
    return code.includes("captcha") || code.includes("recaptcha");
  }
  return false;
}

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { authedFetch } from "@/lib/client/authedFetch";
import { dashboardDeals } from "@/mock/dashboardDeals";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
};

const sections = [
  { id: "profile", label: "Profile" },
  { id: "orders", label: "Orders" },
  { id: "deals", label: "Deals" },
  { id: "billing", label: "Billing" },
];

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded-full bg-zinc-200" />
      <div className="h-24 animate-pulse rounded-2xl bg-zinc-200" />
    </div>
  );
}

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function AddCardForm({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? "Unable to save card.");
      setSubmitting(false);
      return;
    }

    toast.success("Card saved");
    setSubmitting(false);
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <PaymentElement />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={!stripe || submitting}>
        {submitting ? "Saving..." : "Save card"}
      </Button>
    </form>
  );
}

function BillingSection({
  email,
}: {
  email?: string | null;
}) {
  const stripeReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const [loading, setLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentLoading, setIntentLoading] = useState(false);

  const loadPaymentMethods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/billing/payment-methods");
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as {
        defaultPaymentMethodId: string | null;
        paymentMethods: PaymentMethod[];
      };
      setPaymentMethods(data.paymentMethods ?? []);
      setDefaultId(data.defaultPaymentMethodId ?? null);
    } catch (err) {
      setError((err as Error).message || "Unable to load payment methods.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openAddCard = useCallback(async () => {
    if (!stripeReady) return;
    setIntentLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/billing/setup-intent", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { clientSecret: string };
      setClientSecret(data.clientSecret);
      setModalOpen(true);
    } catch (err) {
      setError((err as Error).message || "Unable to start card setup.");
    } finally {
      setIntentLoading(false);
    }
  }, [stripeReady]);

  const setDefault = async (id: string) => {
    try {
      const res = await authedFetch(`/api/billing/payment-methods/${id}/default`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      toast.success("Default payment method updated");
      await loadPaymentMethods();
    } catch {
      toast.error("Unable to update default");
    }
  };

  const removeMethod = async (id: string) => {
    try {
      const res = await authedFetch(`/api/billing/payment-methods/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      toast.success("Payment method removed");
      await loadPaymentMethods();
    } catch {
      toast.error("Unable to remove payment method");
    }
  };

  useEffect(() => {
    void loadPaymentMethods();
  }, [loadPaymentMethods]);

  const elementsOptions = useMemo(
    () =>
      clientSecret
        ? {
            clientSecret,
            appearance: { theme: "stripe" as const },
          }
        : undefined,
    [clientSecret]
  );

  return (
    <Card id="billing" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Billing</h2>
          <p className="text-sm text-zinc-600">
            Manage your saved payment methods.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={openAddCard}
          disabled={!stripeReady || intentLoading}
        >
          {intentLoading ? "Starting..." : "Add new card"}
        </Button>
      </div>

      {!stripeReady ? (
        <p className="text-sm text-red-600">
          Stripe publishable key is missing. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="space-y-3">
          <div className="h-16 animate-pulse rounded-2xl bg-zinc-200" />
          <div className="h-16 animate-pulse rounded-2xl bg-zinc-200" />
        </div>
      ) : paymentMethods.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No saved cards yet. Add one to speed up checkout.
        </p>
      ) : (
        <div className="space-y-3">
          {paymentMethods.map((method) => (
            <div
              key={method.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {method.brand.toUpperCase()} •••• {method.last4}
                </p>
                <p className="text-xs text-zinc-500">
                  Expires {method.expMonth ?? "--"}/{method.expYear ?? "--"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {defaultId === method.id ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Default
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDefault(method.id)}
                  >
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMethod(method.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="Add a new card"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        {clientSecret && elementsOptions ? (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <AddCardForm
              onComplete={() => {
                setModalOpen(false);
                setClientSecret(null);
                void loadPaymentMethods();
              }}
            />
          </Elements>
        ) : (
          <p className="text-sm text-zinc-600">Preparing secure form...</p>
        )}
        {email ? (
          <p className="mt-3 text-xs text-zinc-500">
            Cards saved for {email}.
          </p>
        ) : null}
      </Modal>
    </Card>
  );
}

export default function AccountClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("profile");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [appliedDeals, setAppliedDeals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin?next=/account");
    }
  }, [loading, user, router]);

  const openEdit = () => {
    setEditName(user.displayName ?? "");
    setEditPhone(user.phoneNumber ?? "");
    setEditOpen(true);
  };

  const handleJump = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading) {
    return <SectionSkeleton />;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-4">
        <Card className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Account</p>
            <h1 className="text-lg font-semibold text-zinc-900">
              {user.displayName ?? "Welcome"}
            </h1>
            <p className="text-sm text-zinc-600">{user.email}</p>
          </div>
          <div className="hidden flex-col gap-2 lg:flex">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => handleJump(section.id)}
                className={`rounded-full px-4 py-2 text-left text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:hidden">
          <Card className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-700">Jump to</p>
            <select
              className="h-9 rounded-full border border-zinc-300 bg-white px-3 text-sm text-zinc-700"
              value={activeSection}
              onChange={(event) => handleJump(event.target.value)}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </Card>
        </div>
      </aside>

      <div className="space-y-6">
        <Card id="profile" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Personal info</h2>
              <p className="text-sm text-zinc-600">
                Keep your profile information up to date.
              </p>
            </div>
            <Button variant="outline" onClick={openEdit}>
              Edit
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-zinc-500">Name</p>
              <p className="text-sm font-medium text-zinc-900">
                {user.displayName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Email</p>
              <p className="text-sm font-medium text-zinc-900">{user.email}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-zinc-500">Phone</p>
              <p className="text-sm font-medium text-zinc-900">
                {user.phoneNumber ?? "—"}
              </p>
            </div>
          </div>
        </Card>

        <Card id="orders" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Orders</h2>
            <p className="text-sm text-zinc-600">
              Track recent purchases and reorder favorites.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-600">
              View your order history and current status updates.
            </p>
            <Button variant="outline" onClick={() => router.push("/orders")}>
              Go to orders
            </Button>
          </div>
        </Card>

        <Card id="deals" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Deals</h2>
            <p className="text-sm text-zinc-600">Apply available savings.</p>
          </div>
          <div className="space-y-3">
            {dashboardDeals.map((deal) => {
              const applied = appliedDeals[deal.id];
              return (
                <div
                  key={deal.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {deal.title}
                    </p>
                    <p className="text-xs text-zinc-500">{deal.description}</p>
                    <p className="text-xs text-zinc-500">
                      Code {deal.code} • Expires {deal.expires}
                    </p>
                  </div>
                  <Button
                    variant={applied ? "ghost" : "outline"}
                    size="sm"
                    onClick={() =>
                      setAppliedDeals((prev) => ({
                        ...prev,
                        [deal.id]: !applied,
                      }))
                    }
                  >
                    {applied ? "Remove" : "Apply"}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        <BillingSection email={user.email} />
      </div>

      <Modal
        title="Edit personal info"
        open={editOpen}
        onClose={() => setEditOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-500">Name</label>
            <Input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500">Phone</label>
            <Input
              value={editPhone}
              onChange={(event) => setEditPhone(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              onClick={() => {
                setEditOpen(false);
                toast.success("Profile saved", "Saved locally for now.");
              }}
            >
              Save changes
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

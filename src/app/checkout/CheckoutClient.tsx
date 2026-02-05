"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { db } from "@/lib/firebase";
import { calcTotals } from "@/utils/calcTotals";

const DELIVERY_FEE = 5.99;
const MIN_DELIVERY_ORDER = 20;
const DELIVERY_RADIUS_MILES = 8;
const ADDRESS_DEBOUNCE_MS = 400;
const PREFS_STORAGE_KEY = "vailsburg_checkout_prefs_v1";

const TIP_OPTIONS = [0, 0.1, 0.15, 0.2];

const policyLinks = [
  { href: "/policies/delivery", label: "Delivery Policy" },
  { href: "/policies/pickup", label: "Pickup Policy" },
  { href: "/policies/refund-cancellation", label: "Refund & Cancellation" },
  { href: "/policies/terms", label: "Terms of Service" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/age-verification", label: "Age Verification (21+)" },
];

type Fulfillment = "delivery" | "pickup";

type Address = {
  street: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
};

type Coordinates = {
  lat: number;
  lng: number;
};

type AddressSuggestion = {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  coordinates: Coordinates;
};

type ValidationState = {
  status: "idle" | "loading" | "eligible" | "ineligible" | "error";
  distanceMiles?: number;
  message?: string;
};

type CheckoutPrefs = {
  fulfillmentType: Fulfillment;
  address: Address;
  coords?: Coordinates;
  distanceMiles?: number;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatMiles(value?: number) {
  if (typeof value !== "number") return "";
  return value.toFixed(1);
}

function formatAddressLabel(value: Address) {
  const parts = [
    value.street,
    value.city,
    value.state,
    value.zip,
  ]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(", ");
}

function readLocalPrefs(): CheckoutPrefs | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CheckoutPrefs;
  } catch {
    return null;
  }
}

function writeLocalPrefs(prefs: CheckoutPrefs) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

async function fetchGeocode(query: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/mapbox/geocode?query=${encodeURIComponent(query)}`,
    { signal }
  );
  if (!response.ok) throw new Error("geocode-failed");
  const data = (await response.json()) as { features?: AddressSuggestion[] };
  return data.features ?? [];
}

async function fetchDistance(coords: Coordinates, signal?: AbortSignal) {
  const response = await fetch(
    `/api/mapbox/distance?toLat=${coords.lat}&toLng=${coords.lng}`,
    { signal }
  );
  if (!response.ok) throw new Error("distance-failed");
  const data = (await response.json()) as { distanceMiles?: number };
  if (typeof data.distanceMiles !== "number") throw new Error("distance-failed");
  return data.distanceMiles;
}

export default function CheckoutClient() {
  const { items, loading } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [tipMode, setTipMode] = useState<"percent" | "custom">("percent");
  const [tipPercent, setTipPercent] = useState(0.1);
  const [customTip, setCustomTip] = useState(0);
  const [address, setAddress] = useState<Address>({
    street: "",
    apt: "",
    city: "",
    state: "NJ",
    zip: "",
  });
  const [addressSearch, setAddressSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [manualSearch, setManualSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({
    status: "idle",
  });
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  const validationCache = useRef<{ key: string; result: ValidationState } | null>(
    null
  );
  const validationAbort = useRef<AbortController | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPrefsRef = useRef<CheckoutPrefs | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.price * item.qty, 0),
    [items]
  );

  const tipAmount = useMemo(() => {
    if (fulfillment !== "delivery") return 0;
    if (tipMode === "custom") return customTip;
    return subtotal * tipPercent;
  }, [fulfillment, tipMode, tipPercent, customTip, subtotal]);

  const deliveryEligible =
    fulfillment === "delivery" && validation.status === "eligible";
  const deliveryIneligible =
    fulfillment === "delivery" && validation.status === "ineligible";

  const deliveryFee = deliveryEligible ? DELIVERY_FEE : 0;

  const totals = useMemo(
    () => calcTotals({ items, deliveryFee, tip: tipAmount }),
    [items, deliveryFee, tipAmount]
  );

  const minOrderRequired = fulfillment === "delivery" && deliveryEligible;
  const meetsMinOrder = !minOrderRequired || subtotal >= MIN_DELIVERY_ORDER;

  const canPlaceOrder =
    items.length > 0 &&
    !loading &&
    (fulfillment === "pickup" || (deliveryEligible && meetsMinOrder));

  const addressQuery = useMemo(() => {
    const searchValue = addressSearch.trim();
    if (searchValue) return searchValue;

    const hasStreet = address.street.trim().length > 2;
    const hasCity = address.city.trim().length > 1;
    const hasZip = address.zip.trim().length >= 4;
    if (!(hasStreet && hasCity && hasZip)) return "";

    const parts = [address.street, address.city, address.state, address.zip]
      .map((value) => value.trim())
      .filter(Boolean);
    return parts.join(", ");
  }, [addressSearch, address.street, address.city, address.state, address.zip]);

  useEffect(() => {
    const stored = readLocalPrefs();
    if (stored) {
      localPrefsRef.current = stored;
      setFulfillment(stored.fulfillmentType);
      setAddress((prev) => ({
        ...prev,
        ...stored.address,
        state: stored.address.state || "NJ",
      }));
      const label = formatAddressLabel(stored.address);
      if (label) {
        setAddressSearch(label);
        setManualSearch(false);
      }
      if (stored.coords) {
        setCoords(stored.coords);
        setValidation({
          status:
            stored.distanceMiles && stored.distanceMiles <= DELIVERY_RADIUS_MILES
              ? "eligible"
              : stored.distanceMiles
                ? "ineligible"
                : "idle",
          distanceMiles: stored.distanceMiles,
        });
      }
    }

    setLocalLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setPrefsReady(localLoaded);
      return;
    }

    if (!db) return;
    let active = true;

    const loadPrefs = async () => {
      setPrefsReady(false);
      const ref = doc(db, "users", user.uid, "checkoutPrefs", "default");
      const snap = await getDoc(ref);
      if (!active) return;

      if (snap.exists()) {
        const data = snap.data() as CheckoutPrefs;
        setFulfillment(data.fulfillmentType ?? "delivery");
        if (data.address) {
          setAddress((prev) => ({
            ...prev,
            ...data.address,
            state: data.address.state || "NJ",
          }));
          const label = formatAddressLabel(data.address);
          if (label) {
            setAddressSearch(label);
            setManualSearch(false);
          }
        }
        if (data.coords) {
          setCoords(data.coords);
        }
        if (typeof data.distanceMiles === "number") {
          setValidation({
            status:
              data.distanceMiles <= DELIVERY_RADIUS_MILES
                ? "eligible"
                : "ineligible",
            distanceMiles: data.distanceMiles,
          });
        }
      } else if (localPrefsRef.current) {
        const payload = {
          ...localPrefsRef.current,
          updatedAt: serverTimestamp(),
        } as Record<string, unknown>;
        if (payload.coords === undefined) {
          delete payload.coords;
        }
        if (payload.distanceMiles === undefined) {
          delete payload.distanceMiles;
        }
        await setDoc(ref, {
          ...payload,
        });
      }
      setPrefsReady(true);
    };

    loadPrefs().catch(() => setPrefsReady(true));

    return () => {
      active = false;
    };
  }, [user, localLoaded]);

  useEffect(() => {
    if (!prefsReady) return;
    const prefsBase: CheckoutPrefs = {
      fulfillmentType: fulfillment,
      address,
    };
    if (typeof validation.distanceMiles === "number") {
      prefsBase.distanceMiles = validation.distanceMiles;
    }
    if (coords) {
      prefsBase.coords = coords;
    }

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      if (user && db) {
        const ref = doc(db, "users", user.uid, "checkoutPrefs", "default");
        await setDoc(ref, {
          ...prefsBase,
          updatedAt: serverTimestamp(),
        });
      } else {
        writeLocalPrefs(prefsBase);
      }
    }, 500);
  }, [prefsReady, fulfillment, address, coords, validation.distanceMiles, user]);

  useEffect(() => {
    if (fulfillment !== "delivery") {
      setValidation({ status: "idle" });
      setSuggestions([]);
      return;
    }

    if (!searchFocused || !manualSearch) {
      setSuggestions([]);
      return;
    }

    if (addressSearch.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await fetchGeocode(addressSearch.trim(), controller.signal);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, ADDRESS_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [addressSearch, fulfillment, manualSearch, searchFocused]);

  const validateAddress = useCallback(async (overrideCoords?: Coordinates) => {
    if (fulfillment !== "delivery") return;
    const query = addressQuery;
    const targetCoords = overrideCoords ?? coords;
    const cacheKey = targetCoords
      ? `coords:${targetCoords.lat.toFixed(5)},${targetCoords.lng.toFixed(5)}`
      : `query:${query.toLowerCase()}`;

    if (validationCache.current?.key === cacheKey) {
      setValidation(validationCache.current.result);
      return;
    }

    if (!query && !targetCoords) return;

    validationAbort.current?.abort();
    const controller = new AbortController();
    validationAbort.current = controller;
    setValidation({ status: "loading" });

    try {
      let resolvedCoords = targetCoords;

      if (!resolvedCoords) {
        const results = await fetchGeocode(query, controller.signal);
        if (!results.length) {
          throw new Error("Address not found");
        }
        resolvedCoords = results[0].coordinates;
      }

      const miles = await fetchDistance(resolvedCoords, controller.signal);
      const result: ValidationState =
        miles <= DELIVERY_RADIUS_MILES
          ? { status: "eligible", distanceMiles: miles }
          : { status: "ineligible", distanceMiles: miles };

      setValidation(result);
      validationCache.current = { key: cacheKey, result };
      setCoords(resolvedCoords);
    } catch {
      if (controller.signal.aborted) return;
      setValidation({
        status: "error",
        message: "Unable to validate address. Try again.",
      });
    }
  }, [addressQuery, coords, fulfillment]);

  useEffect(() => {
    if (fulfillment !== "delivery") return;
    if (!addressQuery && !coords) {
      setValidation({ status: "idle" });
      return;
    }
    if (addressQuery.trim().length < 3 && !coords) {
      setValidation({ status: "idle" });
      return;
    }

    const timer = setTimeout(() => {
      void validateAddress();
    }, ADDRESS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [addressSearch, addressQuery, coords, fulfillment, validateAddress]);

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setAddress({
      street: suggestion.street,
      apt: "",
      city: suggestion.city,
      state: "NJ",
      zip: suggestion.zip,
    });
    setAddressSearch(suggestion.label);
    setManualSearch(false);
    setSearchFocused(false);
    setSuggestions([]);
    setCoords(suggestion.coordinates);
    void validateAddress(suggestion.coordinates);
  };

  const handleAddressChange = (field: keyof Address, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
    if (field !== "apt") {
      setCoords(null);
    }
  };

  const tipEnabled = fulfillment === "delivery";

  const handleCreateIntent = async () => {
    if (!canPlaceOrder || creatingIntent) return;
    setIntentError(null);
    setCreatingIntent(true);

    try {
      const idToken = user ? await user.getIdToken() : null;
      const payload = {
        items: items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
        })),
        fulfillment,
        address,
        coords,
        distanceMiles: validation.distanceMiles,
        tipAmount: tipAmount,
        idToken,
      };

      const response = await fetch("/api/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        clientSecret?: string;
        orderId?: string;
        error?: string;
        summary?: {
          subtotal: number;
          taxableSubtotal: number;
          deliveryFee: number;
          tip: number;
          tax: number;
          total: number;
          fulfillment: Fulfillment;
          address?: Address;
          items: Array<{
            productId: string;
            name: string;
            price: number;
            qty: number;
            image?: string | null;
            category?: string;
          }>;
        };
      };

      if (!response.ok || !data.clientSecret || !data.orderId) {
        throw new Error(data.error || "Unable to start payment.");
      }

      if (typeof window !== "undefined" && data.summary) {
        window.sessionStorage.setItem(
          `vw_order_summary_${data.orderId}`,
          JSON.stringify(data.summary)
        );
      }

      router.push(
        `/checkout/payment?orderId=${encodeURIComponent(
          data.orderId
        )}&clientSecret=${encodeURIComponent(data.clientSecret)}`
      );
    } catch (error) {
      setIntentError((error as Error).message || "Unable to start payment.");
    } finally {
      setCreatingIntent(false);
    }
  };

  if (loading && items.length === 0) {
    return <Card className="p-6 text-sm text-zinc-600">Loading checkout...</Card>;
  }

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-zinc-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Start shopping
        </Link>
      </Card>
    );
  }

  return (
    <div className="grid gap-8 pb-24 lg:pb-0 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
          <p className="text-sm text-zinc-600">
            Choose pickup or delivery and confirm your details.
          </p>
        </div>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Fulfillment</h2>
          <div className="flex flex-wrap gap-2">
            {(["delivery", "pickup"] as Fulfillment[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFulfillment(option)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  fulfillment === option
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700"
                }`}
              >
                {option === "delivery" ? "Delivery" : "Pickup"}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-600">
            Same-day delivery within 8 miles. Pickup available.
          </p>
        </Card>

        {fulfillment === "delivery" ? (
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              Delivery address
            </h2>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">
                Address search
              </label>
              <div className="relative">
                <Input
                  placeholder="Search your address"
                  value={addressSearch}
                  onChange={(event) => {
                    setAddressSearch(event.target.value);
                    setManualSearch(true);
                    setCoords(null);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setSearchFocused(false), 150);
                  }}
                />
                {searching ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    Searching...
                  </span>
                ) : null}
                {suggestions.length > 0 ? (
                  <div className="absolute z-20 mt-2 w-full rounded-2xl border border-zinc-200 bg-white shadow-lg">
                    {suggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="block w-full px-4 py-3 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  placeholder="Street address"
                  value={address.street}
                  onChange={(event) =>
                    handleAddressChange("street", event.target.value)
                  }
                />
              </div>
              <Input
                placeholder="Apt / Suite"
                value={address.apt}
                onChange={(event) => handleAddressChange("apt", event.target.value)}
              />
              <Input
                placeholder="City"
                value={address.city}
                onChange={(event) => handleAddressChange("city", event.target.value)}
              />
              <Input
                placeholder="State"
                value={address.state}
                disabled
              />
              <Input
                placeholder="ZIP"
                value={address.zip}
                onChange={(event) => handleAddressChange("zip", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              {validation.status === "loading" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
                  Validating address...
                </span>
              ) : null}
              {validation.status === "eligible" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  Delivery available ({formatMiles(validation.distanceMiles)} miles)
                </span>
              ) : null}
              {validation.status === "ineligible" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                  Outside delivery radius ({formatMiles(validation.distanceMiles)} miles).
                </span>
              ) : null}
              {validation.status === "error" ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
                  {validation.message ?? "Unable to validate address."}
                </span>
              ) : null}
            </div>

            {deliveryIneligible ? (
              <Button
                variant="outline"
                onClick={() => setFulfillment("pickup")}
              >
                Switch to pickup
              </Button>
            ) : null}
          </Card>
        ) : null}

        {tipEnabled ? (
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Tip</h2>
            <div className="flex flex-wrap gap-2">
              {TIP_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTipMode("percent");
                    setTipPercent(option);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    tipMode === "percent" && tipPercent === option
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-700"
                  }`}
                >
                  {option === 0 ? "No tip" : `${option * 100}%`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTipMode("custom")}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  tipMode === "custom"
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 text-zinc-700"
                }`}
              >
                Custom
              </button>
            </div>
            {tipMode === "custom" ? (
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Enter tip"
                value={customTip ? String(customTip) : ""}
                onChange={(event) =>
                  setCustomTip(Number.parseFloat(event.target.value) || 0)
                }
              />
            ) : null}
          </Card>
        ) : null}

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-900">Policies</h2>
          <p className="text-sm text-zinc-600">
            By placing an order, you agree to the following policies.
          </p>
          <ul className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
            {policyLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-zinc-900">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Order summary</h2>
          <div className="space-y-2 text-sm text-zinc-600">
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
            {deliveryEligible ? (
              <div className="flex items-center justify-between">
                <span>Delivery fee</span>
                <span>{formatMoney(totals.deliveryFee)}</span>
              </div>
            ) : null}
            {tipEnabled ? (
              <div className="flex items-center justify-between">
                <span>Tip</span>
                <span>{formatMoney(totals.tip)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span>Tax</span>
              <span>Calculated at checkout</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-4 text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
          {!meetsMinOrder ? (
            <p className="text-xs text-amber-600">
              Delivery requires a minimum order of ${MIN_DELIVERY_ORDER}.
            </p>
          ) : null}
          {fulfillment === "delivery" && validation.status === "error" ? (
            <p className="text-xs text-amber-600">
              Validate your address to continue.
            </p>
          ) : null}
          {intentError ? (
            <p className="text-xs text-red-600">{intentError}</p>
          ) : null}
          <Button
            disabled={!canPlaceOrder || creatingIntent}
            aria-disabled={!canPlaceOrder || creatingIntent}
            onClick={handleCreateIntent}
          >
            {creatingIntent ? "Starting payment..." : "Pay now"}
          </Button>
        </Card>

        <Card className="space-y-2 text-xs text-zinc-500">
          <p>Tax calculated at checkout.</p>
          <p>Same-day delivery only.</p>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">Total</p>
            <p className="text-sm font-semibold text-zinc-900">
              {formatMoney(totals.total)}
            </p>
          </div>
          <Button
            disabled={!canPlaceOrder || creatingIntent}
            aria-disabled={!canPlaceOrder || creatingIntent}
            onClick={handleCreateIntent}
          >
            {creatingIntent ? "Starting..." : "Pay now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

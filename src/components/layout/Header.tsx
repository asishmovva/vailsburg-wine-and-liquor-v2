"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { useRole } from "@/hooks/useRole";
import { signOut } from "@/services/auth";

const baseMobileLinks = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/favorites", label: "Favorites" },
  { href: "/cart", label: "Cart" },
  { href: "/orders", label: "Dashboard" },
  { href: "/policies", label: "Policies" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  const { user, loading } = useAuth();
  const { role } = useRole(user);
  const isAuthed = Boolean(user);
  const showAdmin = role === "admin";
  const { totalQty } = useCart();

  useEffect(() => {
    if (!accountOpen) return;
    const handler = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [accountOpen]);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("overflow-hidden");
      return;
    }
    document.body.classList.add("overflow-hidden");
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const mobileLinks = useMemo(() => {
    if (!showAdmin) return baseMobileLinks;
    const withAdmin = [...baseMobileLinks];
    withAdmin.splice(5, 0, { href: "/admin", label: "Admin" });
    return withAdmin;
  }, [showAdmin]);

  const handleSignOut = async () => {
    await signOut();
    setAccountOpen(false);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="hidden h-16 items-center justify-between md:flex">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900"
          >
            Vailsburg Wine & Liquor
          </Link>

          <form
            action="/shop"
            method="get"
            className="mx-8 flex w-full max-w-xl"
          >
            <Input
              name="q"
              placeholder="Search wine, beer, spirits..."
              aria-label="Search"
            />
          </form>

          <div className="flex items-center gap-3">
            <Link
              href="/favorites"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <IconHeart />
              <span className="hidden lg:inline">Favorites</span>
            </Link>
            <Link
              href="/cart"
              className="relative inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
            >
              <IconCart />
              <span className="hidden lg:inline">Cart</span>
              <Badge className="bg-zinc-900 text-white">{totalQty}</Badge>
            </Link>

            {loading ? (
              <div className="h-10 w-24 rounded-full bg-zinc-100" />
            ) : isAuthed ? (
              <AccountDropdown
                open={accountOpen}
                onToggle={() => setAccountOpen((prev) => !prev)}
                onClose={() => setAccountOpen(false)}
                onSignOut={handleSignOut}
                showAdmin={showAdmin}
                menuRef={menuRef}
              />
            ) : (
              <Link
                href="/signin"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white"
              >
                <IconUser />
                <span className="hidden lg:inline">Sign in</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex h-16 items-center justify-between md:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-700"
            aria-label="Open menu"
          >
            <IconMenu />
          </button>
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-900"
          >
            Vailsburg Wine & Liquor
          </Link>
          <Link
            href="/cart"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-700"
            aria-label="Cart"
          >
            <IconCart />
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center px-1">
              {totalQty}
            </Badge>
          </Link>
        </div>
      </div>

      <MobileNavDrawer
        open={open}
        onClose={() => setOpen(false)}
        links={mobileLinks}
        loading={loading}
        isAuthed={isAuthed}
        onSignOut={handleSignOut}
        pathname={pathname}
      />
    </header>
  );
}

function AccountDropdown({
  open,
  onToggle,
  onClose,
  onSignOut,
  showAdmin,
  menuRef,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSignOut: () => void;
  showAdmin: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900"
        aria-expanded={open}
      >
        <IconUser />
        <span className="hidden lg:inline">Account</span>
        <IconChevron />
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg">
          <Link
            href="/orders"
            className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={onClose}
          >
            Dashboard
          </Link>
          <Link
            href="/favorites"
            className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={onClose}
          >
            Favorites
          </Link>
          {showAdmin ? (
            <Link
              href="/admin"
              className="block rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={onClose}
            >
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavDrawer({
  open,
  onClose,
  links,
  loading,
  isAuthed,
  onSignOut,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  links: { href: string; label: string }[];
  loading: boolean;
  isAuthed: boolean;
  onSignOut: () => void;
  pathname: string;
}) {
  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity md:hidden ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div
        className={`fixed left-0 top-0 h-dvh w-[85vw] max-w-[320px] bg-white shadow-2xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <div className="flex h-full flex-col overflow-y-auto px-6 pb-6">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-zinc-900">Menu</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600"
            >
              Close
            </button>
          </div>
          <nav className="mt-6 space-y-4">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-xl px-3 py-2 text-base font-medium transition ${
                    isActive
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-800 hover:bg-zinc-100"
                  }`}
                  onClick={onClose}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-zinc-200 pt-4">
            {loading ? (
              <div className="h-10 w-32 rounded-full bg-zinc-100" />
            ) : isAuthed ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-medium text-zinc-700"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/signin"
                className="inline-flex h-10 w-full items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-sm font-medium text-white"
                onClick={onClose}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconMenu() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconCart() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 6h14l-1.5 9h-11z" />
      <path d="M6 6l-1-3H2" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.7A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

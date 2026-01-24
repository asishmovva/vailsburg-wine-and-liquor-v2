"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";

const cartCount = 0;
const isAuthed = false;
const showAdmin = false;

const navItemClass =
  "text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-900";

const mobileLinks = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/favorites", label: "Favorites" },
  { href: "/cart", label: "Cart" },
  { href: "/orders", label: "Dashboard" },
  { href: "/policies", label: "Policies" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const authLabel = isAuthed ? "Profile" : "Sign in";
  const authHref = isAuthed ? "/orders" : "/signin";

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

          <div className="flex items-center gap-4">
            <Link href={authHref} className={navItemClass}>
              {authLabel}
            </Link>
            <Link href="/orders" className={navItemClass}>
              Dashboard
            </Link>
            <Link href="/favorites" className={navItemClass}>
              Favorites
            </Link>
            <Link
              href="/cart"
              className="relative inline-flex items-center gap-2 text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-900"
            >
              Cart
              <Badge className="bg-zinc-900 text-white">{cartCount}</Badge>
            </Link>
            {showAdmin ? (
              <Link href="/admin" className={navItemClass}>
                Admin
              </Link>
            ) : null}
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
              {cartCount}
            </Badge>
          </Link>
        </div>
      </div>

      <MobileNavDrawer open={open} onClose={() => setOpen(false)} />
    </header>
  );
}

function MobileNavDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-40 transition-opacity md:hidden ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div
        className={`absolute left-0 top-0 h-full w-72 bg-white p-6 shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
          {mobileLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-base font-medium text-zinc-800"
              onClick={onClose}
            >
              {link.label}
            </Link>
          ))}
        </nav>
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


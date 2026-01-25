"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface HeroSlide {
  id: string;
  title: string;
  description: string;
  badge: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  gradientClass: string;
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSlide = useMemo(
    () => slides[activeIndex] ?? slides[0],
    [slides, activeIndex]
  );

  const goPrev = () => {
    setActiveIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  };

  if (!activeSlide) return null;

  return (
    <section className="relative overflow-hidden rounded-3xl">
      <div
        className={`relative min-h-[320px] overflow-hidden rounded-3xl px-6 py-10 text-white sm:min-h-[360px] sm:px-10 sm:py-12 ${activeSlide.gradientClass}`}
      >
        <div className="relative z-10 max-w-2xl space-y-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            {activeSlide.badge}
          </p>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
            {activeSlide.title}
          </h1>
          <p className="text-sm text-white/85 sm:text-base">
            {activeSlide.description}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={activeSlide.primaryCta.href}
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900"
            >
              {activeSlide.primaryCta.label}
            </Link>
            <Link
              href={activeSlide.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {activeSlide.secondaryCta.label}
            </Link>
          </div>
        </div>

        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 rounded-full bg-white/15 blur-[80px]" />
      </div>

      <button
        type="button"
        onClick={goPrev}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/40 bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        onClick={goNext}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/40 bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
      >
        <ChevronRight />
      </button>

      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            aria-label={`Go to ${slide.title}`}
            onClick={() => setActiveIndex(index)}
            className={`h-2.5 w-2.5 rounded-full transition ${
              index === activeIndex ? "bg-white" : "bg-white/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function ChevronLeft() {
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
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function ChevronRight() {
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
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

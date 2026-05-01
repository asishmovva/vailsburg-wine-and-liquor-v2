import { describe, expect, it } from "vitest";
import {
  applyReservedStock,
  buildReservationExpiry,
  buildReservationReleaseStock,
  getAvailableStock,
  getReservedStock,
  isReservationExpired,
} from "@/lib/checkout/inventoryReservations";

describe("inventory reservations", () => {
  it("computes available stock from stock minus reserved stock", () => {
    expect(getReservedStock({ stock: 12, reservedStock: 4 })).toBe(4);
    expect(getAvailableStock({ stock: 12, reservedStock: 4 })).toBe(8);
    expect(getAvailableStock({ stock: 3, reservedStock: 9 })).toBe(0);
  });

  it("detects expired active reservations", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    const future = buildReservationExpiry(now);

    expect(
      isReservationExpired(
        {
          inventoryReservationActive: true,
          reservationExpiresAt: new Date(now.getTime() - 60_000),
        },
        now
      )
    ).toBe(true);

    expect(
      isReservationExpired(
        {
          inventoryReservationActive: true,
          reservationExpiresAt: future,
        },
        now
      )
    ).toBe(false);
  });

  it("clamps reserved stock math at zero", () => {
    expect(applyReservedStock(2, 3)).toBe(5);
    expect(buildReservationReleaseStock(2, 5)).toBe(0);
  });
});

export type CheckoutFulfillment = "delivery" | "pickup";

export type FulfillmentAvailability = {
  fulfillment: CheckoutFulfillment;
  isOpen: boolean;
  openMinutes: number;
  closeMinutes: number;
  currentMinutes: number;
  label: string;
  message: string | null;
  timeZone: string;
};

const DEFAULT_STORE_TIME_ZONE = process.env.STORE_TIMEZONE?.trim() || "America/New_York";

const DEFAULT_WINDOWS: Record<CheckoutFulfillment, string> = {
  pickup: process.env.CHECKOUT_PICKUP_HOURS?.trim() || "09:00-21:00",
  delivery: process.env.CHECKOUT_DELIVERY_HOURS?.trim() || "10:00-20:00",
};

function padMinutes(value: number) {
  return value.toString().padStart(2, "0");
}

function parseClockValue(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid checkout hours value "${value}". Expected HH:MM.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid checkout hours value "${value}". Expected HH:MM.`);
  }

  return hours * 60 + minutes;
}

function formatMinutesLabel(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${padMinutes(minutes)} ${period}`;
}

function parseHoursWindow(value: string) {
  const [rawOpen, rawClose] = value.split("-");
  if (!rawOpen || !rawClose) {
    throw new Error(`Invalid checkout hours window "${value}". Expected HH:MM-HH:MM.`);
  }

  const openMinutes = parseClockValue(rawOpen);
  const closeMinutes = parseClockValue(rawClose);

  if (closeMinutes <= openMinutes) {
    throw new Error(
      `Invalid checkout hours window "${value}". Closing time must be after opening time.`
    );
  }

  return {
    openMinutes,
    closeMinutes,
    label: `${formatMinutesLabel(openMinutes)} - ${formatMinutesLabel(closeMinutes)}`,
  };
}

function getCurrentStoreMinutes(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * 60 + minute;
}

export function getFulfillmentAvailability(
  fulfillment: CheckoutFulfillment,
  now = new Date(),
  timeZone = DEFAULT_STORE_TIME_ZONE
): FulfillmentAvailability {
  const window = parseHoursWindow(DEFAULT_WINDOWS[fulfillment]);
  const currentMinutes = getCurrentStoreMinutes(now, timeZone);
  const isOpen =
    currentMinutes >= window.openMinutes && currentMinutes < window.closeMinutes;

  return {
    fulfillment,
    isOpen,
    openMinutes: window.openMinutes,
    closeMinutes: window.closeMinutes,
    currentMinutes,
    label: window.label,
    message: isOpen
      ? null
      : fulfillment === "delivery"
        ? `Delivery orders are currently unavailable. Delivery hours are ${window.label}.`
        : `Pickup orders are currently unavailable. Pickup hours are ${window.label}.`,
    timeZone,
  };
}

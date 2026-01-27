import type { Timestamp } from "firebase/firestore";

export function orderNumberFromId(id: string, digits = 5) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000000;
  }
  const value = Math.abs(hash) % 10 ** digits;
  return value.toString().padStart(digits, "0");
}

export function formatOrderDate(value?: Timestamp | Date | null) {
  if (!value) return "";
  const date =
    value instanceof Date
      ? value
      : typeof (value as Timestamp).toDate === "function"
        ? (value as Timestamp).toDate()
        : new Date(value as unknown as string);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

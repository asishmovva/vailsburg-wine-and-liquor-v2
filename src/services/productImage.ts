export function resolveProductImage(input: {
  primaryImageUrl?: unknown;
  image?: unknown;
}) {
  const primary = String(input.primaryImageUrl ?? "").trim();
  if (primary) {
    return primary;
  }

  return String(input.image ?? "").trim();
}

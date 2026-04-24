"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { authedFetch } from "@/lib/client/authedFetch";

type AdminProductItem = {
  id: string;
  name: string;
  category: string;
  size: string;
  pack: string;
  price: number;
  inStock: boolean;
  image: string;
  hasImage: boolean;
};

type PendingUpload = {
  file: File;
  previewUrl: string;
};

const CATEGORY_OPTIONS = [
  "BEER",
  "WINE",
  "WHISKY",
  "VODKA",
  "TEQUILA",
  "RUM",
  "GIN",
  "COGNAC",
  "BRANDY",
  "LIQUOR",
  "SODA",
  "CHAMPAGNE",
  "COCKTAILS",
  "WINE COOLER",
];

export default function AdminProductsClient() {
  const [items, setItems] = useState<AdminProductItem[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [missingImageOnly, setMissingImageOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, PendingUpload>>(
    {}
  );
  const pendingUploadsRef = useRef<Record<string, PendingUpload>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    if (missingImageOnly) params.set("missingImage", "1");
    params.set("limit", "40");
    return params.toString();
  }, [q, category, missingImageOnly]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/admin/products?${queryString}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load products.");
      }
      const payload = (await response.json()) as { items: AdminProductItem[] };
      setItems(payload.items ?? []);
    } catch (loadError) {
      setError((loadError as Error).message ?? "Unable to load products.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      Object.values(pendingUploadsRef.current).forEach((upload) => {
        URL.revokeObjectURL(upload.previewUrl);
      });
    };
  }, []);

  const onChooseFile = (productId: string, file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    setPendingUploads((current) => {
      const existing = current[productId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      return {
        ...current,
        [productId]: {
          file,
          previewUrl: URL.createObjectURL(file),
        },
      };
    });
  };

  const clearPendingUpload = (productId: string) => {
    setPendingUploads((current) => {
      const existing = current[productId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      const next = { ...current };
      delete next[productId];
      return next;
    });

    const input = fileInputRefs.current[productId];
    if (input) input.value = "";
  };

  const uploadImage = async (productId: string) => {
    const pending = pendingUploads[productId];
    if (!pending) return;

    setUploadingId(productId);
    try {
      const formData = new FormData();
      formData.append("file", pending.file);

      const response = await authedFetch(`/api/admin/products/${productId}/image`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to upload image.");
      }

      toast.success("Product image updated.");
      clearPendingUpload(productId);
      await loadProducts();
    } catch (uploadError) {
      toast.error((uploadError as Error).message ?? "Unable to upload image.");
    } finally {
      setUploadingId(null);
    }
  };

  const removeImage = async (productId: string) => {
    setRemovingId(productId);
    try {
      const response = await authedFetch(`/api/admin/products/${productId}/image`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to remove image.");
      }

      toast.success("Product image removed.");
      clearPendingUpload(productId);
      await loadProducts();
    } catch (removeError) {
      toast.error((removeError as Error).message ?? "Unable to remove image.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Image Manager</h1>
          <Badge>Admin Only</Badge>
        </div>
        <p className="text-sm text-zinc-600">
          Search products, upload or replace images, and clean missing image gaps.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search product name"
            aria-label="Search product name"
          />

          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-4 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={missingImageOnly}
              onChange={(event) => setMissingImageOnly(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Missing image only
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>{loading ? "Loading..." : `Showing ${items.length} products`}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadProducts()}>
              Refresh
            </Button>
            <Link href="/admin/image-review" className="inline-flex">
              <Button variant="outline" size="sm">
                Review Image Matches
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {error ? <Card className="text-sm text-red-600">{error}</Card> : null}

      {!loading && items.length === 0 ? (
        <Card className="text-sm text-zinc-600">No products found for the current filters.</Card>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => {
          const pendingUpload = pendingUploads[item.id];
          const busy = uploadingId === item.id || removingId === item.id;
          const hasCurrentImage = Boolean(item.image);

          return (
            <Card
              key={item.id}
              className="grid gap-4 p-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start"
            >
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                {pendingUpload ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pendingUpload.previewUrl}
                    alt={`${item.name} preview`}
                    className="h-24 w-full object-contain"
                  />
                ) : item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-24 w-full object-contain"
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center text-xs text-zinc-500">
                    No image
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-900">{item.name}</p>
                    <p className="text-xs text-zinc-500">
                      {item.size || "-"} {item.pack ? `• ${item.pack}` : ""} •{" "}
                      {item.category} • ${item.price.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-zinc-400">ID: {item.id}</p>
                  </div>
                  <Badge className={item.inStock ? "bg-emerald-700" : "bg-zinc-500"}>
                    {item.inStock ? "In stock" : "Out of stock"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={(node) => {
                      fileInputRefs.current[item.id] = node;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) =>
                      onChooseFile(item.id, event.target.files?.[0] ?? null)
                    }
                  />

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                  >
                    {hasCurrentImage ? "Replace image" : "Upload image"}
                  </Button>

                  {pendingUpload ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void uploadImage(item.id)}
                      >
                        {uploadingId === item.id ? "Uploading..." : "Save image"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => clearPendingUpload(item.id)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}

                  {hasCurrentImage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void removeImage(item.id)}
                    >
                      {removingId === item.id ? "Removing..." : "Remove image"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

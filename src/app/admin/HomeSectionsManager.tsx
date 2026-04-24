"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { authedFetch } from "@/lib/client/authedFetch";

type SectionConfig = {
  id: string;
  title: string;
  href: string;
  productIds: string[];
};

type HomeSectionsResponse = {
  sections: SectionConfig[];
  source: "default" | "firestore";
  updatedAt: number | null;
  updatedBy: string | null;
};

type ProductPreview = {
  id: string;
  name: string;
  category?: string;
  size?: string;
  pack?: string;
  image?: string;
  inStock?: boolean;
};

function formatUpdatedAt(value: number | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export default function HomeSectionsManager() {
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState<"default" | "firestore">("default");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [metaById, setMetaById] = useState<Record<string, ProductPreview>>({});
  const [searchBySection, setSearchBySection] = useState<Record<string, string>>({});
  const [searchResultsBySection, setSearchResultsBySection] = useState<
    Record<string, ProductPreview[]>
  >({});
  const [searchingBySection, setSearchingBySection] = useState<
    Record<string, boolean>
  >({});
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/home-sections");
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load homepage sections.");
      }
      const payload = (await response.json()) as HomeSectionsResponse;
      setSections(payload.sections);
      setSource(payload.source);
      setUpdatedAt(payload.updatedAt);
      setUpdatedBy(payload.updatedBy);
    } catch (loadError) {
      setError((loadError as Error).message ?? "Unable to load homepage sections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    const timers = searchTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, [loadConfig]);

  const refreshSelectedMeta = useCallback(async () => {
    const ids = unique(sections.flatMap((section) => section.productIds));
    if (!ids.length) return;

    const response = await fetch("/api/products/by-ids", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) return;

    const payload = (await response.json()) as {
      items: Array<{
        id: string;
        name: string;
        category?: string;
        size?: string;
        pack?: string;
        image?: string;
        inStock?: boolean;
      }>;
    };

    setMetaById((current) => {
      const next = { ...current };
      for (const item of payload.items ?? []) {
        next[item.id] = {
          id: item.id,
          name: item.name,
          category: item.category,
          size: item.size,
          pack: item.pack,
          image: item.image,
          inStock: item.inStock,
        };
      }
      return next;
    });
  }, [sections]);

  useEffect(() => {
    void refreshSelectedMeta();
  }, [refreshSelectedMeta]);

  const updateSearch = (sectionId: string, value: string) => {
    setSearchBySection((current) => ({ ...current, [sectionId]: value }));

    const existingTimer = searchTimers.current[sectionId];
    if (existingTimer) clearTimeout(existingTimer);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSearchResultsBySection((current) => ({ ...current, [sectionId]: [] }));
      setSearchingBySection((current) => ({ ...current, [sectionId]: false }));
      return;
    }

    setSearchingBySection((current) => ({ ...current, [sectionId]: true }));
    searchTimers.current[sectionId] = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "8" });
        const response = await authedFetch(`/api/admin/products?${params.toString()}`);
        if (!response.ok) throw new Error("Search failed.");
        const payload = (await response.json()) as { items: ProductPreview[] };
        const results = payload.items ?? [];
        setSearchResultsBySection((current) => ({ ...current, [sectionId]: results }));
        setMetaById((current) => {
          const next = { ...current };
          for (const item of results) {
            next[item.id] = item;
          }
          return next;
        });
      } catch {
        setSearchResultsBySection((current) => ({ ...current, [sectionId]: [] }));
      } finally {
        setSearchingBySection((current) => ({ ...current, [sectionId]: false }));
      }
    }, 250);
  };

  const addProductToSection = (sectionId: string, product: ProductPreview) => {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.productIds.includes(product.id)) return section;
        return {
          ...section,
          productIds: [...section.productIds, product.id],
        };
      })
    );
    setSearchBySection((current) => ({ ...current, [sectionId]: "" }));
    setSearchResultsBySection((current) => ({ ...current, [sectionId]: [] }));
  };

  const removeProductFromSection = (sectionId: string, productId: string) => {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              productIds: section.productIds.filter((id) => id !== productId),
            }
          : section
      )
    );
  };

  const moveProduct = (sectionId: string, productId: string, direction: -1 | 1) => {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        const index = section.productIds.indexOf(productId);
        if (index < 0) return section;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= section.productIds.length) return section;
        const ids = [...section.productIds];
        const [moved] = ids.splice(index, 1);
        ids.splice(targetIndex, 0, moved);
        return { ...section, productIds: ids };
      })
    );
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await authedFetch("/api/admin/home-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to save homepage sections.");
      }
      setSource("firestore");
      setUpdatedAt(Date.now());
      setMessage("Homepage sections saved.");
      toast.success("Homepage sections updated.");
    } catch (saveError) {
      const messageText =
        (saveError as Error).message ?? "Unable to save homepage sections.";
      setError(messageText);
      toast.error(messageText);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card id="home-sections" className="space-y-2 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">Homepage Sections</p>
        <p>Loading section config...</p>
      </Card>
    );
  }

  return (
    <Card id="home-sections" className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-zinc-900">Homepage Sections</p>
          <p className="text-xs text-zinc-500">
            Source: {source} - Last updated: {formatUpdatedAt(updatedAt)}
            {updatedBy ? ` - by ${updatedBy}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadConfig()}>
            Reload
          </Button>
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? "Saving..." : "Save sections"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => {
          const searchValue = searchBySection[section.id] ?? "";
          const searchResults = searchResultsBySection[section.id] ?? [];
          const searching = searchingBySection[section.id] ?? false;

          return (
            <div
              key={section.id}
              className="space-y-3 rounded-2xl border border-zinc-200 p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-900">{section.title}</p>
                <p className="text-xs text-zinc-500">{section.href}</p>
              </div>

              <div className="space-y-2">
                <Input
                  value={searchValue}
                  onChange={(event) => updateSearch(section.id, event.target.value)}
                  placeholder="Search product name..."
                />
                {searching ? (
                  <p className="text-xs text-zinc-500">Searching...</p>
                ) : null}
                {searchResults.length > 0 ? (
                  <div className="space-y-1 rounded-xl border border-zinc-200 p-2">
                    {searchResults.map((result) => (
                      <div
                        key={`${section.id}-${result.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-2 py-1"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-zinc-900">
                            {result.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {result.size || "-"} {result.pack ? `• ${result.pack}` : ""}{" "}
                            • {result.category || "-"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addProductToSection(section.id, result)}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {section.productIds.length === 0 ? (
                  <p className="text-xs text-zinc-500">No products selected.</p>
                ) : (
                  section.productIds.map((id, index) => {
                    const product = metaById[id];
                    return (
                      <div
                        key={`${section.id}-${id}`}
                        className="flex items-center gap-2 rounded-xl border border-zinc-200 p-2"
                      >
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                          {product?.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-contain"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-900">
                            {product?.name ?? id}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {product?.size || "-"}{" "}
                            {product?.pack ? `• ${product.pack}` : ""}{" "}
                            {product?.category ? `• ${product.category}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={index === 0}
                            onClick={() => moveProduct(section.id, id, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={index === section.productIds.length - 1}
                            onClick={() => moveProduct(section.id, id, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeProductFromSection(section.id, id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

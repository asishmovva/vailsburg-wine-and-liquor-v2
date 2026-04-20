"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { authedFetch } from "@/lib/client/authedFetch";
import type {
  AdminAnalyticsResponse,
  AnalyticsRangeKey,
  AnalyticsTrendPoint,
} from "@/lib/analytics/types";

const RANGE_OPTIONS: Array<{ key: AnalyticsRangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

const KPI_CARD_STYLES = [
  "bg-white",
  "bg-white",
  "bg-white",
  "bg-white",
  "bg-white",
  "bg-white",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function buildAnalyticsUrl(filters: {
  range: AnalyticsRangeKey;
  start?: string;
  end?: string;
}) {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  return `/api/admin/analytics?${params.toString()}`;
}

function KpiCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <Card className={`space-y-2 p-5 ${className ?? ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="text-3xl font-semibold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </Card>
  );
}

function LoadingDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-64 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <Card className="space-y-2 text-sm text-zinc-600">
      <p className="font-medium text-zinc-900">No analytics data available.</p>
      <p>No orders were found for {rangeLabel.toLowerCase()}.</p>
    </Card>
  );
}

function LineChart({
  title,
  description,
  data,
  dataKey,
  formatter,
}: {
  title: string;
  description: string;
  data: AnalyticsTrendPoint[];
  dataKey: "revenue" | "orders";
  formatter: (value: number) => string;
}) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const values = data.map((point) => point[dataKey]);
  const maxValue = Math.max(...values, 1);
  const points = data
    .map((point, index) => {
      const x =
        data.length === 1
          ? width / 2
          : padding + (index * (width - padding * 2)) / (data.length - 1);
      const y =
        height - padding - (point[dataKey] / maxValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-zinc-500">No trend data for this range.</p>
      ) : (
        <div className="space-y-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-64 w-full overflow-visible rounded-2xl bg-zinc-50"
            role="img"
            aria-label={title}
          >
            <line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              className="stroke-zinc-200"
            />
            <polyline
              fill="none"
              stroke="#18181b"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points}
            />
            {data.map((point, index) => {
              const x =
                data.length === 1
                  ? width / 2
                  : padding +
                    (index * (width - padding * 2)) / (data.length - 1);
              const y =
                height -
                padding -
                (point[dataKey] / maxValue) * (height - padding * 2);

              return (
                <g key={`${point.key}-${dataKey}`}>
                  <circle cx={x} cy={y} r="4" fill="#18181b" />
                </g>
              );
            })}
          </svg>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {data.map((point) => (
              <div key={`${point.key}-legend`} className="rounded-2xl bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {point.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {formatter(point[dataKey])}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function BarChart({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: AnalyticsTrendPoint[];
}) {
  const maxValue = Math.max(...data.map((point) => point.orders), 1);

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-zinc-500">No trend data for this range.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex h-64 items-end gap-2 rounded-2xl bg-zinc-50 p-4">
            {data.map((point) => (
              <div
                key={`${point.key}-bar`}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
              >
                <div className="text-[11px] font-semibold text-zinc-700">
                  {point.orders}
                </div>
                <div
                  className="w-full rounded-t-2xl bg-zinc-900/90 transition-all"
                  style={{
                    height: `${Math.max((point.orders / maxValue) * 100, point.orders > 0 ? 10 : 0)}%`,
                  }}
                />
                <div className="text-[11px] text-zinc-500">{point.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {data.map((point) => (
              <div key={`${point.key}-count`} className="rounded-2xl bg-zinc-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {point.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {point.orders} orders
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

type ActiveFilters = {
  range: AnalyticsRangeKey;
  start?: string;
  end?: string;
};

export default function AdminAnalyticsClient() {
  const { user, loading } = useAuth();
  const { role, loading: roleLoading } = useRole(user);

  const [selectedRange, setSelectedRange] = useState<AnalyticsRangeKey>("7d");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [filters, setFilters] = useState<ActiveFilters>({ range: "7d" });
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!user) return;

    setLoadingData(true);
    setError(null);

    try {
      const response = await authedFetch(buildAnalyticsUrl(filters));
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to load analytics.");
      }

      const payload = (await response.json()) as AdminAnalyticsResponse;
      setData(payload);
    } catch (loadError) {
      setError((loadError as Error).message ?? "Unable to load analytics.");
    } finally {
      setLoadingData(false);
    }
  }, [filters, user]);

  useEffect(() => {
    if (!user || roleLoading || role !== "admin") return;
    void loadAnalytics();
  }, [loadAnalytics, role, roleLoading, user]);

  const hasOrders = (data?.summary.totalOrders ?? 0) > 0;

  const handlePresetRange = (range: AnalyticsRangeKey) => {
    setSelectedRange(range);
    if (range !== "custom") {
      setFilters({ range });
    }
  };

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) return;
    setSelectedRange("custom");
    setFilters({ range: "custom", start: draftStart, end: draftEnd });
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Total orders",
        value: String(data.summary.totalOrders),
        hint: `Orders created in ${data.range.label.toLowerCase()}.`,
      },
      {
        label: "Paid revenue",
        value: formatCurrency(data.summary.paidRevenue),
        hint: "Excludes cancelled, failed, and unpaid pending orders.",
      },
      {
        label: "Average order value",
        value: formatCurrency(data.summary.averageOrderValue),
        hint: `${data.summary.paidOrders} paid orders included.`,
      },
      {
        label: "Cancelled orders",
        value: String(data.summary.cancelledOrders),
        hint: "Orders cancelled in the selected range.",
      },
      {
        label: "Payment failures",
        value: String(data.summary.paymentFailures),
        hint: "Orders that failed before confirmation.",
      },
      {
        label: "Pickup vs delivery",
        value: `${data.fulfillment.pickupOrders} / ${data.fulfillment.deliveryOrders}`,
        hint: `${formatPercent(data.fulfillment.pickupPercent)} pickup, ${formatPercent(
          data.fulfillment.deliveryPercent
        )} delivery.`,
      },
    ];
  }, [data]);

  if (loading || roleLoading) {
    return <LoadingDashboard />;
  }

  if (!user || role !== "admin") {
    return <Card className="p-6 text-sm text-zinc-600">Not authorized.</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Admin Analytics
          </h1>
          <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
            Admin Mode
          </span>
        </div>
        <p className="text-sm text-zinc-600">
          Operational reporting for orders, revenue, fulfillment, and issues.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => handlePresetRange(option.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                selectedRange === option.key
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input
            type="date"
            value={draftStart}
            onChange={(event) => setDraftStart(event.target.value)}
            disabled={selectedRange !== "custom"}
          />
          <Input
            type="date"
            value={draftEnd}
            onChange={(event) => setDraftEnd(event.target.value)}
            disabled={selectedRange !== "custom"}
          />
          <Button
            variant="outline"
            onClick={applyCustomRange}
            disabled={selectedRange !== "custom" || !draftStart || !draftEnd}
          >
            Apply range
          </Button>
        </div>

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
            <p>
              Showing {data.range.label} ({data.range.start} to {data.range.end}) in{" "}
              {data.range.timeZone}.
            </p>
            <Button variant="outline" size="sm" onClick={() => void loadAnalytics()}>
              Refresh
            </Button>
          </div>
        ) : null}
      </Card>

      {loadingData ? <LoadingDashboard /> : null}

      {!loadingData && error ? (
        <Card className="space-y-3 text-sm text-red-600">
          <p className="font-medium text-zinc-900">Unable to load analytics.</p>
          <p>{error}</p>
          <div>
            <Button variant="outline" onClick={() => void loadAnalytics()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : null}

      {!loadingData && !error && data && !hasOrders ? (
        <EmptyState rangeLabel={data.range.label} />
      ) : null}

      {!loadingData && !error && data && hasOrders ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {kpis.map((kpi, index) => (
              <KpiCard
                key={kpi.label}
                label={kpi.label}
                value={kpi.value}
                hint={kpi.hint}
                className={KPI_CARD_STYLES[index]}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <LineChart
              title="Revenue by day"
              description="Paid revenue from valid orders in the selected range."
              data={data.trends}
              dataKey="revenue"
              formatter={formatCurrency}
            />
            <BarChart
              title="Orders by day"
              description="Order volume trend across the selected range."
              data={data.trends}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Fulfillment insights
                </h2>
                <p className="text-sm text-zinc-500">
                  Pickup vs delivery volume and fee/tip totals.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Pickup orders
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.fulfillment.pickupOrders}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatPercent(data.fulfillment.pickupPercent)} of range orders
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Delivery orders
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.fulfillment.deliveryOrders}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatPercent(data.fulfillment.deliveryPercent)} of range orders
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Delivery fees
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {formatCurrency(data.fulfillment.deliveryFeeTotal)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Paid orders only
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Tips
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {formatCurrency(data.fulfillment.tipTotal)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Paid orders only
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Cancelled pickup
                  </p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {data.fulfillment.cancelledPickup}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Cancelled delivery
                  </p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {data.fulfillment.cancelledDelivery}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Operational visibility
                </h2>
                <p className="text-sm text-zinc-500">
                  Read-only issue counts to help staff spot problems early.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Orders needing attention
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.operational.ordersNeedingAttention}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Stale open orders or notification failures
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Stale open orders
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.operational.staleOpenOrders}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Open longer than 60 minutes
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Pending over 30 minutes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.operational.pendingOver30Minutes}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Notification failures
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.operational.notificationFailures}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Open orders
                  </p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {data.operational.openOrders}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Completed orders
                  </p>
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {data.operational.completedOrders}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Cancelled today
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">
                  {data.operational.cancelledToday}
                </p>
                <p className="text-xs text-zinc-500">
                  Based on `cancelledAt`, independent of the selected range.
                </p>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Top products
                </h2>
                <p className="text-sm text-zinc-500">
                  Based on paid orders only.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="pb-3 pr-4 font-semibold">Product</th>
                      <th className="pb-3 pr-4 font-semibold">Category</th>
                      <th className="pb-3 pr-4 font-semibold">Units</th>
                      <th className="pb-3 font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.topProducts.map((product) => (
                      <tr key={product.productId}>
                        <td className="py-3 pr-4 font-medium text-zinc-900">
                          {product.name}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {product.category}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600">
                          {product.quantitySold}
                        </td>
                        <td className="py-3 font-semibold text-zinc-900">
                          {formatCurrency(product.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Category performance
                </h2>
                <p className="text-sm text-zinc-500">
                  Top categories by units sold and revenue.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    Top categories by units
                  </p>
                  {data.topCategoriesByUnits.map((category) => (
                    <div
                      key={`${category.category}-units`}
                      className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {category.category}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {formatCurrency(category.revenue)} revenue
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-zinc-900">
                        {category.quantitySold}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    Top categories by revenue
                  </p>
                  {data.topCategoriesByRevenue.map((category) => (
                    <div
                      key={`${category.category}-revenue`}
                      className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">
                          {category.category}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {category.quantitySold} units sold
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-zinc-900">
                        {formatCurrency(category.revenue)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Metric definitions
            </h2>
            <div className="space-y-2 text-sm text-zinc-600">
              <p>{data.definitions.revenue}</p>
              <p>{data.definitions.topProducts}</p>
              <p>{data.definitions.aggregation}</p>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

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
  AnalyticsCategoryBreakdown,
  AnalyticsRangeKey,
  AnalyticsTopProduct,
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

type ActiveFilters = {
  range: AnalyticsRangeKey;
  start?: string;
  end?: string;
};

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

function buildAnalyticsUrl(filters: ActiveFilters) {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  return `/api/admin/analytics?${params.toString()}`;
}

function getTickIndexes(length: number, maxTicks = 5) {
  if (length <= maxTicks) {
    return Array.from({ length }, (_, index) => index);
  }

  const step = (length - 1) / (maxTicks - 1);
  return Array.from({ length: maxTicks }, (_, index) =>
    Math.round(index * step)
  ).filter((value, index, array) => array.indexOf(value) === index);
}

function getRecentPoints(data: AnalyticsTrendPoint[], limit = 6) {
  return data.slice(Math.max(data.length - limit, 0));
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
    <Card className={`space-y-2 p-4 sm:p-5 ${className ?? ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="text-2xl font-semibold text-zinc-900 sm:text-3xl">{value}</p>
      <p className="text-xs leading-5 text-zinc-500">{hint}</p>
    </Card>
  );
}

function LoadingDashboard() {
  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-4 sm:p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="space-y-4 p-4 sm:p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-52 w-full" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <Card className="space-y-2 p-5 text-sm text-zinc-600">
      <p className="font-medium text-zinc-900">No analytics data available.</p>
      <p>No orders were found for {rangeLabel.toLowerCase()}.</p>
    </Card>
  );
}

function TrendMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function TrendChartCard({
  title,
  description,
  data,
  dataKey,
  formatter,
  mode,
}: {
  title: string;
  description: string;
  data: AnalyticsTrendPoint[];
  dataKey: "revenue" | "orders";
  formatter: (value: number) => string;
  mode: "line" | "bars";
}) {
  if (data.length === 0) {
    return (
      <Card className="space-y-4 overflow-hidden p-4 sm:p-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
        <p className="text-sm text-zinc-500">No trend data for this range.</p>
      </Card>
    );
  }

  const chartWidth = 100;
  const chartHeight = 100;
  const baselineY = 90;
  const values = data.map((point) => point[dataKey]);
  const maxValue = Math.max(...values, 1);
  const tickIndexes = getTickIndexes(data.length, 5);
  const tickPoints = tickIndexes.map((index) => data[index]).filter(Boolean);
  const recentPoints = getRecentPoints(data);
  const latestPoint = data[data.length - 1];
  const peakPoint = data.reduce((best, point) =>
    point[dataKey] > best[dataKey] ? point : best
  );
  const totalValue = values.reduce((sum, value) => sum + value, 0);

  const graphPoints = data.map((point, index) => {
    const x =
      data.length === 1 ? chartWidth / 2 : (index * chartWidth) / (data.length - 1);
    const y = baselineY - (point[dataKey] / maxValue) * 72;
    return { x, y, point };
  });

  const polylinePoints = graphPoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const areaPoints = `0,${baselineY} ${polylinePoints} ${chartWidth},${baselineY}`;

  return (
    <Card className="space-y-4 overflow-hidden p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TrendMetric
          label="Range total"
          value={formatter(totalValue)}
          hint={`${data.length} day${data.length === 1 ? "" : "s"} tracked`}
        />
        <TrendMetric
          label="Peak day"
          value={formatter(peakPoint[dataKey])}
          hint={peakPoint.label}
        />
        <TrendMetric
          label="Latest day"
          value={formatter(latestPoint[dataKey])}
          hint={latestPoint.label}
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5">
        <div className="h-48 w-full">
          {mode === "line" ? (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-full w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={title}
            >
              <line
                x1="0"
                y1={baselineY}
                x2={chartWidth}
                y2={baselineY}
                stroke="#d4d4d8"
                strokeWidth="0.8"
              />
              <line
                x1="0"
                y1="54"
                x2={chartWidth}
                y2="54"
                stroke="#e4e4e7"
                strokeWidth="0.6"
                strokeDasharray="2 2"
              />
              <polygon fill="rgba(24,24,27,0.08)" points={areaPoints} />
              <polyline
                fill="none"
                stroke="#18181b"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={polylinePoints}
              />
              {graphPoints.map(({ x, y }, index) => {
                if (!tickIndexes.includes(index) && index !== data.length - 1) {
                  return null;
                }

                return <circle key={`${title}-point-${index}`} cx={x} cy={y} r="1.5" fill="#18181b" />;
              })}
            </svg>
          ) : (
            <div className="flex h-full items-end gap-1">
              {data.map((point) => (
                <div
                  key={`${title}-${point.key}`}
                  className="flex h-full min-w-0 flex-1 items-end"
                >
                  <div
                    className="w-full rounded-t-xl bg-zinc-900/90"
                    style={{
                      height: `${Math.max(
                        (point[dataKey] / maxValue) * 100,
                        point[dataKey] > 0 ? 8 : 0
                      )}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-medium text-zinc-500">
          {tickPoints.map((point) => (
            <span key={`${title}-${point.key}`} className="min-w-0 truncate">
              {point.label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-900">Recent daily values</p>
          <p className="text-xs text-zinc-500">
            Showing the most recent {recentPoints.length} day
            {recentPoints.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {recentPoints.map((point) => (
            <div
              key={`${title}-${point.key}-recent`}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {point.label}
              </p>
              <p className="mt-1 text-base font-semibold text-zinc-900">
                {formatter(point[dataKey])}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {point.orders} order{point.orders === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ProductPerformanceList({ items }: { items: AnalyticsTopProduct[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No paid product data for this range.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((product, index) => (
        <div
          key={product.productId}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600">
                  #{index + 1}
                </span>
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {product.name}
                </p>
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                {product.category}
              </p>
            </div>

            <div className="text-right">
              <p className="text-sm font-semibold text-zinc-900">
                {formatCurrency(product.revenue)}
              </p>
              <p className="text-xs text-zinc-500">
                {product.quantitySold} units
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryBreakdownList({
  title,
  rows,
  emphasize,
}: {
  title: string;
  rows: AnalyticsCategoryBreakdown[];
  emphasize: "units" | "revenue";
}) {
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="text-sm text-zinc-500">No category data for this range.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {rows.map((category) => (
        <div
          key={`${title}-${category.category}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-zinc-900">{category.category}</p>
            <p className="text-xs text-zinc-500">
              {emphasize === "units"
                ? `${formatCurrency(category.revenue)} revenue`
                : `${category.quantitySold} units sold`}
            </p>
          </div>
          <p className="shrink-0 text-lg font-semibold text-zinc-900">
            {emphasize === "units"
              ? category.quantitySold
              : formatCurrency(category.revenue)}
          </p>
        </div>
      ))}
    </div>
  );
}

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
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Operational reporting for orders, revenue, fulfillment, and issues.
          Numbers are computed server-side and stay read-only.
        </p>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
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

        {selectedRange === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              type="date"
              value={draftStart}
              onChange={(event) => setDraftStart(event.target.value)}
            />
            <Input
              type="date"
              value={draftEnd}
              onChange={(event) => setDraftEnd(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={applyCustomRange}
              disabled={!draftStart || !draftEnd}
              className="w-full lg:w-auto"
            >
              Apply range
            </Button>
          </div>
        ) : null}

        {data ? (
          <div className="flex flex-col gap-3 border-t border-zinc-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Showing {data.range.label} ({data.range.start} to {data.range.end})
              {" "}in {data.range.timeZone}.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAnalytics()}
              className="w-full sm:w-auto"
            >
              Refresh
            </Button>
          </div>
        ) : null}
      </Card>

      {loadingData ? <LoadingDashboard /> : null}

      {!loadingData && error ? (
        <Card className="space-y-3 p-5 text-sm text-red-600">
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
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <TrendChartCard
              title="Revenue by day"
              description="Paid revenue from valid orders in the selected range."
              data={data.trends}
              dataKey="revenue"
              formatter={formatCurrency}
              mode="line"
            />
            <TrendChartCard
              title="Orders by day"
              description="Order volume trend across the selected range."
              data={data.trends}
              dataKey="orders"
              formatter={(value) => `${value}`}
              mode="bars"
            />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <Card className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Fulfillment insights
                </h2>
                <p className="text-sm text-zinc-500">
                  Pickup vs delivery volume and fee or tip totals.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TrendMetric
                  label="Pickup orders"
                  value={String(data.fulfillment.pickupOrders)}
                  hint={`${formatPercent(data.fulfillment.pickupPercent)} of range orders`}
                />
                <TrendMetric
                  label="Delivery orders"
                  value={String(data.fulfillment.deliveryOrders)}
                  hint={`${formatPercent(data.fulfillment.deliveryPercent)} of range orders`}
                />
                <TrendMetric
                  label="Delivery fees"
                  value={formatCurrency(data.fulfillment.deliveryFeeTotal)}
                  hint="Paid orders only"
                />
                <TrendMetric
                  label="Tips"
                  value={formatCurrency(data.fulfillment.tipTotal)}
                  hint="Paid orders only"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TrendMetric
                  label="Cancelled pickup"
                  value={String(data.fulfillment.cancelledPickup)}
                  hint="Cancelled pickup orders in range"
                />
                <TrendMetric
                  label="Cancelled delivery"
                  value={String(data.fulfillment.cancelledDelivery)}
                  hint="Cancelled delivery orders in range"
                />
              </div>
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Operational visibility
                </h2>
                <p className="text-sm text-zinc-500">
                  Read-only issue counts to help staff spot problems early.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Orders needing attention
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-zinc-900">
                    {data.operational.ordersNeedingAttention}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Stale open orders or notification failures
                  </p>
                </div>
                <TrendMetric
                  label="Stale open orders"
                  value={String(data.operational.staleOpenOrders)}
                  hint="Open longer than 60 minutes"
                />
                <TrendMetric
                  label="Pending over 30 minutes"
                  value={String(data.operational.pendingOver30Minutes)}
                  hint="Pending store orders only"
                />
                <TrendMetric
                  label="Notification failures"
                  value={String(data.operational.notificationFailures)}
                  hint="Detected from notification state"
                />
                <TrendMetric
                  label="Open orders"
                  value={String(data.operational.openOrders)}
                  hint="Non-final admin order states"
                />
                <TrendMetric
                  label="Completed orders"
                  value={String(data.operational.completedOrders)}
                  hint="Completed in selected range"
                />
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Cancelled today
                </p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">
                  {data.operational.cancelledToday}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Based on `cancelledAt`, independent of the selected range.
                </p>
              </div>
            </Card>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <Card className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Top products
                </h2>
                <p className="text-sm text-zinc-500">
                  Based on paid order items only.
                </p>
              </div>
              <ProductPerformanceList items={data.topProducts} />
            </Card>

            <Card className="space-y-4 p-4 sm:p-5">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Category performance
                </h2>
                <p className="text-sm text-zinc-500">
                  Top categories by units sold and revenue.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <CategoryBreakdownList
                  title="Top categories by units"
                  rows={data.topCategoriesByUnits}
                  emphasize="units"
                />
                <CategoryBreakdownList
                  title="Top categories by revenue"
                  rows={data.topCategoriesByRevenue}
                  emphasize="revenue"
                />
              </div>
            </Card>
          </div>

          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-zinc-900">
              Metric definitions
            </h2>
            <div className="space-y-2 text-sm leading-6 text-zinc-600">
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

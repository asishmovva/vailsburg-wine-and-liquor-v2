export type AnalyticsRangeKey = "today" | "7d" | "30d" | "custom";

export type AnalyticsDateRange = {
  key: AnalyticsRangeKey;
  label: string;
  start: string;
  end: string;
  timeZone: string;
  isCustom: boolean;
};

export type AnalyticsSummary = {
  totalOrders: number;
  paidOrders: number;
  paidRevenue: number;
  averageOrderValue: number;
  cancelledOrders: number;
  paymentFailures: number;
};

export type AnalyticsFulfillmentSplit = {
  pickupOrders: number;
  deliveryOrders: number;
  pickupPercent: number;
  deliveryPercent: number;
  deliveryFeeTotal: number;
  tipTotal: number;
  cancelledPickup: number;
  cancelledDelivery: number;
};

export type AnalyticsTrendPoint = {
  key: string;
  label: string;
  orders: number;
  paidOrders: number;
  revenue: number;
  cancelledOrders: number;
};

export type AnalyticsTopProduct = {
  productId: string;
  name: string;
  category: string;
  quantitySold: number;
  revenue: number;
};

export type AnalyticsCategoryBreakdown = {
  category: string;
  quantitySold: number;
  revenue: number;
};

export type AnalyticsOperationalMetrics = {
  ordersNeedingAttention: number;
  staleOpenOrders: number;
  pendingOver30Minutes: number;
  notificationFailures: number;
  openOrders: number;
  completedOrders: number;
  cancelledToday: number;
};

export type AdminAnalyticsResponse = {
  range: AnalyticsDateRange;
  summary: AnalyticsSummary;
  fulfillment: AnalyticsFulfillmentSplit;
  trends: AnalyticsTrendPoint[];
  topProducts: AnalyticsTopProduct[];
  topCategoriesByUnits: AnalyticsCategoryBreakdown[];
  topCategoriesByRevenue: AnalyticsCategoryBreakdown[];
  operational: AnalyticsOperationalMetrics;
  definitions: {
    revenue: string;
    topProducts: string;
    aggregation: string;
  };
  meta: {
    generatedAt: string;
    servedFromCache: boolean;
    cacheSource: "live" | "memory";
    cacheKey: string;
    cacheExpiresAt: string | null;
  };
};

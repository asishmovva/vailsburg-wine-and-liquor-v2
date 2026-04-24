export type HomeProductSectionConfig = {
  id: string;
  title: string;
  href: string;
  productIds: string[];
};

export const DEFAULT_HOME_PRODUCT_SECTIONS: HomeProductSectionConfig[] = [
  {
    id: "top-deals",
    title: "Top Deals",
    href: "/shop?sort=price-low",
    productIds: ["57307", "50309", "57371", "51055", "50900", "56431"],
  },
  {
    id: "top-shelf",
    title: "Top Shelf Picks",
    href: "/shop?sort=price-high",
    productIds: [
      "51153",
      "57620",
      "56964",
      "57103",
      "52928",
      "57900",
      "56717",
      "53009",
    ],
  },
  {
    id: "popular",
    title: "Popular",
    href: "/shop?sort=popular",
    productIds: ["50205", "56771", "57147", "51625", "57166"],
  },
];

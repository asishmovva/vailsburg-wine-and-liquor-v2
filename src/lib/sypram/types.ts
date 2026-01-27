export type SypramItem = Record<string, unknown> & {
  UPC?: string | number | null;
  SKU?: string | number | null;
  ItemName?: string | null;
  Department?: string | null;
  SizeName?: string | null;
  PackName?: string | null;
  Price?: string | number | null;
  Cost?: string | number | null;
  SALEPRICE?: string | number | null;
  TotalQty?: string | number | null;
};

export type SypramResponse =
  | SypramItem[]
  | {
      data?: SypramItem[];
      Data?: SypramItem[];
      items?: SypramItem[];
      Items?: SypramItem[];
      ItemList?: SypramItem[];
      itemList?: SypramItem[];
    };

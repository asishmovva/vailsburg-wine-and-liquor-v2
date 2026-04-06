export type NormalizedProductImageFields = {
  nameNormalized: string;
  sizeNormalized: string;
  packNormalized: string;
  categoryNormalized: string;
  matchTokens: string[];
};

export type IndexedImageCandidate = NormalizedProductImageFields & {
  sourceFilePath: string;
  sourceFileName: string;
  sourceCategory: string;
};

export type ProductImageMatchTarget = NormalizedProductImageFields & {
  id: string;
  name: string;
  category: string;
  size?: string;
  pack?: string;
  isSellableOnline: boolean;
  primaryImageUrl?: string;
  image?: string;
};

export type ScoredMatchCandidate = {
  productId: string;
  productName: string;
  score: number;
  reasons: string[];
  hasConflict: boolean;
};

export type MatchDecision = "auto-match" | "needs-review" | "unmatched";

export type MatchOutputRecord = IndexedImageCandidate & {
  decision: MatchDecision;
  chosenProductId: string | null;
  chosenProductName: string | null;
  score: number;
  margin: number | null;
  whyMatched: string[];
  topCandidates: ScoredMatchCandidate[];
};

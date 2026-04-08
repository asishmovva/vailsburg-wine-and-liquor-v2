export type ImageReviewCandidate = {
  productId: string;
  productName: string;
  size?: string;
  pack?: string;
  score: number;
  reasons: string[];
};

export type ImageReviewItem = {
  id: string;
  sourceFilePath: string;
  sourceFileName: string;
  previewSrc: string | null;
  parsedName: string;
  category: string;
  score: number;
  proposedProductId: string | null;
  proposedProductName: string | null;
  proposedSize?: string;
  proposedPack?: string;
  topCandidates: ImageReviewCandidate[];
};

export type ImageReviewListResponse = {
  items: ImageReviewItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    categories: string[];
    category: string;
    search: string;
    minScore: number | null;
    maxScore: number | null;
  };
};

export type ImageReviewDecision =
  | {
      sourceFilePath: string;
      sourceFileName: string;
      action: "approve";
      productId: string;
      confidence: number;
    }
  | {
      sourceFilePath: string;
      sourceFileName: string;
      action: "alternate";
      productId: string;
      confidence: number;
    }
  | {
      sourceFilePath: string;
      sourceFileName: string;
      action: "reject";
    };

export type ReviewApprovedRecord = {
  productId: string;
  imagePath: string;
  confidence: number;
  source: "manual_review";
};

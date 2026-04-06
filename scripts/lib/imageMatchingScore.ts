import type {
  IndexedImageCandidate,
  ProductImageMatchTarget,
  ScoredMatchCandidate,
} from "./imageMatchingTypes";

type MatchThresholds = {
  autoScore: number;
  autoMargin: number;
  reviewMin: number;
};

const DEFAULT_THRESHOLDS: MatchThresholds = {
  autoScore: 80,
  autoMargin: 20,
  reviewMin: 55,
};

type ContainerType = "CAN" | "BTL" | null;

function detectContainerType(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
  if (/\b(can|cans)\b/.test(normalized)) {
    return "CAN" as ContainerType;
  }
  if (/\b(btl|bottle|bottles)\b/.test(normalized)) {
    return "BTL" as ContainerType;
  }
  return null;
}

function intersection<T>(left: T[], right: T[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

function difference<T>(left: T[], right: T[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

export function scoreImageCandidate(
  image: IndexedImageCandidate,
  product: ProductImageMatchTarget
): ScoredMatchCandidate {
  let score = 0;
  let hasConflict = false;
  const reasons: string[] = [];

  if (image.categoryNormalized !== product.categoryNormalized) {
    return {
      productId: product.id,
      productName: product.name,
      score: Number.NEGATIVE_INFINITY,
      reasons: ["rejected: category mismatch"],
      hasConflict: true,
    };
  }

  const imageContainer = detectContainerType(image.sourceFileName);
  const productContainer = detectContainerType(product.name);
  if (imageContainer && productContainer) {
    if (imageContainer === productContainer) {
      score += 20;
      reasons.push(`+20 exact container match (${imageContainer})`);
    } else {
      score -= 45;
      hasConflict = true;
      reasons.push(
        `-45 conflicting container (${imageContainer} vs ${productContainer})`
      );
    }
  }

  if (image.nameNormalized && image.nameNormalized === product.nameNormalized) {
    score += 50;
    reasons.push("+50 exact normalized name match");
  }

  if (image.sizeNormalized && product.sizeNormalized) {
    if (image.sizeNormalized === product.sizeNormalized) {
      score += 20;
      reasons.push("+20 exact size match");
    } else {
      score -= 40;
      hasConflict = true;
      reasons.push(`-40 conflicting size (${image.sizeNormalized} vs ${product.sizeNormalized})`);
    }
  }

  if (image.packNormalized && product.packNormalized) {
    if (image.packNormalized === product.packNormalized) {
      score += 15;
      reasons.push("+15 exact pack match");
    } else {
      score -= 25;
      hasConflict = true;
      reasons.push(`-25 conflicting pack (${image.packNormalized} vs ${product.packNormalized})`);
    }
  }

  const sharedTokens = intersection(image.matchTokens, product.matchTokens);
  const missingTokens = difference(image.matchTokens, product.matchTokens);

  if (image.matchTokens.length > 0 && missingTokens.length === 0) {
    score += 15;
    reasons.push("+15 all major tokens present");
  } else if (missingTokens.length > 0) {
    score -= 20;
    reasons.push(`-20 missing major tokens: ${missingTokens.join(", ")}`);
  }

  const imageBrandToken = image.matchTokens[0];
  const productBrandToken = product.matchTokens[0];
  if (imageBrandToken && imageBrandToken === productBrandToken) {
    score += 10;
    reasons.push(`+10 brand token match (${imageBrandToken})`);
  }

  const sharedBeyondBrand = sharedTokens.filter((token) => token !== imageBrandToken);
  if (
    imageBrandToken &&
    imageBrandToken === productBrandToken &&
    image.matchTokens.length > 1 &&
    product.matchTokens.length > 1 &&
    sharedBeyondBrand.length === 0
  ) {
    score -= 20;
    reasons.push("-20 likely flavor/variant mismatch");
  }

  return {
    productId: product.id,
    productName: product.name,
    score,
    reasons,
    hasConflict,
  };
}

export function classifyScoredMatches(
  scored: ScoredMatchCandidate[],
  thresholds: Partial<MatchThresholds> = {}
) {
  const resolved = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const ordered = [...scored]
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score);

  const best = ordered[0] ?? null;
  const second = ordered[1] ?? null;
  const margin =
    best && second ? best.score - second.score : best ? best.score : null;

  if (!best) {
    return {
      decision: "unmatched" as const,
      best: null,
      margin: null,
      topCandidates: [],
    };
  }

  if (
    best.score >= resolved.autoScore &&
    (margin ?? 0) >= resolved.autoMargin &&
    !best.hasConflict
  ) {
    return {
      decision: "auto-match" as const,
      best,
      margin,
      topCandidates: ordered.slice(0, 3),
    };
  }

  if (best.score >= resolved.reviewMin) {
    return {
      decision: "needs-review" as const,
      best,
      margin,
      topCandidates: ordered.slice(0, 3),
    };
  }

  return {
    decision: "unmatched" as const,
    best,
    margin,
    topCandidates: ordered.slice(0, 3),
  };
}

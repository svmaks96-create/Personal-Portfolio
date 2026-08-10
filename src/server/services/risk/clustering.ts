import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

/**
 * Correlation clusters: which holdings move as one underlying bet.
 *
 * Agglomerative clustering with average linkage on correlation distance
 * (1 − ρ), stopping when no two clusters average above the threshold. Chosen
 * because every merge has a plain-language reading — "these grouped because
 * their average correlation is 0.68" — where k-means or spectral methods
 * would not. Uses the *shrunk* correlation so a single noisy pair can't
 * fabricate a cluster.
 *
 * Cluster naming lives with the user, not the algorithm: labels are stored
 * as (name, member set) and re-attached by overlap, so a cluster that drifts
 * past recognition shows up unnamed rather than silently inheriting a stale
 * label.
 */

export const DEFAULT_CLUSTER_CORRELATION_THRESHOLD = 0.5;

export interface CorrelationCluster {
  /** Sorted member tickers. */
  members: string[];
  totalWeightPct: number;
  /** Average pairwise shrunk correlation inside the cluster; null for singletons. */
  avgInternalCorrelation: number | null;
}

export interface StoredClusterName {
  name: string;
  members: string[];
}

export function clusterByCorrelation(
  estimate: CovarianceEstimate,
  weights: UniverseWeight[],
  threshold: number = DEFAULT_CLUSTER_CORRELATION_THRESHOLD
): CorrelationCluster[] {
  const n = estimate.tickers.length;
  if (n === 0) return [];
  const maxDistance = 1 - threshold;

  const clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);

  const distance = (a: number, b: number) => 1 - estimate.correlation[a][b];

  const avgLinkage = (a: number[], b: number[]): number => {
    let sum = 0;
    for (const i of a) for (const j of b) sum += distance(i, j);
    return sum / (a.length * b.length);
  };

  for (;;) {
    let bestA = -1;
    let bestB = -1;
    let bestDistance = Infinity;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const d = avgLinkage(clusters[a], clusters[b]);
        if (d < bestDistance) {
          bestDistance = d;
          bestA = a;
          bestB = b;
        }
      }
    }
    if (bestA === -1 || bestDistance > maxDistance) break;
    clusters[bestA] = [...clusters[bestA], ...clusters[bestB]];
    clusters.splice(bestB, 1);
  }

  const weightOf = new Map(weights.map((w) => [w.ticker, w.weightPct]));

  const result = clusters.map((members) => {
    let corrSum = 0;
    let corrCount = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        corrSum += estimate.correlation[members[a]][members[b]];
        corrCount++;
      }
    }
    const tickers = members.map((i) => estimate.tickers[i]).sort();
    return {
      members: tickers,
      totalWeightPct: tickers.reduce((a, t) => a + (weightOf.get(t) ?? 0), 0),
      avgInternalCorrelation: corrCount === 0 ? null : corrSum / corrCount,
    };
  });

  return result.sort((a, b) => b.totalWeightPct - a.totalWeightPct);
}

/**
 * Re-attach persisted names to freshly-computed clusters by member overlap
 * (Jaccard > 0.5). Returns one name (or null) per cluster, never assigning
 * the same stored label twice.
 */
export function matchClusterNames(
  clusters: CorrelationCluster[],
  stored: StoredClusterName[]
): (string | null)[] {
  const used = new Set<number>();
  return clusters.map((cluster) => {
    const members = new Set(cluster.members);
    let bestIndex = -1;
    let bestJaccard = 0.5;
    for (let i = 0; i < stored.length; i++) {
      if (used.has(i)) continue;
      const other = new Set(stored[i].members);
      let intersection = 0;
      for (const m of members) if (other.has(m)) intersection++;
      const union = members.size + other.size - intersection;
      const jaccard = union === 0 ? 0 : intersection / union;
      if (jaccard > bestJaccard) {
        bestJaccard = jaccard;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) return null;
    used.add(bestIndex);
    return stored[bestIndex].name;
  });
}

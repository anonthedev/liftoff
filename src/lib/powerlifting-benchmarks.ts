import type { PowerliftingBenchmark } from "@/lib/db/schema";
import type { LiftName } from "@/lib/workouts";

export type SerializedPowerliftingBenchmark = Omit<
  PowerliftingBenchmark,
  "updatedAt"
> & {
  updatedAt: string;
};

export type LiftBenchmarkSummary = {
  benchmark: SerializedPowerliftingBenchmark;
  percentile: number;
};

export function serializePowerliftingBenchmark(
  benchmark: PowerliftingBenchmark,
): SerializedPowerliftingBenchmark {
  return {
    ...benchmark,
    updatedAt: benchmark.updatedAt.toISOString(),
  };
}

export function normalizeSex(gender?: string | null): "M" | "F" | null {
  const value = gender?.toLowerCase() ?? "";
  if (value.includes("female") || value.includes("woman")) return "F";
  if (value.includes("male") || value.includes("man")) return "M";
  return null;
}

export function estimatePercentile(
  liftKg: number,
  benchmark: Pick<
    SerializedPowerliftingBenchmark,
    "p25" | "p50" | "p75" | "p90"
  >,
) {
  const points = [
    { percentile: 10, value: Math.max(1, benchmark.p25 * 0.75) },
    { percentile: 25, value: benchmark.p25 },
    { percentile: 50, value: benchmark.p50 },
    { percentile: 75, value: benchmark.p75 },
    { percentile: 90, value: benchmark.p90 },
    { percentile: 97, value: benchmark.p90 * 1.12 },
  ];

  if (liftKg <= points[0].value) return points[0].percentile;
  if (liftKg >= points.at(-1)!.value) return points.at(-1)!.percentile;

  const upperIndex = points.findIndex((point) => liftKg <= point.value);
  const lower = points[upperIndex - 1];
  const upper = points[upperIndex];
  const progress = (liftKg - lower.value) / (upper.value - lower.value);

  return Math.round(
    lower.percentile + progress * (upper.percentile - lower.percentile),
  );
}

export function getPowerliftingSummary(
  benchmarks: SerializedPowerliftingBenchmark[],
  lift: LiftName,
  liftKg?: number | null,
): LiftBenchmarkSummary | null {
  const benchmark = benchmarks.find((item) => item.exercise === lift);

  if (!benchmark || !liftKg) return null;

  return {
    benchmark,
    percentile: estimatePercentile(liftKg, benchmark),
  };
}

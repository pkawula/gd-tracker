import { LookbackStrategy, ReadingWithWeight } from "./adaptive-lookback.ts";

export function calculateWeightedMedian(
    readings: ReadingWithWeight[],
): number {
    if (readings.length === 0) return 0;

    // Sort by minute_of_day
    const sorted = [...readings].sort((a, b) =>
        a.minute_of_day - b.minute_of_day
    );

    // Calculate total weight
    const totalWeight = sorted.reduce((sum, r) => sum + r.weight, 0);

    // Find weighted median position
    const targetWeight = totalWeight / 2;
    let cumulativeWeight = 0;

    for (const reading of sorted) {
        cumulativeWeight += reading.weight;
        if (cumulativeWeight >= targetWeight) {
            return reading.minute_of_day;
        }
    }

    // Fallback (should not reach if weights > 0)
    return sorted[Math.floor(sorted.length / 2)].minute_of_day;
}

export function calculateConfidence(
    readings: ReadingWithWeight[],
    strategy: LookbackStrategy,
): number {
    if (readings.length < 3) return 0.5; // Default fallback

    // Separate by data quality
    const scheduledReadings = readings.filter((r) =>
        r.data_quality === "scheduled_week"
    );
    const historicalReadings = readings.filter((r) =>
        r.data_quality === "historical"
    );

    // Base confidence
    let confidence = 0.7;

    // Bonus: Scheduled data count (high quality)
    // Max 0.2 bonus for 5 scheduled readings
    const scheduledBonus = Math.min(0.2, scheduledReadings.length * 0.04);
    confidence += scheduledBonus;

    // Bonus: Historical data count (weighted by strategy)
    // Max 0.1 bonus
    const historicalBonus = Math.min(
        0.1,
        historicalReadings.length * 0.02 * strategy.historicalWeight,
    );
    confidence += historicalBonus;

    // Bonus: Data quality ratio
    // If 100% scheduled, +0.1
    const scheduledRatio = readings.length > 0
        ? scheduledReadings.length / readings.length
        : 0;
    confidence += scheduledRatio * 0.1;

    return Math.min(1.0, confidence);
}

export function filterOutliersByWeight(
    readings: ReadingWithWeight[],
    threshold = 2,
): ReadingWithWeight[] {
    if (readings.length < 3) return readings;

    // We can use the weighted median as the center?
    // Standard deviation is trickier with weights.
    // Spec says "Remove outliers (per window)".
    // `filtering.ts` has `detectStatisticalOutliers`.
    // Maybe we just use standard outlier detection on the raw values first?
    // Using simple outlier detection on the minute_of_day values is properly robust.

    // Let's implement standard IQR or StdDev based outlier removal ignoring weights for distribution shape,
    // OR we honor weights?
    // If a point has low weight (unreliable), it shouldn't pull the mean/median much.
    // But if it IS an outlier, it should be removed regardless of weight?
    // Actually, if a point is weighted 1.0 (high confidence), it's less likely to be an outlier?

    // For simplicity and adhering to the prompt "Remove outliers (per window)",
    // we can reuse the logic from valid statistical methods or the existing filtering.ts logic.
    // However, existing filtering.ts uses StdDev.

    // Let's extract values, run outlier detection, filter map.
    const values = readings.map((r) => r.minute_of_day);

    // Calculate Mean & StdDev (non-weighted for standard outlier detection)
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];

    // StdDev
    const variance =
        values.reduce((sum, val) => sum + Math.pow(val - median, 2), 0) /
        values.length;
    const stdDev = Math.sqrt(variance);

    return readings.filter((r) => {
        const dev = Math.abs(r.minute_of_day - median);
        return dev <= (threshold * (stdDev || 1));
    });
}

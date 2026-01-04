import { assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import {
    calculateConfidence,
    calculateWeightedMedian,
} from "./weighted-statistics.ts";
import { LookbackStrategy, ReadingWithWeight } from "./adaptive-lookback.ts";

Deno.test("calculateWeightedMedian - simple weighted balance", () => {
    const readings: ReadingWithWeight[] = [
        {
            minute_of_day: 420, /* 07:00 */
            weight: 0.4,
            data_quality: "historical",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 480, /* 08:00 */
            weight: 1.0,
            data_quality: "scheduled_week",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 540, /* 09:00 */
            weight: 1.0,
            data_quality: "scheduled_week",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
    ];

    // Total weight = 2.4. Half = 1.2
    // 420 (0.4) -> sum 0.4
    // 480 (1.0) -> sum 1.4 -> >= 1.2 -> result 480

    const median = calculateWeightedMedian(readings);
    assertEquals(median, 480);
});

Deno.test("calculateWeightedMedian - heavy historical pull", () => {
    const readings: ReadingWithWeight[] = [
        {
            minute_of_day: 420,
            weight: 1.0,
            data_quality: "historical",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 430,
            weight: 1.0,
            data_quality: "historical",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 600,
            weight: 0.5,
            data_quality: "scheduled_week",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
    ];

    // Total 2.5. Half 1.25.
    // 420 (1.0) -> 1.0
    // 430 (1.0) -> 2.0 -> >= 1.25 -> 430

    const median = calculateWeightedMedian(readings);
    assertEquals(median, 430);
});

Deno.test("calculateConfidence - calculates score correctly", () => {
    const strategy: LookbackStrategy = {
        mode: "transition",
        scheduledWeeksCount: 1,
        useScheduledWeeks: true,
        useHistoricalWeeks: true,
        historicalLookbackDays: 60,
        historicalWeight: 0.7,
    };

    const readings: ReadingWithWeight[] = [
        {
            minute_of_day: 480,
            weight: 1.0,
            data_quality: "scheduled_week",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 490,
            weight: 1.0,
            data_quality: "scheduled_week",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
        {
            minute_of_day: 420,
            weight: 0.7,
            data_quality: "historical",
            user_id: "u1",
            measurement_type: "fasting",
            day_of_week: 1,
            date: "2023-01-01",
        },
    ];

    // Base 0.7
    // Scheduled Bonus: 2 * 0.04 = 0.08
    // Historical Bonus: 1 * 0.02 * 0.7 = 0.014
    // Ratio Bonus: (2/3) * 0.1 = 0.066
    // Total: 0.7 + 0.08 + 0.014 + 0.0667 = 0.8607

    const confidence = calculateConfidence(readings, strategy);
    assertAlmostEquals(confidence, 0.86, 0.01);
});

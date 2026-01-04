import { MealWindow } from "./filtering.ts";
import {
  applyAdaptiveFallback,
  LookbackStrategy,
  ReadingWithWeight,
} from "./adaptive-lookback.ts";
import {
  calculateConfidence,
  calculateWeightedMedian,
  filterOutliersByWeight,
} from "./weighted-statistics.ts";
import { fromZonedTime, toZonedTime } from "npm:date-fns-tz@3.1.3";
import { TypedClient } from "../_shared/db.ts";

const TIMEZONE = "Europe/Warsaw";

export interface ScheduleCandidate {
  user_id: string;
  meal_window_id: string;
  measurement_type: string;
  day_of_week: number;
  minute_of_day: number;
  scheduled_at: string; // ISO timestamp

  // Metadata
  confidence: number;
  source: "history" | "default_window";
  readings_count?: number;
  data_quality_breakdown?: {
    scheduled: number;
    historical: number;
  };
}

function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function generateScheduleForWindow(
  supabase: TypedClient,
  window: MealWindow,
  allReadings: ReadingWithWeight[],
  strategy: LookbackStrategy,
  targetMonday: Date,
): Promise<ScheduleCandidate> {
  const startMinute = timeToMinutes(window.time_start);
  const endMinute = timeToMinutes(window.time_end);

  // 1. Extract window-specific readings
  let windowReadings = allReadings.filter((r) =>
    r.measurement_type === window.measurement_type &&
    r.day_of_week === window.day_of_week &&
    r.minute_of_day >= startMinute &&
    r.minute_of_day <= endMinute
  );

  // 2. Remove outliers (per window)
  windowReadings = filterOutliersByWeight(windowReadings);

  // 3. Apply adaptive fallback (if needed)
  // Note: This fetches more data if needed and returns combined list
  windowReadings = await applyAdaptiveFallback(
    supabase,
    windowReadings,
    strategy,
    window.user_id,
    window,
  );

  // 4. Calculate schedule
  let targetMinute: number;
  let confidence: number;
  let source: "history" | "default_window";

  // Check if we have enough data (weighted check? No, count check primarily)
  // Spec: "IF weighted readings >= 3" (implies count of readings that have weight > 0? or just count?)
  // "Detect: readings.length < 3 in mature mode" implies count.

  if (windowReadings.length >= 3) {
    // Calculate weighted median
    const median = calculateWeightedMedian(windowReadings);
    targetMinute = Math.round(median) + 5; // Median + 5 min

    // Clamp to window? Spec doesn't explicitly say but implies schedule should be valid.
    // Spec: "Schedule: median + 5 min"
    // Ideally we clamp it to be within reasonable bounds or close to window?
    // Let's trust the logic for now, but valid readings imply median is in window. +5 might push it out.
    // If it pushes out, is it bad?
    // "Enforce 90-min spacing" happens later.
    // Let's not clamp strictly unless needed to ensure it's "for this window".

    confidence = calculateConfidence(windowReadings, strategy);
    source = "history";
  } else {
    // Default timing
    if (window.measurement_type === "fasting") {
      targetMinute = Math.round((startMinute + endMinute) / 2);
    } else {
      // Post-meal: end - 30 min
      targetMinute = endMinute - 30;
    }

    // Ensure default is within window (start < target < end)
    targetMinute = Math.max(startMinute, Math.min(endMinute, targetMinute));

    confidence = 0.5;
    source = "default_window";
  }

  // Calculate scheduled_at ISO string
  const warsawMonday = toZonedTime(targetMonday, TIMEZONE);
  const daysToAdd = window.day_of_week === 0 ? 6 : window.day_of_week - 1; // Monday=0 base adjustment

  const warsawTargetDate = new Date(warsawMonday);
  warsawTargetDate.setDate(warsawMonday.getDate() + daysToAdd);
  warsawTargetDate.setHours(
    Math.floor(targetMinute / 60),
    targetMinute % 60,
    0,
    0,
  );

  const scheduledAt = fromZonedTime(warsawTargetDate, TIMEZONE).toISOString();

  // Breakdown
  const scheduledCount =
    windowReadings.filter((r) => r.data_quality === "scheduled_week")
      .length;
  const historicalCount =
    windowReadings.filter((r) => r.data_quality === "historical").length;

  return {
    user_id: window.user_id,
    meal_window_id: window.id,
    measurement_type: window.measurement_type,
    day_of_week: window.day_of_week,
    minute_of_day: targetMinute,
    scheduled_at: scheduledAt,
    confidence,
    source,
    readings_count: windowReadings.length,
    data_quality_breakdown: {
      scheduled: scheduledCount,
      historical: historicalCount,
    },
  };
}

export function enforceSpacingByConfidence(
  candidates: ScheduleCandidate[],
  minSpacingMinutes: number,
): ScheduleCandidate[] {
  if (candidates.length === 0) return [];

  // Sort by scheduled_at
  const sorted = [...candidates].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  const finalSchedules: ScheduleCandidate[] = [];

  // We can't just iterate once because removing one might solve conflicts with next?
  // Or greedy approach: Pick highest confidence items first?
  // Spec: "prioritize by confidence"

  // Greedy strategy:
  // 1. Sort all candidates by confidence (descending).
  // 2. Pick top confidence candidate.
  // 3. Mark it as accepted.
  // 4. Remove any other candidates that conflict with it (< 90 min).
  // 5. Repeat until no candidates left.

  // Wait, if we prioritize by confidence, we might pick a 10:00 (conf 0.9) and drop a 9:00 (conf 0.5) and 11:00 (conf 0.5).
  // Is this desired? Yes, "prioritize by confidence".
  // But we want to maximize specific schedules?
  // "OUTPUT: up to 42 schedules"
  // If we have 42 windows, we want to fill them all.
  // But if windows overlap, we pick better one.

  // Let's implement the greedy confidence approach.

  let pool = [...candidates];
  // Sort by confidence desc
  pool.sort((a, b) => b.confidence - a.confidence);

  while (pool.length > 0) {
    const best = pool.shift()!;
    finalSchedules.push(best);

    // Remove conflicting candidates from pool
    const bestTime = new Date(best.scheduled_at).getTime();

    pool = pool.filter((c) => {
      const cTime = new Date(c.scheduled_at).getTime();
      const diffMinutes = Math.abs(cTime - bestTime) / (1000 * 60);
      return diffMinutes >= minSpacingMinutes;
    });
  }

  // Finally sort by time again for clean output
  return finalSchedules.sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}

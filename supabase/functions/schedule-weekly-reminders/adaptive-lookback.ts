import { MealWindow } from "./filtering.ts";
import { Database, TypedClient } from "../_shared/db.ts";

type GlucoseRow = Database["public"]["Tables"]["glucose_readings"]["Row"];
type ReadingSubset = Pick<
  GlucoseRow,
  "measured_at" | "measurement_type" | "reading_context"
>;

export interface LookbackStrategy {
  mode: "bootstrap" | "transition" | "mature";
  scheduledWeeksCount: number;
  useScheduledWeeks: boolean;
  useHistoricalWeeks: boolean;
  historicalLookbackDays: number;
  historicalWeight: number; // 0.0-1.0
}

export interface ReadingWithWeight {
  user_id: string;
  measurement_type: string;
  day_of_week: number;
  minute_of_day: number;
  date: string;
  data_quality: "scheduled_week" | "historical";
  weight: number; // Applied during median calculation
}

// Helper function to count scheduled weeks (DB function wrapper)
async function countScheduledWeeks(
  supabase: TypedClient,
  userId: string,
  targetMonday: Date,
): Promise<number> {
  // @ts-expect-error: Supabase RPC types inference mismatch
  const { data, error } = await supabase.rpc("count_scheduled_weeks", {
    p_user_id: userId,
    p_target_monday: targetMonday.toISOString().split("T")[0],
  });

  if (error) {
    console.error(
      `Error counting scheduled weeks for user ${userId}:`,
      error,
    );
    return 0; // Default to 0 on error
  }

  return data ?? 0;
}

export async function determineLookbackStrategy(
  supabase: TypedClient,
  userId: string,
  targetMonday: Date,
): Promise<LookbackStrategy> {
  // Count completed scheduled weeks (before target week)
  const scheduledWeeks = await countScheduledWeeks(
    supabase,
    userId,
    targetMonday,
  );

  if (scheduledWeeks === 0) {
    // Bootstrap: First-time user
    return {
      mode: "bootstrap",
      scheduledWeeksCount: 0,
      useScheduledWeeks: false,
      useHistoricalWeeks: true,
      historicalLookbackDays: 60,
      historicalWeight: 1.0,
    };
  }

  if (scheduledWeeks < 4) {
    // Transition: Building quality dataset
    // Weight decay: Week 1 = 0.7, Week 2 = 0.4, Week 3 = 0.1
    // Formula: 1.0 - (scheduledWeeks * 0.3)
    const historicalWeight = Math.max(0.1, 1.0 - (scheduledWeeks * 0.3));
    const historicalDays = 60 - (scheduledWeeks * 7);

    return {
      mode: "transition",
      scheduledWeeksCount: scheduledWeeks,
      useScheduledWeeks: true,
      useHistoricalWeeks: true,
      historicalLookbackDays: historicalDays,
      historicalWeight: historicalWeight,
    };
  }

  // Mature: Use scheduled data only
  return {
    mode: "mature",
    scheduledWeeksCount: scheduledWeeks,
    useScheduledWeeks: true,
    useHistoricalWeeks: false,
    historicalLookbackDays: 0,
    historicalWeight: 0,
  };
}

interface RawReading {
  measured_at: string;
  measurement_type: string;
  reading_context: string | null;
  raw_weight: number;
  quality_tag: "scheduled_week" | "historical";
}

export async function fetchReadingsWithContext(
  supabase: TypedClient,
  userId: string,
  strategy: LookbackStrategy,
  _targetMonday: Date, // Although logic doesn't strictly depend on targetMonday for fetching besides exclusion, keeping signature
): Promise<ReadingWithWeight[]> {
  // Helper to fetch readings
  const fetchReadings = async (
    daysLookback: number | null,
    quality: "scheduled_week" | "historical",
    weight: number,
  ) => {
    let query = supabase
      .from("glucose_readings")
      .select("measured_at, measurement_type, reading_context")
      .eq("user_id", userId);

    if (daysLookback !== null) {
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - daysLookback);
      query = query.gte("measured_at", lookbackDate.toISOString());
    }

    if (quality === "scheduled_week") {
      // Filter for readings tagged as scheduled_prompt
      query = query.eq("reading_context", "scheduled_prompt");
    } else {
      // Exclude scheduled prompts from historical fetch to avoid double counting
      // (They are fetched separately with high weight)
      query = query.neq("reading_context", "scheduled_prompt");
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching readings:", error);
      return [];
    }

    // Transform to ReadingWithWeight
    // Note: We need to handle Timezone conversion here similar to index.ts
    // For now assuming we have a helper or duplicate logic.
    // I will duplicate logic from index.ts using date-fns-tz if possible, or simple Date ops if offsets are stable.
    // index.ts uses date-fns-tz. I should import it.

    // We will do transformation after fetching all to avoid duplication?
    // No, transforms here.

    const typedData = (data as unknown as ReadingSubset[]) || [];

    return typedData.map((r) => ({
      measured_at: r.measured_at, // keep for processing
      measurement_type: r.measurement_type,
      reading_context: r.reading_context,
      raw_weight: weight,
      quality_tag: quality,
    }));
  };

  const rawReadings: RawReading[] = [];

  // 1. Fetch Scheduled Weeks Data (if enabled)
  if (strategy.useScheduledWeeks) {
    // We fetch ALL scheduled prompts, regardless of time?
    // "Clean data from scheduled weeks"
    // Probably unbounded lookback for scheduled prompts? Or maybe last X months?
    // Spec doesn't specify limit for scheduled data lookback, implies it's "clean data".
    // Let's assume last 90 days for sanity if not specified, or just all.
    // Let's stick to a reasonable max like 90 days for now unless otherwise constrained.
    const scheduledData = await fetchReadings(90, "scheduled_week", 1.0);
    rawReadings.push(...scheduledData);
  }

  // 2. Fetch Historical Data (if enabled)
  if (strategy.useHistoricalWeeks && strategy.historicalLookbackDays > 0) {
    const historicalData = await fetchReadings(
      strategy.historicalLookbackDays,
      "historical",
      strategy.historicalWeight,
    );
    // Filter out any that might have been fetched as scheduled (double safety)
    // actually if we implement the filter in query it's fine.
    // But let's apply the neq filter logic in the fetchReadings block above.
    rawReadings.push(...historicalData);
  }

  // Process and Transform
  // Import timezone utils
  const { toZonedTime } = await import("npm:date-fns-tz@3.1.3");
  const TIMEZONE = "Europe/Warsaw";

  return rawReadings.map((r) => {
    const utcDate = new Date(r.measured_at);
    const warsawDate = toZonedTime(utcDate, TIMEZONE);
    const dayOfWeek = warsawDate.getDay();
    const minuteOfDay = warsawDate.getHours() * 60 +
      warsawDate.getMinutes();
    const dateStr = warsawDate.toISOString().split("T")[0];

    return {
      user_id: userId,
      measurement_type: r.measurement_type,
      day_of_week: dayOfWeek,
      minute_of_day: minuteOfDay,
      date: dateStr,
      data_quality: r.quality_tag,
      weight: r.raw_weight,
    };
  });
}

export async function applyAdaptiveFallback(
  supabase: TypedClient,
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
  userId: string,
  window: MealWindow,
): Promise<ReadingWithWeight[]> {
  // Check if mature mode has insufficient data
  if (strategy.mode === "mature" && readings.length < 3) {
    console.log(
      `User ${userId} in mature mode with insufficient data, applying fallback`,
    );

    // Re-enable recent historical data (30 days)
    // Fetch specifically for this window?
    // The spec says "Fetch Readings" in fallback.
    // We can reuse fetchReadingsWithContext logic but scoped to 30 days and weight 0.5.

    // However, we just need to fetch historical data for this USER, and it will be filtered by window later?
    // Wait, the caller passes `window`.
    // If we fetch ALL historical data for the user again, it's expensive.
    // The spec implementation shows `fetchHistoricalReadings(userId, window, lookbackDate)`.
    // It implies fetching specifically for the window or just general fallback.

    // Let's implement a targeted fetch here to avoid huge payload.
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 30);

    const { data, error } = await supabase
      .from("glucose_readings")
      .select("measured_at, measurement_type")
      .eq("user_id", userId)
      .eq("measurement_type", window.measurement_type) // Optimization: filter by type
      .gte("measured_at", lookbackDate.toISOString());
    // We can't easily filter by time-of-day in DB without complex query or dedicated columns.
    // So we fetch by type and date, then transform.

    if (error || !data) return readings;

    const { toZonedTime } = await import("npm:date-fns-tz@3.1.3");
    const TIMEZONE = "Europe/Warsaw";

    const typedData = (data as unknown as ReadingSubset[]) || [];

    const fallbackReadings: ReadingWithWeight[] = typedData.map((r) => {
      const utcDate = new Date(r.measured_at);
      const warsawDate = toZonedTime(utcDate, TIMEZONE);
      const dayOfWeek = warsawDate.getDay();
      const minuteOfDay = warsawDate.getHours() * 60 +
        warsawDate.getMinutes();
      const dateStr = warsawDate.toISOString().split("T")[0];

      return {
        user_id: userId,
        measurement_type: r.measurement_type,
        day_of_week: dayOfWeek,
        minute_of_day: minuteOfDay,
        date: dateStr,
        data_quality: "historical",
        weight: 0.5, // Reduced weight
      };
    });

    return [...readings, ...fallbackReadings];
  }

  return readings;
}

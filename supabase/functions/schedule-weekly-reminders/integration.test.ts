import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import {
  determineLookbackStrategy,
  fetchReadingsWithContext,
  ReadingWithWeight,
} from "./adaptive-lookback.ts";
import {
  enforceSpacingByConfidence,
  generateScheduleForWindow,
  ScheduleCandidate,
} from "./schedule-generator.ts";
import { MealWindow } from "./filtering.ts";

// Mock Data Generators
function createMockReadings(
  count: number,
  type: "historical" | "scheduled",
  baseMinute: number,
): any[] {
  return Array.from({ length: count }, (_, i) => ({
    measured_at: new Date(
      2023,
      0,
      1,
      Math.floor((baseMinute + i) / 60),
      (baseMinute + i) % 60,
    ).toISOString(),
    measurement_type: "fasting",
    reading_context: type === "scheduled" ? "scheduled_prompt" : "organic",
  }));
}

// Mock Supabase with state
// Mock Query Builder
class MockQueryBuilder {
  readings: any[];

  constructor(readings: any[]) {
    this.readings = [...readings];
  }

  select(_columns: string) {
    return this;
  }

  eq(col: string, val: any) {
    if (col === "reading_context") {
      this.readings = this.readings.filter((r) => r.reading_context === val);
    } else if (col === "measurement_type") {
      this.readings = this.readings.filter((r) => r.measurement_type === val);
    } else if (col === "user_id") {
      // mock user filtering
    }
    return this;
  }

  neq(col: string, val: any) {
    if (col === "reading_context") {
      this.readings = this.readings.filter((r) => r.reading_context !== val);
    }
    return this;
  }

  gte(_col: string, _val: any) {
    return this;
  }

  then(
    resolve: (value: { data: any[]; error: any }) => void,
    _reject?: (reason?: any) => void,
  ) {
    resolve({ data: this.readings, error: null });
  }
}

// Mock Supabase with state
class MockSupabase {
  readings: any[] = [];
  scheduledWeeksCount = 0;

  constructor(scheduledWeeksCount: number, readings: any[]) {
    this.scheduledWeeksCount = scheduledWeeksCount;
    this.readings = readings;
  }

  rpc(name: string, _args: any) {
    if (name === "count_scheduled_weeks") {
      return Promise.resolve({
        data: this.scheduledWeeksCount,
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: "Not implemented" });
  }

  from(table: string) {
    if (table === "glucose_readings") {
      return new MockQueryBuilder(this.readings);
    }
    return {
      select: () => ({
        eq: () => ({
          gte: () => ({ order: () => ({ data: [], error: null }) }),
        }),
      }),
    };
  }
}

// Test Suite
Deno.test("Integration - Bootstrap User (No History)", async () => {
  // Scenario: New user, 0 scheduled weeks, 40 noisy readings (organic)
  // Expect: Bootstrap mode, schedules use defaults or history if enough data (but low confidence)

  // 40 readings around 08:00 (480 min) but noisy
  const rawReadings = createMockReadings(40, "historical", 480);
  const mockDb = new MockSupabase(0, rawReadings);

  const userId = "user-bootstrap";
  const targetMonday = new Date("2026-01-05");

  // 1. Determine Strategy
  const strategy = await determineLookbackStrategy(
    mockDb as any,
    userId,
    targetMonday,
  );
  assertEquals(strategy.mode, "bootstrap");

  // 2. Fetch Readings
  // Reset mock db for query
  mockDb.readings = rawReadings;
  const readings = await fetchReadingsWithContext(
    mockDb as any,
    userId,
    strategy,
    targetMonday,
  );
  assert(readings.length > 0, "Should have fetched readings");
  assertEquals(readings[0].data_quality, "historical");

  // 3. Generate Schedule
  const window: MealWindow = {
    id: "w1",
    user_id: userId,
    day_of_week: 0, // Sunday (mock data is 2023-01-01 is Sunday)
    measurement_type: "fasting",
    meal_number: 1,
    time_start: "06:00:00",
    time_end: "10:00:00", // 360 - 600
    created_at: "",
    updated_at: "",
  };

  const candidate = await generateScheduleForWindow(
    mockDb as any,
    window,
    readings,
    strategy,
    targetMonday,
  );

  // With 40 readings, we should have enough history logic triggered
  assertEquals(candidate.source, "history");
  assert(
    candidate.confidence < 0.8,
    "Confidence should be lower for bootstrap",
  );
});

Deno.test("Integration - Mature User (High Quality)", async () => {
  // Scenario: 6 scheduled weeks, clean data
  const rawReadings = createMockReadings(20, "scheduled", 480); // 20 scheduled readings
  const mockDb = new MockSupabase(6, rawReadings);

  const userId = "user-mature";
  const targetMonday = new Date("2026-01-05");

  // 1. Determine Strategy
  const strategy = await determineLookbackStrategy(
    mockDb as any,
    userId,
    targetMonday,
  );
  assertEquals(strategy.mode, "mature");

  // 2. Fetch Readings
  mockDb.readings = rawReadings;
  const readings = await fetchReadingsWithContext(
    mockDb as any,
    userId,
    strategy,
    targetMonday,
  );

  // 3. Generate Schedule
  const window: MealWindow = {
    id: "w1",
    user_id: userId,
    day_of_week: 0,
    measurement_type: "fasting",
    meal_number: 1,
    time_start: "06:00:00",
    time_end: "10:00:00",
    created_at: "",
    updated_at: "",
  };

  const candidate = await generateScheduleForWindow(
    mockDb as any,
    window,
    readings,
    strategy,
    targetMonday,
  );

  assertEquals(candidate.source, "history");
  assert(
    candidate.confidence > 0.8,
    "Confidence should be high for mature user",
  );
});

Deno.test("Integration - Enforce Spacing", () => {
  // 3 candidates close together
  const candidates: ScheduleCandidate[] = [
    {
      user_id: "u1",
      scheduled_at: "2026-01-05T08:00:00Z",
      confidence: 0.9,
      // ... required fields
      meal_window_id: "1",
      measurement_type: "fasting",
      day_of_week: 1,
      minute_of_day: 480,
      source: "history",
    },
    {
      user_id: "u1",
      scheduled_at: "2026-01-05T08:30:00Z", // Too close (30 min)
      confidence: 0.5,
      meal_window_id: "2",
      measurement_type: "fasting",
      day_of_week: 1,
      minute_of_day: 510,
      source: "history",
    },
    {
      user_id: "u1",
      scheduled_at: "2026-01-05T10:00:00Z", // OK (120 min from first)
      confidence: 0.8,
      meal_window_id: "3",
      measurement_type: "fasting",
      day_of_week: 1,
      minute_of_day: 600,
      source: "history",
    },
  ];

  const final = enforceSpacingByConfidence(candidates, 90);

  assertEquals(final.length, 2);
  assertEquals(final[0].scheduled_at, "2026-01-05T08:00:00Z");
  assertEquals(final[1].scheduled_at, "2026-01-05T10:00:00Z");
});
